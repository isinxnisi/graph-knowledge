import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {migrateMemberDatabase} from '../lib/server/member/migrate';
import {createKnowledgeFoundationService} from '../lib/server/knowledge-foundation';
import {createKnowledgeImports} from '../lib/server/knowledge-import';
import {createWebKnowledgeImports,webImportPrincipal} from '../lib/server/knowledge-web-import';
import {createThemeRegistrations} from '../lib/server/knowledge-theme-registration';
import {migrateKnowledgeTranslations} from '../lib/server/knowledge-translation-migrate';
import {migrateKnowledgeIdentities} from '../lib/server/knowledge-identity-migrate';
import {ensureKnowledgePublicationSchema} from '../lib/server/knowledge-publication';
import {reviewConfigSchema} from '../lib/server/knowledge-review-queue';
import {matchSourceExcerpt,SourceCheckError} from '../lib/server/knowledge-source-verification';
import {quotaDate,nextQuotaDay} from '../lib/server/knowledge-ai-budget';
import {canonicalSourceUrl} from '../lib/domain/knowledge-source-identity';

const pool=new Pool({connectionString:process.env.MEMBER_DATABASE_URL,max:8}),knowledge=new Pool({connectionString:process.env.KNOWLEDGE_CAPSULE_TEST_DATABASE_URL,max:5});
const owner=randomUUID(),other=randomUUID(),fixKeys=['T01','T02','D02','T03'],publishedKeys=['G01','G04','G03','G02','G05'];
const config=reviewConfigSchema.parse({projectId:'amendment-fixture',billingTier:'free',verifiedAt:new Date().toISOString(),model:'gemini-3.1-flash-lite',rpm:15,tokensPerMinute:500000,requestsPerDay:80,requestsPerMonth:2400,inputTokensPerDay:250000,outputTokensPerDay:160000,inputTokensPerMonth:7500000,outputTokensPerMonth:4800000,apiKeyFile:'/unused',allowedUsers:[owner]});
const dispatch=vi.fn(async()=>{throw Error('Operator theme must never send AI');});
const proof=async(url:string,excerpt:string)=>matchSourceExcerpt({url,type:'text/plain',body:Buffer.from(excerpt)},excerpt);
let imports:ReturnType<typeof createKnowledgeImports>,web:ReturnType<typeof createWebKnowledgeImports>,service:ReturnType<typeof createThemeRegistrations>;
const record=(key:string,about=true)=>({key,operation:'add-information' as const,...(about?{about:{kind:'entity' as const,id:'a',revision:1}}:{}),record:{kind:'note' as const,subjectId:'a',assertion:'Fact '+key,evidence:[{id:'proof',source:{id:key==='G07'?'blocked':'shared',revision:1},locator:'Body',excerpt:'Fact '+key}]}});
const create=()=>({requestId:randomUUID(),title:'Isolated amendment fixture',description:'Not a live theme',package:{format:'plunode-knowledge-package',schemaVersion:1,namespace:'amend.fixture',packageId:'fixture',revision:1,entityPins:[{id:'a',revision:1}],sources:[{id:'shared',content:{title:'Shared source',url:'https://example.org/shared'}},{id:'blocked',content:{title:'Blocked source',url:'https://example.org/blocked'}}],items:[...publishedKeys.map(k=>record(k)),record('G07'),...fixKeys.map(k=>record(k,false))]}});
const edit=(registrationRequestId:string,keys:string[],revision=1)=>({requestId:randomUUID(),registrationRequestId,reason:'Fix pending source/target input',items:keys.map(key=>({key,expectedRevision:revision,item:{...record(key),record:{...record(key).record,evidence:[{id:'proof',source:{id:'shared',revision:1},locator:'Correct paragraph',excerpt:'Fact '+key}]}}}))});
async function projected(){await pool.query("UPDATE knowledge_import.items SET state='published' WHERE state='applied'");}
async function receive(){const v=create();await service.submit(owner,v);await service.recoverOne();for(let i=0;i<10;i++)await imports.processNext(config,dispatch);await projected();return v;}
async function inputs(id:string){return (await pool.query('SELECT i.* FROM knowledge_import.items i JOIN knowledge_missions.theme_registrations r ON r.receipt_id=i.package_id WHERE r.request_id=$1 ORDER BY i.ordinal',[id])).rows;}
beforeAll(async()=>{
 expect(process.env.MEMBER_TEST_CONTAINER).toMatch(/^gk-member-test-/);expect((await pool.query('SELECT current_database() n')).rows[0].n).toBe('graph_member_test');expect((await knowledge.query('SELECT current_database() n')).rows[0].n).toBe('plunode_knowledge75_test_capsule_share');
 vi.stubEnv('COMMUNITY_ENABLED','1');vi.stubEnv('SITE_OPERATIONS_ENABLED','1');vi.stubEnv('KNOWLEDGE_MISSIONS_ENABLED','1');vi.stubEnv('SITE_OPERATOR_USER_IDS',owner+','+other);
 await migrateMemberDatabase(pool,...Array(33).fill(true));const before=(await pool.query('SELECT name,checksum FROM member_migration ORDER BY name')).rows;
 await migrateMemberDatabase(pool,...Array(34).fill(true));await migrateMemberDatabase(pool,...Array(34).fill(true));expect((await pool.query("SELECT name,checksum FROM member_migration WHERE name<>'043-theme-item-retries.sql' ORDER BY name")).rows).toEqual(before);
},30000);
beforeEach(async()=>{
 dispatch.mockClear();await pool.query('TRUNCATE knowledge_missions.theme_source_host_waits');await pool.query('TRUNCATE knowledge_missions.theme_registrations,knowledge_missions.web_deliveries,knowledge_missions.web_importers CASCADE');await pool.query('TRUNCATE knowledge_import.packages CASCADE');
 await pool.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt",active,locale) VALUES($1,$2,$3,true,now(),now(),true,$7),($4,$5,$6,true,now(),now(),true,$7) ON CONFLICT(id) DO UPDATE SET active=true',[owner,'Operator','amend-owner@example.org',other,'Other','amend-other@example.org','ja']);
 await knowledge.query('DROP SCHEMA IF EXISTS knowledge75 CASCADE');const foundation=createKnowledgeFoundationService(knowledge);
 await foundation.execute({kind:'operator',id:'fixture'},{action:'create-bundle',requestId:randomUUID(),entities:[{id:'a',content:{name:'Fixture A',kind:'organization'}}],sources:[{id:'base',content:{title:'Base',url:'https://example.org/base'}}],records:[{id:'baseline',content:{kind:'note',subjectId:'a',assertion:'Baseline fact.',evidence:[{id:'base',source:{id:'base',revision:1},locator:'Body',excerpt:'Baseline fact.'}]}}],reason:'Isolated existing entity'});
 await migrateKnowledgeTranslations(knowledge);await migrateKnowledgeIdentities(knowledge);await ensureKnowledgePublicationSchema(knowledge);
 imports=createKnowledgeImports(pool,knowledge,(id,c)=>webImportPrincipal(pool,id,c),{verify:async(url,excerpt)=>{if(url.endsWith('/blocked'))throw new SourceCheckError('Fixture Cloudflare 403',true);return proof(url,excerpt);}});
 web=createWebKnowledgeImports(pool,()=>imports);service=createThemeRegistrations(pool,knowledge,web,imports);
},30000);
afterAll(async()=>{await pool.end();await knowledge.end();vi.unstubAllEnvs();});


