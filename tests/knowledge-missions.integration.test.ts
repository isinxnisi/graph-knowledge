import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {migrateMemberDatabase} from '../lib/server/member/migrate';
import {createKnowledgeFoundationService} from '../lib/server/knowledge-foundation';
import {createKnowledgeImports} from '../lib/server/knowledge-import';
import {createKnowledgeMissions} from '../lib/server/knowledge-missions';
import {missionImportPrincipal} from '../lib/server/knowledge-mission-principal';
import {missionWorkerSchema,type MissionPlan} from '../lib/domain/knowledge-mission';
import {reviewConfigSchema} from '../lib/server/knowledge-review-queue';

const pool=new Pool({connectionString:process.env.MEMBER_DATABASE_URL,max:5}),knowledge=new Pool({connectionString:process.env.KNOWLEDGE_CAPSULE_TEST_DATABASE_URL,max:4});
let core:ReturnType<typeof createKnowledgeMissions>,inbox:ReturnType<typeof createKnowledgeImports>,lostAck=false;
const plan:MissionPlan={title:'装置を調べる',question:'Aと新しい装置の関係を資料から調べる',themeId:null,entityIds:['a'],sourceHosts:['example.org'],intervalHours:24,maxSources:2,maxItems:3};
type Lease={runId:string;missionId:string;planRevision:number;generation:number;token:string;snapshot:unknown;packageIdentity:{namespace:string;packageId:string;revision:number}};
const act=(action:unknown)=>core.act('fixture-operator',action);
async function create(content=plan,requestId=randomUUID()){return (await act({action:'create',requestId,content})).result as {id:string;revision:number};}
async function claim(requestId=randomUUID()){return ((await core.worker('fixture-delivery',{action:'claim',requestId})) as {result:{lease:Lease|null}}).result.lease;}
function payload(l:Lease){return {format:'plunode-knowledge-package',schemaVersion:1,...l.packageIdentity,entityPins:[{id:'a',revision:1}],entities:[{id:'d',content:{name:'D',kind:'work'}}],sources:[{id:'s',content:{title:'Instrument source',url:'https://example.org/instruments'}}],items:[{key:'instrument',operation:'create-relation',record:{kind:'relation',subjectId:'a',objectId:'d',relation:'operates',assertion:'A operates D.',evidence:[{id:'proof',source:{id:'s',revision:1},locator:'Instruments',excerpt:'A operates D.'}]}}]};}
const deliver=(l:Lease,pkg:unknown=payload(l))=>core.worker('fixture-delivery',missionWorkerSchema.parse({action:'deliver',requestId:randomUUID(),runId:l.runId,generation:l.generation,token:l.token,package:pkg}));
beforeAll(async()=>{
 expect(process.env.MEMBER_TEST_CONTAINER).toMatch(/^gk-member-test-/);expect((await pool.query('SELECT current_database() name')).rows[0].name).toBe('graph_member_test');
 expect((await knowledge.query('SELECT current_database() name')).rows[0].name).toBe('plunode_knowledge75_test_capsule_share');
 await migrateMemberDatabase(pool,...Array(25).fill(true));process.env.KNOWLEDGE_MISSIONS_ENABLED='1';
},30000);
beforeEach(async()=>{
 await pool.query('TRUNCATE knowledge_missions.plans,knowledge_missions.commands,knowledge_missions.workers CASCADE');await pool.query('TRUNCATE knowledge_import.packages CASCADE');await knowledge.query('DROP SCHEMA IF EXISTS knowledge75 CASCADE');
 const foundation=createKnowledgeFoundationService(knowledge);await foundation.execute({kind:'operator',id:'fixture'},{action:'create-bundle',requestId:randomUUID(),entities:[{id:'a',content:{name:'A',kind:'organization'}}],sources:[{id:'base',content:{title:'Baseline',url:'https://example.org/baseline'}}],records:[{id:'baseline',content:{kind:'note',subjectId:'a',assertion:'A is an organization.',evidence:[{id:'base',source:{id:'base',revision:1},locator:'Name',excerpt:'A is an organization.'}]}}],reason:'Isolated mission fixture'});
 inbox=createKnowledgeImports(pool,knowledge,(id,client)=>missionImportPrincipal(pool,id,client));lostAck=false;
 core=createKnowledgeMissions(pool,knowledge,()=>({...inbox,intake:async(...args:Parameters<typeof inbox.intake>)=>{const result=await inbox.intake(...args);if(lostAck){lostAck=false;throw Error('fixture ACK lost after durable intake');}return result;}}));
},30000);
afterAll(async()=>{delete process.env.KNOWLEDGE_MISSIONS_ENABLED;await pool.end();await knowledge.end();});

