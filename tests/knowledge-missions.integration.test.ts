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
import {createReviewQueue} from '../lib/server/knowledge-review-queue';
import {matchSourceExcerpt} from '../lib/server/knowledge-source-verification';
import {sourceTextChange} from '../lib/server/knowledge-mission-sources';
import {createWebKnowledgeImports,webImportPrincipal} from '../lib/server/knowledge-web-import';
import {ensureKnowledgePublicationSchema} from '../lib/server/knowledge-publication';
import {migrateKnowledgeTranslations} from '../lib/server/knowledge-translation-migrate';
import {migrateKnowledgeIdentities} from '../lib/server/knowledge-identity-migrate';
import {gunzipSync} from 'node:zlib';

const pool=new Pool({connectionString:process.env.MEMBER_DATABASE_URL,max:5}),knowledge=new Pool({connectionString:process.env.KNOWLEDGE_CAPSULE_TEST_DATABASE_URL,max:4});
let core:ReturnType<typeof createKnowledgeMissions>,inbox:ReturnType<typeof createKnowledgeImports>,lostAck=false;
let sourceBody='A is an organization.';const operator=randomUUID();
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
 await migrateKnowledgeTranslations(knowledge);await migrateKnowledgeIdentities(knowledge);await ensureKnowledgePublicationSchema(knowledge);
 inbox=createKnowledgeImports(pool,knowledge,(id,client)=>id.startsWith('web:')?webImportPrincipal(pool,id,client):missionImportPrincipal(pool,id,client),{verify:async(url,excerpt)=>matchSourceExcerpt({url,type:'text/plain',body:Buffer.from(excerpt)},excerpt)});lostAck=false;sourceBody='A is an organization.';
 core=createKnowledgeMissions(pool,knowledge,()=>({...inbox,intake:async(...args:Parameters<typeof inbox.intake>)=>{const result=await inbox.intake(...args);if(lostAck){lostAck=false;throw Error('fixture ACK lost after durable intake');}return result;}}),{fetchDocument:async url=>({url,type:'text/plain',body:Buffer.from(sourceBody)})});
},30000);
afterAll(async()=>{delete process.env.KNOWLEDGE_MISSIONS_ENABLED;await pool.end();await knowledge.end();});

it('saves idempotently, claims once, and keeps published context pins',async()=>{
 const requestId=randomUUID(),a=await create(plan,requestId),replay=await act({action:'create',requestId,content:plan});expect(replay).toMatchObject({result:a,replayed:true});
 const claimId=randomUUID(),lease=(await claim(claimId))!;expect(await claim(claimId)).toEqual(lease);expect(await claim()).toBeNull();
 expect(lease).toMatchObject({missionId:a.id,planRevision:1,snapshot:{entities:[{id:'a',revision:1}]}});
 const listing=await core.list();expect(listing.items[0]).toMatchObject({id:a.id,state:'active'});expect(listing.entities.some(v=>v.id==='a')).toBe(true);
});

