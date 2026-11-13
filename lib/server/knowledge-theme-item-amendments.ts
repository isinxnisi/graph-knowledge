import type {Pool,PoolClient,QueryResultRow} from 'pg';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {amendThemeRegistrationSchema,themeAuthoringRequestSchema,type AmendThemeRegistration} from '../domain/knowledge-theme-registration';
import {missionMcpPackageSchema} from '../domain/knowledge-mission-mcp';
import {knowledgeImportPackageSchema,type KnowledgeImportPackage} from '../domain/knowledge-import';
import {normalizeImportItem,assertImportScope,importItemOperationId,importActor} from './knowledge-import-plan';
import {knowledgeDigest,KnowledgeError} from './knowledge-foundation';
import {webImportPrincipal} from './knowledge-web-import';
import {operatorThemeIntake} from './operator-theme-intake';

export async function themeItemAmendmentsAvailable(db:Pool|PoolClient){return !!(await db.query("SELECT to_regclass('knowledge_missions.theme_item_input_revisions') AS name")).rows[0]?.name;}
export async function ensureThemeItemAmendments(pool:Pool){
 const name='042-theme-item-amendments.sql',hash=createHash('sha256').update(await readFile(path.join(process.cwd(),'db/member',name))).digest('hex');
 if((await pool.query('SELECT checksum FROM member_migration WHERE name=$1',[name])).rows[0]?.checksum!==hash)throw new KnowledgeError('項目修正用の明示migrationが必要です。',503,'MIGRATION_REQUIRED');
}
export const pendingThemeItemStates=['queued','running','retry','quota','needs-changes','declined','applying'];
export function originalItemInput(pkg:KnowledgeImportPackage,key:string){return {...pkg,items:pkg.items.filter(i=>i&&typeof i==='object'&&!Array.isArray(i)&&i.key===key)};}
/** Changed local resources get content-derived identities. A URL fix must not
 * attempt to overwrite a Source already shared by a different published item. */
export function processingAmendedInput(original:KnowledgeImportPackage,input:KnowledgeImportPackage){
 const result=structuredClone(input),entityIds=new Map<string,string>(),sourceIds=new Map<string,string>();
 for(const [field,ids] of [['entities',entityIds],['sources',sourceIds]] as const){
  result[field]=result[field].map(raw=>{
   const value=raw as {id:string;content:KnowledgeImportPackage['sources'][number]},old=original[field].find(o=>!!o&&typeof o==='object'&&!Array.isArray(o)&&o.id===value.id) as {id:string;content:KnowledgeImportPackage['sources'][number]}|undefined;
   if(!old||knowledgeDigest(old.content)===knowledgeDigest(value.content))return raw;
   const id='amended:'+knowledgeDigest([field,value.id,value.content]).slice(0,40);ids.set(value.id,id);return {...value,id};
  });
 }
 const item=result.items[0] as {record:{subjectId?:string|null;objectId?:string|null;evidence:{source:{id:string}}[]};about?:{kind:string;id:string}};
 for(const field of ['subjectId','objectId'] as const)if(item.record[field]&&entityIds.has(item.record[field]!))item.record[field]=entityIds.get(item.record[field]!)!;
 if(item.about?.kind==='entity'&&entityIds.has(item.about.id))item.about.id=entityIds.get(item.about.id)!;
 for(const evidence of item.record.evidence)if(sourceIds.has(evidence.source.id))evidence.source.id=sourceIds.get(evidence.source.id)!;
 return result;
}

/** Caller holds the existing theme-registration advisory lock and rechecks its
 * operator owner. Lock package -> items exactly like importer apply/recovery. */
