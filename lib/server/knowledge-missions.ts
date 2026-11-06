import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type {Pool,PoolClient,QueryResultRow} from 'pg';
import {missionPlanSchema,missionOperatorSchema,type MissionPlan,type MissionWorkerCommand} from '../domain/knowledge-mission';
import {knowledgeImportPackageSchema,type ImportPrincipal} from '../domain/knowledge-import';
import type {KnowledgeEntityVersion,KnowledgeThemeVersion} from '../domain/knowledge-foundation';
import {createKnowledgeFoundationService,KnowledgeError,knowledgeDigest} from './knowledge-foundation';
import {missionImportPrincipal} from './knowledge-mission-principal';
import {importResources,normalizeImportItem} from './knowledge-import-plan';
import {sourceURL} from './knowledge-source-verification';
import type {createKnowledgeImports} from './knowledge-import';

const reader={kind:'reader' as const,id:'mission-context'};
const stamp=(v:unknown)=>v instanceof Date?v.toISOString():String(v);
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
export type MissionSnapshot={plan:MissionPlan;theme:KnowledgeThemeVersion|null;entities:KnowledgeEntityVersion[];records:{id:string;revision:number}[]};
export async function ensureMissionSchema(pool:Pool){
 const name='033-knowledge-missions.sql',digest=hash(await readFile(path.join(process.cwd(),'db/member',name),'utf8'));
 if((await pool.query('SELECT checksum FROM member_migration WHERE name=$1',[name])).rows[0]?.checksum!==digest)throw new KnowledgeError('定期収集の追加migrationが必要です。',503,'MIGRATION_REQUIRED');
}

export async function validateMissionPackage(raw:unknown,snapshot:MissionSnapshot,runId:string,planId:string,source:(id:string,revision:number)=>Promise<{content:{url?:string|null}}>){
 const pkg=knowledgeImportPackageSchema.parse(raw),plan=snapshot.plan;
 if(pkg.namespace!=='mission.'+planId||pkg.packageId!=='run.'+runId||pkg.revision!==1||pkg.legacy||pkg.items.length>plan.maxItems||pkg.sources.length>plan.maxSources)throw new KnowledgeError('この収集計画の形式・件数に合わせてください。',400,'MISSION_PACKAGE_SCOPE');
 const resources=importResources(pkg);if(Object.values(resources).some(v=>v.issues.length))throw new KnowledgeError('資料や対象の形式を確認してください。',400,'MISSION_PACKAGE_SCOPE');
 const allowed=(raw:string)=>{const u=sourceURL(raw);if(u.protocol!=='https:'||u.port||!plan.sourceHosts.includes(u.hostname))throw new KnowledgeError('計画で指定したサイトの公開資料を使ってください。',403,'MISSION_SOURCE_SCOPE');};
 for(const value of pkg.sources){const s=value as {content?:{url?:string}};if(!s.content?.url)throw new KnowledgeError('定期収集には原資料のURLが必要です。',400,'MISSION_SOURCE_SCOPE');allowed(s.content.url);}
 if(pkg.sources.length+pkg.sourcePins.length>plan.maxSources)throw new KnowledgeError('資料数の上限を超えています。',400,'MISSION_SOURCE_SCOPE');
 for(const value of pkg.sourcePins){const pin=value as {id:string;revision:number};const s=await source(pin.id,pin.revision);if(!s.content.url)throw new KnowledgeError('URLのある公開資料を選んでください。',400,'MISSION_SOURCE_SCOPE');allowed(s.content.url);}
 const normalized=pkg.items.map(v=>normalizeImportItem(pkg,v)),items=normalized.map(v=>v.items[0]);
 const reached=new Set(snapshot.entities.map(v=>v.id)),declared=new Set(pkg.entities.map(v=>(v as {id:string}).id));
 // New subjects may be reached through newly supplied relations. A disconnected
 // entity, note or event cannot be smuggled in as part of a themed package.
 for(let n=0;n<=items.length;n++)for(const i of items){const c=i.record;if(c.kind==='relation'&&c.subjectId&&c.objectId&&(reached.has(c.subjectId)||reached.has(c.objectId))){reached.add(c.subjectId);reached.add(c.objectId);}}
 for(const [n,i] of items.entries()){
  if(!['create-entity','create-relation','add-information','add-evidence'].includes(i.operation??''))throw new KnowledgeError('この収集計画では追加・根拠追加として送ってください。',403,'MISSION_OPERATION_SCOPE');
  const c=i.record,about=i.about;
  if(about?.kind==='entity'&&!snapshot.entities.some(v=>v.id===about.id&&v.revision===about.revision)||about?.kind==='theme'&&(!snapshot.theme||about.id!==snapshot.theme.id||about.revision!==snapshot.theme.revision)||c.aboutTheme&&c.aboutTheme!==snapshot.theme?.id)throw new KnowledgeError('情報を結び付ける対象が計画の範囲外です。',403,'MISSION_TARGET_SCOPE');
  const recordRef=about?.kind==='record'?about:c.aboutRecord;
  const recordBound=recordRef&&snapshot.records.some(v=>v.id===recordRef.id&&v.revision===recordRef.revision);
  const themeBound=!!snapshot.theme&&(about?.kind==='theme'&&about.id===snapshot.theme.id&&about.revision===snapshot.theme.revision||c.aboutTheme===snapshot.theme.id);
  if(recordRef&&!recordBound||!recordBound&&!themeBound&&(!c.subjectId||!reached.has(c.subjectId))||c.objectId&&!reached.has(c.objectId))throw new KnowledgeError('計画の対象につながる情報を送ってください。',403,'MISSION_TARGET_SCOPE');
  if(snapshot.theme){if(i.themes?.length!==1||i.themes[0].id!==snapshot.theme.id||i.themes[0].revision!==snapshot.theme.revision)throw new KnowledgeError('実行時に渡したテーマ版を指定してください。',409,'MISSION_THEME_CHANGED');}
  else if(i.themes?.length)throw new KnowledgeError('この計画に追加先テーマはありません。',403,'MISSION_TARGET_SCOPE');
  if(!c.evidence.length)throw new KnowledgeError('項目ごとに原資料の引用を添えてください。',400,'MISSION_EVIDENCE_REQUIRED');
  for(const field of ['subjectId','objectId'] as const){const id=c[field];if(id&&!declared.has(id)){const pin=snapshot.entities.find(v=>v.id===id),supplied=pkg.entityPins.find(v=>(v as {id:string}).id===id) as {revision:number}|undefined;if(!pin||supplied?.revision!==pin.revision)throw new KnowledgeError(`項目${n+1}の公開対象の版を確認してください。`,409,'MISSION_TARGET_CHANGED');}}
 }
 for(const id of declared)if(!reached.has(id))throw new KnowledgeError('計画から独立した対象は含められません。',403,'MISSION_TARGET_SCOPE');
 return pkg;
}