it('keeps original editions, distinguishes text from markup, and fences observation scope',async()=>{
 const p=await create(),first=(await claim())!;
 const observe=(l:Lease,urls=['https://example.org/baseline'])=>core.worker('fixture-delivery',{action:'observe',requestId:randomUUID(),runId:l.runId,generation:l.generation,token:l.token,urls});
 const initial=await observe(first) as {result:{observations:{state:string}[]}};expect(initial.result.observations[0].state).toBe('first');
 await expect(observe(first,['https://elsewhere.org/page'])).rejects.toMatchObject({code:'MISSION_SOURCE_SCOPE'});
 await core.worker('fixture-delivery',{action:'empty',requestId:randomUUID(),runId:first.runId,generation:first.generation,token:first.token,summary:'No new facts.'});
 await pool.query("UPDATE knowledge_missions.runs SET created_at=created_at-interval '25 hours' WHERE plan_id=$1",[p.id]);await pool.query('UPDATE knowledge_missions.plans SET next_due=clock_timestamp() WHERE id=$1',[p.id]);
 const next=(await claim())!;sourceBody='A is now an institute.';
 const changed=await observe(next) as {result:{observations:{state:string;change:{before:string;after:string}}[]}};
 expect(changed.result.observations[0]).toMatchObject({state:'text-changed',change:{before:'A is an organization.',after:'A is now an institute.'}});
 const saved=(await pool.query('SELECT body_gzip FROM knowledge_missions.source_checks WHERE run_id=$1',[first.runId])).rows[0];expect(gunzipSync(saved.body_gzip).toString()).toBe('A is an organization.');
 expect((await createKnowledgeFoundationService(knowledge).get({kind:'operator',id:'fixture'},'record','baseline')).revision).toBe(1);
 expect(sourceTextChange('same prefix old suffix','same prefix new suffix').before).toContain('old');
 const html=createKnowledgeMissions(pool,knowledge,()=>inbox,{fetchDocument:async url=>({url,type:'text/html',body:Buffer.from('<html><body><p>A is now an institute.</p></body></html>')})});
 await core.worker('fixture-delivery',{action:'empty',requestId:randomUUID(),runId:next.runId,generation:next.generation,token:next.token,summary:'Same supported meaning.'});
 await pool.query("UPDATE knowledge_missions.runs SET created_at=created_at-interval '25 hours' WHERE plan_id=$1",[p.id]);await pool.query('UPDATE knowledge_missions.plans SET next_due=clock_timestamp() WHERE id=$1',[p.id]);const third=(await claim())!;
 const markup=await html.worker('fixture-delivery',{action:'observe',requestId:randomUUID(),runId:third.runId,generation:third.generation,token:third.token,urls:['https://example.org/baseline']}) as {result:{observations:{state:string}[]}};expect(markup.result.observations[0].state).toBe('markup-only');
});

it('accepts an explicit pinned correction only after observing its source and preserves old language text',async()=>{
 await create();const l=(await claim())!;
 const pkg={...payload(l),entities:[],sources:[{id:'s',content:{title:'Revised source',url:'https://example.org/baseline',textLanguages:{title:{tag:'en',basis:'declared'}}}}],items:[{key:'correct-baseline',operation:'correct-record',correction:{id:'baseline',revision:1},about:{kind:'record',id:'baseline',revision:1},reason:'資料の更新に合わせ、研究所の設立年を訂正する。',record:{kind:'note',subjectId:'a',assertion:'Aは2001年設立の研究所です。',textLanguages:{assertion:{tag:'ja',basis:'declared'}},evidence:[{id:'proof',source:{id:'s',revision:1},locator:'Introduction',excerpt:'A is a research institute founded in 2001.',textLanguages:{locator:{tag:'en',basis:'declared'},excerpt:{tag:'en',basis:'declared'}}}]}}]};
 await expect(deliver(l,pkg)).rejects.toMatchObject({code:'MISSION_SOURCE_OBSERVATION_REQUIRED'});
 await expect(deliver(l,{...pkg,items:[{...pkg.items[0],correction:{id:'elsewhere',revision:1}}]})).rejects.toMatchObject({code:'MISSION_CORRECTION_SCOPE'});
 sourceBody='A is a research institute founded in 2001.';await core.worker('fixture-delivery',{action:'observe',requestId:randomUUID(),runId:l.runId,generation:l.generation,token:l.token,urls:['https://example.org/baseline']});const accepted=await deliver(l,pkg) as {receiptId:string};
 const principal=(await missionImportPrincipal(pool,'mission:'+l.runId))!;expect(principal.targets.records).toBe('*');
 const cfg=reviewConfigSchema.parse({projectId:'mission-correction-fixture',billingTier:'free',verifiedAt:new Date().toISOString(),model:'gemini-3.1-flash-lite',rpm:10,tokensPerMinute:30000,requestsPerDay:400,requestsPerMonth:12000,inputTokensPerDay:250000,outputTokensPerDay:160000,inputTokensPerMonth:7500000,outputTokensPerMonth:4800000,apiKeyFile:'/unused',allowedUsers:[randomUUID()]});
 await createReviewQueue(pool).heartbeat(cfg);
 await inbox.processNext(cfg,async()=>({state:'received',status:200,raw:{responseId:'fixture-correction',modelVersion:cfg.model,usageMetadata:{promptTokenCount:100,candidatesTokenCount:20,thoughtsTokenCount:0,totalTokenCount:120},candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({suitability:'legitimate',support:'supported',reason:'Fixture original source supports the text.'})}]}}]}}));
 const correctionResult=(await inbox.receipt(principal,accepted.receiptId)).items[0];expect(correctionResult.state,JSON.stringify(correctionResult)).toBe('applied');
 const f=createKnowledgeFoundationService(knowledge),old=await f.get({kind:'operator',id:'fixture'},'record','baseline',1),current=await f.get({kind:'operator',id:'fixture'},'record','baseline');
 expect(old.content.assertion).toBe('A is an organization.');expect(current.revision).toBe(2);expect(current.content.textLanguages?.assertion?.tag).toBe('ja');expect(current.content.evidence[0].textLanguages?.excerpt?.tag).toBe('en');
});

