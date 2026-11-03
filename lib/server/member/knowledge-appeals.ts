import {createHash,randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {Pool,type PoolClient,type QueryResultRow} from "pg";
import {z} from "zod";
import {appealCommandSchema,appealOperatorCommandSchema,canAppeal} from "../../domain/knowledge-appeal";
import {PUBLICATION_CONSENT_VERSION} from "../../domain/knowledge-review-job";
import {reviewDisclosureForConsent} from "../../domain/knowledge-submission-feedback";
import {knowledgeSubmissionContentSchema} from "../../domain/knowledge-submission";
import {knowledgeDigest,createKnowledgeFoundationService,KnowledgeError} from "../knowledge-foundation";
import {knowledgeReadConfiguration} from "../knowledge-read-runtime";
import {reviewEnabledFor} from "../knowledge-review-queue";
import {memberTransaction,activeMember} from "./operations";
import {isSiteOperator} from "./site-operations";
import {assertMemberOrigin,MemberError,memberInput,memberJson} from "./http";

export async function ensureKnowledgeAppeals(pool:Pool){
 const hash=createHash('sha256').update(await readFile(path.join(process.cwd(),'db/member/026-knowledge-appeals.sql'))).digest('hex');
 if((await pool.query("SELECT checksum FROM member_migration WHERE name='026-knowledge-appeals.sql'")).rows[0]?.checksum!==hash)throw new MemberError(503,'MIGRATION_REQUIRED');
}
const stamp=(v:unknown)=>v instanceof Date?v.toISOString():String(v);
// A case shares only this submitted item and its referenced source/subject names.
export function appealSnapshot(row:QueryResultRow){
 const content=knowledgeSubmissionContentSchema.parse(row.content),item=content.items.find(i=>i.key===row.item_key);
 if(!item)throw new MemberError(409,'ITEM_CHANGED');
 const ctx=row.reference_context??row.source_capsule?.captured,ids=[item.record.subjectId,item.record.objectId];
 return {item,entities:[...content.entities,...(ctx?.entities??[])].filter(e=>ids.includes(e.id)).map(e=>({id:e.id,content:{name:e.content.name,kind:e.content.kind}})),sources:[...content.sources,...(ctx?.sources??[])].filter(s=>item.record.evidence.some(e=>e.source.id===s.id&&(s.revision??1)===e.source.revision)),review:{state:row.state,reason:row.reason,result:row.result},submittedAt:stamp(row.submitted_at)};
}
async function feedback(c:PoolClient,j:QueryResultRow,key:string){
 await c.query("SELECT pg_advisory_xact_lock(hashtextextended('knowledge-feedback:'||$1,0))",[j.submission_id]);
 await c.query(`INSERT INTO member_knowledge.feedback_events(job_id,submission_id,revision,item_key,state,outcome_hash) VALUES($1,$2,$3,$4,'appeal',$5) ON CONFLICT DO NOTHING`,[j.id,j.submission_id,j.revision,j.item_key,knowledgeDigest(key)]);
}
export async function readAppeal(c:PoolClient,id:string){
 const r=(await c.query('SELECT * FROM member_knowledge.appeals WHERE id=$1',[id])).rows[0];if(!r)return null;
 const replies=(await c.query('SELECT action,reason,created_at FROM member_knowledge.appeal_operations WHERE appeal_id=$1 AND public_reply ORDER BY created_at,id',[id])).rows;
 const pending=(await c.query("SELECT 1 FROM member_knowledge.moderation_decisions WHERE appeal_id=$1 AND (state='pending' OR notified_at IS NULL) LIMIT 1",[id])).rowCount===1;
 const moderation=(await c.query("SELECT state,command->>'visibility' AS visibility,reason FROM member_knowledge.moderation_decisions WHERE appeal_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1",[id])).rows[0];
 return {id:r.id,revision:r.revision,status:r.status,pending,...(moderation?{moderation}:{}),detail:r.detail,createdAt:stamp(r.created_at),replies:replies.map(v=>({action:v.action,reason:v.reason,createdAt:stamp(v.created_at)}))};
}
export function createKnowledgeAppeals(pool:Pool,origin:string,owner:(r:Request)=>Promise<{id:string;sessionId:string}>,knowledgePool?:Pool){
 let ready:Promise<void>|undefined,kpool=knowledgePool;
 const ensure=()=>ready??=ensureKnowledgeAppeals(pool).catch(e=>{ready=undefined;throw e;});
 const enabled=()=>{if(process.env.KNOWLEDGE_SUBMISSIONS_ENABLED!=='1')throw new MemberError(404,'NOT_FOUND');};
 const knowledge=()=>kpool??=new Pool({connectionString:knowledgeReadConfiguration().databaseUrl,max:2,statement_timeout:15000});
 async function operator(c:PoolClient,u:{id:string;sessionId:string}){
  if(!isSiteOperator(u.id))throw new MemberError(403,'OPERATOR_REQUIRED');
  if(!(await c.query('SELECT 1 FROM "user" u JOIN session s ON s."userId"=u.id WHERE u.id=$1 AND u.active AND s.id=$2 AND s."expiresAt">clock_timestamp() FOR SHARE OF u,s',[u.id,u.sessionId])).rowCount)throw new MemberError(401,'UNAUTHENTICATED');
 }
 async function access(request:Request,run:(c:PoolClient,u:{id:string;sessionId:string})=>Promise<unknown>,caseId?:string){
  enabled();await ensure();const u=await owner(request);if(!isSiteOperator(u.id))throw new MemberError(403,'OPERATOR_REQUIRED');
  return memberTransaction(pool,async c=>{
   if(caseId){const target=(await c.query('SELECT s.owner_id FROM member_knowledge.appeals a JOIN member_knowledge.review_jobs j ON j.id=a.job_id JOIN member_knowledge.submissions s ON s.id=j.submission_id WHERE a.id=$1',[caseId])).rows[0];
    // Stable user -> submission -> job -> appeal ordering, including self cases.
    await c.query('SELECT id FROM "user" WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[[u.id,...(target?[target.owner_id]:[])]]);
   }
   await operator(c,u);const result=await run(c,u);await operator(c,u);return memberJson(result);
  });
 }
 return {
  async create(request:Request){
   enabled();assertMemberOrigin(request,origin);if(!request.headers.has('x-member-user'))throw new MemberError(400,'INVALID_ARGUMENT');await ensure();
   const u=await owner(request),input=await memberInput(request,z.union([appealCommandSchema,z.strictObject({action:z.literal('withdraw'),id:z.uuidv4(),expectedRevision:z.number().int().positive(),requestId:z.uuidv4()})]),6000);
   if(input.action==='withdraw')return memberTransaction(pool,async c=>{
    await activeMember(c,u.id);const a=(await c.query('SELECT a.* FROM member_knowledge.appeals a JOIN member_knowledge.review_jobs j ON j.id=a.job_id JOIN member_knowledge.submissions s ON s.id=j.submission_id WHERE a.id=$1 AND s.owner_id=$2 FOR UPDATE OF a',[input.id,u.id])).rows[0];if(!a)throw new MemberError(404,'NOT_FOUND');
    const prior=(await c.query('SELECT * FROM member_knowledge.appeal_operations WHERE actor_id=$1 AND request_id=$2',[u.id,input.requestId])).rows[0];
    if(prior){if(prior.payload_hash!==knowledgeDigest(input))throw new MemberError(409,'REQUEST_REUSED');return memberJson({appeal:await readAppeal(c,a.id),replayed:true});}
    if(a.status!=='open'||a.revision!==input.expectedRevision)throw new MemberError(409,'VERSION_CONFLICT');
    await c.query("UPDATE member_knowledge.appeals SET status='withdrawn',revision=revision+1,updated_at=clock_timestamp() WHERE id=$1",[a.id]);
    await c.query("INSERT INTO member_knowledge.appeal_operations(id,appeal_id,actor_id,request_id,payload_hash,action,reason) VALUES($1,$2,$3,$4,$5,'withdraw','投稿者が相談を取り消しました。')",[randomUUID(),a.id,u.id,input.requestId,knowledgeDigest(input)]);
    return memberJson({appeal:await readAppeal(c,a.id),replayed:false});
   });
   return memberTransaction(pool,async c=>{
    await activeMember(c,u.id);
    const s=(await c.query('SELECT * FROM member_knowledge.submissions WHERE id=$1 AND owner_id=$2 FOR UPDATE',[input.submissionId,u.id])).rows[0];if(!s)throw new MemberError(404,'NOT_FOUND');
    const j=(await c.query(`SELECT j.*,r.content,r.reference_context,r.source_capsule,receipt.submitted_at FROM member_knowledge.review_jobs j JOIN member_knowledge.submission_revisions r ON r.submission_id=j.submission_id AND r.revision=j.revision JOIN member_knowledge.submission_receipts receipt ON receipt.submission_id=j.submission_id AND receipt.revision=j.revision WHERE j.submission_id=$1 AND j.revision=$2 AND j.item_key=$3 FOR UPDATE OF j`,[s.id,input.revision,input.itemKey])).rows[0];if(!j)throw new MemberError(404,'NOT_FOUND');
    const hash=knowledgeDigest(input),reused=(await c.query('SELECT a.* FROM member_knowledge.appeals a JOIN member_knowledge.review_jobs j ON j.id=a.job_id JOIN member_knowledge.submissions s ON s.id=j.submission_id WHERE s.owner_id=$1 AND a.request_id=$2',[u.id,input.requestId])).rows[0];if(reused&&(reused.job_id!==j.id||reused.payload_hash!==hash))throw new MemberError(409,'REQUEST_REUSED');
    const prior=(await c.query('SELECT * FROM member_knowledge.appeals WHERE job_id=$1',[j.id])).rows[0];
    if(prior){if(prior.request_id!==input.requestId||prior.payload_hash!==hash)throw new MemberError(409,'APPEAL_EXISTS');return memberJson({appeal:await readAppeal(c,prior.id),replayed:true});}
    if(!canAppeal(j.state))throw new MemberError(409,'RESULT_CHANGED');
    const count=(await c.query(`SELECT count(*)::int AS n FROM member_knowledge.appeals a JOIN member_knowledge.review_jobs j ON j.id=a.job_id JOIN member_knowledge.submissions s ON s.id=j.submission_id WHERE s.owner_id=$1 AND a.created_at>clock_timestamp()-interval '24 hours'`,[u.id])).rows[0].n;
    if(count>=5)throw new MemberError(429,'RATE_LIMIT');
    const id=randomUUID();await c.query('INSERT INTO member_knowledge.appeals(id,job_id,request_id,payload_hash,snapshot,detail) VALUES($1,$2,$3,$4,$5,$6)',[id,j.id,input.requestId,hash,appealSnapshot(j),input.detail]);
    return memberJson({appeal:await readAppeal(c,id),replayed:false});
   });
  },
  list(request:Request){return access(request,async c=>{
   const q=new URL(request.url).searchParams,status=q.get('status')??'open',after=q.get('before')?.split('|');if(!['open','answered','withdrawn','all'].includes(status)||after&&(after.length!==2||!z.iso.datetime({offset:true}).safeParse(after[0]).success||!z.uuidv4().safeParse(after[1]).success))throw new MemberError(400,'INVALID_ARGUMENT');
   const rows=(await c.query(`SELECT a.id,a.status,a.revision,a.created_at,to_char(a.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS page_time,j.state AS job_state,j.revision AS submitted_revision FROM member_knowledge.appeals a JOIN member_knowledge.review_jobs j ON j.id=a.job_id JOIN member_knowledge.submissions s ON s.id=j.submission_id JOIN "user" u ON u.id=s.owner_id WHERE u.active AND ($1='all' OR a.status=$1) AND ($2::timestamptz IS NULL OR (a.created_at,a.id)<($2,$3::uuid)) ORDER BY a.created_at DESC,a.id DESC LIMIT 51`,[status,after?.[0]??null,after?.[1]??null])).rows;
   return {items:rows.slice(0,50),nextBefore:rows.length>50?rows[49].page_time+'|'+rows[49].id:null};
  });},
  async act(request:Request){
   enabled();assertMemberOrigin(request,origin);if(!request.headers.has('x-member-user'))throw new MemberError(400,'INVALID_ARGUMENT');
   const input=await memberInput(request,appealOperatorCommandSchema,5000);
   return access(request,async(c,u)=>{
    const seed=(await c.query('SELECT j.submission_id,j.id FROM member_knowledge.appeals a JOIN member_knowledge.review_jobs j ON j.id=a.job_id WHERE a.id=$1',[input.id])).rows[0];if(!seed)throw new MemberError(404,'NOT_FOUND');
    const s=(await c.query('SELECT s.*,r.digest FROM member_knowledge.submissions s JOIN member_knowledge.submission_revisions r ON r.submission_id=s.id AND r.revision=s.current_revision WHERE s.id=$1 FOR UPDATE OF s',[seed.submission_id])).rows[0];
    const j=(await c.query('SELECT * FROM member_knowledge.review_jobs WHERE id=$1 FOR UPDATE',[seed.id])).rows[0];
    const a=(await c.query('SELECT * FROM member_knowledge.appeals WHERE id=$1 FOR UPDATE',[input.id])).rows[0];
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[u.id+':knowledge-appeal:'+input.requestId]);
    const prior=(await c.query('SELECT * FROM member_knowledge.appeal_operations WHERE actor_id=$1 AND request_id=$2',[u.id,input.requestId])).rows[0],hash=knowledgeDigest(input);
    if(prior&&(prior.payload_hash!==hash||prior.appeal_id!==a.id))throw new MemberError(409,'REQUEST_REUSED');
    if(prior&&input.action!=='inspect')return {result:prior.result,replayed:true};
    if(a.status==='withdrawn')throw new MemberError(409,'APPEAL_WITHDRAWN');
    const ownerActive=(await c.query('SELECT active FROM "user" WHERE id=$1',[s.owner_id])).rows[0]?.active;
    if(!ownerActive)throw new MemberError(409,'APPLICANT_INACTIVE');
    const opId=prior?.id??randomUUID();
    if(!prior)await c.query('INSERT INTO member_knowledge.appeal_operations(id,appeal_id,actor_id,request_id,payload_hash,action,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',[opId,a.id,u.id,input.requestId,hash,input.action,input.reason]);
    if(input.action==='inspect'){
     const publication=(await c.query("SELECT d.command->'record'->>'id' AS id,d.result->>'revision' AS revision FROM member_knowledge.publication_decisions d WHERE d.job_id=$1 AND d.state='published'",[j.id])).rows[0];
     const status=publication?(await knowledge().query("SELECT status_revision,visibility FROM knowledge75.objects WHERE kind='record' AND id=$1",[publication.id])).rows[0]:null;
     return {result:{case:await readAppeal(c,a.id),snapshot:a.snapshot,current:{submittedRevision:j.revision,state:j.state,current:s.current_revision===j.revision&&s.digest===j.submitted_digest&&s.state==='queued',publication:publication&&status?{...publication,revision:Number(publication.revision),...status}:null},moderation:(await c.query("SELECT state,reason,command->>'visibility' AS visibility FROM member_knowledge.moderation_decisions WHERE appeal_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1",[a.id])).rows[0]??null,history:(await c.query('SELECT action,reason,created_at FROM member_knowledge.appeal_operations WHERE appeal_id=$1 ORDER BY created_at,id',[a.id])).rows},replayed:!!prior};
    }
    if(a.revision!==input.expectedRevision)throw new MemberError(409,'VERSION_CONFLICT');
    if(!(await c.query("SELECT 1 FROM member_knowledge.appeal_operations WHERE appeal_id=$1 AND actor_id=$2 AND action='inspect' AND created_at>clock_timestamp()-interval '30 minutes'",[a.id,u.id])).rowCount)throw new MemberError(409,'INSPECTION_REQUIRED');
    let result:Record<string,unknown>={id:a.id,action:input.action};
    if(input.action==='recheck'||input.action==='confirm-content'){
     if(a.status!=='open'||s.current_revision!==j.revision||s.digest!==j.submitted_digest||s.state!=='queued'||!['needs-changes','declined','attention'].includes(j.state))throw new MemberError(409,'RESULT_CHANGED');
     const disclosure=reviewDisclosureForConsent(j.consent_version),authorization=(await c.query('SELECT consent_profile_id FROM member_knowledge.review_authorizations WHERE submission_id=$1 AND revision=$2',[s.id,j.revision])).rows[0];
     if(!reviewEnabledFor(s.owner_id)||process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED!=='1'||j.consent_version!==PUBLICATION_CONSENT_VERSION||disclosure?.profileId!==j.consent_profile_id||authorization?.consent_profile_id!==disclosure?.profileId)throw new MemberError(409,'CONSENT_CHANGED');
     if((await c.query('SELECT 1 FROM member_knowledge.publication_decisions WHERE job_id=$1',[j.id])).rowCount)throw new MemberError(409,'NEW_SUBMISSION_REQUIRED');
     await c.query("UPDATE member_knowledge.review_jobs SET state=$2,reason=$3,result=CASE WHEN $2='queued' THEN NULL ELSE result END,operator_confirmation_id=$4,attempts=0,not_before=clock_timestamp(),lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=$1",[j.id,input.action==='recheck'?'queued':'reviewed',input.action==='recheck'?'運営への相談を受け、内容を再確認します。':'運営で内容を確認しました。原資料と公開条件を照合します。',input.action==='confirm-content'?opId:null]);
     await c.query('DELETE FROM member_knowledge.source_checks WHERE job_id=$1',[j.id]);
    }else if(input.action==='hide'||input.action==='restore'){
     const d=(await c.query("SELECT * FROM member_knowledge.publication_decisions WHERE job_id=$1 AND state='published'",[j.id])).rows[0];if(!d)throw new MemberError(409,'NOT_PUBLISHED');
     await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['knowledge-moderation:'+d.command.record.id]);
     const r=(await knowledge().query("SELECT visibility,status_revision FROM knowledge75.objects WHERE kind='record' AND id=$1",[d.command.record.id])).rows[0];
     if(!r||r.status_revision!==input.statusRevision||r.visibility!==(input.action==='hide'?'public':'hidden'))throw new MemberError(409,'PUBLICATION_CHANGED');
     if((await c.query("SELECT 1 FROM member_knowledge.moderation_decisions WHERE command->>'id'=$1 AND state='pending'",[d.command.record.id])).rowCount)throw new MemberError(409,'MODERATION_PENDING');
     if(input.action==='restore'){
      const stop=(await c.query("SELECT * FROM member_knowledge.moderation_decisions WHERE command->>'id'=$1 ORDER BY created_at DESC,id DESC LIMIT 1",[d.command.record.id])).rows[0];
      if(!stop||stop.appeal_id!==a.id||stop.state!=='applied'||stop.command.visibility!=='hidden'||stop.result?.revision!==r.status_revision)throw new MemberError(409,'ORIGINAL_CASE_REQUIRED');
     }
     const command={action:'set-visibility',requestId:opId,kind:'record',id:d.command.record.id,expectedStatusRevision:r.status_revision,visibility:input.action==='hide'?'hidden':'public',reason:'サイト運営による公開範囲の対応'};
     await c.query('INSERT INTO member_knowledge.moderation_decisions(id,appeal_id,command) VALUES($1,$2,$3)',[opId,a.id,command]);result={...result,pending:true};
    }
    await c.query("UPDATE member_knowledge.appeals SET status='answered',revision=revision+1,updated_at=clock_timestamp() WHERE id=$1",[a.id]);
    await c.query('UPDATE member_knowledge.appeal_operations SET public_reply=true,result=$2 WHERE id=$1',[opId,result]);
    await feedback(c,j,opId);return {result,replayed:false};
   },input.id);
  },
 };
}

