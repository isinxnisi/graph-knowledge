import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {migrateMemberDatabase} from '../lib/server/member/migrate';
import {createKnowledgeFoundationService,knowledgeDigest} from '../lib/server/knowledge-foundation';
import {createKnowledgeImports} from '../lib/server/knowledge-import';
import {createWebKnowledgeImports,webImportPrincipal} from '../lib/server/knowledge-web-import';
import {createThemeRegistrations} from '../lib/server/knowledge-theme-registration';
import {migrateKnowledgeTranslations} from '../lib/server/knowledge-translation-migrate';
import {migrateKnowledgeIdentities} from '../lib/server/knowledge-identity-migrate';
import {ensureKnowledgePublicationSchema} from '../lib/server/knowledge-publication';
import {reviewConfigSchema} from '../lib/server/knowledge-review-queue';
import {matchSourceExcerpt,SourceCheckError} from '../lib/server/knowledge-source-verification';

const pool=new Pool({connectionString:process.env.MEMBER_DATABASE_URL,max:8}),knowledge=new Pool({connectionString:process.env.KNOWLEDGE_CAPSULE_TEST_DATABASE_URL,max:5});
const owner=randomUUID(),other=randomUUID(),fixKeys=['T01','T02','D02','T03'],publishedKeys=['G01','G04','G03','G02','G05'];
const config=reviewConfigSchema.parse({projectId:'amendment-fixture',billingTier:'free',verifiedAt:new Date().toISOString(),model:'gemini-3.1-flash-lite',rpm:15,tokensPerMinute:500000,requestsPerDay:80,requestsPerMonth:2400,inputTokensPerDay:250000,outputTokensPerDay:160000,inputTokensPerMonth:7500000,outputTokensPerMonth:4800000,apiKeyFile:'/unused',allowedUsers:[owner]});
const dispatch=vi.fn(async()=>{throw Error('Operator theme must never send AI');});
const proof=async(url:string,excerpt:string)=>matchSourceExcerpt({url,type:'text/plain',body:Buffer.from(excerpt)},excerpt);
let imports:ReturnType<typeof createKnowledgeImports>,web:ReturnType<typeof createWebKnowledgeImports>,service:ReturnType<typeof createThemeRegistrations>;
const record=(key:string,about=true)=>({key,operation:'add-information' as const,...(about?{about:{kind:'entity' as const,id:'a',revision:1}}:{}),record:{kind:'note' as const,subjectId:'a',assertion:'Fact '+key,evidence:[{id:'proof',source:{id:key==='G07'?'blocked':'shared',revision:1},locator:'Body',excerpt:'Fact '+key}]}});
const create=()=>({requestId:randomUUID(),title:'Isolated amendment fixture',description:'Not a live theme',package:{format:'plunode-knowledge-package',schemaVersion:1,namespace:'amend.fixture',packageId:'fixture',revision:1,entityPins:[{id:'a',revision:1}],sources:[{id:'shared',content:{title:'Shared source',url:'https://example.org/shared'}},{id:'blocked',content:{title:'Blocked source',url:'https://example.org/blocked'}}],items:[...publishedKeys.map(k=>record(k)),record('G07'),...fixKeys.map(k=>record(k,false))]}});
const edit=(registrationRequestId:string,keys:string[],revision=1)=>({requestId:randomUUID(),registrationRequestId,reason:'Fix pending source/target input',items:keys.map(key=>({key,expectedRevision:revision,item:{...record(key),record:{...record(key).record,evidence:[{id:'proof',source:{id:'shared',revision:1},locator:'Correct paragraph',excerpt:'Fact '+key}]}}}))});
async function wake(){await pool.query("UPDATE knowledge_missions.theme_registrations SET next_attempt=clock_timestamp() WHERE state IN('saved','processing')");}
async function projected(){await pool.query("UPDATE knowledge_import.items SET state='published' WHERE state='applied'");}
async function receive(){const v=create();await service.submit(owner,v);await service.recoverOne();for(let i=0;i<10;i++)await imports.processNext(config,dispatch);await projected();return v;}
async function inputs(id:string){return (await pool.query('SELECT i.* FROM knowledge_import.items i JOIN knowledge_missions.theme_registrations r ON r.receipt_id=i.package_id WHERE r.request_id=$1 ORDER BY i.ordinal',[id])).rows;}
beforeAll(async()=>{
 expect(process.env.MEMBER_TEST_CONTAINER).toMatch(/^gk-member-test-/);expect((await pool.query('SELECT current_database() n')).rows[0].n).toBe('graph_member_test');expect((await knowledge.query('SELECT current_database() n')).rows[0].n).toBe('plunode_knowledge75_test_capsule_share');
 vi.stubEnv('COMMUNITY_ENABLED','1');vi.stubEnv('SITE_OPERATIONS_ENABLED','1');vi.stubEnv('KNOWLEDGE_MISSIONS_ENABLED','1');vi.stubEnv('SITE_OPERATOR_USER_IDS',owner+','+other);
 await migrateMemberDatabase(pool,...Array(32).fill(true));const before=(await pool.query('SELECT name,checksum FROM member_migration ORDER BY name')).rows;
 await migrateMemberDatabase(pool,...Array(33).fill(true));await migrateMemberDatabase(pool,...Array(33).fill(true));expect((await pool.query("SELECT name,checksum FROM member_migration WHERE name<>'042-theme-item-amendments.sql' ORDER BY name")).rows).toEqual(before);
},30000);
beforeEach(async()=>{
 dispatch.mockClear();await pool.query('TRUNCATE knowledge_missions.theme_registrations,knowledge_missions.web_deliveries,knowledge_missions.web_importers CASCADE');await pool.query('TRUNCATE knowledge_import.packages CASCADE');
 await pool.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt",active,locale) VALUES($1,$2,$3,true,now(),now(),true,$7),($4,$5,$6,true,now(),now(),true,$7) ON CONFLICT(id) DO UPDATE SET active=true',[owner,'Operator','amend-owner@example.org',other,'Other','amend-other@example.org','ja']);
 await knowledge.query('DROP SCHEMA IF EXISTS knowledge75 CASCADE');const foundation=createKnowledgeFoundationService(knowledge);
 await foundation.execute({kind:'operator',id:'fixture'},{action:'create-bundle',requestId:randomUUID(),entities:[{id:'a',content:{name:'Fixture A',kind:'organization'}}],sources:[{id:'base',content:{title:'Base',url:'https://example.org/base'}}],records:[{id:'baseline',content:{kind:'note',subjectId:'a',assertion:'Baseline fact.',evidence:[{id:'base',source:{id:'base',revision:1},locator:'Body',excerpt:'Baseline fact.'}]}}],reason:'Isolated existing entity'});
 await migrateKnowledgeTranslations(knowledge);await migrateKnowledgeIdentities(knowledge);await ensureKnowledgePublicationSchema(knowledge);
 imports=createKnowledgeImports(pool,knowledge,(id,c)=>webImportPrincipal(pool,id,c),{verify:async(url,excerpt)=>{if(url.endsWith('/blocked'))throw new SourceCheckError('Fixture Cloudflare 403',true);return proof(url,excerpt);}});
 web=createWebKnowledgeImports(pool,()=>imports);service=createThemeRegistrations(pool,knowledge,web,imports);
},30000);
afterAll(async()=>{await pool.end();await knowledge.end();vi.unstubAllEnvs();});