it('collects a theme-only background without inventing a graph entity',async()=>{
 const f=createKnowledgeFoundationService(knowledge);await f.execute({kind:'operator',id:'fixture'},{action:'create-bundle',requestId:randomUUID(),records:[{id:'reading-context',content:{kind:'note',assertion:'A theme has a reading context.',evidence:[{id:'e',source:{id:'base',revision:1},locator:'Intro',excerpt:'A theme has a reading context.'}]}}],reason:'Fixture editorial theme context'});
 await f.execute({kind:'operator',id:'fixture'},{action:'create-theme',requestId:randomUUID(),id:'reading',title:'A reading theme',recordPins:[{id:'reading-context',revision:1}],initialView:'timeline'});
 await create({...plan,themeId:'reading',entityIds:[]});const l=(await claim())!;
 expect(l.snapshot).toMatchObject({entities:[],records:[{id:'reading-context',revision:1}]});
 const pkg={format:'plunode-knowledge-package',schemaVersion:1,...l.packageIdentity,sources:payload(l).sources,items:[{key:'context',operation:'add-information',about:{kind:'theme',id:'reading',revision:1},themes:[{id:'reading',revision:1}],record:{kind:'note',aboutTheme:'reading',assertion:'A theme has a reading context.',evidence:[{id:'e',source:{id:'s',revision:1},locator:'Intro',excerpt:'A theme has a reading context.'}]}}]};
 expect((await deliver(l,pkg) as {receipt:{items:{state:string}[]}}).receipt.items[0].state).toBe('queued');
});

