import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {identityCommandSchema,identityDetailSchema,identityPageSchema,identityEntitySchema} from '../domain/knowledge-identity';
import {knowledgeIdSchema,knowledgeRecordContentSchema} from '../domain/knowledge-foundation';
import {KnowledgeError,knowledgeDigest,recordReadable} from './knowledge-foundation';
import {assertIdentitySchema} from './knowledge-identity-migrate';

const currentEntities=`FROM knowledge75.objects o JOIN knowledge75.revisions v ON v.kind=o.kind AND v.id=o.id AND v.revision=o.current_revision JOIN knowledge75.published_revisions p ON p.kind=o.kind AND p.id=o.id AND p.revision=v.revision WHERE o.kind='entity' AND o.visibility='public'`;
const projection=`o.id,o.current_revision AS revision,v.content`;
// Every hop must still refer to the exact public content versions reviewed.
const edges=`SELECT r.left_id,r.right_id FROM knowledge75.entity_identity_links l JOIN knowledge75.entity_identity_revisions r ON r.link_id=l.id AND r.revision=l.current_revision JOIN knowledge75.objects a ON a.kind='entity' AND a.id=r.left_id AND a.current_revision=r.left_revision AND a.visibility='public' JOIN knowledge75.objects b ON b.kind='entity' AND b.id=r.right_id AND b.current_revision=r.right_revision AND b.visibility='public' JOIN knowledge75.published_revisions ap ON ap.kind='entity' AND ap.id=a.id AND ap.revision=a.current_revision JOIN knowledge75.published_revisions bp ON bp.kind='entity' AND bp.id=b.id AND bp.revision=b.current_revision WHERE r.state='same'`;
// Tiny, bounded management groups do not benefit from compiling PostgreSQL JIT
// plans. Keep this per transaction; never change the shared database setting.
async function group(c:PoolClient,ids:string[]){await c.query('SET LOCAL jit=off');return (await c.query(`WITH RECURSIVE edges AS MATERIALIZED (${edges}), members(id) AS (SELECT unnest($1::text[]) UNION SELECT CASE WHEN e.left_id=m.id THEN e.right_id ELSE e.left_id END FROM members m JOIN edges e ON e.left_id=m.id OR e.right_id=m.id) SELECT id FROM members ORDER BY id`,[ids])).rows.map(r=>r.id as string);}
// Search across reviewed names without changing original endpoints or snapshots.
// The caller includes the returned IDs in its cursor fingerprint.
export async function identitySearchIds(c:PoolClient,q:string,generation?:string){if(!q.trim())return [];await c.query('SET LOCAL jit=off');const projected=generation?" AND EXISTS(SELECT 1 FROM knowledge75.publication_entities x WHERE x.generation=$2 AND x.id=r.left_id AND x.revision=r.left_revision) AND EXISTS(SELECT 1 FROM knowledge75.publication_entities x WHERE x.generation=$2 AND x.id=r.right_id AND x.revision=r.right_revision)":"";return (await c.query(`WITH RECURSIVE edges AS MATERIALIZED (${edges}${projected}), members(id) AS (SELECT o.id ${currentEntities} AND (o.id IN(SELECT left_id FROM edges) OR o.id IN(SELECT right_id FROM edges)) AND lower(normalize(concat_ws(' ',v.content->>'name',(v.content->'aliases')::text),NFKC)) LIKE $1 ESCAPE E'\\\\' UNION SELECT CASE WHEN e.left_id=m.id THEN e.right_id ELSE e.left_id END FROM members m JOIN edges e ON e.left_id=m.id OR e.right_id=m.id) SELECT id FROM members ORDER BY id`,['%'+q.normalize('NFKC').toLowerCase().replace(/[\\%_]/g,'\\$&')+'%',...(generation?[generation]:[])])).rows.map(r=>r.id as string);}
async function entity(c:PoolClient,id:string,lock=false){const row=(await c.query(`SELECT ${projection} ${currentEntities} AND o.id=$1 ${lock?'FOR SHARE OF o':''}`,[id])).rows[0];if(!row)throw new KnowledgeError('現在公開されている対象を選んでください',404,'NOT_FOUND');return identityEntitySchema.parse(row);}
function link(r:Record<string,unknown>){return {id:r.link_id,revision:r.revision,left:{id:r.left_id,revision:r.left_revision},right:{id:r.right_id,revision:r.right_revision},state:r.state,reason:r.reason,reference:r.reference,locator:r.locator,createdAt:new Date(r.created_at as string).toISOString(),stale:r.stale};}

