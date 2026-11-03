import {createHash,randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {Pool,type PoolClient,type QueryResultRow} from "pg";
import {z} from "zod";
import {knowledgeSubmissionContentSchema,type KnowledgeSubmission} from "../domain/knowledge-submission";
import {knowledgeReviewCommandSchema,REVIEW_CONSENT_VERSION,PUBLICATION_CONSENT_VERSION,type KnowledgeReviewStatus,submissionReviewInput} from "../domain/knowledge-review-job";
import {geminiReviewRequest,GEMINI_REVIEW_POLICY,parseGeminiReview,type callGeminiReview} from "./gemini-knowledge-review";
import {knowledgeDigest,KnowledgeError} from "./knowledge-foundation";
export const reviewConfigSchema=z.strictObject({
 projectId:z.string().min(1),billingTier:z.literal("free"),verifiedAt:z.string().datetime({offset:true}),
 model:z.literal("gemini-3.5-flash-lite"),rpm:z.number().int().min(1).max(15),tokensPerMinute:z.number().int().positive(),
 requestsPerDay:z.number().int().positive().max(80),requestsPerMonth:z.number().int().positive(),
 inputTokensPerDay:z.number().int().positive(),outputTokensPerDay:z.number().int().positive(),
 inputTokensPerMonth:z.number().int().positive(),outputTokensPerMonth:z.number().int().positive(),
 apiKeyFile:z.string().min(1),allowedUsers:z.array(z.uuidv4()).min(1).max(10),
});
export type ReviewConfig=z.infer<typeof reviewConfigSchema>;
export const reviewEnabledFor=(id:string)=>(process.env.MEMBER_ORIGIN==="https://graph-beta.isinxnisi.com"||process.env.NODE_ENV==="test")&&process.env.KNOWLEDGE_REVIEW_ENABLED==="1"&&(process.env.KNOWLEDGE_REVIEW_ALLOWED_USERS??"").split(",").includes(id);
const iso=(v:unknown)=>v instanceof Date?v.toISOString():String(v);
export async function ensureReviewSchema(pool:Pool){
 const checksum=createHash("sha256").update(await readFile(path.join(process.cwd(),"db/member/021-knowledge-review-jobs.sql"))).digest("hex");
 if((await pool.query("SELECT checksum FROM member_migration WHERE name='021-knowledge-review-jobs.sql'")).rows[0]?.checksum!==checksum)throw new KnowledgeError("AI確認用の明示migrationが必要です",503,"MIGRATION_REQUIRED");
}
export async function reviewStatus(c:Pool|PoolClient,ownerId:string,id:string,revision:number):Promise<KnowledgeReviewStatus|undefined>{
 const rows=(await c.query(`SELECT j.* FROM member_knowledge.review_jobs j JOIN member_knowledge.submissions s ON s.id=j.submission_id WHERE j.submission_id=$1 AND s.owner_id=$2 AND j.revision=$3 ORDER BY j.created_at,j.item_key`,[id,ownerId,revision])).rows;
 if(!rows.length)return undefined;
 if(process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED==='1'){
  const decisions=(await c.query("SELECT job_id,state,reason,result,command FROM member_knowledge.publication_decisions WHERE job_id=ANY($1::uuid[])",[rows.map(r=>r.id)])).rows;
  for(const row of rows){const d=decisions.find(d=>d.job_id===row.id);if(d)row.publication={id:d.command.record.id,revision:d.result?.revision??(d.command.expectedRevision??0)+1,state:d.state,reason:d.reason};}
 }
 const workerAvailable=(await c.query("SELECT 1 FROM member_knowledge.review_projects WHERE heartbeat_at>clock_timestamp()-interval '45 seconds' LIMIT 1")).rowCount===1;
 return {revision,workerAvailable,items:rows.map(r=>({key:r.item_key,state:r.state,reason:r.reason,nextAttemptAt:['retry','quota'].includes(r.state)?iso(r.not_before):null,attempts:r.attempts,result:r.result,...(r.publication?{publication:r.publication}:{})}))};
}
function submission(row:QueryResultRow):KnowledgeSubmission{
 return {id:row.id,revision:row.current_revision,version:row.state_version,state:row.state,content:knowledgeSubmissionContentSchema.parse(row.content),digest:row.digest,createdAt:iso(row.created_at),updatedAt:iso(row.updated_at),origin:row.source_capsule?{capsuleId:row.source_capsule.capsuleId,capsuleRevision:row.source_capsule.capsuleRevision,title:row.source_capsule.title,keys:row.source_capsule.keys}:null,...(row.source_capsule?.captured?{context:{entities:row.source_capsule.captured.entities,sources:row.source_capsule.captured.sources}}:{})};
}
const quotaFormatter=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"});
export function quotaDate(now:Date){return quotaFormatter.format(now);}
export function nextQuotaDay(now:Date){const today=quotaDate(now),[y,m,d]=today.split('-').map(Number);let next=new Date(Date.UTC(y,m-1,d+1));while(quotaDate(next)===today)next=new Date(next.getTime()+3600000);return next;}
export function nextQuotaMonth(now:Date){const month=quotaDate(now).slice(0,7),[y,m]=month.split('-').map(Number);let next=new Date(Date.UTC(y,m,1));while(quotaDate(next).slice(0,7)===month)next=new Date(next.getTime()+3600000);return next;}
export type ReviewLease={jobId:string;attemptId:string;token:string;wire:string;wireDigest:string;model:string};
type WireResult=Awaited<ReturnType<typeof callGeminiReview>>;
export function createReviewQueue(pool:Pool){
 let ready:Promise<void>|undefined;
 const ensure=async()=>{ready??=ensureReviewSchema(pool).catch(e=>{ready=undefined;throw e;});await ready;};
 async function tx<T>(run:(c:PoolClient)=>Promise<T>){await ensure();const c=await pool.connect();try{await c.query("BEGIN");const result=await run(c);await c.query("COMMIT");return result;}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}}
 async function ownerLock(c:PoolClient,id:string){return (await c.query('SELECT active FROM "user" WHERE id=$1 FOR UPDATE',[id])).rows[0]?.active===true;}
 async function current(c:PoolClient,id:string){return (await c.query(`SELECT s.*,v.content,v.digest,v.source_capsule FROM member_knowledge.submissions s JOIN member_knowledge.submission_revisions v ON v.submission_id=s.id AND v.revision=s.current_revision WHERE s.id=$1 FOR UPDATE OF s`,[id])).rows[0];}
 async function jobTransaction<T>(id:string,run:(c:PoolClient,row:QueryResultRow,active:boolean)=>Promise<T>){
  const seed=(await pool.query("SELECT s.owner_id,s.id FROM member_knowledge.review_jobs j JOIN member_knowledge.submissions s ON s.id=j.submission_id WHERE j.id=$1",[id])).rows[0];
  if(!seed)return null;
  return tx(async c=>{const active=await ownerLock(c,seed.owner_id);const s=await current(c,seed.id);const j=(await c.query("SELECT * FROM member_knowledge.review_jobs WHERE id=$1 FOR UPDATE",[id])).rows[0];if(!s||!j)return null;return run(c,{...j,submission:s},active);});
 }
  async function finish(lease:ReviewLease,result:WireResult|{state:'not-sent'}){
   await ensure();const parsed=result.state==='received'?parseGeminiReview(result.raw):null;
   const usage=parsed?.usage;
   await pool.query(`UPDATE member_knowledge.review_attempts SET state=$2,finished_at=clock_timestamp(),request_charge=$3,input_actual=$4,output_actual=$5,thoughts_actual=$6,cached_actual=$7,total_actual=$8,candidates_actual=$9 WHERE id=$1 AND state IN('sending','delivery-unknown')`,[lease.attemptId,result.state,result.state==='not-sent'?0:1,result.state==='not-sent'?0:usage?.promptTokenCount??null,result.state==='not-sent'?0:usage?.candidatesTokenCount!==null&&usage?.candidatesTokenCount!==undefined&&usage.thoughtsTokenCount!==null?usage.candidatesTokenCount+usage.thoughtsTokenCount:null,usage?.thoughtsTokenCount??null,usage?.cachedContentTokenCount??null,usage?.totalTokenCount??null,usage?.candidatesTokenCount??null]);
   // The payload row is absent after account deletion; never recreate it.
   if(result.state==='received')await pool.query("UPDATE member_knowledge.review_payloads SET response=$2 WHERE attempt_id=$1",[lease.attemptId,result.raw]);
   return jobTransaction(lease.jobId,async(c,j,active)=>{
    if(j.state!=='running'||j.lease_token!==lease.token||!active||j.submission.state!=='queued'||j.submission.current_revision!==j.revision||j.submission.digest!==j.submitted_digest)return false;
    let state='retry',reason='AIとの接続を再確認しています。',notBefore=new Date(Date.now()+120000),advice:unknown=null;
    if(result.state==='not-sent'){state='cancelled';reason='submission-changed';}
    else if(parsed?.state==='reviewed'){
     if(parsed.modelVersion!==lease.model){state='attention';reason='評価済みのモデルと応答が異なるため、接続を確認しています。';}
     else{advice=parsed.review;state=parsed.review.suitability==='abuse'?'declined':parsed.review.suitability==='legitimate'&&parsed.review.support==='supported'?'reviewed':'needs-changes';reason=parsed.review.reason;}
    }else if(parsed){state='attention';reason='AIの回答形式を確認できませんでした。内容への不受理判定ではありません。';}
    else if(result.state==='http-error'){
     const retry=Number(result.retryAfter),date=Date.parse(result.retryAfter??'');const ms=Number.isFinite(retry)&&retry>0?retry*1000:Number.isFinite(date)?Math.max(60000,date-Date.now()):60000;
     if(result.category==='rate-limit'){state='quota';reason='AIの無料利用枠が混雑しています。枠の再開後に再試行します。';notBefore=new Date(Date.now()+Math.min(86400000,ms));}
     else if(result.category==='authorization'||result.category==='invalid-request'){state='attention';reason='AI接続の設定を確認しています。';}
     if(['rate-limit','authorization','invalid-request'].includes(result.category))await c.query("UPDATE member_knowledge.review_projects SET paused_until=$2,pause_reason=$3 WHERE project_id=(SELECT project_id FROM member_knowledge.review_attempts WHERE id=$1)",[lease.attemptId,result.category==='rate-limit'?notBefore:new Date(Date.now()+86400000),reason]);
    }
    if(j.attempts>=3&&['retry','quota'].includes(state)){state='attention';reason='送信を3回試しました。AI接続の確認を待っています。';}
    await c.query("UPDATE member_knowledge.review_jobs SET state=$2,reason=$3,result=$4,not_before=$5,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=$1",[j.id,state,reason,advice,notBefore]);return true;
   });
  }

 return {
  async authorize(ownerId:string,raw:unknown){
   const command=knowledgeReviewCommandSchema.parse(raw),digest=knowledgeDigest(raw);
   return tx(async c=>{
    if(!await ownerLock(c,ownerId))throw new KnowledgeError("本人を確認してください",401,"UNAUTHENTICATED");
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['submission-owner:'+ownerId]);
    const old=(await c.query("SELECT digest,response FROM member_knowledge.submission_requests WHERE owner_id=$1 AND request_id=$2",[ownerId,command.requestId])).rows[0];
    if(old){if(old.digest!==digest)throw new KnowledgeError("操作IDの内容が異なります",409,"REQUEST_CONFLICT");return old.response as KnowledgeSubmission;}
    const row=await current(c,command.id);if(!row||row.owner_id!==ownerId)throw new KnowledgeError("投稿がありません",404,"NOT_FOUND");
    if(row.state_version!==command.expectedVersion||row.state!=='queued')throw new KnowledgeError("受付内容が変わりました",409,"VERSION_CONFLICT");
    const n=Number((await c.query("SELECT count(*) AS n FROM member_knowledge.submission_requests WHERE owner_id=$1 AND created_at>clock_timestamp()-interval '10 minutes'",[ownerId])).rows[0].n);
    if(n>=120)throw new KnowledgeError("少し待ってから再試行してください",429,"RATE_LIMITED");
    const value=submission(row);
    if((await c.query("SELECT 1 FROM member_knowledge.review_authorizations WHERE submission_id=$1 AND revision=$2",[value.id,value.revision])).rowCount)return {...value,review:await reviewStatus(c,ownerId,value.id,value.revision)};
    await c.query("INSERT INTO member_knowledge.review_authorizations(submission_id,revision,consent_version) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[value.id,value.revision,command.consentVersion]);
    for(const item of value.content.items)await c.query(`INSERT INTO member_knowledge.review_jobs(id,submission_id,revision,item_key,submitted_digest,consent_version,state) VALUES($1,$2,$3,$4,$5,$6,'queued') ON CONFLICT(submission_id,revision,item_key) DO NOTHING`,[randomUUID(),value.id,value.revision,item.key,value.digest,command.consentVersion]);
    const result={...value,review:await reviewStatus(c,ownerId,value.id,value.revision)};
    await c.query("INSERT INTO member_knowledge.submission_requests(owner_id,request_id,submission_id,digest,response) VALUES($1,$2,$3,$4,$5)",[ownerId,command.requestId,value.id,digest,result]);return result;
   });
  },
  async reserveAdvice(ownerId:string){return tx(async c=>{if(!await ownerLock(c,ownerId))throw new KnowledgeError("本人を確認してください",401,"UNAUTHENTICATED");const n=Number((await c.query("SELECT count(*) AS n FROM member_knowledge.advice_requests WHERE owner_id=$1 AND created_at>clock_timestamp()-interval '10 minutes'",[ownerId])).rows[0].n);if(n>=4)throw new KnowledgeError("ヒントの確認が続いています",429,"RATE_LIMITED");await c.query("INSERT INTO member_knowledge.advice_requests(id,owner_id) VALUES($1,$2)",[randomUUID(),ownerId]);});},
  async heartbeat(raw:ReviewConfig){const cfg=reviewConfigSchema.parse(raw);await ensure();const digest=knowledgeDigest({...cfg,apiKeyFile:undefined});await pool.query("INSERT INTO member_knowledge.review_projects(project_id,config_digest) VALUES($1,$2) ON CONFLICT DO NOTHING",[cfg.projectId,digest]);const r=await pool.query("UPDATE member_knowledge.review_projects SET heartbeat_at=clock_timestamp() WHERE project_id=$1 AND config_digest=$2",[cfg.projectId,digest]);if(r.rowCount!==1)throw Error("Review project configuration changed; explicitly restart with a reviewed configuration");},
  async recoverExpired(){
   await ensure();const rows=(await pool.query("SELECT id FROM member_knowledge.review_jobs WHERE state='running' AND lease_until<clock_timestamp() LIMIT 20")).rows;
   for(const r of rows){
    const completed=(await pool.query(`SELECT j.lease_token,a.id AS attempt_id,a.model,p.wire,p.wire_digest,p.response FROM member_knowledge.review_jobs j JOIN member_knowledge.review_attempts a ON a.job_id=j.id JOIN member_knowledge.review_payloads p ON p.attempt_id=a.id WHERE j.id=$1 AND a.state='received' AND p.response IS NOT NULL ORDER BY a.started_at DESC LIMIT 1`,[r.id])).rows[0];
    if(completed){await finish({jobId:r.id,attemptId:completed.attempt_id,token:completed.lease_token,model:completed.model,wire:completed.wire,wireDigest:completed.wire_digest},{state:'received',status:200,raw:completed.response});continue;}
    await jobTransaction(r.id,async(c,j,active)=>{
    if(j.state!=='running'||new Date(j.lease_until).getTime()>=Date.now())return;
    await c.query("UPDATE member_knowledge.review_attempts SET state='delivery-unknown',finished_at=clock_timestamp() WHERE job_id=$1 AND state='sending'",[j.id]);
    const stale=!active||j.submission.state!=='queued'||j.submission.current_revision!==j.revision||j.submission.digest!==j.submitted_digest;
    await c.query("UPDATE member_knowledge.review_jobs SET state=$2,reason=$3,not_before=clock_timestamp()+interval '120 seconds',lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=$1",[j.id,stale?'cancelled':j.attempts>=3?'attention':'retry',stale?'submission-changed':'前の送信結果を確認できません。重複を避けて間隔を空けて再試行します。']);
   });}
  },
  async claim(raw:ReviewConfig):Promise<ReviewLease|null>{
   const cfg=reviewConfigSchema.parse(raw);await ensure();
   const candidates=(await pool.query("SELECT j.id FROM member_knowledge.review_jobs j JOIN member_knowledge.submissions s ON s.id=j.submission_id WHERE j.state IN('queued','retry','quota') AND j.not_before<=clock_timestamp() AND s.owner_id=ANY($1::uuid[]) ORDER BY j.not_before,j.created_at LIMIT 8",[cfg.allowedUsers])).rows;
   for(const candidate of candidates){const lease=await jobTransaction(candidate.id,async(c,j,active)=>{
    if(!['queued','retry','quota'].includes(j.state)||new Date(j.not_before).getTime()>Date.now())return null;
    const s=j.submission;
    if(!active||s.state!=='queued'||s.current_revision!==j.revision||s.digest!==j.submitted_digest||![REVIEW_CONSENT_VERSION,...(process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED==='1'?[PUBLICATION_CONSENT_VERSION]:[])].includes(j.consent_version)){await c.query("UPDATE member_knowledge.review_jobs SET state='cancelled',reason='submission-changed' WHERE id=$1",[j.id]);return null;}
    if(j.attempts>=3){await c.query("UPDATE member_knowledge.review_jobs SET state='attention',reason='送信を3回試しました。AI接続の確認を待っています。' WHERE id=$1",[j.id]);return null;}
    let wire:string;
    try{wire=JSON.stringify(geminiReviewRequest(submissionReviewInput(submission(s),j.item_key,j.consent_version===PUBLICATION_CONSENT_VERSION)));}
    catch{await c.query("UPDATE member_knowledge.review_jobs SET state='needs-changes',reason='内容・対象・資料の取得版や入力の長さを確認してください。' WHERE id=$1",[j.id]);return null;}
    const project=(await c.query("SELECT * FROM member_knowledge.review_projects WHERE project_id=$1 FOR UPDATE",[cfg.projectId])).rows[0];if(!project)throw Error("Review project is not configured");
    const now=new Date(),day=quotaDate(now),month=day.slice(0,7),inputReserved=Buffer.byteLength(wire)+1024,outputReserved=2048;
    const usage=(await c.query(`SELECT COALESCE(sum(request_charge) FILTER(WHERE quota_day=$2),0)::int AS day_requests,COALESCE(sum(request_charge) FILTER(WHERE quota_month=$3),0)::int AS month_requests,
      COALESCE(sum(COALESCE(input_actual,input_reserved)) FILTER(WHERE quota_day=$2),0)::bigint AS day_input,COALESCE(sum(COALESCE(output_actual,output_reserved)) FILTER(WHERE quota_day=$2),0)::bigint AS day_output,
      COALESCE(sum(COALESCE(input_actual,input_reserved)) FILTER(WHERE quota_month=$3),0)::bigint AS month_input,COALESCE(sum(COALESCE(output_actual,output_reserved)) FILTER(WHERE quota_month=$3),0)::bigint AS month_output,
      COALESCE(sum(request_charge) FILTER(WHERE started_at>clock_timestamp()-interval '1 minute'),0)::int AS minute_requests,COALESCE(sum(COALESCE(input_actual,input_reserved)) FILTER(WHERE started_at>clock_timestamp()-interval '1 minute'),0)::bigint AS minute_input,
      max(started_at) AS last_start FROM member_knowledge.review_attempts WHERE project_id=$1`,[cfg.projectId,day,month])).rows[0];
    let wait:Date|null=null,reason='';
    if(project.paused_until&&new Date(project.paused_until)>now){wait=new Date(project.paused_until);reason=project.pause_reason;}
    else if(usage.day_requests>=cfg.requestsPerDay||Number(usage.day_input)+inputReserved>cfg.inputTokensPerDay||Number(usage.day_output)+outputReserved>cfg.outputTokensPerDay){wait=nextQuotaDay(now);reason='本日の無料利用枠を待っています。';}
    else if(usage.month_requests>=cfg.requestsPerMonth||Number(usage.month_input)+inputReserved>cfg.inputTokensPerMonth||Number(usage.month_output)+outputReserved>cfg.outputTokensPerMonth){wait=nextQuotaMonth(now);reason='今月の利用枠を待っています。';}
    else if(usage.minute_requests>=cfg.rpm||Number(usage.minute_input)+inputReserved>cfg.tokensPerMinute){wait=new Date(now.getTime()+61000);reason='利用が集中しています。順番に確認します。';}
    else if(usage.last_start){const after=new Date(new Date(usage.last_start).getTime()+Math.ceil(60000/cfg.rpm)+100);if(after>now){wait=after;reason='順番に確認しています。';}}
    if(inputReserved>cfg.tokensPerMinute||inputReserved>cfg.inputTokensPerDay||outputReserved>cfg.outputTokensPerDay){await c.query("UPDATE member_knowledge.review_jobs SET state='needs-changes',reason='一度に確認できる量を超えています。項目の本文や根拠を短くしてください。' WHERE id=$1",[j.id]);return null;}
    if(wait){await c.query("UPDATE member_knowledge.review_jobs SET state='quota',reason=$2,not_before=$3,updated_at=clock_timestamp() WHERE id=$1",[j.id,reason,wait]);return null;}
    const attemptId=randomUUID(),token=randomUUID(),wireDigest=createHash("sha256").update(wire).digest("hex");
    await c.query(`INSERT INTO member_knowledge.review_attempts(id,job_id,project_id,provider,model,policy,purpose,state,quota_day,quota_month,input_reserved,output_reserved) VALUES($1,$2,$3,'gemini',$4,$5,'submission','sending',$6,$7,$8,$9)`,[attemptId,j.id,cfg.projectId,cfg.model,GEMINI_REVIEW_POLICY,day,month,inputReserved,outputReserved]);
    await c.query("INSERT INTO member_knowledge.review_payloads(attempt_id,job_id,wire,wire_digest) VALUES($1,$2,$3,$4)",[attemptId,j.id,wire,wireDigest]);
    await c.query("UPDATE member_knowledge.review_jobs SET state='running',reason='',attempts=attempts+1,lease_token=$2,lease_until=clock_timestamp()+interval '180 seconds',updated_at=clock_timestamp() WHERE id=$1",[j.id,token]);
    return {jobId:j.id,attemptId,token,wire,wireDigest,model:cfg.model};
   });if(lease)return lease;}
   return null;
  },
  async canSend(lease:ReviewLease){await ensure();return (await pool.query(`SELECT 1 FROM member_knowledge.review_jobs j JOIN member_knowledge.submissions s ON s.id=j.submission_id JOIN "user" u ON u.id=s.owner_id WHERE j.id=$1 AND j.lease_token=$2 AND j.state='running' AND j.lease_until>clock_timestamp() AND u.active AND s.state='queued' AND s.current_revision=j.revision`,[lease.jobId,lease.token])).rowCount===1;},
  finish,
  async rejectBeforeSend(lease:ReviewLease,reason:string,retryable:boolean){
   await finish(lease,{state:'not-sent'});
   await jobTransaction(lease.jobId,async(c,j,active)=>{
    if(active&&j.state==='cancelled'&&j.submission.state==='queued'&&j.submission.current_revision===j.revision&&j.submission.digest===j.submitted_digest)
     await c.query("UPDATE member_knowledge.review_jobs SET state=$2,reason=$3,not_before=clock_timestamp()+interval '120 seconds' WHERE id=$1",[j.id,retryable?'retry':'needs-changes',reason]);
   });
  },
  async usage(config:ReviewConfig){
   await ensure();const day=quotaDate(new Date()),month=day.slice(0,7);
   const row=(await pool.query(`SELECT count(*)::int AS attempts,COALESCE(sum(request_charge),0)::int AS requests,
    COALESCE(sum(input_actual),0)::bigint AS observed_input,COALESCE(sum(candidates_actual),0)::bigint AS observed_candidates,COALESCE(sum(thoughts_actual),0)::bigint AS observed_thoughts,COALESCE(sum(cached_actual),0)::bigint AS observed_cached,COALESCE(sum(total_actual),0)::bigint AS observed_total,
    count(*) FILTER(WHERE input_actual IS NULL)::int AS missing_input,count(*) FILTER(WHERE thoughts_actual IS NULL)::int AS missing_thoughts,
    COALESCE(sum(input_reserved) FILTER(WHERE input_actual IS NULL),0)::bigint AS input_held,COALESCE(sum(output_reserved) FILTER(WHERE output_actual IS NULL),0)::bigint AS output_held,
    COALESCE(sum(request_charge) FILTER(WHERE quota_day=$2),0)::int AS day_requests,COALESCE(sum(request_charge) FILTER(WHERE quota_month=$3),0)::int AS month_requests
    FROM member_knowledge.review_attempts WHERE project_id=$1`,[config.projectId,day,month])).rows[0];
   const project=(await pool.query("SELECT paused_until,pause_reason,heartbeat_at FROM member_knowledge.review_projects WHERE project_id=$1",[config.projectId])).rows[0]??null;
   return {provider:'gemini',projectId:config.projectId,model:config.model,day,month,localLimits:{rpm:config.rpm,tokensPerMinute:config.tokensPerMinute,requestsPerDay:config.requestsPerDay,requestsPerMonth:config.requestsPerMonth,inputTokensPerDay:config.inputTokensPerDay,outputTokensPerDay:config.outputTokensPerDay},usage:row,project,providerRemainingUnknown:true};
  },
  async importEvaluation(raw:unknown,digest:string,config:ReviewConfig){
   const ledger=z.object({projectId:z.string(),attempts:z.record(z.string(),z.object({day:z.string(),state:z.string(),startedAt:z.string(),inputReserved:z.number().int(),outputReserved:z.number().int(),inputActual:z.number().int().nullable(),outputActual:z.number().int().nullable()}))}).parse(raw);
   if(ledger.projectId!==config.projectId||!/^[a-f0-9]{64}$/.test(digest))throw Error("Evaluation ledger belongs to a different project");
   return tx(async c=>{await c.query("SELECT project_id FROM member_knowledge.review_projects WHERE project_id=$1 FOR UPDATE",[config.projectId]);if((await c.query("SELECT 1 FROM member_knowledge.review_imports WHERE digest=$1",[digest])).rowCount)return 0;
    let n=0;for(const [id,a] of Object.entries(ledger.attempts)){const hex=createHash('sha256').update('evaluation:'+config.projectId+':'+id).digest('hex');const uuid=hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20,32);const r=await c.query(`INSERT INTO member_knowledge.review_attempts(id,project_id,provider,model,policy,purpose,state,started_at,quota_day,quota_month,input_reserved,output_reserved,input_actual,output_actual) VALUES($1,$2,'gemini',$3,$4,'evaluation',$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,[uuid,config.projectId,config.model,GEMINI_REVIEW_POLICY,a.state,a.startedAt,a.day,a.day.slice(0,7),a.inputReserved,a.outputReserved,a.inputActual,a.outputActual]);n+=r.rowCount??0;}
    await c.query("INSERT INTO member_knowledge.review_imports(digest,project_id) VALUES($1,$2)",[digest,config.projectId]);return n;
   });
  },
 };
}
