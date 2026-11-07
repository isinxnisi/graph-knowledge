import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {knowledgeImportPackageSchema,type ImportPrincipal} from '../domain/knowledge-import';
import {knowledgeDigest,KnowledgeError} from './knowledge-foundation';
import {knowledgeCapability} from './knowledge-deployment';
import {ensureMissionSchema} from './knowledge-missions';
import {normalizeImportItem} from './knowledge-import-plan';
import type {createKnowledgeImports} from './knowledge-import';
import {isSiteOperator} from './member/site-operations';

export const webImportCommandSchema=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('deliver'),requestId:z.uuidv4(),package:z.json()}),
 z.strictObject({action:z.literal('cancel'),receiptId:z.uuidv4()}),
]);
/** A browser session creates an internal identity; no import bearer is exposed. */
export async function webImportPrincipal(pool:Pool,id:string,client?:PoolClient):Promise<ImportPrincipal|null>{
 if(!/^web:[a-f0-9-]{36}$/.test(id)||!knowledgeCapability('missions')||!knowledgeCapability('operator')||process.env.KNOWLEDGE_MISSIONS_ENABLED!=='1')return null;
 const c=client??pool;
 const row=(await c.query('SELECT w.*,u.active FROM knowledge_missions.web_importers w JOIN "user" u ON u.id=w.owner_id WHERE w.id=$1'+(client?' FOR SHARE OF u,w':''),[id.slice(4)])).rows[0];
 if(!row?.active||!isSiteOperator(row.owner_id))return null;
 return {id,namespace:row.namespace,tokenSha256:'0'.repeat(64),expiresAt:'2100-01-01T00:00:00Z',disabled:false,operations:['create-entity','create-relation','add-information','add-evidence','correct-record','correct-entity','translate-text'],targets:{entities:'*',records:'*',sources:'*',themes:row.themes},allowNewEntities:true,packagesPerDay:200,itemsPerDay:2000,pendingItems:200};
}
export function createWebKnowledgeImports(pool:Pool,imports:()=>ReturnType<typeof createKnowledgeImports>){
 async function dispatch(saved:{request_id:string;importer_id:string;payload:unknown;state:string}){
  if(!['saved','delivered'].includes(saved.state))throw new KnowledgeError('この配送は停止しています。内容を確認し、新しい操作として送ってください。',409,'WEB_DELIVERY_STOPPED');
  const p=await webImportPrincipal(pool,'web:'+saved.importer_id);
  if(!p){await pool.query("UPDATE knowledge_missions.web_deliveries SET state='cancelled',reason='運営権限が停止されています。' WHERE request_id=$1 AND state='saved'",[saved.request_id]);throw new KnowledgeError('現在の運営権限を確認してください。',403,'OPERATOR_REQUIRED');}
  try{const accepted=await imports().intake(p,saved.payload);await pool.query("UPDATE knowledge_missions.web_deliveries SET receipt_id=$2,state='delivered',reason='' WHERE request_id=$1",[saved.request_id,accepted.receiptId]);return {receipt:await imports().receipt(p,accepted.receiptId),replayed:accepted.replayed};}
  catch(e){if(e instanceof KnowledgeError&&e.status>=400&&e.status<500&&e.status!==429)await pool.query("UPDATE knowledge_missions.web_deliveries SET state='needs-changes',reason=$2 WHERE request_id=$1 AND state='saved'",[saved.request_id,e.message]);else await pool.query("UPDATE knowledge_missions.web_deliveries SET next_attempt=clock_timestamp()+interval '1 minute' WHERE request_id=$1 AND state='saved'",[saved.request_id]);throw e;}
 }
 async function deliver(actor:string,requestId:string,raw:unknown,beforeWrite?:(c:PoolClient)=>Promise<void>){
  await ensureMissionSchema(pool);
  const pkg=knowledgeImportPackageSchema.parse(raw),digest=knowledgeDigest(raw);
  // Collect permissions from valid items; the common importer keeps independent
  // errors for malformed items instead of losing an otherwise useful package.
  const normalized=pkg.items.flatMap(v=>{try{return [normalizeImportItem(pkg,v)];}catch{return [];}});
  const themes=[...new Set(normalized.flatMap(v=>v.items.flatMap(i=>i.themes?.map(t=>t.id)??[])))];
  const c=await pool.connect();let saved;
  try{await c.query('BEGIN');await beforeWrite?.(c);
   if(!isSiteOperator(actor)||(await c.query('SELECT 1 FROM "user" WHERE id=$1 AND active FOR SHARE',[actor])).rowCount!==1)throw new KnowledgeError('現在の運営権限を確認してください。',403,'OPERATOR_REQUIRED');
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['web-import:'+actor]);
   const old=(await c.query('SELECT d.*,w.owner_id FROM knowledge_missions.web_deliveries d JOIN knowledge_missions.web_importers w ON w.id=d.importer_id WHERE d.request_id=$1',[requestId])).rows[0];
   if(old){if(old.owner_id!==actor||old.original_hash!==digest)throw new KnowledgeError('同じ受付操作に別の内容は送れません。',409,'REQUEST_CHANGED');saved=old;}
   else{
    // Owner-wide backpressure cannot be bypassed by changing package namespaces.
    const usage=(await c.query("SELECT count(*) FILTER(WHERE d.created_at>clock_timestamp()-interval '24 hours')::int daily,COALESCE(sum(jsonb_array_length(d.payload->'items')) FILTER(WHERE d.created_at>clock_timestamp()-interval '24 hours'),0)::int items FROM knowledge_missions.web_deliveries d JOIN knowledge_missions.web_importers w ON w.id=d.importer_id WHERE w.owner_id=$1",[actor])).rows[0];
    if(usage.daily>=200||usage.items+pkg.items.length>2000)throw new KnowledgeError('今日のWeb受付上限に達しました。次の日に続けられます。',429,'IMPORT_LIMIT');
    const namespace='web.'+knowledgeDigest({actor,namespace:pkg.namespace}).slice(0,48);
    const w=(await c.query('INSERT INTO knowledge_missions.web_importers(id,owner_id,original_namespace,namespace,themes) VALUES($1,$2,$3,$4,$5) ON CONFLICT(owner_id,original_namespace) DO UPDATE SET themes=ARRAY(SELECT DISTINCT unnest(knowledge_missions.web_importers.themes||EXCLUDED.themes)) RETURNING *',[randomUUID(),actor,pkg.namespace,namespace,themes])).rows[0];
    if(w.themes.length>1000)throw new KnowledgeError('この取込名のテーマ数が上限に達しました。',429,'IMPORT_LIMIT');
    const payload={...raw as object,namespace};
    saved=(await c.query('INSERT INTO knowledge_missions.web_deliveries(request_id,importer_id,original_hash,original_payload,payload) VALUES($1,$2,$3,$4,$5) RETURNING *',[requestId,w.id,digest,JSON.stringify(raw),JSON.stringify(payload)])).rows[0];
   }await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  return dispatch(saved);
 }
 async function list(actor:string){
  await ensureMissionSchema(pool);const out=[];
  const rows=(await pool.query('SELECT d.request_id,d.receipt_id,d.payload,d.created_at,d.state,d.reason,w.id importer_id,w.original_namespace FROM knowledge_missions.web_deliveries d JOIN knowledge_missions.web_importers w ON w.id=d.importer_id WHERE w.owner_id=$1 ORDER BY d.created_at DESC,d.request_id DESC LIMIT 10',[actor])).rows;
  for(const row of rows){const p=await webImportPrincipal(pool,'web:'+row.importer_id);if(!p)continue;out.push({requestId:row.request_id,namespace:row.original_namespace,packageId:row.payload.packageId,revision:row.payload.revision,createdAt:row.created_at.toISOString(),state:row.state,reason:row.reason,receipt:row.receipt_id?await imports().receipt(p,row.receipt_id):null});}
  return {items:out};
 }
 async function cancel(actor:string,id:string){const row=(await pool.query('SELECT w.id FROM knowledge_missions.web_deliveries d JOIN knowledge_missions.web_importers w ON w.id=d.importer_id WHERE d.receipt_id=$1 AND w.owner_id=$2',[id,actor])).rows[0];const p=row?await webImportPrincipal(pool,'web:'+row.id):null;if(!p)throw new KnowledgeError('受付がありません。',404,'NOT_FOUND');return imports().cancel(p,id);}
 async function recoverOne(){await ensureMissionSchema(pool);const row=(await pool.query("SELECT * FROM knowledge_missions.web_deliveries WHERE state='saved' AND next_attempt<=clock_timestamp() ORDER BY created_at,request_id LIMIT 1")).rows[0];if(!row)return false;try{await dispatch(row);}catch{/* Durable state/retry time is retained, without logging input or credentials. */}return true;}
 return {deliver,list,cancel,recoverOne};
}