export function createKnowledgeIdentity(pool:Pool){
 async function read<T>(run:(c:PoolClient)=>Promise<T>){const c=await pool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await assertIdentitySchema(c);const value=await run(c);await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 return {
 list:(raw:unknown)=>read(async c=>{const q=z.strictObject({q:z.string().trim().max(200).default(''),after:knowledgeIdSchema.optional(),matching:knowledgeIdSchema.optional()}).parse(raw),args:unknown[]=[],conditions:string[]=[];
  if(q.q){args.push('%'+q.q.normalize('NFKC').toLowerCase().replace(/[\\%_]/g,'\\$&')+'%');conditions.push(`lower(normalize(concat_ws(' ',v.content->>'name',(v.content->'aliases')::text),NFKC)) LIKE $${args.length} ESCAPE E'\\\\'`);}
  if(q.matching){const e=await entity(c,q.matching);args.push([e.content.name,...e.content.aliases].map(n=>n.normalize('NFKC').toLowerCase()));conditions.push(`EXISTS(SELECT 1 FROM jsonb_array_elements_text(jsonb_build_array(v.content->>'name')||COALESCE(v.content->'aliases','[]'::jsonb)) n WHERE lower(normalize(n,NFKC))=ANY($${args.length}::text[]))`);args.push(q.matching);conditions.push('o.id<>$'+args.length);}
  const where=conditions.length?' AND '+conditions.join(' AND '):'',total=Number((await c.query(`SELECT count(*) AS n ${currentEntities}${where}`,args)).rows[0].n);
  if(q.after){args.push(q.after);conditions.push('o.id>$'+args.length);}const rows=(await c.query(`SELECT ${projection} ${currentEntities}${conditions.length?' AND '+conditions.join(' AND '):''} ORDER BY o.id LIMIT 26`,args)).rows;
  return identityPageSchema.parse({items:rows.slice(0,25),total,next:rows.length>25?rows[24].id:null});}),
 peers:(id:string)=>read(async c=>{await entity(c,knowledgeIdSchema.parse(id));const ids=(await group(c,[id])).filter(v=>v!==id);return {peers:await Promise.all(ids.map(v=>entity(c,v)))};}),
 detail:(id:string)=>read(async c=>{
  const e=await entity(c,knowledgeIdSchema.parse(id)),ids=(await group(c,[id])).filter(v=>v!==id);
  const raw=(await c.query(`SELECT r.*, (a.current_revision<>r.left_revision OR b.current_revision<>r.right_revision OR a.visibility<>'public' OR b.visibility<>'public') AS stale FROM knowledge75.entity_identity_revisions r JOIN knowledge75.objects a ON a.kind='entity' AND a.id=r.left_id JOIN knowledge75.objects b ON b.kind='entity' AND b.id=r.right_id WHERE r.left_id=$1 OR r.right_id=$1 ORDER BY r.sequence DESC LIMIT 100`,[id])).rows;
  const current=(await c.query(`SELECT r.*, (a.current_revision<>r.left_revision OR b.current_revision<>r.right_revision OR a.visibility<>'public' OR b.visibility<>'public') AS stale FROM knowledge75.entity_identity_links l JOIN knowledge75.entity_identity_revisions r ON r.link_id=l.id AND r.revision=l.current_revision JOIN knowledge75.objects a ON a.kind='entity' AND a.id=r.left_id JOIN knowledge75.objects b ON b.kind='entity' AND b.id=r.right_id WHERE l.left_id=$1 OR l.right_id=$1 ORDER BY l.id`,[id])).rows;
  const candidates=(await c.query(`SELECT o.id,v.revision,v.content FROM knowledge75.objects o JOIN knowledge75.revisions v ON v.kind=o.kind AND v.id=o.id AND v.revision=o.current_revision WHERE o.kind='record' AND o.visibility='public' AND (v.content->>'subjectId'=$1 OR v.content->>'objectId'=$1) ORDER BY o.id LIMIT 30`,[id])).rows;
  const records=[];for(const row of candidates){const content=knowledgeRecordContentSchema.parse(row.content);if(!await recordReadable(c,{id:row.id,revision:row.revision,content,createdAt:'',reason:''}))continue;const sources=[];for(const proof of content.evidence.slice(0,3)){const s=(await c.query(`SELECT content FROM knowledge75.revisions WHERE kind='source' AND id=$1 AND revision=$2`,[proof.source.id,proof.source.revision])).rows[0].content;sources.push({title:s.title,url:s.url,locator:proof.locator,excerpt:proof.excerpt});}records.push({id:row.id,assertion:content.assertion,sources});if(records.length===5)break;}
  return identityDetailSchema.parse({entity:e,records,links:current.map(link),peers:await Promise.all(ids.map(v=>entity(c,v))),history:raw.map(link)});
 }),
 async act(actorId:string,raw:unknown){const cmd=identityCommandSchema.parse(raw),pins=[cmd.left,cmd.right].sort((a,b)=>a.id<b.id?-1:1),[left,right]=pins,id='identity:'+knowledgeDigest(pins.map(p=>p.id)).slice(0,48),digest=knowledgeDigest(cmd),c=await pool.connect();try{
  await c.query('BEGIN');await assertIdentitySchema(c);await c.query('SELECT pg_advisory_xact_lock(7500600)');
  const receipt=(await c.query('SELECT digest,result FROM knowledge75.entity_identity_requests WHERE actor_id=$1 AND request_id=$2',[actorId,cmd.requestId])).rows[0];if(receipt){if(receipt.digest!==digest)throw new KnowledgeError('同じ操作IDの内容が違います',409,'REQUEST_CONFLICT');await c.query('COMMIT');return receipt.result;}
  const entities=[];for(const p of pins){const e=await entity(c,p.id,true);if(e.revision!==p.revision)throw new KnowledgeError('対象の内容が変わりました。比較し直してください',409,'REVISION_CONFLICT');entities.push(e);}
  const old=(await c.query('SELECT current_revision FROM knowledge75.entity_identity_links WHERE id=$1',[id])).rows[0];if((old?.current_revision??0)!==cmd.expectedRevision)throw new KnowledgeError('関連付けが変わりました。再取得してください',409,'REVISION_CONFLICT');
  if(cmd.state==='withdrawn'&&!old)throw new KnowledgeError('解除する関連付けがありません');
  if(cmd.state==='same'){
   const kinds:Record<string,string>={人物:'person',作品:'work',組織:'organization',出来事:'event'};const kind=(s:string)=>kinds[s]??s;
   if(kind(entities[0].content.kind)!==kind(entities[1].content.kind))throw new KnowledgeError('分類が異なります。対象の内容を確認・訂正してから関連付けてください',409,'KIND_MISMATCH');
   if((await group(c,pins.map(p=>p.id))).length>20)throw new KnowledgeError('関連付けは一組20件までです。対象を見直してください',409,'GROUP_LIMIT');
  }
  const revision=(old?.current_revision??0)+1;
  await c.query('INSERT INTO knowledge75.entity_identity_links(id,left_id,right_id,current_revision) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET current_revision=EXCLUDED.current_revision',[id,left.id,right.id,revision]);
  await c.query('INSERT INTO knowledge75.entity_identity_revisions(link_id,revision,left_id,left_revision,right_id,right_revision,state,reason,reference,locator,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,revision,left.id,left.revision,right.id,right.revision,cmd.state,cmd.reason,cmd.reference,cmd.locator,actorId]);
  const result={id,revision,state:cmd.state,members:await group(c,[left.id])};await c.query('INSERT INTO knowledge75.entity_identity_requests(actor_id,request_id,digest,result) VALUES($1,$2,$3,$4)',[actorId,cmd.requestId,digest,result]);await c.query('COMMIT');return result;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 };
}
