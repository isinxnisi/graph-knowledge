import {lockThemeCaseBinding} from './knowledge-theme-editions';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type {Pool,PoolClient,QueryResultRow} from 'pg';
import {themeProductionCommandSchema,productionSubmissionCommandSchema,type ThemeProductionCommand,type ProductionSubmissionCommand,type ProductionFence} from '../domain/theme-production';
import {KnowledgeError,knowledgeDigest} from './knowledge-foundation';
import {withThemeProductionSubmission,assertThemeProductionLease} from './theme-production-fence';

type Target={theme:{id:string;revision:number};digest:string;guide:{id:string;revision:number};references:unknown;publicationConflict?:unknown};
type Observed={state:'accepted'|'pending'|'applied'|'failed';result:unknown;theme?:{id:string;revision:number}};
type Dependencies={environment:'beta'|'production';origin:string;authorize:(owner:string)=>Promise<void>;target:(id:string,owner:string,revision?:number)=>Promise<Target>;send:(owner:string,command:ProductionSubmissionCommand)=>Promise<unknown>;observe:(owner:string,command:ProductionSubmissionCommand)=>Promise<Observed|null>;publish:(owner:string,intentId:string)=>Promise<void>;publication:(id:string,intentId?:string)=>Promise<{state:string;publishedRevision:number|null;workingRevision:number;releaseId:string|null;workingChanges:boolean;approvalPresent:boolean}>;afterDispatch?:()=>Promise<void>};
const failure=(text:string,code='PRODUCTION_CONFLICT',status=409)=>new KnowledgeError(text,status,code);
const lockKey=(id:string)=>'theme-production:'+id;
const terminal=(state:string)=>['applied','failed','withdrawn'].includes(state);
function json(value:unknown){return JSON.parse(JSON.stringify(value));}
export async function ensureThemeProduction(pool:Pool){
 for(const name of ['044-theme-production.sql','045-theme-publication.sql','046-theme-production-workflows.sql']){const checksum=createHash('sha256').update(await readFile(path.join(process.cwd(),'db/member',name))).digest('hex');
 if((await pool.query('SELECT checksum FROM member_migration WHERE name=$1',[name])).rows[0]?.checksum!==checksum)throw failure('制作案件の明示migrationが必要です。','MIGRATION_REQUIRED',503);}
}
/** A private current checkpoint, not a scheduler, collection plan or model runner. */
export function createThemeProductions(pool:Pool,deps:Dependencies){
 let ready:Promise<void>|undefined;const ensure=()=>ready??=ensureThemeProduction(pool).catch(e=>{ready=undefined;throw e;});
 async function row(c:Pool|PoolClient,owner:string,id:string){
  const r=(await c.query('SELECT *,lease_until>clock_timestamp() AS lease_live FROM theme_production.cases WHERE id=$1 AND owner_id=$2 AND environment=$3 AND origin=$4',[id,owner,deps.environment,deps.origin])).rows[0];
  if(!r)throw failure('制作案件がありません。','NOT_FOUND',404);return r;
 }
 async function availableTheme(c:PoolClient,owner:string,id:string,except?:string){
  if((await c.query("SELECT id FROM theme_production.cases WHERE owner_id=$1 AND environment=$2 AND origin=$3 AND theme_id=$4 AND status<>'completed' AND ($5::uuid IS NULL OR id<>$5)",[owner,deps.environment,deps.origin,id,except??null])).rowCount)throw failure('同じテーマの未完了案件があります。その案件IDを指定して再開してください。','PRODUCTION_THEME_ACTIVE');
 }
 async function current(c:Pool|PoolClient,owner:string){
  return (await c.query("SELECT id FROM theme_production.cases WHERE owner_id=$1 AND environment=$2 AND origin=$3 AND workflow='scheduled' ORDER BY (status<>'completed') DESC,created_at DESC LIMIT 1",[owner,deps.environment,deps.origin])).rows[0]?.id as string|undefined;
 }
 async function submissions(c:Pool|PoolClient,r:QueryResultRow){
  const list=(await c.query('SELECT * FROM theme_production.submissions WHERE case_id=$1 ORDER BY created_at,id',[r.id])).rows;
  for(const item of list){
   if(['uncertain','accepted','pending'].includes(item.state)){
    try{const observed=await deps.observe(r.owner_id,productionSubmissionCommandSchema.parse(JSON.parse(item.command_wire)));
     if(observed){item.state=observed.state;item.result=observed.result;if(observed.theme)item.theme=observed.theme;if(observed.result&&typeof observed.result==='object'&&'reason' in observed.result)item.reason=observed.result.reason;}
    }catch(e){item.reason=e instanceof KnowledgeError?e.message:'登録状態を確認できません。成功扱いにせず再確認してください。';if(!terminal(item.state))item.state='uncertain';}
   }
  }
  return list;
 }
 function targetId(r:QueryResultRow,list:QueryResultRow[]){return r.theme_id??list.find(s=>s.command_action==='submit-theme'&&s.theme)?.theme.id;}
 async function evaluation(r:QueryResultRow,list:QueryResultRow[]){
  const id=targetId(r,list);let target:Target|null=null,unavailable:string|null=null;
  if(id)try{target=await deps.target(id,r.owner_id);}catch(e){unavailable=e instanceof KnowledgeError?e.message:'評価対象の現在版を確認できません。';}
  const workDigest=knowledgeDigest(list.map(s=>[s.id,s.digest,s.state]));
  const assessment=r.assessment,workCurrent=!!assessment&&assessment.workDigest===workDigest,contentCurrent=!!assessment&&!!target&&assessment.targetDigest===target.digest,guideCurrent=!!assessment&&!!target&&assessment.guideRevision===target.guide.revision;
  return {target,assessment:assessment?{...assessment,contentCurrent,guideCurrent,workCurrent,current:contentCurrent&&guideCurrent&&workCurrent}:null,unavailable};
 }
 async function view(owner:string,id:string,selection?:{submissionId?:string;submissionCursor?:number}){
  const r=await row(pool,owner,id),list=await submissions(pool,r),ev=await evaluation(r,list),cursor=selection?.submissionCursor??0;
  const selected=selection?.submissionId?list.find(s=>s.id===selection.submissionId):null;
  if(selection?.submissionId&&!selected)throw failure('保存済み送信がありません。','NOT_FOUND',404);
  const intent=(await pool.query('SELECT id,completion_command FROM theme_production.publication_intents WHERE case_id=$1 ORDER BY created_at DESC LIMIT 1',[id])).rows[0];
  const themeId=targetId(r,list);
  const publication=themeId?await deps.publication(themeId,intent?.id):null;
  const publicationPending=!!intent&&publication?.approvalPresent!==true;
  // A durable intent may need a new review even when the private draft digest has stayed the same.
  const retryCommand=r.status==='completed'&&publicationPending&&ev.assessment?.current&&!ev.target?.publicationConflict
   ?intent.completion_command:null;
  // A successful approval closes this historical case permanently. Current
  // evaluation freshness is still reported independently of that outcome.
  const complete=r.status==='completed'&&ev.assessment?.result==='pass'&&publication?.approvalPresent===true;
  const summary=(s:QueryResultRow)=>({id:s.id,requestId:s.command_request_id,action:s.command_action,digest:s.digest,state:s.state,reason:s.reason,dispatches:s.dispatches});
  const currentWork=list.filter(s=>!terminal(s.state)||s.state==='failed');
  return json({id:r.id,ownerId:owner,workflow:r.workflow,environment:r.environment,origin:r.origin,version:r.version,phase:r.phase,status:r.status==='completed'&&!complete?(retryCommand?'waiting-publication':'needs-review'):r.status,
   progress:r.progress,theme:ev.target?.theme??(r.theme_id?{id:r.theme_id,revision:r.theme_revision}:null),lease:r.execution_id?{executionId:r.execution_id,until:r.lease_until,valid:r.lease_live===true}:null,
   publication:publication?{...publication,pending:publicationPending,...(retryCommand?{retryCommand}:{})}:null,evaluationTarget:ev.target,lastWholeThemeAssessment:ev.assessment,evaluationUnavailable:ev.unavailable,completed:complete,
   submissions:currentWork.slice(cursor,cursor+20).map(summary),nextSubmissionCursor:currentWork.length>cursor+20?cursor+20:null,completedSubmissionCount:list.length-currentWork.length,pendingSubmissionCount:list.filter(s=>!terminal(s.state)).length,
   ...(selected?{savedSubmission:{...summary(selected),result:selected.result,encoding:'json',wire:selected.command_wire,command:JSON.parse(selected.command_wire)}}:{}),updatedAt:r.updated_at});
 }
 async function response(owner:string,result:Record<string,unknown>,selection?:{submissionId?:string;submissionCursor?:number}){
  const id=result.caseId as string|undefined;const resultCase=id?await view(owner,id,selection):null;const value:Record<string,unknown>={...result,case:resultCase};delete value.caseId;
  if(value.leaseToken){const lease=await row(pool,owner,id!);if(lease.lease_live!==true||lease.execution_id!==result.executionId||lease.lease_token!==value.leaseToken){delete value.leaseToken;if(value.outcome==='claimed')value.outcome='found';}}
  delete value.executionId;return value;
 }
 async function previous(c:PoolClient,owner:string,command:ThemeProductionCommand){
  if(!('requestId' in command))return null;const old=(await c.query('SELECT digest,result FROM theme_production.operations WHERE owner_id=$1 AND request_id=$2',[owner,command.requestId])).rows[0];
  if(old&&old.digest!==knowledgeDigest(command))throw failure('同じ操作requestIdに異なる入力は送れません。','REQUEST_CHANGED');return old?{...old.result,replayed:true}:null;
 }
 async function record(c:PoolClient,owner:string,command:ThemeProductionCommand,result:Record<string,unknown>){
  if(!('requestId' in command))throw Error('Operation requestId required');
  await c.query('INSERT INTO theme_production.operations(owner_id,request_id,case_id,digest,result) VALUES($1,$2,$3,$4,$5)',[owner,command.requestId,result.caseId,knowledgeDigest(command),JSON.stringify(result)]);return result;
 }
 async function tx<T>(owner:string,id:string|undefined,work:(c:PoolClient)=>Promise<T>){
  const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['theme-production-owner:'+owner+':'+deps.environment]);
   if(id&&!(await c.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS held',[lockKey(id)])).rows[0].held)throw failure('この案件は別の処理が送信中です。','PRODUCTION_BUSY');
   const value=await work(c);await c.query('COMMIT');return value;
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 function fence(r:QueryResultRow,v:ProductionFence){
  if(r.version!==v.expectedVersion)throw failure('進捗が更新されました。現在の状態版を読み直してください。','PRODUCTION_VERSION_CONFLICT');
  if(r.status==='completed'||r.execution_id!==v.executionId||r.lease_token!==v.leaseToken||r.lease_live!==true)throw failure('実行権が失効しています。','PRODUCTION_LEASE_EXPIRED');
 }
 async function increment(c:PoolClient,id:string){await c.query('UPDATE theme_production.cases SET version=version+1,updated_at=clock_timestamp() WHERE id=$1',[id]);}
 async function scope(c:PoolClient,r:QueryResultRow,cmd:ProductionSubmissionCommand,list:QueryResultRow[]){
  const id=targetId(r,list);
  if((cmd.action==='submit-theme'||cmd.action==='update-theme')&&cmd.editorial)throw failure('制作案件の登録には通常編集の指定を使えません。','PRODUCTION_EDIT_CHANNEL');
  if(cmd.action==='submit-theme'){
   if(id||list.some(s=>s.command_action==='submit-theme'&&s.state!=='withdrawn'))throw failure('この案件にはテーマ作成の送信または対象テーマがあります。','PRODUCTION_THEME_ALREADY_BOUND');
  }else if(cmd.action==='update-theme'||cmd.action==='submit-translation'){
   const target=cmd.action==='update-theme'?cmd.target:cmd.theme;
   if(!id||target.id!==id)throw failure('この案件に紐づくテーマだけを更新してください。','PRODUCTION_TARGET_REQUIRED');
  }else if(['amend-theme-items','control-theme-retry','cancel-theme','cancel-translation'].includes(cmd.action)){
   const parent='registrationRequestId' in cmd?cmd.registrationRequestId:cmd.requestId;
   if(!list.some(s=>s.command_request_id===parent&&['submit-theme','update-theme','submit-translation'].includes(s.command_action)))throw failure('操作する受付はこの案件に紐づいていません。','PRODUCTION_TARGET_REQUIRED');
  }
  if((cmd.action==='submit-theme'||cmd.action==='update-theme')&&list.some(s=>!terminal(s.state)&&['submit-theme','update-theme'].includes(s.command_action)))throw failure('前のテーマ受付が未完了です。結果確認・項目修正を先に行ってください。','PRODUCTION_PUBLICATION_PENDING');
  void c;
 }
 async function create(owner:string,command:Extract<ThemeProductionCommand,{action:'create-theme-production'}>){
  return response(owner,await tx(owner,undefined,async c=>{
   const old=await previous(c,owner,command);if(old)return old;
   const workflow=command.workflow??'scheduled';const active=workflow==='scheduled'?await current(c,owner):undefined;
   if(active){const r=await row(c,owner,active);if(r.status!=='completed')throw failure('定期制作の進行中案件を先に見直し完了まで進めてください。通常チャットの別案件はworkflow: manualで作成できます。','PRODUCTION_ACTIVE_CASE');if((await view(owner,active)).publication?.pending)throw failure('前の案件の公開切替が未完了です。同一の完了要求を再送してください。','PRODUCTION_PUBLICATION_PENDING');if(!(await view(owner,active)).completed)throw failure('前の案件の対象が未承認または変更されています。見直しへ戻してください。','PRODUCTION_REVIEW_REQUIRED');}
   if(command.phase==='review'&&!command.theme)throw failure('既存テーマの見直し開始には正確なテーマ版が必要です。','PRODUCTION_TARGET_REQUIRED',400);
   if(command.theme){await lockThemeCaseBinding(c,command.theme.id);await availableTheme(c,owner,command.theme.id);const target=await deps.target(command.theme.id,owner);if(target.theme.revision!==command.theme.revision)throw failure('対象テーマ版を読み直してください。','REVISION_CONFLICT');}
   const id=randomUUID();await c.query("INSERT INTO theme_production.cases(id,owner_id,environment,origin,phase,status,progress,theme_id,theme_revision,workflow) VALUES($1,$2,$3,$4,$5,'ready',$6,$7,$8,$9)",[id,owner,deps.environment,deps.origin,command.phase,JSON.stringify(command.progress),command.theme?.id??null,command.theme?.revision??null,workflow]);
   return record(c,owner,command,{outcome:'created',caseId:id});
  }));
 }
 async function claim(owner:string,command:Extract<ThemeProductionCommand,{action:'claim-theme-production'}>){
  const id=command.caseId??await current(pool,owner);if(!id)return {outcome:'none',case:null};
  try{return response(owner,await tx(owner,id,async c=>{
   const old=await previous(c,owner,command);if(old)return old;const r=await row(c,owner,id);
   if(r.status==='completed'){
    const v=await view(owner,id);if(v.completed||v.status==='waiting-publication')return {outcome:'found',caseId:id};
    if(command.phase!=='review')return {outcome:'phase-mismatch',caseId:id};
    if(r.theme_id)await availableTheme(c,owner,r.theme_id,r.id);r.phase='review';await c.query("UPDATE theme_production.cases SET phase='review',status='ready' WHERE id=$1",[id]);
   }
   if(r.phase!==command.phase)return {outcome:'phase-mismatch',caseId:id};
   if(r.lease_live&&r.execution_id!==command.executionId)return {outcome:'busy',caseId:id};
   if(command.phase==='review'&&r.last_production_execution===command.executionId)throw failure('見直しは別のChatGPT起動から開始してください。executionIdは一回の起動全体で共用します。','PRODUCTION_INDEPENDENT_RUN_REQUIRED');
   const token=r.lease_live?r.lease_token:randomUUID();await c.query("UPDATE theme_production.cases SET execution_id=$2,lease_token=$3,lease_until=GREATEST(lease_until,clock_timestamp()+$4*interval '1 second'),status=CASE WHEN status='ready' OR status='completed' THEN 'working' ELSE status END,last_production_execution=CASE WHEN phase='production' THEN $2 ELSE last_production_execution END WHERE id=$1",[id,command.executionId,token,command.leaseSeconds]);await increment(c,id);
   return record(c,owner,command,{outcome:'claimed',caseId:id,executionId:command.executionId,leaseToken:token});
  }));}catch(e){if(e instanceof KnowledgeError&&e.code==='PRODUCTION_BUSY')return response(owner,{outcome:'busy',caseId:id});throw e;}
 }
 async function update(owner:string,command:Extract<ThemeProductionCommand,{action:'update-theme-production'}>){
  const result=await tx(owner,command.caseId,async c=>{
   const old=await previous(c,owner,command);if(old)return old;let r=await row(c,owner,command.caseId);fence(r,command);
   if(command.progress){if(Buffer.byteLength(JSON.stringify(command.progress))>1500000)throw failure('一回の進捗保存は1.5MB以内に分けてください。案件・ターンの総量制限ではありません。','PRODUCTION_CHECKPOINT_SIZE',413);await c.query('UPDATE theme_production.cases SET progress=$2 WHERE id=$1',[r.id,JSON.stringify(command.progress)]);r.progress=command.progress;}
   if(command.status)await c.query('UPDATE theme_production.cases SET status=$2 WHERE id=$1',[r.id,command.status]);
   const list=await submissions(c,r),pending=list.filter(s=>!terminal(s.state));const ev=await evaluation(r,list);
   if(ev.target){await availableTheme(c,owner,ev.target.theme.id,r.id);await c.query('UPDATE theme_production.cases SET theme_id=$2,theme_revision=$3 WHERE id=$1',[r.id,ev.target.theme.id,ev.target.theme.revision]);}
   r=await row(c,owner,r.id);fence(r,command);
   if(command.operation==='handoff'){
    if(r.phase!=='production'||pending.length||!ev.target)throw failure('制作の登録結果を確認してから見直しへ引き継いでください。','PRODUCTION_PUBLICATION_PENDING');
    await c.query("UPDATE theme_production.cases SET phase='review',status='ready',execution_id=NULL,lease_token=NULL,lease_until=NULL WHERE id=$1",[r.id]);
   }else if(command.operation==='renew')await c.query("UPDATE theme_production.cases SET lease_until=GREATEST(lease_until,clock_timestamp()+$2*interval '1 second') WHERE id=$1",[r.id,command.leaseSeconds]);
   else if(command.operation==='release')await c.query('UPDATE theme_production.cases SET execution_id=NULL,lease_token=NULL,lease_until=NULL WHERE id=$1',[r.id]);
   else if(command.operation==='withdraw-submission'){
    const item=list.find(s=>s.id===command.submissionId);if(!item||!['prepared','failed'].includes(item.state)||!command.reason?.trim())throw failure('未送信または失敗が確定した送信だけを理由付きで取り下げられます。未反映の処理中送信は取り下げられません。','PRODUCTION_SUBMISSION_STATE');
    await c.query("UPDATE theme_production.submissions SET state='withdrawn',reason=$2 WHERE id=$1",[item.id,command.reason]);
   }else if(command.operation==='assess'){
    const a=command.assessment;if(r.phase!=='review'||!a||!ev.target)throw failure('見直し工程でテーマ全体の評価を指定してください。','PRODUCTION_ASSESSMENT_REQUIRED');
    if(a.targetDigest!==ev.target.digest||a.guideRevision!==ev.target.guide.revision)throw failure('評価対象または品質ガイドが変わりました。現在の全体を再評価してください。','PRODUCTION_ASSESSMENT_STALE');
    if(a.result==='pass'&&pending.length)throw failure('未反映の送信を合格扱いにはできません。','PRODUCTION_PUBLICATION_PENDING');
    for(const item of list.filter(s=>s.state==='failed'))if(a.result==='pass'&&!a.exceptions.some(e=>e.submissionId===item.id))throw failure('未反映の失敗を未解消例外として明示してください。','PRODUCTION_EXCEPTION_REQUIRED');
    await c.query('UPDATE theme_production.cases SET assessment=$2 WHERE id=$1',[r.id,JSON.stringify({...a,workDigest:knowledgeDigest(list.map(s=>[s.id,s.digest,s.state])),evaluatedTheme:ev.target.theme,guide:ev.target.guide,evaluatedAt:new Date().toISOString(),executionId:command.executionId})]);
   }else if(command.operation==='complete'){
    if(ev.target?.publicationConflict)throw failure('通常公開が進みました。制作版と公開版を照合してから全体を再評価してください。','THEME_PUBLICATION_CONFLICT');
    if(r.phase!=='review'||!ev.assessment?.current||ev.assessment.result!=='pass'||!ev.target)throw failure('現在の対象版とガイドに基づく独立した全体評価が必要です。','PRODUCTION_ASSESSMENT_STALE');
    if(pending.length||r.progress.unfinished.length||r.progress.blockers.length)throw failure('未反映・未完作業・阻害要因が残っています。対応不能点は全体評価の例外へ内容と理由を明示してください。','PRODUCTION_INCOMPLETE');
    await c.query('INSERT INTO theme_production.publication_intents(id,case_id,owner_id,theme_id,theme_revision,target_digest,guide_revision,assessment,completion_command) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[command.requestId,r.id,owner,ev.target.theme.id,ev.target.theme.revision,ev.target.digest,ev.target.guide.revision,JSON.stringify(r.assessment),JSON.stringify(command)]);
     await c.query("UPDATE theme_production.cases SET status='completed',execution_id=NULL,lease_token=NULL,lease_until=NULL WHERE id=$1",[r.id]);
   }
   // A long read/verification cannot commit a stale checkpoint after lease expiry.
   r=await row(c,owner,r.id);if(!['handoff','release','complete'].includes(command.operation)&&r.lease_live!==true)throw failure('実行権が失効しています。','PRODUCTION_LEASE_EXPIRED');
   await increment(c,r.id);return record(c,owner,command,{outcome:'updated',caseId:r.id});
  });
  if(command.operation==='complete'){try{await deps.publish(owner,command.requestId);}catch(e){return {...await response(owner,result),publicationError:{code:e instanceof KnowledgeError?e.code:'PUBLICATION_UNAVAILABLE',message:e instanceof KnowledgeError?e.message:'公開切替を完了できませんでした。未承認版は非公開のままです。同一完了要求を再送してください。'}};}}
  return response(owner,result);
 }
 async function prepare(owner:string,command:Extract<ThemeProductionCommand,{action:'prepare-theme-production-submission'}>){
  const result=await tx(owner,command.caseId,async c=>{
   const old=await previous(c,owner,command);if(old)return old;const r=await row(c,owner,command.caseId);fence(r,command);const list=await submissions(c,r);
   const wire=JSON.stringify(command.command);if(Buffer.byteLength(wire)>1800000)throw failure('送信の事前保存は1.8MB以内で分割してください。案件・ターン全体の制限ではありません。','PRODUCTION_SUBMISSION_SIZE',413);
   const digest=knowledgeDigest(command.command),prior=(await c.query('SELECT * FROM theme_production.submissions WHERE owner_id=$1 AND command_action=$2 AND command_request_id=$3',[owner,command.command.action,command.command.requestId])).rows[0];
   if(prior&&(prior.case_id!==r.id||prior.digest!==digest))throw failure('同じ登録requestIdの保存内容や案件は変更できません。','REQUEST_CHANGED');
   if(!prior)await scope(c,r,command.command,list);
   fence(await row(c,owner,r.id),command);
   const id=prior?.id??command.requestId;
   if(!prior)await c.query('INSERT INTO theme_production.submissions(id,case_id,owner_id,command_action,command_request_id,command_wire,digest) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,r.id,owner,command.command.action,command.command.requestId,wire,digest]);
   await increment(c,r.id);return record(c,owner,command,{outcome:'prepared',caseId:r.id,submissionId:id});
  });return response(owner,result,{submissionId:result.submissionId});
 }
 async function dispatch(owner:string,command:Extract<ThemeProductionCommand,{action:'dispatch-theme-production-submission'}>){
  // Persist dispatch intent before calling the normal API. Slow validation must
  // not hold the case lease hostage; normal writes acquire the short SQL fence.
  const admitted=await tx(owner,command.caseId,async c=>{
   const replay=await previous(c,owner,command);if(replay)return {replay};
   const r=await row(c,owner,command.caseId);fence(r,command);
   const item=(await c.query('SELECT * FROM theme_production.submissions WHERE id=$1 AND case_id=$2 AND owner_id=$3',[command.submissionId,r.id,owner])).rows[0];
   if(!item||item.state==='withdrawn')throw failure('実行できる保存済み送信がありません。','PRODUCTION_SUBMISSION_STATE');
   const payload=productionSubmissionCommandSchema.parse(JSON.parse(item.command_wire));if(knowledgeDigest(payload)!==item.digest)throw failure('保存済み送信の整合性が一致しません。','PRODUCTION_WIRE_CHANGED');
   await c.query("UPDATE theme_production.submissions SET state='uncertain',dispatches=dispatches+1,updated_at=clock_timestamp() WHERE id=$1",[item.id]);
   await c.query("UPDATE theme_production.cases SET status='waiting-publication',version=version+1,updated_at=clock_timestamp() WHERE id=$1",[r.id]);
   const result=await record(c,owner,command,{outcome:'dispatched',caseId:r.id,submissionId:item.id});return {r,item,payload,result};
  });
  if('replay' in admitted)return response(owner,admitted.replay!);
  const {r,item,payload,result}=admitted;let outcome:unknown;
  try{outcome=await withThemeProductionSubmission({pool,owner,caseId:r.id,executionId:command.executionId,leaseToken:command.leaseToken,submissionId:item.id,digest:item.digest},async()=>{await assertThemeProductionLease();return deps.send(owner,payload);});await deps.afterDispatch?.();}
  catch(e){await pool.query('UPDATE theme_production.submissions SET reason=$2 WHERE id=$1',[item.id,e instanceof KnowledgeError?e.message:'送信結果が不明です。状態を確認し、同じ登録requestIdと保存済み内容で回復してください。']);throw e;}
  // Internal receipt projection never overwrites a successor's draft, phase,
  // lease or assessment. A newer case version asks the successor to reread.
  const failed=!!outcome&&typeof outcome==='object'&&'ok' in outcome&&outcome.ok===false;
  const state=failed?'failed':['submit-theme','update-theme'].includes(payload.action)?'accepted':payload.action==='submit-translation'&&!(outcome&&typeof outcome==='object'&&'state' in outcome&&outcome.state==='published')?'pending':'applied';
  await tx(owner,r.id,async c=>{await c.query('UPDATE theme_production.submissions SET state=$2,result=$3,reason=$4,updated_at=clock_timestamp() WHERE id=$1',[item.id,state,JSON.stringify(outcome),failed?'通常APIが失敗を返しました。結果を確認してください。':'']);await increment(c,r.id);});
  return response(owner,result);
 }
 async function execute(owner:string,raw:ThemeProductionCommand){
  await ensure();await deps.authorize(owner);const command=themeProductionCommandSchema.parse(raw);
  if(command.action==='get-theme-production'){
   const id=command.caseId??await current(pool,owner);if(!id)return {outcome:'none',case:null};
   const result=await view(owner,id,command);if(!command.caseId&&result.completed)return {outcome:'none',case:null};return {outcome:'found',case:result};
  }
  if(command.action==='create-theme-production')return create(owner,command);
  if(command.action==='claim-theme-production')return claim(owner,command);
  if(command.action==='update-theme-production')return update(owner,command);
  if(command.action==='prepare-theme-production-submission')return prepare(owner,command);
  return dispatch(owner,command);
 }
 return {execute,view};
}