export type ThemeAmendmentResult={requestId:string;registrationRequestId:string;receiptId:string;replayed:boolean;items:{key:string;inputRevision:number;state:string;nextAttemptAt:string}[]};
export async function amendThemeItems(c:PoolClient,knowledge:Pool,r:QueryResultRow,owner:string,raw:AmendThemeRegistration):Promise<ThemeAmendmentResult>{
 const input=amendThemeRegistrationSchema.parse(raw),digest=knowledgeDigest(input);
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['theme-registration-owner:'+owner]);
 const old=(await c.query('SELECT * FROM knowledge_missions.theme_item_amendments WHERE request_id=$1',[input.requestId])).rows[0];
 if(old){if(old.owner_id!==owner||old.registration_id!==r.request_id)throw new KnowledgeError('修正受付がありません。',404,'NOT_FOUND');if(old.digest!==digest)throw new KnowledgeError('同じ修正操作IDに異なる内容は送れません。',409,'REQUEST_CHANGED');return {...old.response,replayed:true};}
 if((await knowledge.query('SELECT 1 FROM knowledge75.operations WHERE actor_id=$1 AND request_id=$2',['theme-registration:'+owner,r.request_id])).rowCount)throw new KnowledgeError('テーマへの反映は完了済みです。',409,'THEME_REGISTRATION_FINISHED');
 if(!['saved','processing','needs-changes'].includes(r.state)||r.result)throw new KnowledgeError('このテーマ受付は既に完了または取消済みです。',409,'THEME_REGISTRATION_FINISHED');
 if(!r.receipt_id)throw new KnowledgeError('項目の受付が準備されるまでお待ちください。',409,'THEME_DELIVERY_PENDING');
 if(Buffer.byteLength(JSON.stringify(input))>1_000_000)throw new KnowledgeError('一度に修正する量を減らしてください。',413,'AMENDMENT_TOO_LARGE');
 const pkg=(await c.query('SELECT * FROM knowledge_import.packages WHERE id=$1 FOR UPDATE',[r.receipt_id])).rows[0];
 const p=await webImportPrincipal(c,pkg.principal_id,c);
 if(!p||pkg.cancelled_at||!await operatorThemeIntake(c,pkg.id,p,true))throw new KnowledgeError('現在の運営テーマの受付と権限を確認してください。',403,'OPERATOR_REQUIRED');
 if(Number((await c.query("SELECT count(*)::int n FROM knowledge_missions.theme_item_amendments WHERE owner_id=$1 AND created_at>clock_timestamp()-interval '24 hours'",[owner])).rows[0].n)>=200)throw new KnowledgeError('今日の項目修正受付上限を待っています。',429,'THEME_AMENDMENT_LIMIT');
 const original=knowledgeImportPackageSchema.parse(pkg.payload),authoring=themeAuthoringRequestSchema.parse(r.input),changes=[];
 for(const edit of [...input.items].sort((a,b)=>a.key.localeCompare(b.key))){
  const item=(await c.query('SELECT * FROM knowledge_import.items WHERE package_id=$1 AND item_key=$2 FOR UPDATE',[pkg.id,edit.key])).rows[0];
  if(!item)throw new KnowledgeError('修正対象の項目が受付にありません。',404,'ITEM_NOT_FOUND');
  if(item.input_revision!==edit.expectedRevision)throw new KnowledgeError('項目の入力版が更新されています。同じ受付を読み直してください。',409,'ITEM_REVISION_CONFLICT');
  const applied=(await knowledge.query('SELECT 1 FROM knowledge75.operations WHERE actor_id=$1 AND request_id=$2',[importActor(p),importItemOperationId(item as {id:string;input_revision:number})])).rowCount;
  if(item.result||applied||!pendingThemeItemStates.includes(item.state))throw new KnowledgeError('既に原記録へ反映または取消済みの項目は修正できません。公開記録を訂正する別の操作を使ってください。',409,'ITEM_ALREADY_APPLIED');
  if(item.input_revision>=20)throw new KnowledgeError('この項目の入力履歴上限に達しました。',429,'ITEM_REVISION_LIMIT');
  const previous=(await c.query('SELECT input FROM knowledge_missions.theme_item_input_revisions WHERE item_id=$1 AND revision=$2',[item.id,item.input_revision])).rows[0]?.input??originalItemInput(original,edit.key);
  const next=missionMcpPackageSchema.parse({...previous,...Object.fromEntries(['entities','sources','entityPins','sourcePins'].filter(k=>k in edit).map(k=>[k,edit[k as keyof typeof edit]])),items:[edit.item]});
  if(knowledgeDigest(previous)===knowledgeDigest(next))throw new KnowledgeError('項目の内容が変わっていません。',409,'ITEM_INPUT_UNCHANGED');
  // Reuse creation/update target restrictions, without changing selection,
  // images, products or any other item in the immutable original envelope.
  themeAuthoringRequestSchema.parse({...authoring,package:next,recordKeys:[]});
  const processing=processingAmendedInput(original,next),normalized=normalizeImportItem(processing,processing.items[0]);
  if('target' in authoring&&edit.item.correction&&!authoring.recordPins.some(pin=>pin.id===edit.item.correction!.id)){
   const target=(await knowledge.query("SELECT r.content FROM knowledge75.revisions r WHERE r.kind='theme' AND r.id=$1 AND r.revision=$2",[authoring.target.id,authoring.target.revision])).rows[0];
   if(!target?.content.recordPins.some((pin:{id:string})=>pin.id===edit.item.correction!.id))throw new KnowledgeError('訂正する記録を対象テーマから選んでください。',400,'THEME_MEMBER_REQUIRED');
  }
  assertImportScope(p,normalized);
  changes.push({item,previous,next,processing,normalized,revision:item.input_revision+1});
 }
 const response={requestId:input.requestId,registrationRequestId:r.request_id,receiptId:r.receipt_id,replayed:false,items:changes.map(v=>({key:v.item.item_key,inputRevision:v.revision,state:'queued',nextAttemptAt:new Date(['retry','quota','running','applying'].includes(v.item.state)?Math.max(Date.now(),new Date(v.item.next_attempt).getTime()):Date.now()).toISOString()}))};
 await c.query('INSERT INTO knowledge_missions.theme_item_amendments(request_id,registration_id,owner_id,digest,reason,response) VALUES($1,$2,$3,$4,$5,$6)',[input.requestId,r.request_id,owner,digest,input.reason,JSON.stringify(response)]);
 for(const change of changes){
  const {item,previous,next,processing,normalized,revision}=change;
  await c.query('INSERT INTO knowledge_missions.theme_item_input_revisions(item_id,revision,registration_id,input,input_digest,prior_state,created_at) VALUES($1,1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[item.id,r.request_id,JSON.stringify(previous),knowledgeDigest(previous),item.state,item.created_at]);
  await c.query('INSERT INTO knowledge_missions.theme_item_input_revisions(item_id,revision,registration_id,amendment_id,input,input_digest,prior_state) VALUES($1,$2,$3,$4,$5,$6,$7)',[item.id,revision,r.request_id,input.requestId,JSON.stringify(next),knowledgeDigest(next),item.state]);
  // Preserve cumulative attempts and source cooldown across input editions.
  await c.query("UPDATE knowledge_import.items SET input_revision=$2,input_package=$3,input_digest=$4,normalized=$5,state='queued',prepared=NULL,decision=NULL,issues='[]',lease_token=NULL,lease_until=NULL,current_attempt=NULL,reason='入力を修正しました。原資料と参照を再確認します。',next_attempt=CASE WHEN state IN('retry','quota','running','applying') THEN GREATEST(next_attempt,clock_timestamp()) ELSE clock_timestamp() END,updated_at=clock_timestamp() WHERE id=$1",[item.id,revision,JSON.stringify(processing),knowledgeDigest(next.items[0]),JSON.stringify(normalized)]);
 }
 await c.query("UPDATE knowledge_missions.theme_registrations SET state='processing',reason='修正した項目を確認しています。',next_attempt=clock_timestamp(),updated_at=clock_timestamp() WHERE request_id=$1",[r.request_id]);
 return response;
}

