import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type {Pool,PoolClient,QueryResultRow} from 'pg';
import {readingOperatorSchema,readingWorkerSchema,READING_POLICY,sourceChunks,type ReadingLease} from '../domain/knowledge-collection-reading';
import {createKnowledgeFoundationService,knowledgeDigest,KnowledgeError} from './knowledge-foundation';
import {readingPlans,readingRequest,type ReadingContext} from './knowledge-collection-plan';
import {verifyAcceptanceReferences} from './knowledge-acceptance';
import {normalizeSourceText,sourceText,SourceCheckError} from './knowledge-source-verification';
import {geminiReviewRequest,parseGeminiJson,parseGeminiReview} from './gemini-knowledge-review';
import {reserveKnowledgeAI} from './knowledge-ai-budget';
import type {ReviewConfig} from './knowledge-review-queue';
import {memberTransaction} from './member/operations';
import {MemberError} from './member/http';
import {isSiteOperator} from './member/site-operations';
const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
const iso=(s:Date|string)=>s instanceof Date?s.toISOString():s;
export async function ensureReadingSchema(pool:Pool){const checksum=hash(await readFile(path.join(process.cwd(),'db/member/028-collection-reading.sql')));if((await pool.query("SELECT checksum FROM member_migration WHERE name='028-collection-reading.sql'")).rows[0]?.checksum!==checksum)throw new MemberError(503,'MIGRATION_REQUIRED');}
export function createCollectionReading(pool:Pool,knowledge:Pool,cfg:ReviewConfig){
 const foundation=createKnowledgeFoundationService(knowledge);const reader={kind:'reader' as const,id:'collection-public-context'};
 let ready:Promise<void>|undefined;const ensure=()=>ready??=ensureReadingSchema(pool).catch(e=>{ready=undefined;throw e;});
 async function tx<T>(run:(c:PoolClient)=>Promise<T>){await ensure();return memberTransaction(pool,run);}
 async function once(c:PoolClient,principal:string,input:{requestId:string;action:string},run:()=>Promise<unknown>){
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['collection-reading:'+principal+':'+input.requestId]);const digest=knowledgeDigest(input);
  const old=(await c.query('SELECT * FROM knowledge_collection.commands WHERE principal=$1 AND request_id=$2',[principal,input.requestId])).rows[0];
  if(old){if(old.payload_hash!==digest)throw new MemberError(409,'REQUEST_CHANGED');return {result:old.result,replayed:true};}
  const result=await run();await c.query('INSERT INTO knowledge_collection.commands(principal,request_id,action,payload_hash,result) VALUES($1,$2,$3,$4,$5)',[principal,input.requestId,input.action,digest,result]);return {result,replayed:false};
 }
 async function source(c:PoolClient,id:string){const s=(await c.query("SELECT * FROM knowledge_collection.items WHERE id=$1 AND state='captured'",[id])).rows[0];
  if(!s?.body||!s.document||hash(s.body)!==s.body_sha256||hash(s.document.text)!==s.text_sha256||normalizeSourceText(sourceText({url:s.document.url,type:s.document.type,body:s.body}))!==s.document.text)throw new KnowledgeError('保存した資料の原本が一致しません',409,'SOURCE_CHANGED');return s;
 }
 async function active(c:PoolClient,j:QueryResultRow){return j.state==='active'&&isSiteOperator(j.creator_id)&&(await c.query('SELECT 1 FROM "user" WHERE id=$1 AND active FOR SHARE',[j.creator_id])).rowCount===1;}
 async function references(context:ReadingContext){const c=await knowledge.connect();try{await c.query('BEGIN READ ONLY');await verifyAcceptanceReferences(c,context.references,false);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 async function contextFor(target:ReadingContext['target']):Promise<ReadingContext>{
  const known=(await knowledge.query("SELECT r.content->>'assertion' AS assertion FROM knowledge75.objects o JOIN knowledge75.revisions r ON r.kind=o.kind AND r.id=o.id AND r.revision=o.current_revision WHERE o.kind='record' AND o.visibility='public' AND (r.content->>'subjectId'=$1 OR r.content->>'objectId'=$1 OR r.content->>'aboutTheme'=$1) ORDER BY o.id LIMIT 40",[target.id])).rows.map(r=>r.assertion);
  if(target.kind==='entity'){const e=await foundation.get(reader,'entity',target.id,target.revision);const context={target,knownAssertions:known,label:e.content.name,entities:[e],references:[{kind:'entity' as const,id:e.id,revision:e.revision,content:e.content}]};await references(context);return context;}
  const {theme,snapshot}=await foundation.resolveTheme(reader,target.id,target.revision);if(snapshot.entities.length>40)throw new KnowledgeError('初版の読解対象は40対象までです。対象Entityを選んで分けてください');
  const context={target,knownAssertions:known,label:theme.content.title,entities:snapshot.entities,references:[{kind:'theme' as const,id:theme.id,revision:theme.revision,content:theme.content},...snapshot.entities.map(e=>({kind:'entity' as const,id:e.id,revision:e.revision,content:e.content}))]};await references(context);return context;
 }
 async function task(c:PoolClient,input:ReadingLease){
  const j=(await c.query('SELECT * FROM knowledge_collection.read_jobs WHERE id=$1 FOR UPDATE',[input.jobId])).rows[0];
  const t=(await c.query('SELECT * FROM knowledge_collection.read_tasks WHERE id=$1 AND job_id=$2 FOR UPDATE',[input.taskId,input.jobId])).rows[0];
  const a=(await c.query('SELECT a.*,u.model,u.state AS usage_state FROM knowledge_collection.read_attempts a JOIN member_knowledge.review_attempts u ON u.id=a.id WHERE a.id=$1 AND a.task_id=$2 FOR UPDATE OF a,u',[input.attemptId,input.taskId])).rows[0];
  if(!j||!t||!a||a.wire!==input.wire||a.wire_digest!==input.wireDigest||a.model!==input.model||hash(input.wire)!==input.wireDigest)throw new MemberError(409,'LEASE_CHANGED');return {j,t,a};
 }
 async function live(c:PoolClient,j:QueryResultRow,t:QueryResultRow,lease:ReadingLease){return await active(c,j)&&t.state==='running'&&t.lease_token===lease.token&&t.current_attempt===lease.attemptId&&new Date(t.lease_until).getTime()>Date.now();}
 async function settle(c:PoolClient,id:string,result:Extract<ReturnType<typeof readingWorkerSchema.parse>,{action:'complete'}>['result']){
  const parsed=result.state==='received'?parseGeminiJson(result.raw):null,u=parsed?.usage;await c.query(`UPDATE member_knowledge.review_attempts SET state=$2,finished_at=clock_timestamp(),request_charge=$3,input_actual=$4,output_actual=$5,thoughts_actual=$6,cached_actual=$7,total_actual=$8,candidates_actual=$9 WHERE id=$1 AND state IN('reserved','sending','delivery-unknown')`,[id,result.state,result.state==='not-sent'?0:1,result.state==='not-sent'?0:u?.promptTokenCount??null,result.state==='not-sent'?0:u?.candidatesTokenCount!=null&&u?.thoughtsTokenCount!=null?u.candidatesTokenCount+u.thoughtsTokenCount:null,u?.thoughtsTokenCount??null,u?.cachedContentTokenCount??null,u?.totalTokenCount??null,u?.candidatesTokenCount??null]);
 }
 async function createChecks(c:PoolClient,j:QueryResultRow,t:QueryResultRow,raw:unknown){
  const s=await source(c,t.source_id);const plans=readingPlans(raw,j.context,{id:'collection-source:'+s.id,title:s.url,url:s.document.url,text:s.document.text,bodySha256:s.body_sha256,textSha256:s.text_sha256},j.id);
  for(const plan of plans){const id=randomUUID();if(plan.state==='attention'){await c.query("INSERT INTO knowledge_collection.read_tasks(id,job_id,source_id,purpose,content,state,reason) VALUES($1,$2,$3,'check',$4,'attention',$5)",[id,j.id,t.source_id,{candidate:plan.candidate},plan.reason]);continue;}
   if((await c.query("SELECT 1 FROM knowledge_collection.read_tasks WHERE job_id=$1 AND purpose='check' AND content->'command'->'record'->>'id'=$2",[j.id,plan.command.action==='accept-record'?plan.command.record.id:''])).rowCount)continue;
   const request=geminiReviewRequest(plan.review);request.systemInstruction.parts[0].text+=' Additionally require relevance to the requested collection scope, correct endpoint identity, no invented precision or membership. Unclear identity/relevance => support unclear. Scope: '+j.scope;
   await c.query("INSERT INTO knowledge_collection.read_tasks(id,job_id,source_id,purpose,content) VALUES($1,$2,$3,'check',$4)",[id,j.id,t.source_id,{command:plan.command,request,candidate:plan.candidate}]);
  }return {candidates:plans.length,reason:!plans.length?'この資料では登録する項目がありませんでした。':''};
 }
 async function recover(c:PoolClient){
  const expired=(await c.query("SELECT t.* FROM knowledge_collection.read_tasks t WHERE state='running' AND lease_until<=clock_timestamp() FOR UPDATE SKIP LOCKED")).rows;
  for(const t of expired){const a=(await c.query('SELECT state FROM member_knowledge.review_attempts WHERE id=$1 FOR UPDATE',[t.current_attempt])).rows[0];
   await c.query("UPDATE member_knowledge.review_attempts SET state=$2,request_charge=$3,input_actual=CASE WHEN $3=0 THEN 0 ELSE input_actual END,output_actual=CASE WHEN $3=0 THEN 0 ELSE output_actual END,finished_at=clock_timestamp() WHERE id=$1 AND state IN('reserved','sending')",[t.current_attempt,a?.state==='reserved'?'not-sent':'delivery-unknown',a?.state==='reserved'?0:1]);
   await c.query("UPDATE knowledge_collection.read_tasks SET state=$2,reason='配送結果が不明な試行を記録しました。残る回数内で再試行します。',next_attempt=clock_timestamp()+interval '2 minutes',lease_token=NULL,lease_until=NULL WHERE id=$1",[t.id,t.attempts>=3?'attention':'retry']);
  }
 }
 async function worker(identity:string,input:ReturnType<typeof readingWorkerSchema.parse>){return tx(async c=>{await c.query('INSERT INTO knowledge_collection.read_workers(id) VALUES($1) ON CONFLICT(id) DO UPDATE SET last_seen=clock_timestamp()',[identity]);return once(c,'reader:'+identity,input,async()=>{
  if(input.action==='claim'){
   await c.query("SELECT pg_advisory_xact_lock(hashtextextended('collection-reading-claim',0))");await recover(c);
   const rows=(await c.query("SELECT j.* FROM knowledge_collection.read_jobs j WHERE j.state='active' AND EXISTS(SELECT 1 FROM knowledge_collection.read_tasks t WHERE t.job_id=j.id AND t.state IN('queued','retry','quota') AND t.next_attempt<=clock_timestamp()) ORDER BY j.created_at LIMIT 1 FOR UPDATE OF j")).rows;if(!rows.length)return {lease:null};const j=rows[0];
   if(!await active(c,j)){await c.query("UPDATE knowledge_collection.read_jobs SET state='cancelled' WHERE id=$1",[j.id]);await c.query("UPDATE knowledge_collection.read_tasks SET state='cancelled',reason='依頼者の利用状態が変わりました。' WHERE job_id=$1 AND state IN('queued','retry','quota')",[j.id]);return {lease:null};}
   const t=(await c.query("SELECT * FROM knowledge_collection.read_tasks WHERE job_id=$1 AND state IN('queued','retry','quota') AND next_attempt<=clock_timestamp() ORDER BY created_at,id LIMIT 1 FOR UPDATE",[j.id])).rows[0];
   if((await c.query('SELECT count(*)::int AS n FROM knowledge_collection.read_attempts a JOIN knowledge_collection.read_tasks t ON t.id=a.task_id WHERE t.job_id=$1',[j.id])).rows[0].n>=16){await c.query("UPDATE knowledge_collection.read_tasks SET state='attention',reason='依頼の最大16試行に達しました。範囲を分けて依頼できます。' WHERE job_id=$1 AND state IN('queued','retry','quota')",[j.id]);return {lease:null};}
   try{await references(j.context);await source(c,t.source_id);}catch(e){if(!(e instanceof KnowledgeError)&&!(e instanceof SourceCheckError))throw e;await c.query("UPDATE knowledge_collection.read_tasks SET state='attention',reason=$2 WHERE id=$1",[t.id,(e as Error).message]);return {lease:null};}
   const wire=JSON.stringify(t.content.request);const reserved=await reserveKnowledgeAI(c,cfg,{purpose:j.evaluation?'collection-evaluation':t.purpose==='read'?'collection-read':'collection-check',policy:READING_POLICY,inputReserved:Buffer.byteLength(wire)+256,outputReserved:2048});
   if(reserved.state!=='reserved'){await c.query('UPDATE knowledge_collection.read_tasks SET state=$2,reason=$3,next_attempt=$4 WHERE id=$1',[t.id,reserved.state==='wait'?'quota':'attention',reserved.state==='wait'?reserved.reason:'入力が利用枠を超えています。資料を分けてください。',reserved.state==='wait'?reserved.wait:new Date()]);return {lease:null};}
   const token=randomUUID(),expiresAt=new Date(Date.now()+180000).toISOString();await c.query('INSERT INTO knowledge_collection.read_attempts(id,task_id,wire,wire_digest) VALUES($1,$2,$3,$4)',[reserved.id,t.id,wire,hash(wire)]);await c.query("UPDATE knowledge_collection.read_tasks SET state='running',attempts=attempts+1,lease_token=$2,lease_until=$3,current_attempt=$4,reason='' WHERE id=$1",[t.id,token,expiresAt,reserved.id]);return {lease:{taskId:t.id,jobId:j.id,attemptId:reserved.id,token,wire,wireDigest:hash(wire),model:cfg.model,expiresAt}};
  }
  const {j,t,a}=await task(c,input.lease);const current=await live(c,j,t,input.lease);
  if(input.action==='begin'){
   if(!current||a.usage_state!=='reserved'){if(a.usage_state==='reserved')await settle(c,a.id,{state:'not-sent'});return {send:false};}
   try{await references(j.context);}catch{await settle(c,a.id,{state:'not-sent'});await c.query("UPDATE knowledge_collection.read_tasks SET state='attention',reason='対象の内容や公開範囲が変わりました。' WHERE id=$1",[t.id]);return {send:false};}
   await c.query("UPDATE member_knowledge.review_attempts SET state='sending' WHERE id=$1",[a.id]);return {send:true};
  }
  // A delayed response still consumes usage, but can never replace the current task.
  if(a.result)return {state:'recorded'};
  if(a.usage_state==='reserved'&&input.result.state!=='not-sent')throw new MemberError(409,'NOT_STARTED');
  if(a.usage_state==='sending'&&input.result.state==='not-sent')throw new MemberError(409,'DELIVERY_UNKNOWN');
  await settle(c,a.id,input.result);await c.query('UPDATE knowledge_collection.read_attempts SET result=$2 WHERE id=$1',[a.id,input.result]);if(!current)return {state:'recorded'};
  let state='retry',reason='接続を再確認しています。',result:unknown=null,next=new Date(Date.now()+120000);
  if(input.result.state==='received'){
   const parsed=t.purpose==='read'?parseGeminiJson(input.result.raw):parseGeminiReview(input.result.raw);state='attention';reason='読解結果の形式を確認できませんでした。';
   if(parsed.modelVersion===cfg.model&&t.purpose==='read'&&parsed.state==='parsed'){try{result=await createChecks(c,j,t,parsed.content);state='done';reason=(result as {reason:string}).reason;}catch(e){reason=(e as Error).message;}}
   if(parsed.modelVersion===cfg.model&&t.purpose==='check'&&parsed.state==='reviewed'){
    result=parsed.review;reason=parsed.review.reason;
    if(parsed.review.suitability==='legitimate'&&parsed.review.support==='supported'){
     if(j.evaluation){state='done';reason='評価用：登録は行いません。';}
     else {await c.query('INSERT INTO knowledge_collection.read_decisions(id,task_id,job_id,command) VALUES($1,$2,$3,$4) ON CONFLICT(task_id) DO NOTHING',[randomUUID(),t.id,j.id,t.content.command]);state='ready';reason='根拠を確認しました。登録へ反映しています。';}
    }
   }
  }else if(input.result.state==='not-sent'){state='cancelled';reason='送信前に取り消しました。';}
  else if(input.result.state==='http-error'){
   if(input.result.category==='authorization'||input.result.category==='invalid-request'){state='attention';reason='接続設定を確認してください。自動で他のAIへは送信しません。';}
   else if(input.result.category==='rate-limit'){next=new Date(Date.now()+Math.max(60000,Math.min(86400000,(Number(input.result.retryAfter)||120)*1000)));reason='提供元の利用枠を待っています。';await c.query('UPDATE member_knowledge.review_projects SET paused_until=GREATEST(COALESCE(paused_until,$2),$2),pause_reason=$3 WHERE project_id=$1',[cfg.projectId,next,reason]);}
  }
  if(state==='retry'&&t.attempts>=3){state='attention';reason='3回の試行で結果を確認できませんでした。';}
  await c.query('UPDATE knowledge_collection.read_tasks SET state=$2,reason=$3,result=$4,next_attempt=$5,lease_token=NULL,lease_until=NULL WHERE id=$1',[t.id,state,reason,result,next]);return {state:'recorded'};
 });});}
 return {
  async act(creatorId:string,raw:unknown){const input=readingOperatorSchema.parse(raw);return tx(c=>once(c,'reading-operator:'+creatorId,input,async()=>{
   if(input.action==='cancel'){const j=(await c.query('SELECT id FROM knowledge_collection.read_jobs WHERE id=$1 FOR UPDATE',[input.id])).rows[0];if(!j)throw new MemberError(404,'NOT_FOUND');await c.query("UPDATE knowledge_collection.read_jobs SET state='cancelled' WHERE id=$1",[input.id]);await c.query("UPDATE knowledge_collection.read_tasks SET state='cancelled',reason='残りの処理を取り消しました。',lease_token=NULL,lease_until=NULL WHERE job_id=$1 AND state IN('queued','running','quota','retry','ready')",[input.id]);return {id:input.id};}
   if(!isSiteOperator(creatorId))throw new MemberError(403,'OPERATOR_REQUIRED');
   const parent=(await c.query("SELECT * FROM knowledge_collection.jobs WHERE id=$1 AND state='active' FOR SHARE",[input.captureJobId])).rows[0];if(!parent)throw new MemberError(409,'CAPTURE_UNAVAILABLE');
   await c.query("SELECT pg_advisory_xact_lock(hashtextextended('collection-reading-intake',0))");if((await c.query("SELECT count(*)::int AS n FROM knowledge_collection.read_jobs WHERE created_at>clock_timestamp()-interval '24 hours'")).rows[0].n>=10)throw new MemberError(429,'COLLECTION_LIMIT');
   const context=await contextFor(input.target);const tasks=[];
   for(const id of [...new Set(input.sourceIds)]){const s=await source(c,id);if(s.job_id!==parent.id)throw new MemberError(400,'SOURCE_CHANGED');for(const chunk of sourceChunks(s.document.text))tasks.push({s,chunk});}
   if(tasks.length>4)throw new KnowledgeError('初版は計4区画（約3万字）までです。資料や依頼を分けてください');
   const id=randomUUID();await c.query('INSERT INTO knowledge_collection.read_jobs(id,capture_job_id,creator_id,scope,target,context,source_ids,policy) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,parent.id,creatorId,input.scope,input.target,context,input.sourceIds,READING_POLICY]);
   for(const {s,chunk} of tasks)await c.query("INSERT INTO knowledge_collection.read_tasks(id,job_id,source_id,purpose,content) VALUES($1,$2,$3,'read',$4)",[randomUUID(),id,s.id,{offset:chunk.offset,bodySha256:s.body_sha256,textSha256:s.text_sha256,request:readingRequest(input.scope,context,chunk.text)}]);return {id};
  }));},
  worker,
  async list(){await ensure();const jobs=(await pool.query("SELECT id,capture_job_id,scope,target,context->>'label' AS label,state,created_at FROM knowledge_collection.read_jobs ORDER BY created_at DESC LIMIT 40")).rows;for(const j of jobs){j.createdAt=iso(j.created_at);delete j.created_at;j.tasks=(await pool.query("SELECT id,source_id,purpose,state,reason,attempts,next_attempt,content->'candidate' AS candidate,result FROM knowledge_collection.read_tasks WHERE job_id=$1 ORDER BY created_at,id",[j.id])).rows;j.decisions=(await pool.query("SELECT state,reason,command->'record'->>'id' AS id,command->'record'->'content'->>'assertion' AS assertion,result FROM knowledge_collection.read_decisions WHERE job_id=$1",[j.id])).rows;}return {jobs,workerConnected:(await pool.query("SELECT 1 FROM knowledge_collection.read_workers WHERE last_seen>clock_timestamp()-interval '45 seconds' LIMIT 1")).rowCount===1};},
  async drain(){await ensure();const pending=(await pool.query("SELECT id,job_id FROM knowledge_collection.read_decisions WHERE state='pending' ORDER BY created_at LIMIT 1")).rows[0];if(!pending)return false;
   return tx(async c=>{const j=(await c.query('SELECT * FROM knowledge_collection.read_jobs WHERE id=$1 FOR UPDATE',[pending.job_id])).rows[0];const d=(await c.query("SELECT * FROM knowledge_collection.read_decisions WHERE id=$1 AND state='pending' FOR UPDATE",[pending.id])).rows[0];if(!d)return false;
    const prior=(await knowledge.query("SELECT result FROM knowledge75.operations WHERE actor_id='collection-reading-v1' AND request_id=$1",[d.command.requestId])).rows[0];
    if(prior){await c.query("UPDATE knowledge_collection.read_decisions SET state='applied',result=$2 WHERE id=$1",[d.id,prior.result]);await c.query("UPDATE knowledge_collection.read_tasks SET state='done',reason='登録しました。検索・図へ反映しています。' WHERE id=$1",[d.task_id]);return true;}
    try{
     if(!await active(c,j))throw new KnowledgeError('取り消した依頼の残りは登録しません',409,'CANCELLED');
     const t=(await c.query('SELECT * FROM knowledge_collection.read_tasks WHERE id=$1',[d.task_id])).rows[0];await source(c,t.source_id);
     const result=await foundation.execute({kind:'collection',id:'collection-reading-v1'},d.command,{prepare:async()=>{},verify:async k=>{await verifyAcceptanceReferences(k,j.context.references);}});
     await c.query("UPDATE knowledge_collection.read_decisions SET state='applied',result=$2 WHERE id=$1",[d.id,result]);await c.query("UPDATE knowledge_collection.read_tasks SET state='done',reason='登録しました。検索・図へ反映しています。' WHERE id=$1",[d.task_id]);
    }catch(e){if(e instanceof KnowledgeError&&e.status<500||e instanceof SourceCheckError){await c.query("UPDATE knowledge_collection.read_decisions SET state='blocked',reason=$2 WHERE id=$1",[d.id,(e as Error).message]);await c.query("UPDATE knowledge_collection.read_tasks SET state=$3,reason=$2 WHERE id=$1",[d.task_id,(e as Error).message,e instanceof KnowledgeError&&e.code==='CANCELLED'?'cancelled':'attention']);}else throw e;}return true;
   });
  }
 };
}
