import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type {Pool,PoolClient,QueryResultRow} from 'pg';
import {z} from 'zod';
import {themeRegistrationInputSchema} from '../domain/knowledge-theme-registration';
import {knowledgeCommandSchema,type KnowledgePin} from '../domain/knowledge-foundation';
import {createKnowledgeFoundationService,knowledgeDigest,KnowledgeError} from './knowledge-foundation';
import {knowledgeCapability} from './knowledge-deployment';
import {verifyKnowledgeReadSchema} from './knowledge-publication-preview';
import {isSiteOperator} from './member/site-operations';
import type {createWebKnowledgeImports} from './knowledge-web-import';
import type {createKnowledgeImports} from './knowledge-import';

export async function ensureThemeRegistrationSchema(pool:Pool){
 const name='036-theme-registration.sql',checksum=createHash('sha256').update(await readFile(path.join(process.cwd(),'db/member',name))).digest('hex');
 if((await pool.query('SELECT checksum FROM member_migration WHERE name=$1',[name])).rows[0]?.checksum!==checksum)throw new KnowledgeError('テーマ受付の明示migrationが必要です。',503,'MIGRATION_REQUIRED');
}
const finalStates=['published','published-with-issues','needs-changes','cancelled'];
const actorId=(owner:string)=>'theme-registration:'+owner;

/** Durable operator request -> common evidence review -> public record pins ->
 * Theme. No browser, bearer token or manual DB seeding is needed for each Theme.
 * The member-side lock and common operation receipt recover a lost cross-DB ACK. */
