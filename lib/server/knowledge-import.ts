import {verifyTranslationReviewContext,type TranslationReviewSnapshot} from "./knowledge-translation-context";
import {GEMINI_TRANSLATION_POLICY} from "./gemini-knowledge-review";
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import type {Pool,PoolClient,QueryResultRow} from 'pg';
import {knowledgeImportPackageSchema,type ImportPrincipal} from '../domain/knowledge-import';
import {knowledgeSubmissionContentSchema} from '../domain/knowledge-submission';
import {normalizeImportItem,importResources,assertImportScope,resolveImportContext,prepareImportPlan,importActor} from './knowledge-import-plan';
import {createKnowledgeFoundationService,knowledgeDigest,KnowledgeError,readKnowledgeTranslationById} from './knowledge-foundation';
import {verifySourceExcerpt,SourceCheckError,type SourceProof} from './knowledge-source-verification';
import {submissionReviewEvidence} from '../domain/knowledge-submission-intent';
import {submissionReviewInput} from '../domain/knowledge-review-job';
import {reuseDuplicatePlan,verifyAcceptanceReferences,verifyAcceptedSemantics,verifyLegacyCommand,type AcceptancePlan} from './knowledge-acceptance';
import {captureDuplicates,commonDuplicatePins,type DuplicateCapture} from './knowledge-duplicates';
import {knownSourceDocuments,retainSourceAcquisitions} from './knowledge-source-registry';
import {geminiReviewRequest,geminiDuplicateReviewRequest,parseGeminiReview,type GeminiCallResult} from './gemini-knowledge-review';
import {reserveKnowledgeAI,quotaDate,nextQuotaDay} from './knowledge-ai-budget';
import {reviewRetryAt,aiFailureDiagnostic,REVIEW_SENDS_PER_ITEM_DAY} from './knowledge-ai-retry';
import type {ReviewConfig} from './knowledge-review-queue';

