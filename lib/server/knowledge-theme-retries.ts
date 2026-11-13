import type {Pool,PoolClient,QueryResultRow} from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {canonicalSourceUrl} from '../domain/knowledge-source-identity';
import {knowledgeImportPackageSchema} from '../domain/knowledge-import';
import {submissionReviewEvidence} from '../domain/knowledge-submission-intent';
import {controlThemeRetrySchema,type ControlThemeRetry} from '../domain/knowledge-theme-registration';
import {knowledgeDigest,KnowledgeError} from './knowledge-foundation';
import {normalizeImportItem,resolveImportContext,importActor,importItemOperationId} from './knowledge-import-plan';
import {quotaDate,nextQuotaDay} from './knowledge-ai-budget';
import {SourceCheckError,sourceURL} from './knowledge-source-verification';
import {webImportPrincipal} from './knowledge-web-import';
import {operatorThemeIntake} from './operator-theme-intake';

export const THEME_RETRY_LIMITS={sourceAttemptsPerItemUrlDay:8,preparationsPerItemDay:32,sourceChecksPerMinute:60,sourceChecksPerDay:10000,hostChecksPerMinute:12,operationsPerOperator24h:200};
export async function themeRetriesAvailable(c:Pool|PoolClient){return !!(await c.query("SELECT to_regclass('knowledge_missions.theme_retry_operations') name")).rows[0]?.name;}
export async function ensureThemeRetries(c:Pool|PoolClient){
 const name='043-theme-item-retries.sql',hash=createHash('sha256').update(await readFile(path.join(process.cwd(),'db/member',name))).digest('hex');
 if((await c.query('SELECT checksum FROM member_migration WHERE name=$1',[name])).rows[0]?.checksum!==hash)throw new KnowledgeError('再試行制御用の明示migrationが必要です。',503,'MIGRATION_REQUIRED');
}
export class ThemeRetryWait extends SourceCheckError {
 constructor(readonly until:Date,readonly code:string,message:string){super(message,true,Math.max(0,until.getTime()-Date.now()));}
}
const later=(seconds:number)=>new Date(Date.now()+seconds*1000);
const key=(url:string)=>canonicalSourceUrl(sourceURL(url).href);
export async function themeInputUrls(knowledge:Pool,pkg:QueryResultRow,item:QueryResultRow,original=false){
 const input=knowledgeImportPackageSchema.parse(original?pkg.payload:item.input_package??pkg.payload);
 let content;try{content=original?normalizeImportItem(input,input.items.find(v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&v.key===item.item_key)):item.normalized;}catch{return [];}
 if(!content)return [];
 const context=await resolveImportContext(knowledge,content),urls=[];
 for(const evidence of submissionReviewEvidence(content.items[0],context)){
  const source=content.sources.find((s:{id:string})=>s.id===evidence.source.id&&evidence.source.revision===1)??context.sources.find(s=>s.id===evidence.source.id&&s.revision===evidence.source.revision);
  if(source?.content.url)urls.push(key(source.content.url));
 }
 return [...new Set(urls)];
}
/** Legacy counters cannot reconstruct HTTP timestamps. Cover all older input
 * URLs conservatively. A freshly amended queued input has not run yet, so its
 * genuinely new URL is not charged for earlier inputs. */
async function legacyThemeUrls(c:Pool|PoolClient,knowledge:Pool,pkg:QueryResultRow,item:QueryResultRow){
 const urls=new Set<string>();
 const add=async(value:QueryResultRow,original:boolean)=>{try{for(const url of await themeInputUrls(knowledge,value,item,original))urls.add(url);}catch(error){if(!(error instanceof KnowledgeError||error instanceof SourceCheckError))throw error;}};
 await add(pkg,true);
 const revisions=(await c.query('SELECT input FROM knowledge_missions.theme_item_input_revisions WHERE item_id=$1 AND revision<$2',[item.id,item.input_revision])).rows;
 for(const revision of revisions)await add({...pkg,payload:revision.input},true);
 if(item.state!=='queued')await add(pkg,false);
 return [...urls];
}
/** Called under package/item lock BEFORE incrementing prepare counters. Old
 * un-attributed preparations are conservatively charged to original URLs only.
 * Reading status never initializes or advances an existing receipt. */