const control=(registrationRequestId:string,operation:'retry'|'pause'|'resume',key='G07',expectedRevision=1)=>({requestId:randomUUID(),registrationRequestId,operation,reason:'Isolated retry control',items:[{key,expectedRevision}]});
async function legacyLimit(requestId:string){
 const item=(await inputs(requestId)).find(i=>i.item_key==='G07')!;
 await pool.query('DELETE FROM knowledge_missions.theme_source_results WHERE attempt_id IN(SELECT id FROM knowledge_missions.theme_source_attempts WHERE item_id=$1)',[item.id]);
 await pool.query('DELETE FROM knowledge_missions.theme_source_attempts WHERE item_id=$1',[item.id]);
 await pool.query('DELETE FROM knowledge_missions.theme_retry_legacy WHERE item_id=$1',[item.id]);
 await pool.query("UPDATE knowledge_import.items SET state='quota',retry_initialized=false,prepare_attempts=8,prepare_day=$2,prepare_total=0,next_attempt=$3 WHERE id=$1",[item.id,quotaDate(new Date()),nextQuotaDay(new Date())]);return item;
}
it('allows a new G07 source immediately after a legacy 8/day failure without changing receipt, public items, images/products or original envelope',async()=>{
 const v=await receive();await legacyLimit(v.requestId);
 const baseline=(await pool.query('SELECT input,input_hash,receipt_id,theme_id FROM knowledge_missions.theme_registrations WHERE request_id=$1',[v.requestId])).rows[0],publicItems=(await inputs(v.requestId)).filter(i=>publishedKeys.includes(i.item_key));
 const change=edit(v.requestId,['G07']);change.items[0]={...change.items[0],sources:[{id:'shared',content:{title:'NEA replacement',url:'https://new.example.org/nea'}}]} as typeof change.items[number];await service.amend(owner,change);
 expect(+new Date((await inputs(v.requestId)).find(i=>i.item_key==='G07')!.next_attempt)).toBeGreaterThan(Date.now()+60000);
 const status=await service.retryStatus(owner,v.requestId,'G07');expect(status.items?.[0]).toMatchObject({inputRevision:2,canRetryNow:true,sourceUrls:['https://new.example.org/nea']});
 const op=control(v.requestId,'retry','G07',2),accepted=await service.controlRetry(owner,op);expect(accepted.items[0]).toMatchObject({inputRevision:2,paused:false,waitCode:null});expect(await service.controlRetry(owner,op)).toMatchObject({replayed:true});
 await imports.processNext(config,dispatch);await projected();const after=await inputs(v.requestId);expect(after.find(i=>i.item_key==='G07')).toMatchObject({state:'published',prepare_attempts:9,prepare_total:'9'});
 for(const old of publicItems)expect(after.find(i=>i.id===old.id)).toEqual(old);
 expect((await pool.query('SELECT input,input_hash,receipt_id,theme_id FROM knowledge_missions.theme_registrations WHERE request_id=$1',[v.requestId])).rows[0]).toEqual(baseline);
 const history=await service.retryStatus(owner,v.requestId,'G07');expect(history.operations).toHaveLength(1);expect(history.items?.[0].attempts).toEqual([expect.objectContaining({inputRevision:2,url:'https://new.example.org/nea',outcome:'verified'})]);expect(history.items?.[0].legacySourceBudgets).toEqual([expect.objectContaining({url:'https://example.org/blocked',attempts:8})]);expect(dispatch).not.toHaveBeenCalled();expect((await pool.query('SELECT count(*)::int n FROM knowledge_import.attempts')).rows[0].n).toBe(0);
});
it('retains same canonical URL limits across input edits, tracking parameters and repeated distinct retry operation IDs',async()=>{
 const v=await receive();await legacyLimit(v.requestId);const change=edit(v.requestId,['G07']);change.items[0].item.record.evidence[0].source.id='blocked';await service.amend(owner,change);
 for(let n=0;n<3;n++){const result=await service.controlRetry(owner,control(v.requestId,'retry','G07',2));expect(result.items[0].waitCode).toBe('SOURCE_DAILY_LIMIT');}
 expect(await imports.processNext(config,dispatch)).toBe(false);
 const again=edit(v.requestId,['G07'],2);(again.items[0] as typeof again.items[number]&{sources:unknown}).sources=[{id:'shared',content:{title:'Same URL with tracking',url:'https://example.org/blocked?utm_source=chat#top'}}] as never;await service.amend(owner,again);
 const result=await service.controlRetry(owner,control(v.requestId,'retry','G07',3));expect(result.items[0].waitCode).toBe('SOURCE_DAILY_LIMIT');expect(canonicalSourceUrl('https://example.org/blocked?utm_source=chat#top')).toBe('https://example.org/blocked');expect(dispatch).not.toHaveBeenCalled();
});
it('pauses only the selected item, remains paused after amendment and resumes through normal source checks',async()=>{
 const v=await receive(),otherBefore=(await inputs(v.requestId)).find(i=>i.item_key==='T01');await service.controlRetry(owner,control(v.requestId,'pause'));
 await service.amend(owner,edit(v.requestId,['G07']));expect((await service.retryStatus(owner,v.requestId,'G07')).items?.[0]).toMatchObject({paused:true,inputRevision:2,nextAttemptAt:null});expect(await imports.processNext(config,dispatch)).toBe(false);
 await expect(service.controlRetry(owner,control(v.requestId,'retry','G07',2))).rejects.toMatchObject({code:'ITEM_RETRY_PAUSED'});
 await service.controlRetry(owner,control(v.requestId,'resume','G07',2));await imports.processNext(config,dispatch);await projected();expect((await inputs(v.requestId)).find(i=>i.item_key==='G07')?.state).toBe('published');expect((await inputs(v.requestId)).find(i=>i.item_key==='T01')).toEqual(otherBefore);expect(dispatch).not.toHaveBeenCalled();
});
it('fences in-flight source results during pause/amend/resume, and never double applies racing workers',async()=>{
 const v=create();v.package.items=[record('G07')];await service.submit(owner,v);await service.recoverOne();
 let entered!:()=>void,release!:()=>void;const start=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
 const worker=createKnowledgeImports(pool,knowledge,(id,c)=>webImportPrincipal(pool,id,c),{verify:async(url,excerpt)=>{entered();await gate;return proof(url,excerpt);}});
 const run=worker.processNext(config,dispatch);await start;
 await expect(service.controlRetry(owner,control(v.requestId,'retry'))).rejects.toMatchObject({code:'ITEM_RUNNING'});
 await service.controlRetry(owner,control(v.requestId,'pause'));await service.amend(owner,edit(v.requestId,['G07']));const resumed=await service.controlRetry(owner,control(v.requestId,'resume','G07',2));expect(resumed.items[0].waitCode).toBe('SOURCE_IN_FLIGHT');
 release();await run;expect((await inputs(v.requestId))[0]).toMatchObject({state:'queued',input_revision:2,result:null});
 await service.controlRetry(owner,control(v.requestId,'retry','G07',2));await Promise.all([imports.processNext(config,dispatch),imports.processNext(config,dispatch)]);await projected();expect((await inputs(v.requestId))[0].state).toBe('published');
 expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.objects WHERE kind='record'")).rows[0].n).toBe(2);
 const history=await service.retryStatus(owner,v.requestId);expect(history.items?.[0].attempts.map(a=>a.inputRevision)).toEqual([1,2]);expect(dispatch).not.toHaveBeenCalled();
});
it('rejects foreign/revoked owners, stale revisions, changed operation payload, published/cancelled items and batches atomically',async()=>{
 const v=await receive(),op=control(v.requestId,'pause');await service.controlRetry(owner,op);
 await expect(service.controlRetry(owner,{...op,operation:'resume'})).rejects.toMatchObject({code:'REQUEST_CHANGED'});
 await expect(service.controlRetry(other,control(v.requestId,'retry'))).rejects.toMatchObject({code:'NOT_FOUND'});
 await expect(service.controlRetry(owner,control(v.requestId,'pause','G07',2))).rejects.toMatchObject({code:'ITEM_REVISION_CONFLICT'});
 await expect(service.controlRetry(owner,{...control(v.requestId,'pause','T01'),items:[{key:'T01',expectedRevision:1},{key:'G01',expectedRevision:1}]})).rejects.toMatchObject({code:'ITEM_ALREADY_APPLIED'});expect((await inputs(v.requestId)).find(i=>i.item_key==='T01')?.retry_paused).toBe(false);
 await pool.query("UPDATE knowledge_import.items SET state='cancelled' WHERE item_key='T01'");await expect(service.controlRetry(owner,control(v.requestId,'retry','T01'))).rejects.toMatchObject({code:'ITEM_ALREADY_APPLIED'});
 await pool.query('UPDATE "user" SET active=false WHERE id=$1',[owner]);await expect(service.controlRetry(owner,control(v.requestId,'resume'))).rejects.toMatchObject({code:'OPERATOR_REQUIRED'});
});
it('preserves host access restrictions and Retry-After even for another URL, but allows another host',async()=>{
 const v=create();v.package.items=[record('G07')];await service.submit(owner,v);await service.recoverOne();
 const restricted=createKnowledgeImports(pool,knowledge,(id,c)=>webImportPrincipal(pool,id,c),{verify:async()=>{throw new SourceCheckError('Fixture 429 Retry-After',true,600000,{host:'example.org',status:429});}});await restricted.processNext(config,dispatch);
 const beforeWait=(await inputs(v.requestId))[0].prepare_attempts;await pool.query('UPDATE knowledge_import.items SET next_attempt=clock_timestamp() WHERE id=$1',[(await inputs(v.requestId))[0].id]);expect(await restricted.processNext(config,dispatch)).toBe(false);expect((await inputs(v.requestId))[0].prepare_attempts).toBe(beforeWait);
 const change=edit(v.requestId,['G07']);await service.amend(owner,change);let result=await service.controlRetry(owner,control(v.requestId,'retry','G07',2));expect(result.items[0].waitCode).toBe('SOURCE_HOST_WAIT');expect(Date.parse(result.items[0].scheduledAt!)).toBeGreaterThan(Date.now()+590000);
 const next=edit(v.requestId,['G07'],2);(next.items[0] as typeof next.items[number]&{sources:unknown}).sources=[{id:'shared',content:{title:'Other host',url:'https://other.example.org/source'}}] as never;await service.amend(owner,next);result=await service.controlRetry(owner,control(v.requestId,'retry','G07',3));expect(result.items[0].waitCode).toBeNull();
 const before=await inputs(v.requestId);await service.retryStatus(owner,v.requestId);await service.retryStatus(owner,v.requestId);expect(await inputs(v.requestId)).toEqual(before);
 await expect(pool.query("UPDATE knowledge_missions.theme_retry_operations SET reason='modified'")).rejects.toThrow('immutable');await expect(pool.query("UPDATE knowledge_missions.theme_source_attempts SET input_revision=9")).rejects.toThrow('immutable');await expect(pool.query("UPDATE knowledge_missions.theme_source_results SET outcome='verified'")).rejects.toThrow('immutable');expect(dispatch).not.toHaveBeenCalled();
});
it('does not restart a source after its cross-DB commit succeeded but acknowledgement was lost',async()=>{
 const v=create();v.package.items=[record('G01')];await service.submit(owner,v);await service.recoverOne();const worker=createKnowledgeImports(pool,knowledge,(id,c)=>webImportPrincipal(pool,id,c),{verify:proof,afterKnowledgeCommit:async()=>{throw Error('lost ACK');}});await worker.processNext(config,dispatch);await expect(service.controlRetry(owner,control(v.requestId,'retry','G01'))).rejects.toMatchObject({code:'ITEM_ALREADY_APPLIED'});
});