it('repairs G07 source plus T01/T02/D02/T03 targets without recreating or changing the other five public records',async()=>{
 const v=await receive(),before=await inputs(v.requestId),registration=(await pool.query('SELECT * FROM knowledge_missions.theme_registrations WHERE request_id=$1',[v.requestId])).rows[0];
 expect(before.filter(i=>publishedKeys.includes(i.item_key)).every(i=>i.state==='published')).toBe(true);expect(before.filter(i=>fixKeys.includes(i.item_key)).every(i=>i.state==='needs-changes')).toBe(true);
 const amendment=edit(v.requestId,['G07',...fixKeys]);amendment.items[0]={...amendment.items[0],sources:[{id:'shared',content:{title:'New reliable source',url:'https://example.org/replacement'}}]} as typeof amendment.items[number];
 const first=await service.amend(owner,amendment);expect(first.items.map(i=>i.inputRevision)).toEqual([2,2,2,2,2]);expect(await service.amend(owner,amendment)).toMatchObject({replayed:true});
 const pending=await service.status(owner,v.requestId);expect(pending.theme).toBeNull();expect(pending.receipt?.receiptId).toBe(registration.receipt_id);
 const oldInput=await service.status(owner,v.requestId,{itemKey:'G07',inputRevision:1});expect(oldInput.itemAmendments.items?.find(i=>i.key==='G07')?.input?.value.sources).toEqual(expect.arrayContaining([expect.objectContaining({id:'blocked'})]));
 // Advance the isolated failed-source cooldown, without changing live data.
 await pool.query("UPDATE knowledge_import.items SET next_attempt=clock_timestamp() WHERE item_key='G07'");
 for(let i=0;i<5;i++)await imports.processNext(config,dispatch);await projected();await wake();await service.recoverOne();
 const result=await service.status(owner,v.requestId);expect(result,JSON.stringify(result.receipt?.items.map(i=>({key:i.key,state:i.state,reason:i.reason})))).toMatchObject({state:'published',requestId:v.requestId,theme:{revision:1}});expect(result.receipt?.items).toHaveLength(10);
 const after=await inputs(v.requestId);for(const old of before.filter(i=>publishedKeys.includes(i.item_key)))expect(after.find(i=>i.id===old.id)).toEqual(old);
 expect((await pool.query('SELECT input,input_hash,receipt_id,theme_id FROM knowledge_missions.theme_registrations WHERE request_id=$1',[v.requestId])).rows[0]).toEqual({input:registration.input,input_hash:registration.input_hash,receipt_id:registration.receipt_id,theme_id:registration.theme_id});
 expect((await pool.query('SELECT payload,digest FROM knowledge_import.packages WHERE id=$1',[registration.receipt_id])).rows[0].payload.items).toHaveLength(10);
 expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.objects WHERE kind='theme'")).rows[0].n).toBe(1);
 expect((await pool.query('SELECT count(*)::int n FROM knowledge_import.attempts')).rows[0].n).toBe(0);expect(dispatch).not.toHaveBeenCalled();
 expect(await service.amend(owner,amendment)).toMatchObject({replayed:true});
 expect((await knowledge.query("SELECT content->>'url' url FROM knowledge75.revisions WHERE kind='source'")).rows.map(r=>r.url)).toEqual(expect.arrayContaining(['https://example.org/shared','https://example.org/replacement']));
 expect(result.itemAmendments.history).toHaveLength(1);expect(result.itemAmendments.history?.[0].reason).toBe(amendment.reason);
});
it('keeps a partially repaired registration pending so the remaining input errors can still be corrected',async()=>{
 const v=await receive();await service.amend(owner,edit(v.requestId,['G07']));await pool.query("UPDATE knowledge_import.items SET next_attempt=clock_timestamp() WHERE item_key='G07'");await imports.processNext(config,dispatch);await projected();await wake();await service.recoverOne();
 const pending=await service.status(owner,v.requestId);expect(pending).toMatchObject({state:'processing',theme:null});expect(pending.itemAmendments.items?.filter(i=>i.canAmend).map(i=>i.key),JSON.stringify(pending.receipt?.items.map(i=>({key:i.key,state:i.state,reason:i.reason})))).toEqual(fixKeys);
 await service.amend(owner,edit(v.requestId,fixKeys));for(let i=0;i<4;i++)await imports.processNext(config,dispatch);await projected();await wake();await service.recoverOne();const final=await service.status(owner,v.requestId);expect(final,JSON.stringify(final.receipt?.items.map(i=>({key:i.key,state:i.state,reason:i.reason})))).toMatchObject({state:'published'});expect(dispatch).not.toHaveBeenCalled();
});
it('retains cumulative source retry counts and cooldown when the G07 URL changes, rather than bypassing its daily limit',async()=>{
 const v=await receive();await pool.query("UPDATE knowledge_import.items SET state='quota',prepare_day=$1,prepare_attempts=8,next_attempt=clock_timestamp()+interval '2 hours' WHERE item_key='G07'",[(await import('../lib/server/knowledge-ai-budget')).quotaDate(new Date())]);
 const before=(await inputs(v.requestId)).find(i=>i.item_key==='G07')!;await service.amend(owner,edit(v.requestId,['G07']));const after=(await inputs(v.requestId)).find(i=>i.item_key==='G07')!;
 expect(after.prepare_attempts).toBe(8);expect(after.prepare_day).toBe(before.prepare_day);expect(+new Date(after.next_attempt)).toBeGreaterThanOrEqual(+new Date(before.next_attempt));expect(after.attempts).toBe(before.attempts);
 expect(await imports.processNext(config,dispatch)).toBe(false);expect(dispatch).not.toHaveBeenCalled();
});
it('makes an in-flight old source result unable to apply to the amended input',async()=>{
 const v=create();v.package.items=[record('G07')];await service.submit(owner,v);await service.recoverOne();
 let entered!:()=>void,release!:()=>void;const started=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
 const oldWorker=createKnowledgeImports(pool,knowledge,(id,c)=>webImportPrincipal(pool,id,c),{verify:async(url,excerpt)=>{entered();await gate;return proof(url,excerpt);}});
 const oldRun=oldWorker.processNext(config,dispatch);await started;
 const change=edit(v.requestId,['G07']);await service.amend(owner,change);release();await oldRun;
 expect((await inputs(v.requestId))[0]).toMatchObject({input_revision:2,state:'queued',result:null});
 expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.objects WHERE kind='record'")).rows[0].n).toBe(1);
 await imports.processNext(config,dispatch);await projected();await wake();await service.recoverOne();const final=await service.status(owner,v.requestId);expect(final,JSON.stringify(final.receipt?.items.map(i=>({key:i.key,state:i.state,reason:i.reason})))).toMatchObject({state:'published'});expect(dispatch).not.toHaveBeenCalled();
});
it('rejects stale edits, payload reuse, foreign/revoked owners and batches containing an already applied item atomically',async()=>{
 const v=await receive(),first=edit(v.requestId,['T01']);await service.amend(owner,first);
 await expect(service.amend(owner,edit(v.requestId,['T01']))).rejects.toMatchObject({code:'ITEM_REVISION_CONFLICT'});
 await expect(service.amend(owner,{...first,reason:'Different'})).rejects.toMatchObject({code:'REQUEST_CHANGED'});
 await expect(service.amend(other,edit(v.requestId,['T02']))).rejects.toMatchObject({code:'NOT_FOUND'});
 const before=knowledgeDigest((await inputs(v.requestId)).map(i=>({key:i.item_key,revision:i.input_revision,normalized:i.normalized})));
 await expect(service.amend(owner,edit(v.requestId,['T02','G01']))).rejects.toMatchObject({code:'ITEM_ALREADY_APPLIED'});
 expect(knowledgeDigest((await inputs(v.requestId)).map(i=>({key:i.item_key,revision:i.input_revision,normalized:i.normalized})))).toBe(before);
 await pool.query('UPDATE "user" SET active=false WHERE id=$1',[owner]);await expect(service.amend(owner,edit(v.requestId,['T02']))).rejects.toMatchObject({code:'OPERATOR_REQUIRED'});
});
it('refuses an old item whose common commit completed even when the member acknowledgement was lost',async()=>{
 const v=create();v.package.items=[record('G01')];await service.submit(owner,v);await service.recoverOne();
 const worker=createKnowledgeImports(pool,knowledge,(id,c)=>webImportPrincipal(pool,id,c),{verify:proof,afterKnowledgeCommit:async()=>{throw Error('lost ACK');}});
 await worker.processNext(config,dispatch);
 await expect(service.amend(owner,edit(v.requestId,['G01']))).rejects.toMatchObject({code:'ITEM_ALREADY_APPLIED'});expect(dispatch).not.toHaveBeenCalled();
});
it('retains append-only inputs and supports an exact older edition read after successive corrections',async()=>{
 const v=await receive(),a=edit(v.requestId,['T01']);await service.amend(owner,a);const b=edit(v.requestId,['T01'],2);b.items[0].item.record.assertion='New T01 statement';await service.amend(owner,b);
 const current=await service.status(owner,v.requestId),old=await service.status(owner,v.requestId,{itemKey:'T01',inputRevision:2});expect(current.itemAmendments.items?.find(i=>i.key==='T01')?.inputRevision).toBe(3);expect(old.itemAmendments.items?.find(i=>i.key==='T01')?.input?.revision).toBe(2);
 expect(old.itemAmendments.items?.find(i=>i.key==='T01')?.input?.value.items[0]).toMatchObject(a.items[0].item);
 await expect(pool.query("UPDATE knowledge_missions.theme_item_input_revisions SET prior_state='changed'")).rejects.toThrow('immutable');
 await expect(pool.query("UPDATE knowledge_missions.theme_item_amendments SET reason='changed'")).rejects.toThrow('immutable');
});

it('keeps whole-receipt cancellation effective even if previous input errors remain terminal',async()=>{
 const v=await receive();const receipt=(await service.status(owner,v.requestId)).receipt!.receiptId;
 const principal=await webImportPrincipal(pool,(await pool.query('SELECT principal_id FROM knowledge_import.packages WHERE id=$1',[receipt])).rows[0].principal_id);expect(principal).toBeTruthy();
 await imports.cancel(principal!,receipt);await wake();await service.recoverOne();expect(await service.status(owner,v.requestId)).toMatchObject({state:'cancelled',theme:null});expect(dispatch).not.toHaveBeenCalled();
});