type Prepared=ReturnType<typeof prepareImportPlan>&{proofs:SourceProof[];duplicates:DuplicateCapture|null;wire:string};
type Decision={translationReview?:{policy:string;snapshot:TranslationReviewSnapshot;wireDigest:string;attemptId:string};plan:AcceptancePlan;proofs:SourceProof[];guard:{record:unknown;common:unknown}|null};
type WireResult=GeminiCallResult|{state:'not-sent'};
const terminal=['published','existing','cancelled','declined','needs-changes'];
const errorReason=(e:unknown)=>e instanceof SourceCheckError||e instanceof KnowledgeError?e.message:e instanceof z.ZodError?'項目の対象・内容・資料の形式を確認してください。':'処理との接続が一時的に不安定です。内容は保持し、自動で再試行します。';
export async function ensureImportSchema(pool:Pool){
 const name='030-knowledge-import.sql',hash=createHash('sha256').update(await readFile(path.join(process.cwd(),'db/member',name))).digest('hex');
 if((await pool.query('SELECT checksum FROM member_migration WHERE name=$1',[name])).rows[0]?.checksum!==hash)throw new KnowledgeError('取込用の明示migrationが必要です',503,'MIGRATION_REQUIRED');
}
export function createKnowledgeImports(pool:Pool,knowledge:Pool,principal:(id:string,client?:PoolClient)=>Promise<ImportPrincipal|null>,options:{verify?:typeof verifySourceExcerpt;afterKnowledgeCommit?:()=>Promise<void>}={}){
 const foundation=createKnowledgeFoundationService(knowledge),verify=options.verify??verifySourceExcerpt;
 let ready:Promise<void>|undefined;const ensure=()=>ready??=ensureImportSchema(pool).catch(e=>{ready=undefined;throw e;});
 async function tx<T>(f:(c:PoolClient)=>Promise<T>){await ensure();const c=await pool.connect();try{await c.query('BEGIN');const v=await f(c);await c.query('COMMIT');return v;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 async function active(id:string,client?:PoolClient){const p=await principal(id,client);return p&&!p.disabled&&Date.parse(p.expiresAt)>Date.now()?p:null;}
 async function lock(c:PoolClient,id:string){const seed=(await c.query('SELECT package_id FROM knowledge_import.items WHERE id=$1',[id])).rows[0];if(!seed)return null;
  const pkg=(await c.query('SELECT * FROM knowledge_import.packages WHERE id=$1 FOR UPDATE',[seed.package_id])).rows[0];
  const item=(await c.query('SELECT * FROM knowledge_import.items WHERE id=$1 FOR UPDATE',[id])).rows[0];return {pkg,item};}
 async function finishApplied(c:PoolClient,pkg:QueryResultRow,item:QueryResultRow,result:unknown){
  const value=result as {id:string;revision:number;disposition?:string};
  await c.query("UPDATE knowledge_import.items SET state=$2,result=$3,reason=$4,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=$1",[item.id,value.disposition==='existing'?'existing':'applied',result,value.disposition==='existing'?'同じ知識が登録済みです。記録や活動履歴は増やしていません。':'原記録へ反映しました。検索・図へ反映しています。']);
  if(item.item_key)await c.query('INSERT INTO knowledge_import.bindings(namespace,package_key,item_key,record_id,content_revision,input_digest,receipt_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(namespace,package_key,item_key) DO UPDATE SET record_id=$4,content_revision=$5,input_digest=$6,receipt_id=$7',[pkg.namespace,pkg.package_id,item.item_key,value.id,value.revision,item.input_digest,pkg.id]);
 }
 async function recoverApplied(c:PoolClient,pkg:QueryResultRow,item:QueryResultRow){
  if(!item.decision)return false;
  const old=(await knowledge.query('SELECT result FROM knowledge75.operations WHERE actor_id=$1 AND request_id=$2',[importActor({id:pkg.principal_id}),item.id])).rows[0];
  if(!old)return false;await finishApplied(c,pkg,item,old.result);return true;
 }
 async function intake(p:ImportPrincipal,raw:unknown){
  const pkg=knowledgeImportPackageSchema.parse(raw),digest=knowledgeDigest(raw);
  if(pkg.namespace!==p.namespace)throw new KnowledgeError('送信資格のnamespaceと一致しません',403,'NAMESPACE_FORBIDDEN');
  const keys=pkg.items.map(v=>v&&typeof v==='object'&&!Array.isArray(v)&&typeof v.key==='string'?v.key:null).filter(v=>v!==null);
  if(new Set(keys).size!==keys.length)throw new KnowledgeError('項目のkeyが重複しています',400,'DUPLICATE_ITEM_KEYS');
  const normalized=pkg.items.map(raw=>{try{const content=normalizeImportItem(pkg,raw);assertImportScope(p,content);return {content,reason:''};}catch(e){return {content:null,reason:errorReason(e)};}});
  const resources=importResources(pkg),resourceIssues=Object.values(resources).flatMap(v=>v.issues);
  return tx(async c=>{
   await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['knowledge-import:'+p.id]);
   if(!await active(p.id,c))throw new KnowledgeError('送信資格を確認してください',401,'UNAUTHENTICATED');
   const prior=(await c.query('SELECT * FROM knowledge_import.packages WHERE namespace=$1 AND package_id=$2 AND revision=$3',[pkg.namespace,pkg.packageId,pkg.revision])).rows[0];
   if(prior){if(prior.principal_id!==p.id||prior.digest!==digest)throw new KnowledgeError('同じpackage版に異なる内容は送れません',409,'PACKAGE_CONFLICT');return {receiptId:prior.id,replayed:true};}
   if((await c.query('SELECT 1 FROM knowledge_import.packages WHERE namespace=$1 AND package_id=$2 AND revision>$3',[pkg.namespace,pkg.packageId,pkg.revision])).rowCount)throw new KnowledgeError('新しいpackage版が既にあります',409,'REVISION_CONFLICT');
   if((await c.query("SELECT 1 FROM knowledge_import.packages p JOIN knowledge_import.items i ON i.package_id=p.id WHERE p.namespace=$1 AND p.package_id=$2 AND i.state NOT IN('published','existing','cancelled','declined','needs-changes') LIMIT 1",[pkg.namespace,pkg.packageId])).rowCount)throw new KnowledgeError('前の版の結果を待つか、未反映分を取り消してください',409,'PREVIOUS_REVISION_PENDING');
   const usage=(await c.query("SELECT (SELECT count(*) FROM knowledge_import.packages WHERE principal_id=$1 AND created_at>clock_timestamp()-interval '24 hours')::int packages,count(*) FILTER(WHERE p.created_at>clock_timestamp()-interval '24 hours')::int daily,count(*) FILTER(WHERE i.state NOT IN('published','existing','cancelled','declined','needs-changes'))::int pending FROM knowledge_import.items i JOIN knowledge_import.packages p ON p.id=i.package_id WHERE p.principal_id=$1",[p.id])).rows[0];
   if(usage.packages>=p.packagesPerDay||usage.daily+pkg.items.length>p.itemsPerDay||usage.pending+normalized.filter(v=>v.content).length>p.pendingItems)throw new KnowledgeError('送信資格の受付上限を待っています',429,'IMPORT_LIMIT');
   const id=randomUUID();await c.query('INSERT INTO knowledge_import.packages(id,principal_id,namespace,package_id,revision,digest,payload,resource_issues) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,p.id,pkg.namespace,pkg.packageId,pkg.revision,digest,JSON.stringify(raw),JSON.stringify(resourceIssues)]);
   for(const [ordinal,v] of normalized.entries()){
    const item=pkg.items[ordinal],key=item&&typeof item==='object'&&!Array.isArray(item)&&typeof item.key==='string'?item.key:null;
    const old=key?(await c.query('SELECT * FROM knowledge_import.bindings WHERE namespace=$1 AND package_key=$2 AND item_key=$3',[pkg.namespace,pkg.packageId,key])).rows[0]:null;
    const op=v.content?.items[0],reason=old&&v.content&&knowledgeDigest(item)!==old.input_digest&&!['correct-record','correct-entity','add-evidence','translate-text'].includes(op!.operation!)?'前の版で反映した項目の変更は、対象の内容版を指定して訂正・根拠追加してください。':old&&op?.correction&&op.correction.id!==old.record_id?'前の版と異なる対象です。別のitem keyを使ってください。':v.reason;
    await c.query('INSERT INTO knowledge_import.items(id,package_id,ordinal,item_key,input_digest,normalized,state,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),id,ordinal,key,knowledgeDigest(item),v.content,reason?'needs-changes':'queued',reason]);
   }return {receiptId:id,replayed:false};
  });
 }
 async function receipt(p:ImportPrincipal,id:string){
  await ensure();const pkg=(await pool.query('SELECT * FROM knowledge_import.packages WHERE id=$1 AND principal_id=$2 AND namespace=$3',[id,p.id,p.namespace])).rows[0];if(!pkg)throw new KnowledgeError('受付がありません',404,'NOT_FOUND');
  const rows=(await pool.query('SELECT * FROM knowledge_import.items WHERE package_id=$1 ORDER BY ordinal',[id])).rows,items=[];
  for(const i of rows){
   const result=i.result as {id:string;revision:number;disposition?:string;themes?:{id:string;revision:number}[]}|null;let visible=false;
   if(result)try{if(i.decision?.plan?.command?.action==='accept-translation'){const c=await knowledge.connect();try{visible=!!await readKnowledgeTranslationById(c,result.id);}finally{c.release();}}else{await foundation.get({kind:'reader',id:'import-receipt'},'record',result.id,result.revision);visible=true;}}catch{/* Stop old result disclosure when its current public scope changes. */}
   const themes=[];for(const pin of result?.themes??[]){try{await foundation.get({kind:'reader',id:'import-receipt'},'theme',pin.id,pin.revision);themes.push(pin);}catch{/* Keep unavailable scopes out of receipt links. */}}
   const u=(await pool.query("SELECT sum(a.request_charge)::int requests,sum(a.input_actual)::bigint input,sum(a.output_actual)::bigint output,count(*) FILTER(WHERE a.request_charge=1 AND(a.input_actual IS NULL OR a.output_actual IS NULL))::int unknown,sum(a.input_reserved) FILTER(WHERE a.input_actual IS NULL)::bigint reserved_input,sum(a.output_reserved) FILTER(WHERE a.output_actual IS NULL)::bigint reserved_output FROM knowledge_import.attempts t JOIN member_knowledge.review_attempts a ON a.id=t.id WHERE t.item_id=$1",[i.id])).rows[0];
   items.push({ordinal:i.ordinal+1,key:i.item_key,state:i.state,reason:i.reason,nextAttemptAt:['quota','retry'].includes(i.state)?i.next_attempt:null,issues:i.issues,
    result:result?{id:result.id,revision:result.revision,disposition:result.disposition,available:visible,themes,currentUrl:visible&&i.decision?.plan?.command?.action!=='accept-translation'?'/?krecord='+encodeURIComponent(result.id):null}:null,
    usage:{requests:u.requests??0,inputTokens:u.input===null?null:Number(u.input),outputTokens:u.output===null?null:Number(u.output),unknownAttempts:u.unknown,retainedInputReservation:Number(u.reserved_input??0),retainedOutputReservation:Number(u.reserved_output??0)}});
  }
  const done=items.every(i=>terminal.includes(i.state)),cancelled=items.length>0&&items.every(i=>i.state==='cancelled'),fail=items.some(i=>['needs-changes','declined','cancelled'].includes(i.state));
  return {receiptId:pkg.id,namespace:pkg.namespace,packageId:pkg.package_id,revision:pkg.revision,digest:pkg.digest,createdAt:pkg.created_at,cancellation:pkg.cancelled_at?{at:pkg.cancelled_at,reason:pkg.cancel_reason}:null,state:pkg.cancelled_at||cancelled?'cancelled':done?fail?'completed-with-issues':'completed':'processing',resourceIssues:pkg.resource_issues,items,externalUsage:{basis:'sender-declared',value:pkg.payload.externalUsage??null}};
 }
 async function cancel(p:ImportPrincipal,id:string,reason?:string){return tx(async c=>{
  const pkg=(await c.query('SELECT * FROM knowledge_import.packages WHERE id=$1 AND principal_id=$2 AND namespace=$3 FOR UPDATE',[id,p.id,p.namespace])).rows[0];if(!pkg)throw new KnowledgeError('受付がありません',404,'NOT_FOUND');
  if(!await active(p.id,c))throw new KnowledgeError('送信資格を確認してください',401,'UNAUTHENTICATED');
  for(const item of (await c.query('SELECT * FROM knowledge_import.items WHERE package_id=$1 ORDER BY ordinal FOR UPDATE',[id])).rows)if(!terminal.includes(item.state)&&item.state!=='applied'&&!await recoverApplied(c,pkg,item))await c.query("UPDATE knowledge_import.items SET state='cancelled',reason='未反映分を取り消しました。',lease_token=NULL,lease_until=NULL WHERE id=$1",[item.id]);
  await c.query('UPDATE knowledge_import.packages SET cancelled_at=COALESCE(cancelled_at,clock_timestamp()),cancel_reason=COALESCE(cancel_reason,$2) WHERE id=$1',[id,reason??null]);return {receiptId:id};
 });}
 async function lease(){
  const candidates=(await pool.query("SELECT id FROM knowledge_import.items WHERE(state IN('queued','retry','quota','applying') AND next_attempt<=clock_timestamp()) OR(state='running' AND lease_until<=clock_timestamp()) ORDER BY next_attempt,created_at LIMIT 12")).rows;
  for(const candidate of candidates){
   const l=await tx(async c=>{
    const locked=await lock(c,candidate.id);if(!locked)return null;const {pkg,item}=locked;
    if(terminal.includes(item.state)||item.state==='applied'||item.state==='running'&&new Date(item.lease_until)>new Date()||new Date(item.next_attempt)>new Date())return null;
    if(await recoverApplied(c,pkg,item))return null;
    const p=await active(pkg.principal_id,c);
    if(!p||p.namespace!==pkg.namespace||pkg.cancelled_at){await c.query("UPDATE knowledge_import.items SET state='cancelled',reason='受付または送信資格が停止されています。',lease_token=NULL,lease_until=NULL WHERE id=$1",[item.id]);return null;}
    let retained=!!item.decision;
    if(item.state==='running'&&item.current_attempt){
     const a=(await c.query('SELECT a.*,t.response FROM member_knowledge.review_attempts a JOIN knowledge_import.attempts t ON t.id=a.id WHERE a.id=$1 FOR UPDATE OF a',[item.current_attempt])).rows[0];
     if(!a?.response){await c.query("UPDATE member_knowledge.review_attempts SET state=CASE WHEN state='reserved' THEN 'not-sent' ELSE 'delivery-unknown' END,request_charge=CASE WHEN state='reserved' THEN 0 ELSE 1 END,input_actual=CASE WHEN state='reserved' THEN 0 ELSE input_actual END,output_actual=CASE WHEN state='reserved' THEN 0 ELSE output_actual END,finished_at=clock_timestamp() WHERE id=$1 AND state IN('reserved','sending')",[item.current_attempt]);await c.query("UPDATE knowledge_import.items SET state='retry',reason='前の送信結果を確認できません。間隔を空けて自動で再試行します。',next_attempt=$2,lease_token=NULL,lease_until=NULL WHERE id=$1",[item.id,reviewRetryAt(item.attempts)]);return null;}
     retained=retained||a.response.state==='received';
    }
    const day=quotaDate(new Date()),sent=(await c.query('SELECT COALESCE(sum(a.request_charge),0)::int n FROM knowledge_import.attempts t JOIN member_knowledge.review_attempts a ON a.id=t.id WHERE t.item_id=$1 AND a.quota_day=$2',[item.id,day])).rows[0].n;
    if(!retained&&(sent>=REVIEW_SENDS_PER_ITEM_DAY||item.prepare_day===day&&item.prepare_attempts>=8)){await c.query("UPDATE knowledge_import.items SET state='quota',reason='この項目の本日の再試行上限を待っています。',next_attempt=$2 WHERE id=$1",[item.id,nextQuotaDay(new Date())]);return null;}
    const token=randomUUID();await c.query("UPDATE knowledge_import.items SET state='running',lease_token=$2,lease_until=clock_timestamp()+interval '180 seconds',prepare_attempts=CASE WHEN prepare_day=$3 THEN prepare_attempts+1 ELSE 1 END,prepare_day=$3 WHERE id=$1",[item.id,token,day]);return {pkg,item,p,token};
   });if(l)return l;
  }return null;
 }
 async function stillCurrent(c:PoolClient,l:NonNullable<Awaited<ReturnType<typeof lease>>>){const locked=await lock(c,l.item.id);if(!locked||locked.pkg.cancelled_at||locked.item.state!=='running'||locked.item.lease_token!==l.token||new Date(locked.item.lease_until)<=new Date())return null;const p=await active(locked.pkg.principal_id,c);if(!p||p.namespace!==locked.pkg.namespace){await c.query("UPDATE knowledge_import.items SET state='cancelled',reason='送信資格が停止されました。',lease_token=NULL,lease_until=NULL WHERE id=$1",[l.item.id]);return null;}assertImportScope(p,knowledgeSubmissionContentSchema.parse(locked.item.normalized),(locked.item.prepared as Prepared|null)?.value.context);return {...locked,p};}
 async function failure(l:NonNullable<Awaited<ReturnType<typeof lease>>>,e:unknown){await tx(async c=>{
  const v=await lock(c,l.item.id);if(!v||v.item.lease_token!==l.token||v.item.state!=='running')return;
  if(await recoverApplied(c,v.pkg,v.item))return;
  const activeNow=await active(v.pkg.principal_id,c),bad=e instanceof SourceCheckError&&!e.retryable||e instanceof KnowledgeError&&e.status<500&&e.code!=='DUPLICATE_REVIEW_REQUIRED';
  await c.query("UPDATE knowledge_import.items SET state=$2,reason=$3,next_attempt=$4,lease_token=NULL,lease_until=NULL,decision=CASE WHEN $5 THEN NULL ELSE decision END,current_attempt=CASE WHEN $5 THEN NULL ELSE current_attempt END,prepared=CASE WHEN $5 THEN NULL ELSE prepared END WHERE id=$1",[l.item.id,v.pkg.cancelled_at||!activeNow?'cancelled':bad?'needs-changes':'retry',errorReason(e),reviewRetryAt(l.item.attempts+1),e instanceof KnowledgeError&&e.code==='DUPLICATE_REVIEW_REQUIRED']);
 });}
 async function translationSnapshot(prepared:Prepared,c:PoolClient,lock=false){
  const item=prepared.value.content.items[0];if(item.operation!=='translate-text')return null;
  const snapshot=prepared.value.context?.texts?.find(v=>knowledgeDigest(v.target)===knowledgeDigest(item.translation!.target));
  await verifyTranslationReviewContext(c,item.translation!.target,snapshot??{},lock);
  const expected=JSON.stringify(geminiReviewRequest(submissionReviewInput(prepared.value,item.key,true)));
  if(expected!==prepared.wire)throw new KnowledgeError('翻訳の公開文脈を取り直し、新しいパッケージ版で送信してください。',409,'TRANSLATION_CONTEXT_CHANGED');
  return {policy:GEMINI_TRANSLATION_POLICY,snapshot:snapshot!,wireDigest:createHash('sha256').update(prepared.wire).digest('hex')};
 }
 async function prepare(l:NonNullable<Awaited<ReturnType<typeof lease>>>):Promise<Prepared>{
  const pkg=knowledgeImportPackageSchema.parse(l.pkg.payload),content=knowledgeSubmissionContentSchema.parse(l.item.normalized),context=await resolveImportContext(knowledge,content);assertImportScope(l.p,content,context);
  const value=prepareImportPlan(pkg,content,context,l.pkg.id,l.item.id),item=content.items[0],proofs:SourceProof[]=[];
   if(value.plan.command.action==='accept-record'&&value.plan.command.themes?.length){
    const registry=(await pool.query("SELECT to_regclass('knowledge_missions.theme_registrations') AS name")).rows[0]?.name;
    if(registry){
     const deferred=(await pool.query(`SELECT r.input->'target' AS target FROM knowledge_missions.theme_registrations r JOIN knowledge_missions.web_deliveries d ON d.request_id=r.request_id JOIN knowledge_missions.web_importers w ON w.id=d.importer_id WHERE r.receipt_id=$1 AND r.state IN('saved','processing') AND r.input ? 'target' AND 'web:'||w.id::text=$2 AND w.owner_id=r.owner_id`,[l.pkg.id,l.p.id])).rows[0]?.target;
     if(deferred){
      if(value.plan.command.themes.some(p=>p.id!==deferred.id||p.revision!==deferred.revision))throw new KnowledgeError('テーマ更新の取得版を確認してください。',409,'REVISION_CONFLICT');
      // Verified theme context stays pinned; final editorial composition applies
      // membership, rather than publishing a partly updated theme in advance.
      value.plan.command={...value.plan.command,themes:[],...(value.plan.command.record.content.aboutTheme===deferred.id?{deferredTheme:{id:deferred.id,revision:deferred.revision}}:{})};
     }
    }
   }
  if(item.operation!=='translate-text'){const started=Date.now();for(const e of submissionReviewEvidence(item,context)){
   if(Date.now()-started>45000)throw new SourceCheckError('原資料の取得に時間がかかっています。自動で再試行します。',true);
   const source=content.sources.find(s=>s.id===e.source.id&&e.source.revision===1)??context.sources.find(s=>s.id===e.source.id&&s.revision===e.source.revision);
   if(!source?.content.url)throw new SourceCheckError('公開URLで本文を確認できる資料が必要です。');proofs.push(await verify(source.content.url,e.excerpt));
  }}
  const duplicates=value.plan.command.action==='accept-record'?await captureDuplicates(knowledge,value.plan.command.record.content,value.plan.command.expectedRevision?value.plan.recordId:undefined):null;
  const review=submissionReviewInput(value.value,item.key,true),request=duplicates?.review.candidates.length?geminiDuplicateReviewRequest(review,duplicates.review):geminiReviewRequest(review);
  return {...value,proofs,duplicates,wire:JSON.stringify(request)};
 }
 async function settle(c:PoolClient,id:string,result:WireResult){
  const parsed=result.state==='received'?parseGeminiReview(result.raw):null,u=parsed?.usage;
  await c.query("UPDATE member_knowledge.review_attempts SET state=$2,finished_at=clock_timestamp(),request_charge=$3,input_actual=$4,output_actual=$5,thoughts_actual=$6,cached_actual=$7,total_actual=$8,candidates_actual=$9 WHERE id=$1 AND state IN('reserved','sending','delivery-unknown')",[id,result.state,result.state==='not-sent'?0:1,result.state==='not-sent'?0:u?.promptTokenCount??null,result.state==='not-sent'?0:u?.candidatesTokenCount!=null&&u?.thoughtsTokenCount!=null?u.candidatesTokenCount+u.thoughtsTokenCount:null,u?.thoughtsTokenCount??null,u?.cachedContentTokenCount??null,u?.totalTokenCount??null,u?.candidatesTokenCount??null]);
  await c.query('UPDATE knowledge_import.attempts SET response=COALESCE(response,$2) WHERE id=$1',[id,result.state==='received'?result:aiFailureDiagnostic(result)??result]);
 }
 async function apply(l:NonNullable<Awaited<ReturnType<typeof lease>>>){
  const d=l.item.decision as Decision;await verifyLegacyCommand(d.plan.command);
  return tx(async c=>{
   const locked=await lock(c,l.item.id);if(!locked)return;
   if(await recoverApplied(c,locked.pkg,locked.item))return;
   const current=await stillCurrent(c,l);if(!current)return;
   const result=await foundation.execute({kind:'import',id:importActor(current.p)},d.plan.command,{
    verify:async k=>{if(d.plan.command.action==='accept-translation'){
       const proof=d.translationReview,prepared=current.item.prepared as Prepared|null;
       const attempt=proof?.attemptId?(await c.query('SELECT wire,wire_digest FROM knowledge_import.attempts WHERE id=$1 AND item_id=$2',[proof.attemptId,current.item.id])).rows[0]:null;
       if(proof?.policy!==GEMINI_TRANSLATION_POLICY||!prepared||!attempt||attempt.wire!==prepared.wire||attempt.wire_digest!==proof.wireDigest||createHash('sha256').update(attempt.wire).digest('hex')!==proof.wireDigest)throw new KnowledgeError('翻訳の公開文脈を取り直し、新しいパッケージ版で送信してください。',409,'TRANSLATION_CONTEXT_CHANGED');
       await verifyTranslationReviewContext(k,d.plan.command.target,proof.snapshot,true);
      }
      if(d.guard){const pins=(await commonDuplicatePins(k,d.guard.record as Parameters<typeof commonDuplicatePins>[1])).map(r=>({id:r.id,revision:r.revision,digest:knowledgeDigest(r.content)}));if(knowledgeDigest(pins)!==knowledgeDigest(d.guard.common))throw new KnowledgeError('既存の知識が変わりました。重複を再確認します',409,'DUPLICATE_REVIEW_REQUIRED');}
     await verifyAcceptanceReferences(k,d.plan.references);await verifyAcceptedSemantics(k,d.plan);},
    retain:async(k,value)=>{await retainSourceAcquisitions(k,{actorId:importActor(current.p),requestId:l.item.id,result:value,proofs:d.proofs});},
    prepare:async()=>{const p=await active(current.pkg.principal_id,c);if(!p||p.namespace!==current.pkg.namespace)throw new KnowledgeError('送信資格が停止されました',409,'CANCELLED');assertImportScope(p,knowledgeSubmissionContentSchema.parse(current.item.normalized),(current.item.prepared as Prepared).value.context);
     for(const ref of d.plan.references){const kind=ref.kind==='entity'?'entities':ref.kind==='record'?'records':ref.kind==='theme'?'themes':null;if(kind&&p.targets[kind]!=='*'&&!p.targets[kind].includes(ref.id))throw new KnowledgeError('再利用先が送信資格の許可範囲外です。',403,'TARGET_FORBIDDEN');}},
   });await options.afterKnowledgeCommit?.();await finishApplied(c,current.pkg,current.item,result);
  });
 }
 async function consume(l:NonNullable<Awaited<ReturnType<typeof lease>>>,prepared:Prepared,attemptId:string,model:string,result:WireResult){
  await tx(async c=>{await settle(c,attemptId,result);});const parsed=result.state==='received'?parseGeminiReview(result.raw):null;
  if(parsed?.state==='reviewed'&&parsed.modelVersion===model&&parsed.review.suitability==='legitimate'&&parsed.review.support==='supported'){
   const c=await knowledge.connect();let translationReview:Awaited<ReturnType<typeof translationSnapshot>>;try{translationReview=await translationSnapshot(prepared,c);}finally{c.release();}
    const original=prepared.plan,dup=prepared.duplicates;
   const match=dup&&original.command.action==='accept-record'?dup.candidates.find(v=>v.id===parsed.review.duplicate?.sameAs):null;
   if(dup?.review.candidates.length&&!parsed.review.duplicate||parsed.review.duplicate?.sameAs&&!match)throw new SourceCheckError('既存知識の照合結果を確認できません。再試行します。',true);
   const plan=dup?await reuseDuplicatePlan(knowledge,original,dup,parsed.review.duplicate,prepared.proofs,match?await knownSourceDocuments(knowledge,match):[]):original;
   const decision:Decision={...(translationReview?{translationReview:{...translationReview,attemptId}}:{}),plan,proofs:prepared.proofs,guard:dup&&original.command.action==='accept-record'?{record:original.command.record.content,common:dup.common}:null};
   const saved=await tx(async c=>{if(!await stillCurrent(c,l))return false;await c.query('UPDATE knowledge_import.items SET decision=$2 WHERE id=$1',[l.item.id,JSON.stringify(decision)]);return true;});
   if(saved){l.item.decision=decision;await apply(l);}return;
  }
  await tx(async c=>{if(!await stillCurrent(c,l))return;
   let state='retry',reason='確認サービスとの接続を待っています。',next=reviewRetryAt(l.item.attempts+1,result.state==='http-error'?result.retryAfter:null);
   if(parsed){if(parsed.state==='reviewed'&&parsed.modelVersion===model){state=parsed.review.suitability==='abuse'?'declined':'needs-changes';reason=parsed.review.reason;}else{reason='確認結果の形式・モデルを確認できませんでした。内容を保持し、自動で再試行します。';}}
   else if(result.state==='http-error'){
    if(result.category==='rate-limit'){state='quota';reason='外部AIの利用制限が解除されるまで待っています。';}
    else if(result.category==='authorization'||result.category==='invalid-request'){state='needs-changes';reason='確認サービスの接続設定を確認しています。内容の不受理ではありません。';}
    else reason='確認サービスが一時的に混雑しています。自動で再試行します。';
   }
   if(result.state==='http-error'||result.state==='delivery-unknown')await c.query('UPDATE member_knowledge.review_projects SET paused_until=GREATEST(COALESCE(paused_until,$2),$2),pause_reason=$3 WHERE project_id=(SELECT project_id FROM member_knowledge.review_attempts WHERE id=$1)',[attemptId,next,reason]);
   if(result.state==='not-sent'){state='retry';reason='送信を行わず待機しました。';next=new Date(Date.now()+120000);}
   await c.query("UPDATE knowledge_import.items SET state=$2,reason=$3,next_attempt=$4,lease_token=NULL,lease_until=NULL WHERE id=$1",[l.item.id,state,reason,next]);
  });
 }
 async function processNext(config:ReviewConfig,dispatch:(input:{model:string;wire:string})=>Promise<WireResult>){
  await ensure();
  for(const row of (await pool.query("SELECT * FROM knowledge_import.items WHERE state='applied' LIMIT 20")).rows){
   const v=row.result as {id:string;revision:number},translation=row.decision?.plan.command.action==='accept-translation';
   const visible=translation||!!(await knowledge.query("SELECT 1 FROM knowledge75.publication_control c JOIN knowledge75.publication_records r ON r.generation=c.active_generation JOIN knowledge75.objects o ON o.kind='record' AND o.id=r.id WHERE c.singleton AND r.id=$1 AND r.revision>=$2 AND o.visibility='public'",[v.id,v.revision])).rowCount;
   if(visible)await pool.query("UPDATE knowledge_import.items SET state='published',reason='知識へ反映しました。' WHERE id=$1 AND state='applied'",[row.id]);
  }
  const l=await lease();if(!l)return false;let pendingAttempt:string|null=null,dispatched=false;
  try{
   if(l.item.decision){await apply(l);return true;}
   if(l.item.current_attempt){const a=(await pool.query('SELECT * FROM knowledge_import.attempts WHERE id=$1',[l.item.current_attempt])).rows[0];if(a?.response?.state==='received'&&l.item.prepared){await consume(l,l.item.prepared,a.id,a.model,a.response);return true;}}
   const prepared=await prepare(l);
   const reservation=await tx(async c=>{if(!await stillCurrent(c,l))return null;
    const res=await reserveKnowledgeAI(c,config,{purpose:'collection-check',policy:'knowledge-import-v1',inputReserved:Buffer.byteLength(prepared.wire)+1024,outputReserved:2048});
    if(res.state!=='reserved'){await c.query("UPDATE knowledge_import.items SET state=$2,reason=$3,next_attempt=$4,prepare_attempts=CASE WHEN $5 THEN GREATEST(prepare_attempts-1,0) ELSE prepare_attempts END,lease_token=NULL,lease_until=NULL WHERE id=$1",[l.item.id,res.state==='wait'?'quota':'needs-changes',res.state==='wait'?res.reason:'一度に確認できる情報量を超えています。項目を分けてください。',res.state==='wait'?res.wait:new Date(),res.state==='wait']);return null;}
    await c.query('INSERT INTO knowledge_import.attempts(id,item_id,model,wire,wire_digest,proofs,duplicates) VALUES($1,$2,$3,$4,$5,$6,$7)',[res.id,l.item.id,config.model,prepared.wire,createHash('sha256').update(prepared.wire).digest('hex'),JSON.stringify(prepared.proofs),JSON.stringify(prepared.duplicates)]);
    await c.query('UPDATE knowledge_import.items SET prepared=$2,current_attempt=$3,attempts=attempts+1 WHERE id=$1',[l.item.id,JSON.stringify(prepared),res.id]);return res;
   });
   if(!reservation)return true;pendingAttempt=reservation.id;
   const k=await knowledge.connect();try{await translationSnapshot(prepared,k);await verifyAcceptanceReferences(k,prepared.plan.references,false);}finally{k.release();}
   const send=await tx(async c=>{if(!await stillCurrent(c,l))return false;await c.query("UPDATE member_knowledge.review_attempts SET state='sending' WHERE id=$1 AND state='reserved'",[reservation.id]);return true;});
   dispatched=send;await consume(l,prepared,reservation.id,config.model,send?await dispatch({model:config.model,wire:prepared.wire}):{state:'not-sent'});
  }catch(e){if(pendingAttempt)await tx(c=>settle(c,pendingAttempt!,dispatched?{state:'delivery-unknown'}:{state:'not-sent'}));await failure(l,e);}return true;
 }
 return {intake,receipt,cancel,processNext};
}