export function createKnowledgeMissions(pool:Pool,knowledge:Pool,imports:()=>ReturnType<typeof createKnowledgeImports>){
 const foundation=createKnowledgeFoundationService(knowledge);let ready:Promise<void>|undefined;
 const ensure=()=>ready??=ensureMissionSchema(pool).catch(e=>{ready=undefined;throw e;});
 async function tx<T>(f:(c:PoolClient)=>Promise<T>){await ensure();const c=await pool.connect();try{await c.query('BEGIN');const v=await f(c);await c.query('COMMIT');return v;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 async function once(c:PoolClient,actor:string,id:string,input:unknown,f:()=>Promise<unknown>){
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['mission-command:'+actor+':'+id]);
  const digest=knowledgeDigest(input),prior=(await c.query('SELECT * FROM knowledge_missions.commands WHERE principal=$1 AND request_id=$2',[actor,id])).rows[0];
  if(prior){if(prior.payload_hash!==digest)throw new KnowledgeError('同じ操作の内容が変わっています。',409,'REQUEST_CHANGED');return {result:prior.result,replayed:true};}
  const result=await f();await c.query('INSERT INTO knowledge_missions.commands(principal,request_id,action,payload_hash,result) VALUES($1,$2,$3,$4,$5)',[actor,id,(input as {action:string}).action,digest,result]);return {result,replayed:false};
 }
 async function snapshot(plan:MissionPlan):Promise<MissionSnapshot>{
  const theme=plan.themeId?await foundation.get(reader,'theme',plan.themeId):null;
  const ids=new Set(plan.entityIds),records:{id:string;revision:number}[]=[];if(theme){const resolved=await foundation.resolveTheme(reader,theme.id,theme.revision);if(!plan.entityIds.length)for(const e of resolved.snapshot.entities)ids.add(e.id);for(const v of resolved.snapshot.records)records.push({id:v.id,revision:v.revision});}
  if(!ids.size)throw new KnowledgeError('核となる対象のあるテーマか、対象を選んでください。',400,'MISSION_ANCHOR_REQUIRED');
  const entities=[];for(const id of ids)entities.push(await foundation.get(reader,'entity',id));
  if(entities.length>60)throw new KnowledgeError('テーマの対象が多いため、核となる対象で範囲を絞ってください。',400,'MISSION_ANCHOR_LIMIT');
  return {plan,theme,entities,records};
 }
 async function choices(kind:'entity'|'theme',query:string){
  const q=query.normalize('NFKC').slice(0,200),result=[];
  const rows=(await knowledge.query("SELECT o.id FROM knowledge75.objects o JOIN knowledge75.revisions r ON r.kind=o.kind AND r.id=o.id AND r.revision=o.current_revision WHERE o.kind=$1 AND o.visibility='public' AND ($2='' OR strpos(lower(r.content::text),lower($2))>0) ORDER BY r.content->>'name',r.content->>'title',o.id LIMIT 40",[kind,q])).rows;
  for(const row of rows)try{if(kind==='entity'){const v=await foundation.get(reader,'entity',row.id);result.push({id:v.id,label:v.content.name});}else{const v=await foundation.get(reader,'theme',row.id);result.push({id:v.id,label:v.content.title});}}catch{/* Current public context only. */}
  return result;
 }
 async function list(query=''){
  await ensure();const rows=(await pool.query('SELECT * FROM knowledge_missions.plans ORDER BY created_at DESC,id LIMIT 30')).rows,items=[];
  for(const p of rows){const runs=[];for(const r of (await pool.query('SELECT * FROM knowledge_missions.runs WHERE plan_id=$1 ORDER BY created_at DESC,id LIMIT 3',[p.id])).rows){
   let receiptState:string|null=null;const results:{state:string;url:string|null;reason:string}[]=[];
   if(r.receipt_id){const principal=runPrincipal(r,p);try{const receipt=await imports().receipt(principal,r.receipt_id);receiptState=receipt.state;for(const i of receipt.items)results.push({state:i.state,url:i.result?.currentUrl??null,reason:i.reason});}catch{receiptState='unavailable';}}
   runs.push({id:r.id,state:r.state,reason:r.reason,createdAt:stamp(r.created_at),receiptId:r.receipt_id,receiptState,results});
  }items.push({id:p.id,revision:p.revision,state:p.state,content:p.content,nextDue:stamp(p.next_due),runs});}
  const seen=(await pool.query('SELECT max(last_seen) at FROM knowledge_missions.workers')).rows[0]?.at;
  return {items,themes:await choices('theme',''),entities:await choices('entity',query),workerConnected:!!seen&&Date.now()-new Date(seen).getTime()<7200000,workerLastSeen:seen?stamp(seen):null};
 }
 function runPrincipal(run:QueryResultRow,plan:QueryResultRow):ImportPrincipal{const content=missionPlanSchema.parse(plan.content);return {id:'mission:'+run.id,namespace:'mission.'+plan.id,tokenSha256:'0'.repeat(64),expiresAt:'2100-01-01T00:00:00Z',disabled:false,operations:['create-entity','create-relation','add-information','add-evidence'],targets:{entities:'*',records:'*',sources:'*',themes:content.themeId?[content.themeId]:[]},allowNewEntities:true,packagesPerDay:1,itemsPerDay:content.maxItems,pendingItems:content.maxItems};}
 async function act(actor:string,raw:unknown,beforeWrite?:(c:PoolClient)=>Promise<void>){
  const input=missionOperatorSchema.parse(raw);
  return tx(async c=>{await beforeWrite?.(c);return once(c,'operator:'+actor,input.requestId,input,async()=>{
   await c.query("SELECT pg_advisory_xact_lock(hashtextextended('mission-plan-write',0))");
   if('content'in input)await snapshot(input.content);
   if(input.action==='create'){if((await c.query('SELECT count(*)::int n FROM knowledge_missions.plans')).rows[0].n>=30)throw new KnowledgeError('収集計画は30件までです。',429,'MISSION_PLAN_LIMIT');const id=randomUUID();await c.query('INSERT INTO knowledge_missions.plans(id,content,created_by) VALUES($1,$2,$3)',[id,input.content,actor]);return {id,revision:1};}
   const p=(await c.query('SELECT * FROM knowledge_missions.plans WHERE id=$1 FOR UPDATE',[input.id])).rows[0];if(!p)throw new KnowledgeError('収集計画がありません。',404,'NOT_FOUND');if(p.revision!==input.expectedRevision)throw new KnowledgeError('別の操作で計画が変わりました。読み直して確認してください。',409,'REVISION_CONFLICT');
   await c.query("UPDATE knowledge_missions.runs SET state='cancelled',reason='計画が変更・停止されました。',lease_hash=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE plan_id=$1 AND state IN('leased','waiting','delivering')",[p.id]);
   await c.query("UPDATE knowledge_missions.plans SET revision=revision+1,state=$2,content=$3,next_due=CASE WHEN $2='active' THEN clock_timestamp() ELSE next_due END,updated_at=clock_timestamp() WHERE id=$1",[p.id,input.action==='pause'?'paused':input.action==='resume'?'active':p.state,'content'in input?input.content:p.content]);return {id:p.id,revision:p.revision+1};
  });});
 }
 function leaseDto(r:QueryResultRow,p:QueryResultRow,token:string){return {runId:r.id,missionId:p.id,planRevision:r.plan_revision,generation:r.generation,token,expiresAt:stamp(r.lease_until),snapshot:r.snapshot,packageIdentity:{namespace:'mission.'+p.id,packageId:'run.'+r.id,revision:1},...(r.payload?{pendingPackage:r.payload}:{})};}
 async function claim(worker:string,input:Extract<MissionWorkerCommand,{action:'claim'}>){return tx(async c=>once(c,'worker:'+worker,input.requestId,input,async()=>{
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended('mission-claim',0))");
  const pending=(await c.query("SELECT r.*,p.content,p.revision AS current_revision,p.state AS plan_state FROM knowledge_missions.runs r JOIN knowledge_missions.plans p ON p.id=r.plan_id WHERE p.state='active' AND p.revision=r.plan_revision AND (r.state='delivering' OR r.state='leased' AND r.lease_until<=clock_timestamp() OR r.state='waiting' AND r.next_attempt<=clock_timestamp()) ORDER BY r.next_attempt,r.created_at LIMIT 1 FOR UPDATE OF p")).rows[0];
  let p:QueryResultRow,r:QueryResultRow;
  if(pending){p={id:pending.plan_id,content:pending.content,revision:pending.current_revision};r=(await c.query('SELECT * FROM knowledge_missions.runs WHERE id=$1 FOR UPDATE',[pending.id])).rows[0];if(r.attempts>=6&&r.state!=='delivering'){await c.query("UPDATE knowledge_missions.runs SET state='failed',reason='この実行の再試行上限に達しました。次の予定で再開します。' WHERE id=$1",[r.id]);await c.query("UPDATE knowledge_missions.plans SET next_due=clock_timestamp()+make_interval(hours=>$2) WHERE id=$1",[p.id,p.content.intervalHours]);return {lease:null};}}
  else{
   const found=(await c.query("SELECT p.* FROM knowledge_missions.plans p WHERE p.state='active' AND p.next_due<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM knowledge_missions.runs r WHERE r.plan_id=p.id AND r.state IN('leased','waiting','delivering')) AND (SELECT count(*) FROM knowledge_missions.runs r WHERE r.plan_id=p.id AND r.created_at>clock_timestamp()-interval '24 hours')<ceil(24.0/(p.content->>'intervalHours')::integer) ORDER BY p.next_due,p.id LIMIT 1 FOR UPDATE OF p")).rows[0];if(!found)return {lease:null};p=found;
   let context:MissionSnapshot;try{context=await snapshot(missionPlanSchema.parse(p.content));}catch{await c.query("UPDATE knowledge_missions.plans SET next_due=clock_timestamp()+interval '1 hour' WHERE id=$1",[p.id]);return {lease:null,reason:'計画の対象・テーマを現在閲覧できません。次回に再確認します。'};}
   r=(await c.query("INSERT INTO knowledge_missions.runs(id,plan_id,plan_revision,snapshot,state,worker_id) VALUES($1,$2,$3,$4,'leased',$5) RETURNING *",[randomUUID(),p.id,p.revision,context,worker])).rows[0];
  }
  const token=randomBytes(32).toString('hex');r=(await c.query("UPDATE knowledge_missions.runs SET generation=generation+$2,attempts=attempts+$2,worker_id=$3,lease_hash=$4,lease_until=clock_timestamp()+interval '30 minutes',state=CASE WHEN payload IS NOT NULL THEN 'delivering' ELSE 'leased' END,updated_at=clock_timestamp() WHERE id=$1 RETURNING *",[r.id,pending?1:0,worker,hash(token)])).rows[0];return {lease:leaseDto(r,p,token)};
 }));}
 async function lockRun(c:PoolClient,worker:string,input:{runId:string;generation:number;token:string},allowDelivered=false){
  const seed=(await c.query('SELECT plan_id FROM knowledge_missions.runs WHERE id=$1',[input.runId])).rows[0];if(!seed)throw new KnowledgeError('実行がありません。',404,'NOT_FOUND');
  const p=(await c.query('SELECT * FROM knowledge_missions.plans WHERE id=$1 FOR UPDATE',[seed.plan_id])).rows[0],r=(await c.query('SELECT * FROM knowledge_missions.runs WHERE id=$1 FOR UPDATE',[input.runId])).rows[0];
  if(p.state!=='active'||p.revision!==r.plan_revision||r.worker_id!==worker||r.generation!==input.generation||r.lease_hash!==hash(input.token)||!(['leased','delivering',...(allowDelivered?['delivered']:[])].includes(r.state))||r.state==='leased'&&new Date(r.lease_until).getTime()<=Date.now())throw new KnowledgeError('実行の期限・世代・計画が変わりました。配送せず次の実行を確認してください。',409,'MISSION_LEASE_CHANGED');return {p,r};
 }
 async function deliver(worker:string,input:Extract<MissionWorkerCommand,{action:'deliver'}>){
  const saved=await tx(async c=>{const {p,r}=await lockRun(c,worker,input,true);const pkg=await validateMissionPackage(input.package,r.snapshot,r.id,p.id,(id,revision)=>foundation.get(reader,'source',id,revision)),digest=knowledgeDigest(input.package);
   if(r.payload_hash&&r.payload_hash!==digest)throw new KnowledgeError('保存した配送内容が変わっています。同じ内容を再送してください。',409,'MISSION_DELIVERY_CHANGED');
   if(!r.payload)await c.query("UPDATE knowledge_missions.runs SET payload=$2,payload_hash=$3,state='delivering',updated_at=clock_timestamp() WHERE id=$1",[r.id,input.package,digest]);return {p,r,pkg};});
  const principal=await missionImportPrincipal(pool,'mission:'+saved.r.id);if(!principal)throw new KnowledgeError('収集計画が停止・変更されています。',409,'MISSION_LEASE_CHANGED');
  const accepted=await imports().intake(principal,input.package);
  await tx(async c=>{const {p,r}=await lockRun(c,worker,input,true);await c.query("UPDATE knowledge_missions.runs SET state='delivered',receipt_id=$2,reason='資料と内容を受け付けました。公開確認は自動で進みます。',updated_at=clock_timestamp() WHERE id=$1",[r.id,accepted.receiptId]);await c.query('UPDATE knowledge_missions.plans SET next_due=GREATEST(next_due,$2::timestamptz+make_interval(hours=>$3)),updated_at=clock_timestamp() WHERE id=$1',[p.id,r.created_at,p.content.intervalHours]);});
  return {receiptId:accepted.receiptId,replayed:accepted.replayed,receipt:await imports().receipt(principal,accepted.receiptId)};
 }
 async function worker(id:string,input:MissionWorkerCommand){
  await ensure();await pool.query('INSERT INTO knowledge_missions.workers(id) VALUES($1) ON CONFLICT(id) DO UPDATE SET last_seen=clock_timestamp()',[id]);
  if(input.action==='claim')return claim(id,input);if(input.action==='deliver')return deliver(id,input);
  return tx(async c=>once(c,'worker:'+id,input.requestId,input,async()=>{const {p,r}=await lockRun(c,id,input);
   const retry=input.action==='fail'&&input.retryable&&r.attempts<6,state=input.action==='empty'?'empty':retry?'waiting':'failed',reason=input.action==='empty'?input.summary:({network:'通信が不安定です。', 'source-unavailable':'資料を取得できません。','search-unavailable':'資料探索への接続を待っています。',limit:'実行側の利用上限を待っています。','invalid-package':'配送内容を確認できません。'}[input.reason]);
   await c.query("UPDATE knowledge_missions.runs SET state=$2,reason=$3,lease_hash=NULL,lease_until=NULL,next_attempt=clock_timestamp()+interval '15 minutes',updated_at=clock_timestamp() WHERE id=$1",[r.id,state,reason]);
   if(!retry)await c.query('UPDATE knowledge_missions.plans SET next_due=clock_timestamp()+make_interval(hours=>$2) WHERE id=$1',[p.id,p.content.intervalHours]);return {runId:r.id,state};
  }));
 }
 return {list,act,worker};
}
