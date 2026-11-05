import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Pool,PoolClient} from 'pg';
import {assertAcquisitionSchema} from './knowledge-acquisition-schema';
import {knowledgeDigest,KnowledgeError} from './knowledge-foundation';
export type InventoryKind='entity'|'record'|'source'|'theme'|'mapping';
export type InventoryCursor={kind:InventoryKind;id:string};
export type InventoryEntry={kind:InventoryKind;id:string;revision:string;statusRevision:string;digest:string;visibility:string;eligible:boolean};
export type LegacyInventoryPage={revision:string;items:InventoryEntry[];next:InventoryCursor|null};
export type LegacyInventoryReader=(input:{revision?:string;after:InventoryCursor|null;limit:number})=>Promise<LegacyInventoryPage>;
const cursorSchema=z.strictObject({kind:z.enum(['entity','record','source','theme','mapping']),id:z.string().min(1).max(240)});
const entrySchema=z.strictObject({kind:cursorSchema.shape.kind,id:cursorSchema.shape.id,revision:z.string().min(1).max(200),statusRevision:z.string().min(1).max(200),digest:z.string().regex(/^[a-f0-9]{64}$/),visibility:z.string().max(50),eligible:z.boolean()});
const key=(v:InventoryCursor)=>JSON.stringify([v.kind,v.id]);
const after=(a:InventoryCursor,b:InventoryCursor)=>Buffer.compare(Buffer.from(a.kind),Buffer.from(b.kind))>0||a.kind===b.kind&&Buffer.compare(Buffer.from(a.id),Buffer.from(b.id))>0;
/** Internal inventory, not a public search index or publication authorization.
 * Each origin has its own generation; current gates must be checked at use. */
export function createTargetInventory(pool:Pool,legacy:LegacyInventoryReader){
 async function tx<T>(run:(c:PoolClient)=>Promise<T>){const c=await pool.connect();try{await c.query('BEGIN');await assertAcquisitionSchema(c);const v=await run(c);await c.query('COMMIT');return v;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 return {
  async scanPage(origin:'common'|'public-kg',limit=200){
   z.enum(['common','public-kg']).parse(origin);z.number().int().min(1).max(500).parse(limit);
   return tx(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['target-inventory:'+origin]);
    let run=(await c.query("SELECT * FROM knowledge75.target_inventory_runs WHERE origin=$1 AND state='scanning' FOR UPDATE",[origin])).rows[0];
    if(origin==='common')await c.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('knowledge-record-writes-v1',0))");
    const commonRevision=origin==='common'?(await c.query('SELECT coalesce(max(sequence),0)::text AS revision FROM knowledge75.changes')).rows[0].revision:undefined;
    if(run&&origin==='common'&&run.revision!==commonRevision){await c.query("UPDATE knowledge75.target_inventory_runs SET state='stale' WHERE id=$1",[run.id]);run=undefined;}
    const position=run?.cursor?cursorSchema.parse(run.cursor):null;
    let page:LegacyInventoryPage;
    if(origin==='common'){
     const rows=(await c.query(`SELECT o.*,r.content,EXISTS(SELECT 1 FROM knowledge75.published_revisions p WHERE p.kind=o.kind AND p.id=o.id AND p.revision=o.current_revision) AS published FROM knowledge75.objects o JOIN knowledge75.revisions r ON r.kind=o.kind AND r.id=o.id AND r.revision=o.current_revision WHERE ($1::text IS NULL OR (o.kind COLLATE "C",o.id COLLATE "C")>($1,$2)) ORDER BY o.kind COLLATE "C",o.id COLLATE "C" LIMIT $3`,[position?.kind??null,position?.id??null,limit+1])).rows;
     const items=rows.slice(0,limit).map(r=>entrySchema.parse({kind:r.kind,id:r.id,revision:String(r.current_revision),statusRevision:String(r.status_revision),digest:knowledgeDigest(r.content),visibility:r.visibility,eligible:r.visibility==='public'&&r.published}));
     page={revision:commonRevision!,items,next:rows.length>limit?{kind:items.at(-1)!.kind,id:items.at(-1)!.id}:null};
    }else{
     try{page=await legacy({revision:run?.revision,after:position,limit});}catch(e){if(e&&typeof e==='object'&&'code'in e&&e.code==='DATASET_CHANGED'&&run){await c.query("UPDATE knowledge75.target_inventory_runs SET state='stale' WHERE id=$1",[run.id]);return {id:run.id,state:'stale' as const,count:0};}throw e;}
    }
    z.string().min(1).max(200).parse(page.revision);page.items.forEach(e=>entrySchema.parse(e));
    if(page.items.length>limit||new Set(page.items.map(key)).size!==page.items.length||page.items.some((v,i)=>position&&!after(v,position)||i>0&&!after(v,page.items[i-1]))||page.next&&(page.items.length===0||key(page.next)!==key(page.items.at(-1)!)))throw new KnowledgeError('対象一覧の順序・継続位置が不正です',503,'INVENTORY_PAGE_INVALID');
    if(run&&run.revision!==page.revision)throw new KnowledgeError('対象一覧の原本版が変わりました',409,'INVENTORY_CHANGED');
    if(!run)run=(await c.query("INSERT INTO knowledge75.target_inventory_runs(id,origin,revision,state) VALUES($1,$2,$3,'scanning') RETURNING *",[randomUUID(),origin,page.revision])).rows[0];
    for(const e of page.items)await c.query('INSERT INTO knowledge75.target_inventory_entries(run_id,kind,id,revision,status_revision,digest,visibility,eligible) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[run.id,e.kind,e.id,e.revision,e.statusRevision,e.digest,e.visibility,e.eligible]);
    const state=page.next?'scanning':'complete';
    await c.query("UPDATE knowledge75.target_inventory_runs SET state=$2,cursor=$3,completed_at=CASE WHEN $2='complete' THEN clock_timestamp() ELSE NULL END WHERE id=$1",[run.id,state,page.next]);
    return {id:String(run.id),state:state as 'scanning'|'complete',count:page.items.length};
   });
  },
  async page(runId:string,afterCursor:InventoryCursor|null=null,limit=200){
   z.uuidv4().parse(runId);if(afterCursor)cursorSchema.parse(afterCursor);z.number().int().min(1).max(500).parse(limit);
   return tx(async c=>{
    const run=(await c.query("SELECT id,origin,revision,state,created_at,completed_at FROM knowledge75.target_inventory_runs WHERE id=$1",[runId])).rows[0];
    if(!run||run.state!=='complete')throw new KnowledgeError('全件列挙が完了した台帳を指定してください',409,'INVENTORY_INCOMPLETE');
    const rows=(await c.query(`SELECT kind,id,revision,status_revision AS "statusRevision",digest,visibility,eligible FROM knowledge75.target_inventory_entries WHERE run_id=$1 AND ($2::text IS NULL OR (kind COLLATE "C",id COLLATE "C")>($2,$3)) ORDER BY kind COLLATE "C",id COLLATE "C" LIMIT $4`,[runId,afterCursor?.kind??null,afterCursor?.id??null,limit+1])).rows;
    const items=rows.slice(0,limit).map(r=>entrySchema.parse(r));return {run,items,next:rows.length>limit?{kind:items.at(-1)!.kind,id:items.at(-1)!.id}:null};
   });
  }
 };
}