/** Durable public visibility delivery. Replays the same command after any crash. */
export async function runKnowledgeModeration(pool:Pool,knowledge:Pool){
 await ensureKnowledgeAppeals(pool);
 const d=(await pool.query("SELECT * FROM member_knowledge.moderation_decisions WHERE (state='pending' AND not_before<=clock_timestamp()) OR (state IN ('applied','blocked') AND notified_at IS NULL) ORDER BY created_at,id LIMIT 1")).rows[0];if(!d)return false;
 let state=d.state==='pending'?'applied':d.state,reason=d.reason,result:unknown=d.result;
 if(d.state==='pending'){try{result=await createKnowledgeFoundationService(knowledge).execute({kind:'operator',id:'site-knowledge-operations'},d.command);}
 catch(e){state=e instanceof KnowledgeError&&e.status<500?'blocked':'pending';reason=state==='blocked'?'公開状態が変わったため適用できませんでした。運営で最新状態を確認します。':'公開先へ接続できません。処置を保持して再試行します。';}
 await pool.query("UPDATE member_knowledge.moderation_decisions SET state=$2,result=$3,reason=$4,not_before=clock_timestamp()+interval '60 seconds' WHERE id=$1 AND state='pending'",[d.id,state,result,reason]);}
 if(state!=='pending'&&d.appeal_id)await memberTransaction(pool,async c=>{
  const seed=(await c.query('SELECT s.owner_id,s.id,j.id AS job_id FROM member_knowledge.appeals a JOIN member_knowledge.review_jobs j ON j.id=a.job_id JOIN member_knowledge.submissions s ON s.id=j.submission_id WHERE a.id=$1',[d.appeal_id])).rows[0];if(!seed)return;
  await c.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[seed.owner_id]);await c.query('SELECT id FROM member_knowledge.submissions WHERE id=$1 FOR UPDATE',[seed.id]);
  const j=(await c.query('SELECT * FROM member_knowledge.review_jobs WHERE id=$1 FOR UPDATE',[seed.job_id])).rows[0];
  const a=(await c.query('SELECT id FROM member_knowledge.appeals WHERE id=$1 FOR UPDATE',[d.appeal_id])).rows[0];if(!a||!j)return;
  const message=state==='blocked'?reason:d.command.visibility==='hidden'?'知識の公開を停止しました。':'この案件による公開停止を解除しました。';
  const added=await c.query('INSERT INTO member_knowledge.appeal_operations(id,appeal_id,actor_id,request_id,payload_hash,action,reason,public_reply,result) VALUES($1,$2,NULL,$3,$4,$5,$6,true,$7) ON CONFLICT(appeal_id,request_id,action) DO NOTHING',[randomUUID(),a.id,d.id,knowledgeDigest({state,result}),d.command.visibility+'-'+state,message,result??{}]);
  if(added.rowCount){await c.query('UPDATE member_knowledge.appeals SET revision=revision+1,updated_at=clock_timestamp() WHERE id=$1',[a.id]);await feedback(c,j,d.id+':'+state);}
 });
 if(state!=='pending')await pool.query('UPDATE member_knowledge.moderation_decisions SET notified_at=clock_timestamp() WHERE id=$1 AND notified_at IS NULL',[d.id]);
 return true;
}
