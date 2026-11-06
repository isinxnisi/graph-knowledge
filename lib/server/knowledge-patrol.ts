import {z} from 'zod';
import type {Pool,PoolClient} from 'pg';
import {patrolOriginSchema,patrolStatusSchema,type PatrolOrigin} from '../domain/knowledge-patrol';
import {knowledgeDigest} from './knowledge-foundation';
import {assertPatrolSchema} from './knowledge-patrol-schema';
import {createTargetInventory,type InventoryCursor,type InventoryEntry,type LegacyInventoryReader} from './knowledge-target-inventory';

export const PATROL_POLICY='organization-patrol-v1';
const sizeSchema=z.number().int().min(1).max(500);
const intervalSchema=z.number().int().min(30).max(86400);
const fingerprint=(entry:InventoryEntry)=>knowledgeDigest({policy:PATROL_POLICY,...entry});
const date=(value:Date|string|null)=>value?new Date(value).toISOString():null;

/** Enumerates metadata only; never fetches a source or dispatches AI.
 * A completed scan is not an approval. R2b must reread current public content,
 * evidence and permissions before sending or applying any generated candidate.
 */
export function createKnowledgePatrol(pool:Pool,legacy:LegacyInventoryReader){
 const inventory=createTargetInventory(pool,legacy);

 async function retain(c:PoolClient,origin:PatrolOrigin,run:string,entry:InventoryEntry){
  const old=(await c.query('SELECT fingerprint,generation,present FROM knowledge75.patrol_targets WHERE origin=$1 AND kind=$2 AND id=$3 FOR UPDATE',[origin,entry.kind,entry.id])).rows[0];
  const digest=fingerprint(entry),changed=!old||old.fingerprint!==digest||!old.present;
  const generation=old?old.generation+(changed?1:0):1;
  await c.query(`INSERT INTO knowledge75.patrol_targets(origin,kind,id,inventory_run,revision,status_revision,digest,fingerprint,visibility,eligible,generation)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
   ON CONFLICT(origin,kind,id) DO UPDATE SET inventory_run=EXCLUDED.inventory_run,revision=EXCLUDED.revision,
   status_revision=EXCLUDED.status_revision,digest=EXCLUDED.digest,fingerprint=EXCLUDED.fingerprint,
   visibility=EXCLUDED.visibility,eligible=EXCLUDED.eligible,present=true,generation=EXCLUDED.generation,checked_at=clock_timestamp()`,
   [origin,entry.kind,entry.id,run,entry.revision,entry.statusRevision,entry.digest,digest,entry.visibility,entry.eligible,generation]);
  if(changed||!entry.eligible)await c.query(`UPDATE knowledge75.patrol_tasks SET state='superseded',reason=$4,updated_at=clock_timestamp()
   WHERE origin=$1 AND kind=$2 AND target_id=$3 AND state='pending'`,[origin,entry.kind,entry.id,entry.eligible?'対象の内容・状態・巡回方針が更新されました':'現在公開対象ではありません']);
  if(changed&&entry.eligible){
   const id=knowledgeDigest({origin,kind:entry.kind,id:entry.id,generation,fingerprint:digest});
   await c.query(`INSERT INTO knowledge75.patrol_tasks(id,origin,kind,target_id,target_generation,fingerprint,policy,state,reason)
    VALUES($1,$2,$3,$4,$5,$6,$7,'pending',$8) ON CONFLICT(id) DO NOTHING`,
    [id,origin,entry.kind,entry.id,generation,digest,PATROL_POLICY,old?'変更後の文脈から整理候補を確認します':'初回の文脈から整理候補を確認します']);
  }
 }

 async function queuePage(c:PoolClient,origin:PatrolOrigin,run:string,position:InventoryCursor|null,limit:number){
  // Tasks, observed targets and cursor commit together. A crash cannot advance
  // past an input whose task was not retained, or duplicate a retained task.
  await c.query('BEGIN');
  try{
   const snapshot=(await c.query("SELECT state FROM knowledge75.target_inventory_runs WHERE id=$1 AND origin=$2",[run,origin])).rows[0];
   if(snapshot?.state!=='complete')throw Error('Completed inventory required');
   const rows=(await c.query(`SELECT kind,id,revision,status_revision AS "statusRevision",digest,visibility,eligible
    FROM knowledge75.target_inventory_entries WHERE run_id=$1 AND ($2::text IS NULL OR (kind COLLATE "C",id COLLATE "C")>($2,$3))
    ORDER BY kind COLLATE "C",id COLLATE "C" LIMIT $4`,[run,position?.kind??null,position?.id??null,limit+1])).rows as InventoryEntry[];
   const entries=rows.slice(0,limit);
   for(const entry of entries)await retain(c,origin,run,entry);
   const next=rows.length>limit?{kind:entries.at(-1)!.kind,id:entries.at(-1)!.id}:null;
   if(!next){
    // Only a complete generation permits absence reconciliation. An incomplete
    // or failed scan must never withdraw an unseen input.
    await c.query(`UPDATE knowledge75.patrol_tasks t SET state='superseded',reason='完了した対象台帳に存在しません',updated_at=clock_timestamp()
     FROM knowledge75.patrol_targets p WHERE p.origin=$1 AND p.inventory_run<>$2 AND t.origin=p.origin AND t.kind=p.kind AND t.target_id=p.id AND t.state='pending'`,[origin,run]);
    await c.query(`UPDATE knowledge75.patrol_targets SET present=false,eligible=false,checked_at=clock_timestamp()
     WHERE origin=$1 AND inventory_run<>$2 AND present`,[origin,run]);
   }
   await c.query(`UPDATE knowledge75.patrol_cycles SET cursor=$2,scanned=scanned+$3,phase=$4,
    completed_run=CASE WHEN $4='idle' THEN inventory_run ELSE completed_run END,
    completed_at=CASE WHEN $4='idle' THEN clock_timestamp() ELSE completed_at END,
    updated_at=clock_timestamp(),error_code=NULL,retry_at=NULL WHERE origin=$1`,[origin,next,entries.length,next?'queueing':'idle']);
   await c.query('COMMIT');
   return {phase:next?'queueing' as const:'idle' as const,visited:entries.length};
  }catch(e){await c.query('ROLLBACK');throw e;}
 }

 return {
  async tick(rawOrigin:PatrolOrigin,limit=200,intervalSeconds=3600){
   const origin=patrolOriginSchema.parse(rawOrigin);sizeSchema.parse(limit);intervalSchema.parse(intervalSeconds);
   const c=await pool.connect(),lock='organization-patrol:'+origin;
   let held=false;
   try{
    await assertPatrolSchema(c);
    held=Boolean((await c.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS held',[lock])).rows[0].held);
    if(!held)return {phase:'busy' as const,visited:0};
    // Durable before a potentially interrupted inventory page. Session lock
    // serializes the multi-transaction stages and releases on process death.
    await c.query('INSERT INTO knowledge75.patrol_cycles(origin,policy) VALUES($1,$2) ON CONFLICT DO NOTHING',[origin,PATROL_POLICY]);
    let cycle=(await c.query('SELECT *,next_scan_at<=clock_timestamp() AS due,retry_at>clock_timestamp() AS waiting FROM knowledge75.patrol_cycles WHERE origin=$1',[origin])).rows[0];
    if(cycle.waiting)return {phase:'waiting' as const,visited:0};
    if(cycle.phase==='idle'){
     const changed=origin==='common'&&(await c.query(`SELECT coalesce(max(sequence),0)::text<>(SELECT revision FROM knowledge75.target_inventory_runs WHERE id=$1) AS changed FROM knowledge75.changes`,[cycle.completed_run])).rows[0].changed;
     if(!cycle.due&&!changed&&cycle.policy===PATROL_POLICY)return {phase:'idle' as const,visited:0};
     cycle=(await c.query(`UPDATE knowledge75.patrol_cycles SET phase='scanning',inventory_run=NULL,cursor=NULL,scanned=0,total=0,
      scan_started_at=clock_timestamp(),policy=$2,error_code=NULL,retry_at=NULL,updated_at=clock_timestamp() WHERE origin=$1 RETURNING *`,[origin,PATROL_POLICY])).rows[0];
    }
    if(cycle.phase==='scanning'){
     // Recover even if the last inventory page committed before the worker died
     // and before it could record that completed run in patrol_cycles.
     const available=(await c.query(`SELECT id,state FROM knowledge75.target_inventory_runs WHERE origin=$1 AND
      (id=$2 OR state='scanning' OR state='complete' AND created_at>= $3)
      AND state<>'stale' ORDER BY (id=$2) DESC NULLS LAST,created_at DESC,id LIMIT 1`,[origin,cycle.inventory_run,cycle.scan_started_at])).rows[0];
     const page=available?.state==='complete'?{id:available.id,state:'complete'}:await inventory.scanPage(origin,limit);
     if(page.state==='stale'){
      await c.query('UPDATE knowledge75.patrol_cycles SET inventory_run=NULL,updated_at=clock_timestamp() WHERE origin=$1',[origin]);
      return {phase:'scanning' as const,visited:0};
     }
     const total=page.state==='complete'?Number((await c.query('SELECT count(*) AS n FROM knowledge75.target_inventory_entries WHERE run_id=$1',[page.id])).rows[0].n):0;
     await c.query(`UPDATE knowledge75.patrol_cycles SET inventory_run=$2,phase=$3,total=$4,
      next_scan_at=clock_timestamp()+$5*interval '1 second',error_code=NULL,retry_at=NULL,updated_at=clock_timestamp() WHERE origin=$1`,[origin,page.id,page.state==='complete'?'queueing':'scanning',total,intervalSeconds]);
     return {phase:page.state==='complete'?'queueing' as const:'scanning' as const,visited:0};
    }
    return await queuePage(c,origin,cycle.inventory_run,cycle.cursor,limit);
   }catch(e){
    if(held)await c.query(`UPDATE knowledge75.patrol_cycles SET error_code='PATROL_RETRY',retry_at=clock_timestamp()+interval '30 seconds',updated_at=clock_timestamp() WHERE origin=$1`,[origin]).catch(()=>{});
    throw e;
   }finally{
    // Destroy a connection if unlock failed; never return a session-held lock
    // to a shared pool where a later tick could mistake it for a free lock.
    let broken=false;
    if(held)await c.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[lock]).catch(()=>{broken=true;});
    c.release(broken);
   }
  },
  async status(){
   const c=await pool.connect();
   try{
    await assertPatrolSchema(c);
    const rows=(await c.query(`SELECT c.*,
     (SELECT count(*)::int FROM knowledge75.patrol_targets p WHERE p.origin=c.origin AND p.present) AS present,
     (SELECT count(*)::int FROM knowledge75.patrol_targets p WHERE p.origin=c.origin AND p.present AND p.eligible) AS eligible,
     (SELECT count(*)::int FROM knowledge75.patrol_tasks t WHERE t.origin=c.origin AND t.state='pending') AS pending,
     (SELECT count(*)::int FROM knowledge75.patrol_tasks t WHERE t.origin=c.origin AND t.state='superseded') AS superseded
     FROM knowledge75.patrol_cycles c ORDER BY c.origin`)).rows;
    return patrolStatusSchema.parse({policy:PATROL_POLICY,origins:rows.map(r=>({origin:r.origin,phase:r.phase,scanned:r.scanned,total:r.total,
     present:r.present,eligible:r.eligible,pending:r.pending,superseded:r.superseded,completedAt:date(r.completed_at),nextScanAt:date(r.next_scan_at),errorCode:r.error_code,retryAt:date(r.retry_at)}))});
   }finally{c.release();}
  },
 };
}
