import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {migrateMemberDatabase} from '../lib/server/member/migrate';
import {createKnowledgeFoundationService} from '../lib/server/knowledge-foundation';
import {createKnowledgeImports} from '../lib/server/knowledge-import';
import {createWebKnowledgeImports,webImportPrincipal} from '../lib/server/knowledge-web-import';
import {createThemeRegistrations} from '../lib/server/knowledge-theme-registration';
import {ensureKnowledgePublicationSchema} from '../lib/server/knowledge-publication';
import {migrateKnowledgeTranslations} from '../lib/server/knowledge-translation-migrate';
import {migrateKnowledgeIdentities} from '../lib/server/knowledge-identity-migrate';
import {reviewConfigSchema,createReviewQueue} from '../lib/server/knowledge-review-queue';
import {matchSourceExcerpt} from '../lib/server/knowledge-source-verification';

const pool=new Pool({connectionString:process.env.MEMBER_DATABASE_URL,max:6}),knowledge=new Pool({connectionString:process.env.KNOWLEDGE_CAPSULE_TEST_DATABASE_URL,max:4});
const owner=randomUUID(),other=randomUUID();
let service:ReturnType<typeof createThemeRegistrations>,inbox:ReturnType<typeof createKnowledgeImports>,web:ReturnType<typeof createWebKnowledgeImports>;
const input=()=>({requestId:randomUUID(),title:'Aをたどる',description:'資料からたどるテーマ',initialView:'timeline',recordPins:[{id:'baseline',revision:1}]});
const foundation=()=>createKnowledgeFoundationService(knowledge);
const cfg=reviewConfigSchema.parse({projectId:'theme-registration-fixture',billingTier:'free',verifiedAt:new Date().toISOString(),model:'gemini-3.1-flash-lite',rpm:10,tokensPerMinute:30000,requestsPerDay:80,requestsPerMonth:2400,inputTokensPerDay:250000,outputTokensPerDay:160000,inputTokensPerMonth:7500000,outputTokensPerMonth:4800000,apiKeyFile:'/unused',allowedUsers:[owner]});
async function wake(){await pool.query("UPDATE knowledge_missions.theme_registrations SET next_attempt=clock_timestamp() WHERE state IN('saved','processing')");}
beforeAll(async()=>{
 expect(process.env.MEMBER_TEST_CONTAINER).toMatch(/^gk-member-test-/);
 expect((await pool.query('SELECT current_database() name')).rows[0].name).toBe('graph_member_test');
 expect((await knowledge.query('SELECT current_database() name')).rows[0].name).toBe('plunode_knowledge75_test_capsule_share');
 await migrateMemberDatabase(pool,...Array(26).fill(true));
 const before=(await pool.query('SELECT name,checksum FROM member_migration ORDER BY name')).rows;
 await migrateMemberDatabase(pool,...Array(27).fill(true));await migrateMemberDatabase(pool,...Array(27).fill(true));
 expect((await pool.query('SELECT name,checksum FROM member_migration WHERE name<>$1 ORDER BY name',['036-theme-registration.sql'])).rows).toEqual(before);
 expect((await pool.query('SELECT count(*)::int n FROM member_migration')).rows[0].n).toBe(37);
 process.env.KNOWLEDGE_MISSIONS_ENABLED='1';process.env.SITE_OPERATOR_USER_IDS=owner+','+other;
},30000);
beforeEach(async()=>{
 await pool.query('TRUNCATE knowledge_missions.theme_registrations,knowledge_missions.web_deliveries,knowledge_missions.web_importers CASCADE');await pool.query('TRUNCATE knowledge_import.packages CASCADE');
 await knowledge.query('DROP SCHEMA IF EXISTS knowledge75 CASCADE');
 await pool.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt",active,locale) VALUES($1,$2,$3,true,now(),now(),true,$7),($4,$5,$6,true,now(),now(),true,$7) ON CONFLICT(id) DO UPDATE SET active=true',[owner,'Operator','fixture-owner@example.org',other,'Other operator','fixture-other@example.org','ja']);
 await foundation().execute({kind:'operator',id:'fixture'},{action:'create-bundle',requestId:randomUUID(),entities:[{id:'a',content:{name:'A',kind:'organization'}}],sources:[{id:'base',content:{title:'Baseline',url:'https://example.org/base'}}],records:[{id:'baseline',content:{kind:'note',subjectId:'a',assertion:'A is an organization.',evidence:[{id:'base',source:{id:'base',revision:1},locator:'Name',excerpt:'A is an organization.'}]}}],reason:'Isolated registration baseline'});
 await migrateKnowledgeTranslations(knowledge);await migrateKnowledgeIdentities(knowledge);await ensureKnowledgePublicationSchema(knowledge);
 inbox=createKnowledgeImports(pool,knowledge,(id,c)=>webImportPrincipal(pool,id,c),{verify:async(url,excerpt)=>matchSourceExcerpt({url,type:'text/plain',body:Buffer.from(excerpt)},excerpt)});
 web=createWebKnowledgeImports(pool,()=>inbox);service=createThemeRegistrations(pool,knowledge,web,inbox);
},30000);
afterAll(async()=>{delete process.env.KNOWLEDGE_MISSIONS_ENABLED;delete process.env.SITE_OPERATOR_USER_IDS;await pool.end();await knowledge.end();vi.unstubAllEnvs();});