it('enforces actual-source and service rate budgets under concurrent retry operations without counter resets',async()=>{
 const v=create();v.package.items=[record('G07')];await service.submit(owner,v);await service.recoverOne();const item=(await inputs(v.requestId))[0];
 await pool.query('UPDATE knowledge_import.items SET retry_initialized=true WHERE id=$1',[item.id]);
 for(let i=0;i<8;i++){
  const id=randomUUID();await pool.query("INSERT INTO knowledge_missions.theme_source_attempts(id,item_id,input_revision,lease_token,url,host,quota_day,started_at,deadline) VALUES($1,$2,1,$3,'https://example.org/blocked','example.org',$4,clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 minute')",[id,item.id,randomUUID(),quotaDate(new Date())]);await pool.query("INSERT INTO knowledge_missions.theme_source_results(attempt_id,outcome,reason) VALUES($1,'failed','Fixture fetch failed')",[id]);
 }
 const op=control(v.requestId,'retry');const results=await Promise.all([service.controlRetry(owner,op),service.controlRetry(owner,op)]);expect(results.map(v=>v.replayed).sort()).toEqual([false,true]);expect(results[0].items[0].waitCode).toBe('SOURCE_DAILY_LIMIT');
 const change=edit(v.requestId,['G07']);(change.items[0] as typeof change.items[number]&{sources:unknown}).sources=[{id:'shared',content:{title:'Another host',url:'https://new.example.org/source'}}];await service.amend(owner,change);
 for(let i=0;i<60;i++){
  const id=randomUUID();await pool.query("INSERT INTO knowledge_missions.theme_source_attempts(id,item_id,input_revision,lease_token,url,host,quota_day) VALUES($1,$2,1,$3,$4,'rate.example.org',$5)",[id,item.id,randomUUID(),'https://rate.example.org/'+i,quotaDate(new Date())]);await pool.query("INSERT INTO knowledge_missions.theme_source_results(attempt_id,outcome,reason) VALUES($1,'verified','Fixture')",[id]);
 }
 expect((await service.controlRetry(owner,control(v.requestId,'retry','G07',2))).items[0].waitCode).toBe('SOURCE_SERVICE_RATE');expect(dispatch).not.toHaveBeenCalled();
});