it('saves idempotently, claims once, and keeps published context pins',async()=>{
 const requestId=randomUUID(),a=await create(plan,requestId),replay=await act({action:'create',requestId,content:plan});expect(replay).toMatchObject({result:a,replayed:true});
 const claimId=randomUUID(),lease=(await claim(claimId))!;expect(await claim(claimId)).toEqual(lease);expect(await claim()).toBeNull();
 expect(lease).toMatchObject({missionId:a.id,planRevision:1,snapshot:{entities:[{id:'a',revision:1}]}});
 const listing=await core.list();expect(listing.items[0]).toMatchObject({id:a.id,state:'active'});expect(listing.entities.some(v=>v.id==='a')).toBe(true);
});
it('delivers through the common importer and recovers an ACK loss without a second receipt',async()=>{
 await create();const lease=(await claim())!;lostAck=true;await expect(deliver(lease)).rejects.toThrow('ACK lost');
 expect((await pool.query('SELECT count(*)::int n FROM knowledge_import.packages')).rows[0].n).toBe(1);
 const changed=payload(lease);changed.items[0].record.assertion='Different payload';await expect(deliver(lease,changed)).rejects.toMatchObject({code:'MISSION_DELIVERY_CHANGED'});
 const accepted=await deliver(lease) as {receiptId:string;replayed:boolean;receipt:{items:{state:string}[]}};expect(accepted.replayed).toBe(true);expect(accepted.receipt.items[0].state).toBe('queued');
 expect((await pool.query('SELECT receipt_id FROM knowledge_missions.runs WHERE id=$1',[lease.runId])).rows[0].receipt_id).toBe(accepted.receiptId);
 expect(await claim()).toBeNull();
});
it('rejects outside sources, disconnected targets, extra authority and invalid observations',async()=>{
 await create();const lease=(await claim())!;
 const outside=payload(lease);outside.sources[0].content.url='https://evil.example.net/phish';await expect(deliver(lease,outside)).rejects.toMatchObject({code:'MISSION_SOURCE_SCOPE'});
 const debris=payload(lease);debris.entities.push({id:'unrelated',content:{name:'Other',kind:'person'}});await expect(deliver(lease,debris)).rejects.toMatchObject({code:'MISSION_TARGET_SCOPE'});
 const stale=payload(lease);stale.entityPins[0].revision=999;await expect(deliver(lease,stale)).rejects.toMatchObject({code:'MISSION_TARGET_CHANGED'});
 const attached=payload(lease);await expect(deliver(lease,{...attached,items:[{...attached.items[0],about:{kind:'entity',id:'outside',revision:1}}]})).rejects.toMatchObject({code:'MISSION_TARGET_SCOPE'});
 await expect(deliver(lease,{...payload(lease),approved:true})).rejects.toBeTruthy();expect((await pool.query('SELECT count(*)::int n FROM knowledge_import.packages')).rows[0].n).toBe(0);
});
it('fences expired lease generations and rejects edits made during research',async()=>{
 const p=await create(),old=(await claim())!;await pool.query("UPDATE knowledge_missions.runs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[old.runId]);
 const next=(await claim())!;expect(next.runId).toBe(old.runId);expect(next.generation).toBe(old.generation+1);await expect(deliver(old)).rejects.toMatchObject({code:'MISSION_LEASE_CHANGED'});
 await act({action:'update',requestId:randomUUID(),id:p.id,expectedRevision:1,content:{...plan,question:'Aに関する別の資料を調べてほしい'}});await expect(deliver(next)).rejects.toMatchObject({code:'MISSION_LEASE_CHANGED'});
});
it('pauses unreflected work and never revives an old run when resumed',async()=>{
 const p=await create(),lease=(await claim())!;await deliver(lease);expect(await missionImportPrincipal(pool,'mission:'+lease.runId)).not.toBeNull();
 await act({action:'pause',requestId:randomUUID(),id:p.id,expectedRevision:1});expect(await missionImportPrincipal(pool,'mission:'+lease.runId)).toBeNull();expect(await claim()).toBeNull();
 await act({action:'resume',requestId:randomUUID(),id:p.id,expectedRevision:2});expect(await missionImportPrincipal(pool,'mission:'+lease.runId)).toBeNull();expect(await claim()).toBeNull();
 const run=(await pool.query('SELECT created_at FROM knowledge_missions.runs WHERE id=$1',[lease.runId])).rows[0];
 expect(Date.parse((await core.list()).items[0].nextDue)).toBeGreaterThanOrEqual(new Date(run.created_at).getTime()+24*3600000);
 expect((await pool.query('SELECT next_due FROM knowledge_missions.plans WHERE id=$1',[p.id])).rows[0].next_due.getTime()).toBeGreaterThanOrEqual(new Date(run.created_at).getTime()+24*3600000);
 const cfg=reviewConfigSchema.parse({projectId:'mission-fixture',billingTier:'free',verifiedAt:new Date().toISOString(),model:'gemini-3.1-flash-lite',rpm:10,tokensPerMinute:30000,requestsPerDay:80,requestsPerMonth:2400,inputTokensPerDay:250000,outputTokensPerDay:160000,inputTokensPerMonth:7500000,outputTokensPerMonth:4800000,apiKeyFile:'/unused',allowedUsers:[randomUUID()]});
 const dispatch=vi.fn();expect(await inbox.processNext(cfg,dispatch)).toBe(false);expect(dispatch).not.toHaveBeenCalled();expect((await pool.query('SELECT state FROM knowledge_import.items')).rows[0].state).toBe('cancelled');
});
it('records an empty result, applies per-plan daily limits and continues other plans',async()=>{
 const p=await create(),lease=(await claim())!;await core.worker('fixture-delivery',{action:'empty',requestId:randomUUID(),runId:lease.runId,generation:lease.generation,token:lease.token,summary:'No new supported information found.'});
 await pool.query('UPDATE knowledge_missions.plans SET next_due=clock_timestamp() WHERE id=$1',[p.id]);expect(await claim()).toBeNull();expect(Date.parse((await core.list()).items[0].nextDue)).toBeGreaterThan(Date.now()+23*3600000);const other=await create({...plan,title:'別の計画'});expect((await claim())?.missionId).toBe(other.id);
});

it('uses the next released slot when a changed frequency has several runs in its rolling window',async()=>{
 const p=await create({...plan,intervalHours:6});
 for(let n=0;n<4;n++){const l=(await claim())!;await core.worker('fixture-delivery',{action:'empty',requestId:randomUUID(),runId:l.runId,generation:l.generation,token:l.token,summary:'No new information.'});await pool.query('UPDATE knowledge_missions.plans SET next_due=clock_timestamp() WHERE id=$1',[p.id]);}
 await act({action:'update',requestId:randomUUID(),id:p.id,expectedRevision:1,content:{...plan,intervalHours:12}});
 expect(await claim()).toBeNull();const starts=(await pool.query('SELECT created_at FROM knowledge_missions.runs ORDER BY created_at DESC,id DESC')).rows;
 expect(Date.parse((await core.list()).items[0].nextDue)).toBe(new Date(starts[1].created_at).getTime()+24*3600000);
 await pool.query("UPDATE knowledge_missions.runs SET created_at=created_at-interval '25 hours'");await pool.query('UPDATE knowledge_missions.plans SET next_due=clock_timestamp()');expect(await claim()).not.toBeNull();
});

it('pins the current theme and accepts its timeless background without an isolated graph node',async()=>{
 const foundation=createKnowledgeFoundationService(knowledge);await foundation.execute({kind:'operator',id:'fixture'},{action:'create-theme',requestId:randomUUID(),id:'theme',title:'Fixture theme',recordPins:[{id:'baseline',revision:1}],initialView:'graph'});
 await create({...plan,themeId:'theme',entityIds:[]});const lease=(await claim())!;
 const pkg={format:'plunode-knowledge-package',schemaVersion:1,...lease.packageIdentity,sources:payload(lease).sources,items:[{key:'background',operation:'add-information',about:{kind:'theme',id:'theme',revision:1},themes:[{id:'theme',revision:1}],record:{kind:'note',assertion:'This theme describes instruments.',evidence:[{id:'proof',source:{id:'s',revision:1},locator:'Introduction',excerpt:'This theme describes instruments.'}]}}]};
 const value=await deliver(lease,pkg) as {receipt:{items:{state:string}[]}};expect(value.receipt.items[0].state).toBe('queued');
});

it('serializes a stop with the importer final permission boundary',async()=>{
 const p=await create(),lease=(await claim())!;await deliver(lease);const c=await pool.connect();await c.query('BEGIN');
 try{expect(await missionImportPrincipal(pool,'mission:'+lease.runId,c)).not.toBeNull();
  let done=false;const stop=act({action:'pause',requestId:randomUUID(),id:p.id,expectedRevision:1}).then(v=>{done=true;return v;});
  await new Promise(resolve=>setTimeout(resolve,25));expect(done).toBe(false);await c.query('COMMIT');await stop;
  expect(await missionImportPrincipal(pool,'mission:'+lease.runId)).toBeNull();
 }finally{await c.query('ROLLBACK');c.release();}
});