export async function readThemeItemAmendments(pool:Pool,r:QueryResultRow,selection?:{itemKey?:string;inputRevision?:number}):Promise<{available:boolean;operation?:string;history?:{requestId:string;reason:string;createdAt:string;items:ThemeAmendmentResult['items']}[];items?:{key:string;inputRevision:number;canAmend:boolean;input?:{revision:number;value:KnowledgeImportPackage;hash:string}}[]}>{
 if(!r.receipt_id||!await themeItemAmendmentsAvailable(pool))return {available:false};
 const original=knowledgeImportPackageSchema.parse((await pool.query('SELECT payload FROM knowledge_import.packages WHERE id=$1',[r.receipt_id])).rows[0].payload);
 const rows=(await pool.query('SELECT id,item_key,state,result,input_revision FROM knowledge_import.items WHERE package_id=$1 ORDER BY ordinal',[r.receipt_id])).rows;
 const history=(await pool.query('SELECT request_id,reason,created_at,response FROM knowledge_missions.theme_item_amendments WHERE registration_id=$1 ORDER BY created_at,request_id',[r.request_id])).rows.map(v=>({requestId:v.request_id,reason:v.reason,createdAt:v.created_at.toISOString(),items:v.response.items}));
 const items=[];
 for(const item of rows){
  const canAmend=['saved','processing','needs-changes'].includes(r.state)&&!r.result&&!item.result&&pendingThemeItemStates.includes(item.state);
  const revision=selection?.itemKey===item.item_key?selection?.inputRevision??item.input_revision:item.input_revision;
  const row=(await pool.query('SELECT input,input_digest,created_at FROM knowledge_missions.theme_item_input_revisions WHERE item_id=$1 AND revision=$2',[item.id,revision])).rows[0];
  if(selection?.itemKey===item.item_key&&revision!==1&&!row)throw new KnowledgeError('項目の入力履歴がありません。',404,'ITEM_INPUT_NOT_FOUND');
  const input=row?.input??originalItemInput(original,item.item_key);
  items.push({key:item.item_key,inputRevision:item.input_revision,canAmend,...((canAmend&&!selection?.itemKey||selection?.itemKey===item.item_key)?{input:{revision,value:input,hash:knowledgeDigest(input)}}:{})});
 }
 if(selection?.itemKey&&!rows.some(v=>v.item_key===selection.itemKey))throw new KnowledgeError('項目が受付にありません。',404,'ITEM_NOT_FOUND');
 return {available:true,operation:'amend_theme_registration',history,items};
}
