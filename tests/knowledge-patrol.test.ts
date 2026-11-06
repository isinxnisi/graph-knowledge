import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {beforeAll,afterAll,beforeEach,describe,it,expect} from 'vitest';
import {ensureKnowledgeFoundationSchema,createKnowledgeFoundationService,knowledgeDigest} from '../lib/server/knowledge-foundation';
import {migrateKnowledgePatrol} from '../lib/server/knowledge-patrol-schema';
import {createKnowledgePatrol} from '../lib/server/knowledge-patrol';
import type {InventoryEntry,LegacyInventoryReader} from '../lib/server/knowledge-target-inventory';

const url=process.env.KNOWLEDGE_TEST_DATABASE_URL;
describe.skipIf(!url)('autonomous metadata patrol and durable work inputs',()=>{
 const pool=new Pool({connectionString:url,max:6}),foundation=createKnowledgeFoundationService(pool);
 let release='kg-1',entries:InventoryEntry[]=[];
 let failLegacy=false;
 const reader:LegacyInventoryReader=async({revision,after,limit})=>{
  if(failLegacy)throw Error('Read failed');
  if(revision&&revision!==release)throw Object.assign(Error('Changed'),{code:'DATASET_CHANGED'});
  const start=after?entries.findIndex(e=>e.kind===after.kind&&e.id===after.id)+1:0;
  const items=entries.slice(start,start+limit).map(e=>({...e,revision:release,statusRevision:release}));
  return {revision:release,items,next:start+limit<entries.length?{kind:items.at(-1)!.kind,id:items.at(-1)!.id}:null};
 };
 const make=(id:string,eligible=true):InventoryEntry=>({kind:'entity',id,revision:release,statusRevision:release,digest:knowledgeDigest({id}),visibility:eligible?'public':'hidden',eligible});
 async function drain(origin:'common'|'public-kg',limit=3){
  const patrol=createKnowledgePatrol(pool,reader);
  for(let n=0;n<300;n++)if((await patrol.tick(origin,limit)).phase==='idle')return;
  throw Error('Patrol failed to finish bounded fixture');
 }
 async function refresh(origin='public-kg'){
  await pool.query("UPDATE knowledge75.patrol_cycles SET next_scan_at=clock_timestamp()-interval '1 second',retry_at=NULL WHERE origin=$1",[origin]);
 }
 async function counts(){return (await pool.query(`SELECT (SELECT count(*)::int FROM knowledge75.patrol_targets WHERE present) AS targets,
  (SELECT count(*)::int FROM knowledge75.patrol_tasks WHERE state='pending') AS pending,
  (SELECT count(*)::int FROM knowledge75.patrol_tasks WHERE state='superseded') AS superseded`)).rows[0];}
 beforeAll(async()=>{
  expect((await pool.query('SELECT current_database() AS name')).rows[0].name).toMatch(/^plunode_knowledge75_test_/);
  await ensureKnowledgeFoundationSchema(pool);
  expect((await migrateKnowledgePatrol(pool)).applied).toBe(true);
  const ledger=(await pool.query('SELECT name,checksum FROM knowledge75.migrations ORDER BY name')).rows;
  expect((await migrateKnowledgePatrol(pool)).applied).toBe(false);
  expect((await pool.query('SELECT name,checksum FROM knowledge75.migrations ORDER BY name')).rows).toEqual(ledger);
  await foundation.execute({kind:'operator',id:'patrol-test'},{action:'create-bundle',requestId:randomUUID(),
   entities:[{id:'patrol-a',content:{name:'A',kind:'person'}},{id:'patrol-b',content:{name:'B',kind:'work'}}],
   sources:[{id:'patrol-source',content:{title:'A source',url:'https://example.org/source'}}],
   records:Array.from({length:17},(_,n)=>({id:'patrol-r'+String(n).padStart(2,'0'),content:{kind:'relation',subjectId:'patrol-a',objectId:'patrol-b',assertion:'A made B.',relation:'made',evidence:[{id:'ev',source:{id:'patrol-source',revision:1},locator:'First sentence',excerpt:'A made B.'}]}})),reason:'隔離検証'});
 });
 afterAll(()=>pool.end());
 beforeEach(async()=>{
  await pool.query('TRUNCATE knowledge75.patrol_tasks,knowledge75.patrol_targets,knowledge75.patrol_cycles,knowledge75.target_inventory_entries,knowledge75.target_inventory_runs');
  release='kg-1';failLegacy=false;entries=Array.from({length:17},(_,n)=>make('legacy-'+String(n).padStart(2,'0'),n!==4));
 });
 it('covers both origins across pages, resumes with another instance, and preserves originals',async()=>{
  const original=(await pool.query('SELECT kind,id,revision,content FROM knowledge75.revisions ORDER BY kind,id,revision')).rows;
  const first=createKnowledgePatrol(pool,reader);await first.tick('common',2);await first.tick('public-kg',2);
  expect((await first.status()).origins.every(o=>o.phase==='scanning')).toBe(true);
  expect((await counts()).targets).toBe(0); // incomplete inventory is never a deletion list
  await drain('common',2);await drain('public-kg',2);
  const status=await createKnowledgePatrol(pool,reader).status();
  for(const o of status.origins){expect(o.scanned).toBe(o.total);expect(o.phase).toBe('idle');expect(o.total).toBeGreaterThan(2);}
  expect(status.origins.find(o=>o.origin==='public-kg')).toMatchObject({total:17,present:17,eligible:16,pending:16});
  expect((await pool.query("SELECT count(*)::int AS n FROM knowledge75.patrol_tasks WHERE target_id='legacy-04'")).rows[0].n).toBe(0);
  expect((await pool.query('SELECT kind,id,revision,content FROM knowledge75.revisions ORDER BY kind,id,revision')).rows).toEqual(original);
 });
 it('does not create another task on unchanged periodic scans or concurrent ticks',async()=>{
  await drain('public-kg');const before=await counts();await refresh();
  await Promise.all(Array.from({length:5},()=>createKnowledgePatrol(pool,reader).tick('public-kg',2)));
  await drain('public-kg',2);
  expect(await counts()).toEqual(before);
  expect((await pool.query('SELECT max(generation)::int AS n FROM knowledge75.patrol_targets')).rows[0].n).toBe(1);
 });
 it('follows common content/status changes without waiting for the next periodic scan',async()=>{
  await drain('common');
  await foundation.execute({kind:'operator',id:'patrol-test'},{action:'set-visibility',requestId:randomUUID(),kind:'record',id:'patrol-r00',expectedStatusRevision:1,visibility:'hidden',reason:'公開停止の検証'});
  expect((await createKnowledgePatrol(pool,reader).tick('common',3)).phase).not.toBe('idle');
  await drain('common');
  expect((await pool.query("SELECT eligible,generation FROM knowledge75.patrol_targets WHERE origin='common' AND id='patrol-r00'")).rows[0]).toMatchObject({eligible:false,generation:2});
  expect((await pool.query("SELECT state FROM knowledge75.patrol_tasks WHERE target_id='patrol-r00'")).rows.every(r=>r.state==='superseded')).toBe(true);
 });
 it('withdraws absent inputs only after the whole completed generation is traversed',async()=>{
  await drain('public-kg');entries=entries.filter(e=>e.id!=='legacy-00');release='kg-2';await refresh();
  await createKnowledgePatrol(pool,reader).tick('public-kg',1);
  expect((await pool.query("SELECT present FROM knowledge75.patrol_targets WHERE id='legacy-00'")).rows[0].present).toBe(true);
  await drain('public-kg',1);
  expect((await pool.query("SELECT present,eligible FROM knowledge75.patrol_targets WHERE id='legacy-00'")).rows[0]).toEqual({present:false,eligible:false});
  expect((await pool.query("SELECT state FROM knowledge75.patrol_tasks WHERE target_id='legacy-00'")).rows[0].state).toBe('superseded');
 });
 it('rolls back tasks and cursor together and retries without blocking the other origin',async()=>{
  const patrol=createKnowledgePatrol(pool,reader);
  while((await patrol.tick('public-kg',3)).phase==='scanning'){}
  await pool.query(`CREATE FUNCTION knowledge75.fail_patrol_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_id='legacy-01' THEN RAISE EXCEPTION 'injected interruption'; END IF; RETURN NEW; END $$;
   CREATE TRIGGER fail_patrol BEFORE INSERT ON knowledge75.patrol_tasks FOR EACH ROW EXECUTE FUNCTION knowledge75.fail_patrol_test()`);
  try{
   await expect(patrol.tick('public-kg',3)).rejects.toThrow('injected interruption');
   expect((await counts()).targets).toBe(0);
   expect((await patrol.status()).origins[0]).toMatchObject({scanned:0,errorCode:'PATROL_RETRY'});
   await drain('common');
  }finally{await pool.query('DROP TRIGGER fail_patrol ON knowledge75.patrol_tasks; DROP FUNCTION knowledge75.fail_patrol_test()');}
  await refresh();await drain('public-kg',3);
  expect((await pool.query("SELECT count(*)::int AS n FROM knowledge75.patrol_tasks WHERE origin='public-kg' AND state='pending'")).rows[0].n).toBe(16);
 });
 it('recovers the inventory completion/checkpoint gap after worker interruption',async()=>{
  const patrol=createKnowledgePatrol(pool,reader);await patrol.tick('public-kg',3);
  // Simulates inventory commit followed by process death before cycle update.
  const {createTargetInventory}=await import('../lib/server/knowledge-target-inventory');const inv=createTargetInventory(pool,reader);
  let page;do{page=await inv.scanPage('public-kg',3);}while(page.state!=='complete');
  const generations=(await pool.query("SELECT count(*)::int AS n FROM knowledge75.target_inventory_runs WHERE origin='public-kg'")).rows[0].n;
  await drain('public-kg');
  expect((await pool.query("SELECT count(*)::int AS n FROM knowledge75.target_inventory_runs WHERE origin='public-kg'")).rows[0].n).toBe(generations);
  expect((await counts()).pending).toBe(16);
 });
 it('restarts a changing legacy inventory without losing prior coverage',async()=>{
  await drain('public-kg');await refresh();await createKnowledgePatrol(pool,reader).tick('public-kg',1);
  release='kg-2';entries.push(make('legacy-99'));
  await drain('public-kg',1);
  expect((await createKnowledgePatrol(pool,reader).status()).origins[0]).toMatchObject({scanned:18,present:18,pending:17});
  expect((await pool.query("SELECT count(*)::int AS n FROM knowledge75.target_inventory_runs WHERE state='stale'")).rows[0].n).toBe(1);
 });
 it('backs off a failed origin, reports the wait, and never declares it complete',async()=>{
  failLegacy=true;const patrol=createKnowledgePatrol(pool,reader);
  await expect(patrol.tick('public-kg')).rejects.toThrow();
  expect((await patrol.tick('public-kg')).phase).toBe('waiting');
  expect((await patrol.status()).origins[0]).toMatchObject({phase:'scanning',scanned:0,completedAt:null,errorCode:'PATROL_RETRY'});
  await drain('common');failLegacy=false;await refresh();await drain('public-kg');
  expect((await patrol.status()).origins.find(o=>o.origin==='public-kg')?.errorCode).toBeNull();
 });
});