it('creates a pinned theme, replays without a new version and isolates owners',async()=>{
 const v=input();expect(await service.submit(owner,v)).toMatchObject({state:'saved',replayed:false});expect(await service.submit(owner,v)).toMatchObject({replayed:true});
 await expect(service.submit(owner,{...v,title:'different'})).rejects.toMatchObject({code:'REQUEST_CHANGED'});
 await expect(service.status(other,v.requestId)).rejects.toMatchObject({code:'NOT_FOUND'});
 expect(await service.recoverOne()).toBe(true);const result=await service.status(owner,v.requestId);expect(result).toMatchObject({state:'published',theme:{revision:1,title:v.title}});
 expect((await foundation().get({kind:'reader',id:'fixture'},'theme',result.theme!.id)).content.recordPins).toEqual(v.recordPins);
 await wake();expect(await service.recoverOne()).toBe(false);expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.objects WHERE kind='theme'")).rows[0].n).toBe(1);
});
it('recovers a common commit whose member acknowledgement was lost',async()=>{
 const v=input();await service.submit(owner,v);const hook=vi.fn().mockRejectedValueOnce(Error('ACK lost'));
 service=createThemeRegistrations(pool,knowledge,web,inbox,{afterThemeCommit:hook});await service.recoverOne();
 expect(await service.status(owner,v.requestId)).toMatchObject({state:'published',theme:{revision:1}});expect(hook).toHaveBeenCalledTimes(1);
 expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.revisions WHERE kind='theme'")).rows[0].n).toBe(1);
});
it('cancels pending work and does not pretend to cancel a published theme',async()=>{
 const a=input();await service.submit(owner,a);expect(await service.cancel(owner,a.requestId)).toMatchObject({state:'cancelled'});expect(await service.recoverOne()).toBe(false);
 const b=input();await service.submit(owner,b);await service.recoverOne();expect(await service.cancel(owner,b.requestId)).toMatchObject({state:'published'});
});
it('rechecks operator activity and the current public scope before composition and result disclosure',async()=>{
 const a=input();await service.submit(owner,a);await pool.query('UPDATE "user" SET active=false WHERE id=$1',[owner]);await service.recoverOne();
 await expect(service.status(owner,a.requestId)).rejects.toMatchObject({code:'OPERATOR_REQUIRED'});expect((await pool.query('SELECT state FROM knowledge_missions.theme_registrations WHERE request_id=$1',[a.requestId])).rows[0].state).toBe('cancelled');
 await pool.query('UPDATE "user" SET active=true WHERE id=$1',[owner]);const b=input();await service.submit(owner,b);await service.recoverOne();
 await foundation().execute({kind:'operator',id:'fixture'},{action:'set-visibility',requestId:randomUUID(),kind:'record',id:'baseline',expectedStatusRevision:1,visibility:'hidden',reason:'Stop this public source context'});
 expect((await service.status(owner,b.requestId)).theme).toBeNull();
 const c=input();await expect(service.submit(owner,c)).rejects.toMatchObject({code:'REVISION_NOT_PUBLIC'});
});
it('passes new information through the ordinary durable evidence review before composing',async()=>{
 await createReviewQueue(pool).heartbeat(cfg);
 const pkg={format:'plunode-knowledge-package',schemaVersion:1,namespace:'theme.fixture',packageId:'a-device',revision:1,entityPins:[{id:'a',revision:1}],entities:[{id:'b',content:{name:'B',kind:'instrument'}}],sources:[{id:'s',content:{title:'Instrument source',url:'https://example.org/instrument'}}],items:[{key:'connection',operation:'create-relation',record:{kind:'relation',subjectId:'a',objectId:'b',relation:'operates',assertion:'A operates B.',times:[{id:'event',time:{kind:'calendar',from:'2030-01-01',meaning:'point'}}],evidence:[{id:'proof',source:{id:'s',revision:1},locator:'Instrument',excerpt:'A operates B.'}]}}]};
 const v={...input(),recordPins:[],package:pkg,timeline:{version:1,axes:[{id:'calendar',kind:'calendar',label:'Events'}],placements:[{recordId:'item:connection',timeId:'event',axisId:'calendar'}],insets:[]}};await service.submit(owner,v);await service.recoverOne();expect(await service.status(owner,v.requestId)).toMatchObject({state:'processing',theme:null,receipt:{state:'processing'}});
 const dispatch=vi.fn(async()=>({state:'received' as const,status:200,raw:{responseId:'fixture',modelVersion:cfg.model,usageMetadata:{promptTokenCount:100,candidatesTokenCount:20,thoughtsTokenCount:0,totalTokenCount:120},candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({suitability:'legitimate',support:'supported',reason:'Source supports this fact.'})}]}}]}}));
 await inbox.processNext(cfg,dispatch);expect(dispatch).toHaveBeenCalledTimes(1);
 // Publisher completion is a separate tested boundary; no Neo4j process is used
 // in this isolated Member/PG integration test.
 await pool.query("UPDATE knowledge_import.items SET state='published' WHERE state='applied'");await wake();await service.recoverOne();
 const result=await service.status(owner,v.requestId);expect(result.state,JSON.stringify(result.receipt)).toBe('published');expect(result.theme).not.toBeNull();
 const record=result.receipt!.items[0].result!;expect((await foundation().get({kind:'reader',id:'fixture'},'theme',result.theme!.id)).content.recordPins).toEqual([{id:record.id,revision:record.revision}]);
 expect((await foundation().get({kind:'reader',id:'fixture'},'record',record.id,record.revision)).content.relation).toBe('operates');
 expect((await foundation().get({kind:'reader',id:'fixture'},'theme',result.theme!.id)).content.timeline?.placements).toEqual([{recordId:record.id,timeId:'event',axisId:'calendar'}]);
});

it('retains an invalid timeline request for correction instead of silently dropping its reference',async()=>{
 const v={...input(),timeline:{version:1,axes:[{id:'calendar',kind:'calendar',label:'Events'}],placements:[{recordId:'item:typo',timeId:'event',axisId:'calendar'}],insets:[]}};
 await service.submit(owner,v);await service.recoverOne();expect(await service.status(owner,v.requestId)).toMatchObject({state:'needs-changes',theme:null});
 expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.objects WHERE kind='theme'")).rows[0].n).toBe(0);
});
