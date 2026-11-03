import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import type {Pool,PoolClient,QueryResultRow} from "pg";
import {createHash} from "node:crypto";
import {knowledgeCommandSchema,type KnowledgeCommand} from "../domain/knowledge-foundation";
import {knowledgeSubmissionContentSchema,type KnowledgeSubmission} from "../domain/knowledge-submission";
import {PUBLICATION_CONSENT_VERSION} from "../domain/knowledge-review-job";
import {createKnowledgeFoundationService,knowledgeDigest,KnowledgeError} from "./knowledge-foundation";
import {verifySourceExcerpt,sourceURL,SourceCheckError,type SourceProof} from "./knowledge-source-verification";
import type {ReviewConfig} from "./knowledge-review-queue";

export const acceptanceEnabled=()=>process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED==='1';
export async function ensureAcceptanceSchema(pool:Pool){
 const checksum=createHash('sha256').update(await readFile(path.join(process.cwd(),'db/member/022-knowledge-acceptance.sql'))).digest('hex');
 if((await pool.query("SELECT checksum FROM member_migration WHERE name='022-knowledge-acceptance.sql'")).rows[0]?.checksum!==checksum)throw new KnowledgeError('公開受理用の明示migrationが必要です',503,'MIGRATION_REQUIRED');
}
export type AcceptancePlan={command:KnowledgeCommand;references:{kind:'entity'|'source'|'record';id:string;revision:number;content?:unknown}[];recordId:string};
export function acceptancePlan(value:KnowledgeSubmission,key:string,decisionId:string,observedRecord?:{id:string;revision:number;content:unknown}):AcceptancePlan{
 const item=value.content.items.find(i=>i.key===key);if(!item)throw new SourceCheckError('対象の項目がありません。');
 const references:AcceptancePlan['references']=[];
 const allocate=(kind:string,id:string)=>'submission:'+(kind==='record'?decisionId:knowledgeDigest({submission:value.id,revision:value.revision}).slice(0,32))+':'+kind+':'+knowledgeDigest(id).slice(0,16);
 const used=[...new Set([item.record.subjectId,item.record.objectId].filter((v):v is string=>!!v))];
 const entities=value.content.entities.filter(e=>used.includes(e.id)).map(e=>({id:allocate('entity',e.id),content:{...e.content,description:'',aliases:[]}}));
 const entityId=(id:string|null)=>{
  if(!id)return null;const own=value.content.entities.find(e=>e.id===id);if(own)return allocate('entity',id);
  const pin=value.content.entityPins.find(e=>e.id===id),observed=value.context?.entities.find(e=>e.id===id);
  if(!pin||!observed)throw new SourceCheckError('関係する対象の取得版がありません。Capsuleから選び直してください。');
  references.push({kind:'entity',...pin,content:observed.content});return id;
 };
 const record={...item.record,subjectId:entityId(item.record.subjectId),objectId:entityId(item.record.objectId),evidence:item.record.evidence.map(e=>{
  const own=value.content.sources.find(s=>s.id===e.source.id&&e.source.revision===1);
  if(own)return {...e,source:{id:allocate('source',own.id),revision:1}};
  const source=value.context?.sources.find(s=>s.id===e.source.id&&s.revision===e.source.revision);
  if(!source||!value.content.sourcePins.some(s=>s.id===source.id&&s.revision===source.revision))throw new SourceCheckError('資料の取得版がありません。根拠を追加し直してください。');
  references.push({kind:'source',...e.source,content:source.content});return e;
 })};
 const sources=value.content.sources.filter(s=>item.record.evidence.some(e=>e.source.id===s.id&&e.source.revision===1)).map(s=>({id:allocate('source',s.id),content:s.content}));
 const id=item.correction?.id??allocate('record',item.key);
 if(item.correction){
  if(!observedRecord||observedRecord.id!==item.correction.id||observedRecord.revision!==item.correction.revision)throw new SourceCheckError('訂正する元の記録をCapsuleから選んで取り込んでください。');
  const baseline=observedRecord.content as {kind:string;subjectId:string|null;objectId:string|null;relation:string;polarity:string};
  if(['kind','subjectId','objectId','relation','polarity'].some(key=>baseline[key as keyof typeof baseline]!==record[key as keyof typeof baseline]))throw new SourceCheckError('関係の両端・種類・肯否が変わっています。別の知識として投稿してください。');
  references.push({kind:'record',...item.correction,content:observedRecord.content});
 }
 const uniqueReferences=[...new Map(references.map(ref=>[ref.kind+':'+ref.id+'@'+ref.revision,ref])).values()];
 const command=knowledgeCommandSchema.parse({action:'accept-record',requestId:decisionId,entities,sources,entityPins:uniqueReferences.filter(r=>r.kind==='entity').map(({id,revision})=>({id,revision})),sourcePins:uniqueReferences.filter(r=>r.kind==='source').map(({id,revision})=>({id,revision})),record:{id,content:record},...(item.correction?{expectedRevision:item.correction.revision}:{}),reason:'利用者投稿のAI確認・原資料照合による自動受理'});
 return {command,references:uniqueReferences,recordId:id};
}
export async function verifyAcceptanceReferences(c:PoolClient,refs:AcceptancePlan['references'],lock=true){
 for(const ref of [...refs].sort((a,b)=>(a.kind+':'+a.id).localeCompare(b.kind+':'+b.id))){
  const row=(await c.query(`SELECT o.*,r.content,EXISTS(SELECT 1 FROM knowledge75.published_revisions p WHERE p.kind=o.kind AND p.id=o.id AND p.revision=$3) AS published FROM knowledge75.objects o JOIN knowledge75.revisions r ON r.kind=o.kind AND r.id=o.id AND r.revision=$3 WHERE o.kind=$1 AND o.id=$2 ${lock?"FOR SHARE OF o":""}`,[ref.kind,ref.id,ref.revision])).rows[0];
  if(!row||row.visibility!=='public'||!row.published||row.current_revision!==ref.revision)throw new SourceCheckError('取得元の内容や公開範囲が変わりました。最新版を確認して投稿し直してください。');
  if(ref.kind==='record'){
   const legacy=(await c.query('SELECT dataset,payload FROM knowledge75.legacy_links WHERE record_id=$1',[ref.id])).rows;
   if(legacy.some(r=>r.payload?.claim||!String(r.dataset).startsWith('theme75:')))throw new SourceCheckError('旧KGの型付き記録の訂正は準備中です。公開元の限定を確認してください。');
  }
  if(ref.content&&knowledgeDigest(ref.content)!==knowledgeDigest(row.content))throw new SourceCheckError('対象名・資料の取得版が原記録と異なります。取得元の内容を確認してください。');
 }
}
function material(s:QueryResultRow):KnowledgeSubmission{return {id:s.id,revision:s.current_revision,version:s.state_version,state:s.state,content:knowledgeSubmissionContentSchema.parse(s.content),digest:s.digest,createdAt:String(s.created_at),updatedAt:String(s.updated_at),...(s.source_capsule?.captured?{context:{entities:s.source_capsule.captured.entities,sources:s.source_capsule.captured.sources}}:{})};}
export function createKnowledgeAcceptance(pool:Pool,knowledge:Pool,hooks:{afterDecision?:()=>Promise<void>;afterPrepare?:()=>Promise<void>}={},verify=verifySourceExcerpt){
 let ready:Promise<void>|undefined;
 const ensure=async()=>{ready??=ensureAcceptanceSchema(pool).catch(e=>{ready=undefined;throw e;});await ready;};
 async function locked<T>(jobId:string,action:(c:PoolClient,s:QueryResultRow,j:QueryResultRow)=>Promise<T>){
  const seed=(await pool.query('SELECT s.owner_id,s.id FROM member_knowledge.review_jobs j JOIN member_knowledge.submissions s ON s.id=j.submission_id WHERE j.id=$1',[jobId])).rows[0];if(!seed)return null;
  const c=await pool.connect();try{await c.query('BEGIN');const active=(await c.query('SELECT active FROM "user" WHERE id=$1 FOR UPDATE',[seed.owner_id])).rows[0]?.active;
   const s=(await c.query('SELECT s.*,r.content,r.digest,r.source_capsule FROM member_knowledge.submissions s JOIN member_knowledge.submission_revisions r ON r.submission_id=s.id AND r.revision=s.current_revision WHERE s.id=$1 FOR UPDATE OF s',[seed.id])).rows[0];
   const j=(await c.query('SELECT * FROM member_knowledge.review_jobs WHERE id=$1 FOR UPDATE',[jobId])).rows[0];
   if(!active||!s||!j||s.state!=='queued'||s.current_revision!==j.revision||s.digest!==j.submitted_digest){await c.query('ROLLBACK');return null;}
   const result=await action(c,s,j);await c.query('COMMIT');return result;
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 const foundation=createKnowledgeFoundationService(knowledge);
 async function delivered(decision:QueryResultRow,result:unknown){
  // Acknowledgement is idempotent even if private account/job rows no longer exist.
  const c=await pool.connect();try{await c.query('BEGIN');await c.query("UPDATE member_knowledge.publication_decisions SET state='published',result=$2,published_at=clock_timestamp(),reason='' WHERE id=$1",[decision.id,result]);await c.query("UPDATE member_knowledge.review_jobs SET state='accepted',reason='受理しました。検索・関係図へ反映しています。',lease_token=NULL,lease_until=NULL WHERE id=$1 AND state='accepted'",[decision.job_id]);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 async function deliver(decision:QueryResultRow,prepare:()=>Promise<void>=async()=>{}){
  const result=await foundation.execute({kind:'submission',id:'member-submission-v1'},decision.command,{verify:c=>verifyAcceptanceReferences(c,decision.references_json),prepare});
  await hooks.afterDecision?.();await delivered(decision,result);
 }
 return {
 async validateReview(jobId:string){
  const row=(await pool.query("SELECT s.*,r.content,r.digest,r.source_capsule,j.item_key,j.consent_version FROM member_knowledge.review_jobs j JOIN member_knowledge.submissions s ON s.id=j.submission_id JOIN member_knowledge.submission_revisions r ON r.submission_id=s.id AND r.revision=s.current_revision WHERE j.id=$1",[jobId])).rows[0];
  if(!row||row.consent_version!==PUBLICATION_CONSENT_VERSION)return null;
  const c=await knowledge.connect().catch(()=>null);if(!c)return {reason:"取得元の公開状態を確認できません。時間をおいて再試行します。",retryable:true};
  try{
   const value=material(row),item=value.content.items.find(i=>i.key===row.item_key)!;
   if(!item.record.evidence.length)throw new SourceCheckError('資料と、本文から引用した根拠の抜粋を追加してください。');
   for(const evidence of item.record.evidence){
    const source=value.content.sources.find(s=>s.id===evidence.source.id&&evidence.source.revision===1)??value.context?.sources.find(s=>s.id===evidence.source.id&&s.revision===evidence.source.revision);
    if(!source?.content.url)throw new SourceCheckError('書誌だけの資料はまだ自動照合できません。公開URLを追加してください。');
    sourceURL(source.content.url);if(!evidence.excerpt.trim())throw new SourceCheckError('資料本文から引用した根拠の抜粋を追加してください。');
   }
   const observed=row.source_capsule?.captured?.records?.find((r:{id:string})=>r.id===item.correction?.id);
   const plan=acceptancePlan(value,item.key,jobId,observed);
   await c.query('BEGIN READ ONLY');await verifyAcceptanceReferences(c,plan.references,false);await c.query('COMMIT');return null;
  }catch(e){await c.query('ROLLBACK');return {reason:e instanceof SourceCheckError?e.message:'取得元の公開状態を確認できません。時間をおいて再試行します。',retryable:!(e instanceof SourceCheckError)||e.retryable};}finally{c.release();}
 },
 async run(config:ReviewConfig){
  await ensure();
  const indexed=(await pool.query("SELECT d.id,d.job_id,d.result FROM member_knowledge.publication_decisions d JOIN member_knowledge.review_jobs j ON j.id=d.job_id WHERE d.state='published' AND j.state='accepted' LIMIT 20")).rows;
  for(const d of indexed){
   const exists=(await knowledge.query("SELECT 1 FROM knowledge75.publication_control c JOIN knowledge75.publication_records r ON r.generation=c.active_generation JOIN knowledge75.objects o ON o.kind='record' AND o.id=r.id WHERE c.singleton AND r.id=$1 AND r.revision>=$2 AND o.visibility='public'",[d.result.id,d.result.revision])).rowCount;
   if(exists)await pool.query("UPDATE member_knowledge.review_jobs SET state='published',reason='知識として公開しました。' WHERE id=$1 AND state='accepted'",[d.job_id]);
  }
  const pending=(await pool.query("SELECT * FROM member_knowledge.publication_decisions WHERE state='pending' AND not_before<=clock_timestamp() ORDER BY created_at LIMIT 1")).rows[0];
  if(pending){
   if(knowledgeDigest(pending.command)!==pending.digest)throw Error('Accepted command digest differs');
   try{await deliver(pending);}catch(e){const blocked=e instanceof SourceCheckError||e instanceof KnowledgeError&&e.status<500;await pool.query("UPDATE member_knowledge.publication_decisions SET state=$2,attempts=attempts+1,reason=$3,not_before=clock_timestamp()+interval '120 seconds' WHERE id=$1",[pending.id,blocked?'blocked':'pending',blocked?(e as Error).message:'公開処理との接続を再試行しています。受理内容は保存されています。']);if(blocked)await pool.query("UPDATE member_knowledge.review_jobs SET state='needs-changes',reason=$2 WHERE id=$1 AND state='accepted'",[pending.job_id,(e as Error).message]);}
   return true;
  }
  const candidates=(await pool.query(`SELECT j.id FROM member_knowledge.review_jobs j LEFT JOIN member_knowledge.source_checks s ON s.job_id=j.id JOIN member_knowledge.submissions p ON p.id=j.submission_id WHERE j.consent_version=$1 AND p.owner_id=ANY($2::uuid[]) AND (j.state='reviewed' OR j.state='source-retry' AND s.not_before<=clock_timestamp() OR j.state='verifying' AND s.lease_until<clock_timestamp()) ORDER BY j.created_at LIMIT 8`,[PUBLICATION_CONSENT_VERSION,config.allowedUsers])).rows;
  for(const candidate of candidates){
   const token=randomUUID();const lease=await locked(candidate.id,async(c,s,j)=>{
    if(!['reviewed','source-retry','verifying'].includes(j.state)||j.consent_version!==PUBLICATION_CONSENT_VERSION||j.result?.suitability!=='legitimate'||j.result?.support!=='supported')return null;
    const prior=(await c.query('SELECT * FROM member_knowledge.source_checks WHERE job_id=$1',[j.id])).rows[0];
    if(prior&&j.state==='verifying'&&new Date(prior.lease_until)>new Date()||prior&&j.state==='source-retry'&&new Date(prior.not_before)>new Date())return null;
    if(prior?.attempts>=3){await c.query("UPDATE member_knowledge.review_jobs SET state='attention',reason='原資料の接続を3回試しました。資料URLを確認してください。' WHERE id=$1",[j.id]);return null;}
    await c.query("INSERT INTO member_knowledge.source_checks(job_id,attempts,token,lease_until) VALUES($1,1,$2,clock_timestamp()+interval '180 seconds') ON CONFLICT(job_id) DO UPDATE SET attempts=source_checks.attempts+1,token=$2,lease_until=clock_timestamp()+interval '180 seconds'",[j.id,token]);
    await c.query("UPDATE member_knowledge.review_jobs SET state='verifying',reason='原資料の本文と抜粋を照合しています。' WHERE id=$1",[j.id]);return {s,j};
   });if(!lease)continue;
   try{
    const value=material(lease.s),item=value.content.items.find(i=>i.key===lease.j.item_key)!;
    const legacy=lease.s.source_capsule?.captured?.relations?.find((r:{origin:{kind:string};key:string})=>r.origin.kind==='kg'&&'capsule-relation:'+r.key===item.key);
    if(legacy)throw new SourceCheckError('旧KGの型付き限定を保つ受理は準備中です。限定を確認し、新しい知識として内容と根拠を記入してください。');
    if(!item.record.evidence.length)throw new SourceCheckError('根拠の資料と、資料本文からの抜粋を追加してください。');
    const proofs:SourceProof[]=[];const start=Date.now();
    for(const evidence of item.record.evidence){
     if(Date.now()-start>45000)throw new SourceCheckError('複数資料の取得に時間がかかっています。時間をおいて再試行します。',true);
     const source=value.content.sources.find(s=>s.id===evidence.source.id&&evidence.source.revision===1)??value.context?.sources.find(s=>s.id===evidence.source.id&&s.revision===evidence.source.revision);
     if(!source?.content.url)throw new SourceCheckError('書誌だけの資料はまだ自動照合できません。本文を確認できる公開URLを追加してください。');
     proofs.push(await verify(source.content.url,evidence.excerpt));
    }
    const plan=acceptancePlan(value,item.key,lease.j.id,lease.s.source_capsule?.captured?.records?.find((r:{id:string})=>r.id===item.correction?.id));
    const decision={id:lease.j.id,job_id:lease.j.id,command:plan.command,digest:knowledgeDigest(plan.command),references_json:plan.references,proofs};
    await deliver(decision,async()=>{
     const accepted=await locked(lease.j.id,async(c,_s,j)=>{
      const check=(await c.query('SELECT token FROM member_knowledge.source_checks WHERE job_id=$1 FOR UPDATE',[j.id])).rows[0];if(j.state!=='verifying'||check?.token!==token)throw new KnowledgeError('受付版が変わりました',409,'STALE');
      await c.query("INSERT INTO member_knowledge.publication_decisions(id,job_id,command,digest,references_json,proofs,state) VALUES($1,$2,$3,$4,$5,$6,'pending') ON CONFLICT(id) DO NOTHING",[decision.id,j.id,decision.command,decision.digest,JSON.stringify(plan.references),JSON.stringify({sources:proofs,review:j.result,consent:j.consent_version})]);
      await c.query("UPDATE member_knowledge.source_checks SET proofs=$2 WHERE job_id=$1",[j.id,JSON.stringify(proofs)]);
      await c.query("UPDATE member_knowledge.review_jobs SET state='accepted',reason='受理しました。公開へ反映しています。' WHERE id=$1",[j.id]);return true;
     });if(!accepted)throw new KnowledgeError('受付版または会員状態が変わりました',409,'STALE');await hooks.afterPrepare?.();
    });
   }catch(e){
    await locked(lease.j.id,async(c,_s,j)=>{
     if(j.state!=='verifying')return;
     const reason=e instanceof SourceCheckError?e.message:e instanceof KnowledgeError&&e.code==='CONFLICT'?'取得元が更新されました。最新版を確認して投稿し直してください。':'原資料・公開接続を確認できません。時間をおいて再試行します。';
     const retry=!(e instanceof SourceCheckError)||e.retryable;
     await c.query('UPDATE member_knowledge.source_checks SET reason=$2,not_before=clock_timestamp()+$3::integer*interval \'1 millisecond\',lease_until=NULL WHERE job_id=$1',[j.id,reason,e instanceof SourceCheckError?e.retryAfterMs:120000]);
     await c.query('UPDATE member_knowledge.review_jobs SET state=$2,reason=$3 WHERE id=$1',[j.id,retry?'source-retry':'needs-changes',reason]);
    });
   }
   return true;
  }
  return false;
 }};
}