export async function initializeThemeRetries(c:PoolClient,knowledge:Pool,pkg:QueryResultRow,item:QueryResultRow){
 if(item.retry_initialized)return;
 for(const url of await legacyThemeUrls(c,knowledge,pkg,item))if(item.prepare_day&&item.prepare_attempts)
  await c.query('INSERT INTO knowledge_missions.theme_retry_legacy(item_id,url,quota_day,attempts) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[item.id,url,item.prepare_day,item.prepare_attempts]);
 await c.query('UPDATE knowledge_import.items SET retry_initialized=true,prepare_total=GREATEST(prepare_total,prepare_attempts) WHERE id=$1',[item.id]);
}
/** Consistent budget lock used by all operator source starts and manual control.
 * It protects global/host bounds as well as same-URL bounds across input edits. */
async function budgetLock(c:PoolClient){await c.query("SELECT pg_advisory_xact_lock(hashtextextended('operator-theme-source-budget',0))");}
export async function sourceWait(c:Pool|PoolClient,itemId:string,urls:string[]):Promise<ThemeRetryWait|null>{
 const now=new Date(),day=quotaDate(now);
 const inflight=(await c.query('SELECT max(a.deadline) until FROM knowledge_missions.theme_source_attempts a LEFT JOIN knowledge_missions.theme_source_results r ON r.attempt_id=a.id WHERE a.item_id=$1 AND r.attempt_id IS NULL AND a.deadline>clock_timestamp()',[itemId])).rows[0]?.until;
 if(inflight)return new ThemeRetryWait(inflight,'SOURCE_IN_FLIGHT','前の資料取得の終了を待っています。');
 for(const url of urls){
  const host=new URL(url).hostname;
  const hostWait=(await c.query('SELECT wait_until,reason FROM knowledge_missions.theme_source_host_waits WHERE host=$1 AND wait_until>clock_timestamp()',[host])).rows[0];
  if(hostWait)return new ThemeRetryWait(hostWait.wait_until,'SOURCE_HOST_WAIT',hostWait.reason);
  const count=(await c.query(`SELECT (SELECT COALESCE(sum(attempts),0) FROM knowledge_missions.theme_retry_legacy WHERE item_id=$1 AND url=$2 AND quota_day=$3)+(SELECT count(*) FROM knowledge_missions.theme_source_attempts WHERE item_id=$1 AND url=$2 AND quota_day=$3) n`,[itemId,url,day])).rows[0].n;
  if(Number(count)>=THEME_RETRY_LIMITS.sourceAttemptsPerItemUrlDay)return new ThemeRetryWait(nextQuotaDay(now),'SOURCE_DAILY_LIMIT','この資料URLの本日の取得上限を待っています。');
  const failure=(await c.query(`SELECT r.wait_until FROM knowledge_missions.theme_source_results r JOIN knowledge_missions.theme_source_attempts a ON a.id=r.attempt_id WHERE a.item_id=$1 AND a.url=$2 AND r.wait_until>clock_timestamp() ORDER BY r.wait_until DESC LIMIT 1`,[itemId,url])).rows[0];
  if(failure)return new ThemeRetryWait(failure.wait_until,'SOURCE_BACKOFF','この資料URLの再取得間隔を待っています。');
  const hostRate=(await c.query("SELECT count(*)::int n,min(started_at)+interval '1 minute' until FROM knowledge_missions.theme_source_attempts WHERE host=$1 AND started_at>clock_timestamp()-interval '1 minute'",[host])).rows[0];
  if(hostRate.n>=THEME_RETRY_LIMITS.hostChecksPerMinute)return new ThemeRetryWait(hostRate.until,'SOURCE_HOST_RATE','資料サイトへのアクセス間隔を待っています。');
 }
 const global=(await c.query("SELECT count(*) FILTER(WHERE quota_day=$1)::int daily,count(*) FILTER(WHERE started_at>clock_timestamp()-interval '1 minute')::int recent,min(started_at) FILTER(WHERE started_at>clock_timestamp()-interval '1 minute')+interval '1 minute' until FROM knowledge_missions.theme_source_attempts WHERE quota_day=$1 OR started_at>clock_timestamp()-interval '1 minute'",[day])).rows[0];
 if(global.daily>=THEME_RETRY_LIMITS.sourceChecksPerDay)return new ThemeRetryWait(nextQuotaDay(now),'SOURCE_SERVICE_DAILY','サービス全体の資料取得上限を待っています。');
 if(global.recent>=THEME_RETRY_LIMITS.sourceChecksPerMinute)return new ThemeRetryWait(global.until,'SOURCE_SERVICE_RATE','サービス全体の資料取得間隔を待っています。');
 return null;
}
export async function beginThemeSource(c:PoolClient,item:QueryResultRow,url:string,token:string){
 await budgetLock(c);const canonical=key(url),wait=await sourceWait(c,item.id,[canonical]);if(wait)throw wait;
 const id=randomUUID();await c.query('INSERT INTO knowledge_missions.theme_source_attempts(id,item_id,input_revision,lease_token,url,host,quota_day) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,item.id,item.input_revision??1,token,canonical,new URL(canonical).hostname,quotaDate(new Date())]);return id;
}
export async function finishThemeSource(c:PoolClient,id:string,error?:unknown){
 // This immutable result belongs to its input revision, even if paused/amended
 // during IO. It never changes the current item or applies a Record.
 const attempt=(await c.query('SELECT * FROM knowledge_missions.theme_source_attempts WHERE id=$1',[id])).rows[0];
 if(!attempt)return;
 const failures=Number((await c.query("SELECT count(*) n FROM knowledge_missions.theme_source_results r JOIN knowledge_missions.theme_source_attempts a ON a.id=r.attempt_id WHERE a.item_id=$1 AND a.url=$2 AND a.quota_day=$3 AND r.outcome='failed'",[attempt.item_id,attempt.url,attempt.quota_day])).rows[0].n);
 const retryable=error instanceof SourceCheckError&&error.retryable,until=retryable?later(Math.max(error.retryAfterMs/1000,Math.min(7200,120*2**Math.min(failures,6)))):null;
 await c.query('INSERT INTO knowledge_missions.theme_source_results(attempt_id,outcome,reason,wait_until,http_status) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[id,error?'failed':'verified',error instanceof Error?error.message:error?'資料確認に失敗しました。':'原資料の引用を確認しました。',until,error instanceof SourceCheckError?error.siteRestricted?.status??null:null]);
 if(until&&error instanceof SourceCheckError&&error.siteRestricted){
  await c.query('INSERT INTO knowledge_missions.theme_source_host_waits(host,wait_until,reason) VALUES($1,$2,$3) ON CONFLICT(host) DO UPDATE SET wait_until=GREATEST(theme_source_host_waits.wait_until,EXCLUDED.wait_until),reason=EXCLUDED.reason',[error.siteRestricted.host,until,error.message]);
 }
}
export async function controlThemeRetries(c:PoolClient,knowledge:Pool,r:QueryResultRow,owner:string,raw:ControlThemeRetry){
 const input=controlThemeRetrySchema.parse(raw),digest=knowledgeDigest(input);
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['theme-registration-owner:'+owner]);
 const prior=(await c.query('SELECT * FROM knowledge_missions.theme_retry_operations WHERE request_id=$1',[input.requestId])).rows[0];
 if(prior){if(prior.owner_id!==owner||prior.registration_id!==r.request_id)throw new KnowledgeError('再試行操作がありません。',404,'NOT_FOUND');if(prior.digest!==digest)throw new KnowledgeError('同じ操作IDに異なる内容は送れません。',409,'REQUEST_CHANGED');return {...prior.response,replayed:true};}
 if(!r.receipt_id||!['saved','processing','needs-changes'].includes(r.state)||r.result)throw new KnowledgeError('未完了のテーマ受付を選んでください。',409,'THEME_REGISTRATION_FINISHED');
 const pkg=(await c.query('SELECT * FROM knowledge_import.packages WHERE id=$1 FOR UPDATE',[r.receipt_id])).rows[0],p=await webImportPrincipal(c,pkg.principal_id,c);
 if(!p||pkg.cancelled_at||!await operatorThemeIntake(c,pkg.id,p,true))throw new KnowledgeError('現在の運営テーマ受付と権限を確認してください。',403,'OPERATOR_REQUIRED');
 if((await knowledge.query('SELECT 1 FROM knowledge75.operations WHERE actor_id=$1 AND request_id=$2',['theme-registration:'+owner,r.request_id])).rowCount)throw new KnowledgeError('テーマは反映済みです。',409,'THEME_REGISTRATION_FINISHED');
 const uses=Number((await c.query("SELECT count(*) n FROM knowledge_missions.theme_retry_operations WHERE owner_id=$1 AND created_at>clock_timestamp()-interval '24 hours'",[owner])).rows[0].n);
 // Stopping remains available even if the operator exhausts write/retry quota.
 if(input.operation!=='pause'&&uses>=THEME_RETRY_LIMITS.operationsPerOperator24h)throw new KnowledgeError('本日の再試行操作上限を待っています。',429,'RETRY_OPERATION_LIMIT');
 const selectedRows=(await c.query('SELECT * FROM knowledge_import.items WHERE package_id=$1 AND item_key=ANY($2::text[]) ORDER BY item_key FOR UPDATE',[pkg.id,input.items.map(i=>i.key)])).rows;
 const items=[];
 for(const selected of [...input.items].sort((a,b)=>a.key.localeCompare(b.key))){
  const item=selectedRows.find(v=>v.item_key===selected.key);
  if(!item)throw new KnowledgeError('項目が受付にありません。',404,'ITEM_NOT_FOUND');
  if(item.input_revision!==selected.expectedRevision)throw new KnowledgeError('入力版が更新されています。状態を読み直してください。',409,'ITEM_REVISION_CONFLICT');
  if(item.result||!['queued','retry','quota','running','needs-changes','declined','applying'].includes(item.state)||(await knowledge.query('SELECT 1 FROM knowledge75.operations WHERE actor_id=$1 AND request_id=$2',[importActor(p),importItemOperationId(item as {id:string;input_revision:number})])).rowCount)throw new KnowledgeError('反映済み・取消済みの項目は再試行できません。',409,'ITEM_ALREADY_APPLIED');
  if(input.operation==='pause'&&item.retry_paused)throw new KnowledgeError('この項目は既に停止しています。',409,'ITEM_ALREADY_PAUSED');
  if(input.operation==='retry'&&item.retry_paused)throw new KnowledgeError('停止中です。先に再開してください。',409,'ITEM_RETRY_PAUSED');
  if(input.operation==='retry'&&item.state==='running'&&item.lease_until>new Date())throw new KnowledgeError('処理中です。現在の結果を待つか、自動処理を停止してください。',409,'ITEM_RUNNING');
  if(input.operation==='resume'&&!item.retry_paused)throw new KnowledgeError('この項目は停止していません。',409,'ITEM_NOT_PAUSED');
  await initializeThemeRetries(c,knowledge,pkg,item);await budgetLock(c);
  let wait=input.operation==='pause'?null:await sourceWait(c,item.id,await themeInputUrls(knowledge,pkg,item));
  if(input.operation!=='pause'&&item.prepare_day===quotaDate(new Date())&&item.prepare_attempts>=THEME_RETRY_LIMITS.preparationsPerItemDay)wait=new ThemeRetryWait(nextQuotaDay(new Date()),'ITEM_PREPARATION_LIMIT','この項目の本日の検証上限を待っています。');
  items.push({item,wait});
 }
 const result={requestId:input.requestId,registrationRequestId:r.request_id,receiptId:r.receipt_id,operation:input.operation,replayed:false,items:items.map(({item,wait})=>({key:item.item_key,inputRevision:item.input_revision,paused:input.operation==='pause',state:input.operation==='pause'?(item.state==='running'?'retry':item.state):'queued',scheduledAt:input.operation==='pause'?null:(wait?.until??new Date()).toISOString(),waitCode:wait?.code??null,reason:input.operation==='pause'?'自動処理を停止しました。':wait?.message??'通常の検証処理を再実行します。'}))};
 await c.query('INSERT INTO knowledge_missions.theme_retry_operations(request_id,registration_id,owner_id,digest,action,reason,response) VALUES($1,$2,$3,$4,$5,$6,$7)',[input.requestId,r.request_id,owner,digest,input.operation,input.reason,JSON.stringify(result)]);
 for(const {item,wait} of items){
  if(input.operation==='pause')await c.query("UPDATE knowledge_import.items SET retry_paused=true,state=CASE WHEN state='running' THEN 'retry' ELSE state END,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=$1",[item.id]);
  else await c.query("UPDATE knowledge_import.items SET retry_paused=false,state='queued',next_attempt=$2,prepared=NULL,decision=NULL,current_attempt=NULL,lease_token=NULL,lease_until=NULL,reason=$3,updated_at=clock_timestamp() WHERE id=$1",[item.id,wait?.until??new Date(),wait?.message??'通常の検証処理を再実行します。']);
 }
 await c.query("UPDATE knowledge_missions.theme_registrations SET state='processing',next_attempt=clock_timestamp(),updated_at=clock_timestamp() WHERE request_id=$1",[r.request_id]);return result;
}
export async function readThemeRetries(pool:Pool,r:QueryResultRow,itemKey?:string,knowledge?:Pool){
 if(!r.receipt_id||!await themeRetriesAvailable(pool))return {available:false};
 const items=(await pool.query('SELECT * FROM knowledge_import.items WHERE package_id=$1 AND ($2::text IS NULL OR item_key=$2) ORDER BY ordinal',[r.receipt_id,itemKey??null])).rows;
 if(itemKey&&!items.length)throw new KnowledgeError('項目が受付にありません。',404,'ITEM_NOT_FOUND');
 const details=[];
 for(const item of items){
  const attempts=(await pool.query('SELECT a.id,a.input_revision,a.url,a.started_at,a.deadline,r.outcome,r.reason,r.wait_until,r.http_status,r.finished_at FROM knowledge_missions.theme_source_attempts a LEFT JOIN knowledge_missions.theme_source_results r ON r.attempt_id=a.id WHERE a.item_id=$1 ORDER BY a.started_at,a.id',[item.id])).rows;
  const legacy=(await pool.query('SELECT url,quota_day,attempts FROM knowledge_missions.theme_retry_legacy WHERE item_id=$1 ORDER BY quota_day,url',[item.id])).rows;
  const pkg=knowledge?(await pool.query('SELECT * FROM knowledge_import.packages WHERE id=$1',[r.receipt_id])).rows[0]:null;
  let wait:ThemeRetryWait|null=null,urls:string[]=[];
  if(knowledge&&pkg){try{urls=await themeInputUrls(knowledge,pkg,item);wait=await sourceWait(pool,item.id,urls);
   if(!item.retry_initialized&&item.prepare_day===quotaDate(new Date())&&item.prepare_attempts>=8){const legacy=await legacyThemeUrls(pool,knowledge,pkg,item);if(urls.some(u=>legacy.includes(u)))wait=new ThemeRetryWait(nextQuotaDay(new Date()),'SOURCE_LEGACY_LIMIT','変更前からの同じ資料URLの取得上限を待っています。');}
   if(item.prepare_day===quotaDate(new Date())&&item.prepare_attempts>=THEME_RETRY_LIMITS.preparationsPerItemDay)wait=new ThemeRetryWait(nextQuotaDay(new Date()),'ITEM_PREPARATION_LIMIT','この項目の本日の検証上限を待っています。');
  }catch{/* Invalid input is reported by ordinary validation, never fetched here. */}}
  const pending=['saved','processing','needs-changes'].includes(r.state)&&!r.result&&!item.result&&['queued','retry','quota','running','needs-changes','declined','applying'].includes(item.state);
  details.push({key:item.item_key,sourceUrls:urls,canControl:pending,canRetryNow:pending&&!item.retry_paused&&!(item.state==='running'&&item.lease_until>new Date())&&!wait,earliestRetryAt:pending&&!item.retry_paused?(wait?.until??new Date()):null,waitCode:wait?.code??null,waitReason:wait?.message??null,inputRevision:item.input_revision,state:item.state,paused:item.retry_paused,reason:item.retry_paused?'自動処理を停止しています。':item.reason,nextAttemptAt:item.retry_paused||['published','existing','cancelled','needs-changes','declined'].includes(item.state)?null:item.next_attempt,preparationAttemptsTotal:Math.max(Number(item.prepare_total),item.prepare_attempts),legacyPreparation:{day:item.prepare_day,attempts:item.prepare_attempts,attributed:!!item.retry_initialized},legacySourceBudgets:legacy,attempts:attempts.map(a=>({id:a.id,inputRevision:a.input_revision,url:a.url,startedAt:a.started_at,finishedAt:a.finished_at??null,outcome:a.outcome??(a.deadline>new Date()?'running':'outcome-unknown'),reason:a.reason??null,httpStatus:a.http_status??null,waitUntil:a.wait_until??null}))});
 }
 const operations=(await pool.query('SELECT request_id,action,reason,response,created_at FROM knowledge_missions.theme_retry_operations WHERE registration_id=$1 ORDER BY created_at,request_id',[r.request_id])).rows.filter(o=>!itemKey||o.response.items.some((v:{key:string})=>v.key===itemKey));
 return {available:true,registrationRequestId:r.request_id,receiptId:r.receipt_id,limits:THEME_RETRY_LIMITS,items:details,operations:operations.map(o=>({requestId:o.request_id,operation:o.action,reason:o.reason,createdAt:o.created_at,result:o.response})),note:'操作受付と資料取得結果は別です。再試行指示だけでは成功・公開になりません。'};
}