export function createThemeRegistrations(pool:Pool,knowledge:Pool,web:ReturnType<typeof createWebKnowledgeImports>,imports:ReturnType<typeof createKnowledgeImports>,options:{afterThemeCommit?:()=>Promise<void>}={}){
 const foundation=createKnowledgeFoundationService(knowledge,{prepareSchema:()=>verifyKnowledgeReadSchema(knowledge)});
 let ready:Promise<void>|undefined;
 const ensure=()=>ready??=ensureThemeRegistrationSchema(pool).catch(e=>{ready=undefined;throw e;});
 async function current(c:PoolClient|Pool,owner:string){
  if(!knowledgeCapability('operator')||!knowledgeCapability('missions')||!isSiteOperator(owner)||(await c.query('SELECT 1 FROM "user" WHERE id=$1 AND active FOR SHARE',[owner])).rowCount!==1)throw new KnowledgeError('現在の運営権限を確認してください。',403,'OPERATOR_REQUIRED');
 }
 async function tx<T>(requestId:string,f:(c:PoolClient)=>Promise<T>){
  await ensure();const c=await pool.connect();
  try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['theme-registration:'+requestId]);const result=await f(c);await c.query('COMMIT');return result;}
  catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 async function row(c:Pool|PoolClient,owner:string,requestId:string){
  const value=(await c.query('SELECT * FROM knowledge_missions.theme_registrations WHERE request_id=$1 AND owner_id=$2',[requestId,owner])).rows[0];
  if(!value)throw new KnowledgeError('テーマの受付がありません。',404,'NOT_FOUND');return value;
 }
 async function committed(r:QueryResultRow){
  return (await knowledge.query('SELECT result FROM knowledge75.operations WHERE actor_id=$1 AND request_id=$2',[actorId(r.owner_id),r.request_id])).rows[0]?.result as {id:string;revision:number}|undefined;
 }
 async function savePublished(c:PoolClient,r:QueryResultRow,result:{id:string;revision:number},issues?:string[]){
  if(!issues){const input=themeRegistrationInputSchema.parse(r.input),keys=input.recordKeys.length?input.recordKeys:input.package?.items.map(i=>i.key)??[];
   const rows=(await c.query('SELECT i.item_key,i.state FROM knowledge_import.items i JOIN knowledge_missions.web_deliveries d ON d.receipt_id=i.package_id WHERE d.request_id=$1',[r.request_id])).rows;
   issues=keys.filter(k=>!rows.some(i=>i.item_key===k&&['published','existing'].includes(i.state)));
  }
  await c.query("UPDATE knowledge_missions.theme_registrations SET state=$2,result=$3,reason=$4,updated_at=clock_timestamp() WHERE request_id=$1",[r.request_id,issues.length?'published-with-issues':'published',JSON.stringify({...result,excludedKeys:issues}),issues.length?'確認を通った項目でテーマを作成しました。未反映の項目は受付結果で確認できます。':'根拠を確認できた記録からテーマを作成しました。']);
 }
 async function submit(owner:string,raw:unknown){
  await current(pool,owner);
  const input=themeRegistrationInputSchema.parse(raw),hash=knowledgeDigest(input);
  // Reject inaccessible supplied pins before accepting a new request. Recheck at
  // final composition too; an old accepted request is never a visibility grant.
  for(const pin of input.recordPins)await foundation.get({kind:'reader',id:actorId(owner)},'record',pin.id,pin.revision);
  return tx(input.requestId,async c=>{
   await current(c,owner);
   const old=(await c.query('SELECT * FROM knowledge_missions.theme_registrations WHERE request_id=$1',[input.requestId])).rows[0];
   if(old){if(old.owner_id!==owner||old.input_hash!==hash)throw new KnowledgeError('同じ受付IDに異なるテーマは送れません。',409,'REQUEST_CHANGED');return {requestId:old.request_id,state:old.state,replayed:true};}
   // A new namespace/request ID does not bypass the operator-wide upper bound.
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['theme-registration-owner:'+owner]);
   const usage=(await c.query("SELECT count(*) FILTER(WHERE created_at>clock_timestamp()-interval '24 hours')::int daily,count(*) FILTER(WHERE state IN('saved','processing'))::int pending FROM knowledge_missions.theme_registrations WHERE owner_id=$1",[owner])).rows[0];
   if(usage.daily>=30||usage.pending>=10)throw new KnowledgeError('テーマ受付の上限に達しました。処理中の結果か、次の日を待ってください。',429,'THEME_REGISTRATION_LIMIT');
   const id='theme:'+knowledgeDigest({owner,requestId:input.requestId}).slice(0,48);
   await c.query('INSERT INTO knowledge_missions.theme_registrations(request_id,owner_id,input_hash,input,theme_id) VALUES($1,$2,$3,$4,$5)',[input.requestId,owner,hash,JSON.stringify(input),id]);
   return {requestId:input.requestId,state:'saved',replayed:false};
  });
 }
 async function status(owner:string,requestId:string){
  await ensure();await current(pool,owner);const r=await row(pool,owner,requestId);
  let receipt=null,theme=null;
  if(r.receipt_id)receipt=await readReceipt(r);
  if(r.result)try{const v=await foundation.get({kind:'reader',id:actorId(owner)},'theme',r.result.id,r.result.revision);theme={id:v.id,revision:v.revision,title:v.content.title,url:'/?ktheme='+encodeURIComponent(v.id)+'&krev='+v.revision};}catch{/* No stopped/private dependency is disclosed through old receipt links. */}
  return {requestId,state:r.state,reason:r.reason,title:r.input.title,receipt,theme,excludedKeys:r.result?.excludedKeys??[],nextAttemptAt:['saved','processing'].includes(r.state)?r.next_attempt:null};
 }
 async function cancel(owner:string,requestId:string){
  return tx(requestId,async c=>{
   await current(c,owner);const r=await row(c,owner,requestId),done=await committed(r);
   if(done){await savePublished(c,r,done);return {requestId,state:'published',reason:'テーマは作成済みです。公開済みの知識は取り消していません。'};}
   if(finalStates.includes(r.state))return {requestId,state:r.state};
   if(r.receipt_id)await web.cancel(owner,r.receipt_id);
   await c.query("UPDATE knowledge_missions.theme_registrations SET state='cancelled',reason='テーマ作成と未反映の項目を取り消しました。公開済みの記録は保持します。',updated_at=clock_timestamp() WHERE request_id=$1",[requestId]);
   return {requestId,state:'cancelled'};
  });
 }
 async function readReceipt(r:QueryResultRow){
  const d=(await pool.query('SELECT importer_id FROM knowledge_missions.web_deliveries WHERE request_id=$1',[r.request_id])).rows[0];
  if(!d)throw new KnowledgeError('項目受付を再確認しています。',503,'THEME_DELIVERY_PENDING');
  const {webImportPrincipal}=await import('./knowledge-web-import');const p=await webImportPrincipal(pool,'web:'+d.importer_id);
  if(!p)throw new KnowledgeError('現在の送信権限を確認してください。',403,'OPERATOR_REQUIRED');
  return imports.receipt(p,r.receipt_id);
 }
 async function recoverOne(){
  await ensure();
  const next=(await pool.query("SELECT request_id FROM knowledge_missions.theme_registrations WHERE state IN('saved','processing') AND next_attempt<=clock_timestamp() ORDER BY next_attempt,created_at LIMIT 1")).rows[0];
  if(!next)return false;
  try{return await tx(next.request_id,async c=>{
   const r=(await c.query('SELECT * FROM knowledge_missions.theme_registrations WHERE request_id=$1 FOR UPDATE',[next.request_id])).rows[0];
   if(!r||finalStates.includes(r.state)||new Date(r.next_attempt)>new Date())return false;
   const done=await committed(r);if(done){await savePublished(c,r,done);return true;}
   try{await current(c,r.owner_id);}catch{if(r.receipt_id)try{await web.cancel(r.owner_id,r.receipt_id);}catch{/* Common importer independently rejects a revoked owner. */}await c.query("UPDATE knowledge_missions.theme_registrations SET state='cancelled',reason='運営権限が停止されたため、未完了のテーマ作成を停止しました。',updated_at=clock_timestamp() WHERE request_id=$1",[r.request_id]);return true;}
   const input=themeRegistrationInputSchema.parse(r.input);
   if(input.package&&!r.receipt_id){
    const delivered=await web.deliver(r.owner_id,r.request_id,input.package);
    r.receipt_id=delivered.receipt.receiptId;
    await c.query("UPDATE knowledge_missions.theme_registrations SET state='processing',receipt_id=$2,reason='項目の内容と原資料を確認しています。',next_attempt=clock_timestamp()+interval '10 seconds',updated_at=clock_timestamp() WHERE request_id=$1",[r.request_id,r.receipt_id]);
   }
   const received=r.receipt_id?await readReceipt(r):null;
   if(received?.state==='processing'){
    await c.query("UPDATE knowledge_missions.theme_registrations SET next_attempt=clock_timestamp()+interval '10 seconds' WHERE request_id=$1",[r.request_id]);return true;
   }
   if(received?.state==='cancelled'){
    await c.query("UPDATE knowledge_missions.theme_registrations SET state='cancelled',reason='項目の受付が取り消されました。公開済みの記録は保持します。',updated_at=clock_timestamp() WHERE request_id=$1",[r.request_id]);return true;
   }
   const keys=input.recordKeys.length?input.recordKeys:input.package?.items.map(i=>i.key)??[];
   const bindings=new Map<string,KnowledgePin>(),excluded:string[]=[];
   for(const key of keys){const item=received?.items.find(i=>i.key===key);if(item&&['published','existing'].includes(item.state)&&item.result?.available)bindings.set(key,{id:item.result.id,revision:item.result.revision});else excluded.push(key);}
   const byId=new Map<string,KnowledgePin>();for(const pin of [...input.recordPins,...bindings.values()]){const old=byId.get(pin.id);if(old&&old.revision!==pin.revision)throw new KnowledgeError('同じ記録に複数の内容版が指定されています。構成へ残す版を一つ選んでください。',409,'THEME_PIN_CONFLICT');byId.set(pin.id,pin);}
   const pins=[...byId.values()];
   if(!pins.length){await c.query("UPDATE knowledge_missions.theme_registrations SET state='needs-changes',reason='テーマへ含められる公開記録がありません。項目の確認結果を見て、補足した内容を新しい受付IDで送れます。',updated_at=clock_timestamp() WHERE request_id=$1",[r.request_id]);return true;}
   const included=new Set(pins.map(p=>p.id)),resolve=(id:string):string|null=>{
    if(id.startsWith('item:')){const key=id.slice(5);if(excluded.includes(key))return null;const pin=bindings.get(key);if(pin)return pin.id;}
    else if(included.has(id))return id;
    throw new KnowledgeError('年表の配置は、このテーマへ選んだ記録ID、または item:項目key で指定してください。',400,'THEME_TIMELINE_TARGET');
   };
   const timeline=input.timeline?{...input.timeline,placements:input.timeline.placements.flatMap(v=>{const id=resolve(v.recordId);return id?[{...v,recordId:id}]:[];}),insets:input.timeline.insets.flatMap(v=>{const id=resolve(v.parentRecordId);return id?[{...v,parentRecordId:id}]:[];})}:undefined;
   const command=knowledgeCommandSchema.parse({action:'create-theme',requestId:r.request_id,id:r.theme_id,title:input.title,description:input.description,textLanguages:input.textLanguages,initialView:input.initialView,recordPins:pins,timeline,reason:'ChatGPTから受け付けた運営テーマ。原資料確認を通った公開記録の版を構成へ固定。'});
   const result=await foundation.execute({kind:'operator',id:actorId(r.owner_id)},command) as {id:string;revision:number};
   await options.afterThemeCommit?.();
   await savePublished(c,r,result,excluded);return true;
  });}catch(e){
   const permanent=e instanceof z.ZodError||e instanceof KnowledgeError&&e.status<500&&e.status!==429;
   await tx(next.request_id,async c=>{
    const r=(await c.query('SELECT * FROM knowledge_missions.theme_registrations WHERE request_id=$1 FOR UPDATE',[next.request_id])).rows[0];if(!r||finalStates.includes(r.state))return;
    // Knowledge commit may have succeeded before the member-side ACK was lost.
    const done=await committed(r);if(done){await savePublished(c,r,done);return;}
    const reason=e instanceof KnowledgeError?e.message:permanent?'テーマの構成・時期の参照を確認してください。':'接続が一時的に不安定です。受付内容を保持して自動で再試行します。';
    await c.query("UPDATE knowledge_missions.theme_registrations SET state=CASE WHEN $2 THEN 'needs-changes' ELSE state END,reason=$3,next_attempt=clock_timestamp()+interval '1 minute',updated_at=clock_timestamp() WHERE request_id=$1",[next.request_id,permanent,reason]);
   });return true;
  }
 }
 return {submit,status,cancel,recoverOne};
}