it('adapts a Web paste without a bearer, preserves the raw package, and keeps namespaces and rights separate',async()=>{
 await pool.query('TRUNCATE knowledge_missions.web_importers CASCADE');process.env.SITE_OPERATOR_USER_IDS=operator;process.env.SITE_OPERATIONS_ENABLED='1';
 await pool.query('INSERT INTO "user"(id,name,email,"emailVerified",active,locale) VALUES($1,$2,$3,true,true,$4) ON CONFLICT(id) DO UPDATE SET active=true',[operator,'Fixture operator',operator+'@example.org','ja']);
 const web=createWebKnowledgeImports(pool,()=>inbox),raw={...payload({packageIdentity:{namespace:'mission.a',packageId:'web-test',revision:1}} as Lease)},requestId=randomUUID();
 const accepted=await web.deliver(operator,requestId,raw);expect(accepted.receipt.items[0].state).toBe('queued');expect((await web.deliver(operator,requestId,raw)).receipt.receiptId).toBe(accepted.receipt.receiptId);
 const row=(await pool.query('SELECT * FROM knowledge_missions.web_deliveries WHERE request_id=$1',[requestId])).rows[0];expect(row.original_payload).toEqual(raw);expect(row.payload.namespace).toMatch(/^web\./);expect(row.payload.namespace).not.toBe(raw.namespace);
 expect((await web.list(operator)).items).toHaveLength(1);expect((await web.list(randomUUID())).items).toHaveLength(0);
 let lost=true;const recovering=createWebKnowledgeImports(pool,()=>({...inbox,intake:async(...args:Parameters<typeof inbox.intake>)=>{const v=await inbox.intake(...args);if(lost){lost=false;throw Error('fixture Web ACK lost');}return v;}}));
 const recoveryId=randomUUID();await expect(recovering.deliver(operator,recoveryId,{...raw,packageId:'web-recovery'})).rejects.toThrow('Web ACK lost');
 expect((await pool.query('SELECT count(*)::int n FROM knowledge_import.packages')).rows[0].n).toBe(2);await pool.query('UPDATE knowledge_missions.web_deliveries SET next_attempt=clock_timestamp() WHERE request_id=$1',[recoveryId]);expect(await recovering.recoverOne()).toBe(true);
 expect((await pool.query('SELECT count(*)::int n FROM knowledge_import.packages')).rows[0].n).toBe(2);expect((await web.list(operator)).items.find(v=>v.requestId===recoveryId)?.receipt?.receiptId).toBeTruthy();
 await expect(web.deliver(operator,requestId,{...raw,revision:2})).rejects.toMatchObject({code:'REQUEST_CHANGED'});
 const principalId='web:'+row.importer_id;expect(await webImportPrincipal(pool,principalId)).not.toBeNull();await pool.query('UPDATE "user" SET active=false WHERE id=$1',[operator]);expect(await webImportPrincipal(pool,principalId)).toBeNull();
 await expect(web.deliver(operator,randomUUID(),{...raw,packageId:'another'})).rejects.toMatchObject({code:'OPERATOR_REQUIRED'});
 delete process.env.SITE_OPERATOR_USER_IDS;
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
 const p=await create(),old=(await claim())!;
 const resume=()=>core.worker('fixture-delivery',{action:'resume',requestId:randomUUID(),runId:old.runId,generation:old.generation,token:old.token});
 expect((await resume()) as {lease:Lease}).toMatchObject({lease:{runId:old.runId,generation:old.generation}});
 await pool.query("UPDATE knowledge_missions.runs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[old.runId]);await expect(resume()).rejects.toMatchObject({code:'MISSION_LEASE_CHANGED'});
 const next=(await claim())!;expect(next.runId).toBe(old.runId);expect(next.generation).toBe(old.generation+1);await expect(deliver(old)).rejects.toMatchObject({code:'MISSION_LEASE_CHANGED'});
 await act({action:'update',requestId:randomUUID(),id:p.id,expectedRevision:1,content:{...plan,question:'Aに関する別の資料を調べてほしい'}});await expect(deliver(next)).rejects.toMatchObject({code:'MISSION_LEASE_CHANGED'});
});
it('pauses unreflected work and never revives an old run when resumed',async()=>{
 const p=await create(),lease=(await claim())!;await deliver(lease);expect(await missionImportPrincipal(pool,'mission:'+lease.runId)).not.toBeNull();
 await act({action:'pause',requestId:randomUUID(),id:p.id,expectedRevision:1});expect(await missionImportPrincipal(pool,'mission:'+lease.runId)).toBeNull();expect(await claim()).toBeNull();
 await expect(core.worker('fixture-delivery',{action:'resume',requestId:randomUUID(),runId:lease.runId,generation:lease.generation,token:lease.token})).rejects.toMatchObject({code:'MISSION_LEASE_CHANGED'});
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
