import sharp from 'sharp';
import {dispatchProductAuthoring,collectUnusedProductImages} from '../lib/server/member/product-editorial';
import {themeReadingPresentation} from '../lib/server/theme-reading-presentation';
import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {migrateMemberDatabase} from '../lib/server/member/migrate';
import {createKnowledgeFoundationService} from '../lib/server/knowledge-foundation';
import {createKnowledgeImports} from '../lib/server/knowledge-import';
import {createWebKnowledgeImports,webImportPrincipal} from '../lib/server/knowledge-web-import';
import {createThemeAuthoringReader} from '../lib/server/knowledge-theme-authoring-reader';
import {themeAuthoringGuide} from '../lib/server/knowledge-theme-authoring-guide';
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
const cfg=reviewConfigSchema.parse({projectId:'theme-registration-fixture',billingTier:'free',verifiedAt:new Date().toISOString(),model:'gemini-3.1-flash-lite',rpm:15,tokensPerMinute:500000,requestsPerDay:80,requestsPerMonth:2400,inputTokensPerDay:250000,outputTokensPerDay:160000,inputTokensPerMonth:7500000,outputTokensPerMonth:4800000,apiKeyFile:'/unused',allowedUsers:[owner]});
async function wake(){await pool.query("UPDATE knowledge_missions.theme_registrations SET next_attempt=clock_timestamp() WHERE state IN('saved','processing')");}
beforeAll(async()=>{
 vi.stubEnv('COMMUNITY_ENABLED','1');vi.stubEnv('SITE_OPERATIONS_ENABLED','1');
 expect(process.env.MEMBER_TEST_CONTAINER).toMatch(/^gk-member-test-/);
 expect((await pool.query('SELECT current_database() name')).rows[0].name).toBe('graph_member_test');
 expect((await knowledge.query('SELECT current_database() name')).rows[0].name).toBe('plunode_knowledge75_test_capsule_share');
 await migrateMemberDatabase(pool,...Array(26).fill(true));
 const before=(await pool.query('SELECT name,checksum FROM member_migration ORDER BY name')).rows;
 await migrateMemberDatabase(pool,...Array(27).fill(true));await migrateMemberDatabase(pool,...Array(27).fill(true));
 expect((await pool.query('SELECT name,checksum FROM member_migration WHERE name<>$1 ORDER BY name',['036-theme-registration.sql'])).rows).toEqual(before);
 expect((await pool.query('SELECT count(*)::int n FROM member_migration')).rows[0].n).toBe(37);
 const baseline=(await pool.query('SELECT name,checksum FROM member_migration ORDER BY name')).rows;
 await migrateMemberDatabase(pool,...Array(29).fill(true));await migrateMemberDatabase(pool,...Array(29).fill(true));
 expect((await pool.query("SELECT name,checksum FROM member_migration WHERE name NOT IN('037-featured-themes.sql','038-theme-updates.sql') ORDER BY name")).rows).toEqual(baseline);
 expect((await pool.query('SELECT count(*)::int n FROM member_migration')).rows[0].n).toBe(39);
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
it('publishes operator information with verified sources and zero AI calls even when AI is paused',async()=>{
 await createReviewQueue(pool).heartbeat(cfg);await pool.query("UPDATE member_knowledge.review_projects SET paused_until=clock_timestamp()+interval '1 day' WHERE project_id=$1",[cfg.projectId]);
 const pkg={format:'plunode-knowledge-package',schemaVersion:1,namespace:'theme.fixture',packageId:'a-device',revision:1,entityPins:[{id:'a',revision:1}],entities:[{id:'b',content:{name:'B',kind:'instrument'}}],sources:[{id:'s',content:{title:'Instrument source',url:'https://example.org/instrument'}}],items:[{key:'connection',operation:'create-relation',record:{kind:'relation',subjectId:'a',objectId:'b',relation:'operates',assertion:'A operates B.',times:[{id:'event',time:{kind:'calendar',from:'2030-01-01',meaning:'point'}}],evidence:[{id:'proof',source:{id:'s',revision:1},locator:'Instrument',excerpt:'A operates B.'}]}}]};
 const v={...input(),recordPins:[],package:pkg,timeline:{version:1,axes:[{id:'calendar',kind:'calendar',label:'Events'}],placements:[{recordId:'item:connection',timeId:'event',axisId:'calendar'}],insets:[]}};await service.submit(owner,v);await service.recoverOne();expect(await service.status(owner,v.requestId)).toMatchObject({state:'processing',theme:null,receipt:{state:'processing'}});
 const dispatch=vi.fn(async()=>({state:'received' as const,status:200,raw:{responseId:'fixture',modelVersion:cfg.model,usageMetadata:{promptTokenCount:100,candidatesTokenCount:20,thoughtsTokenCount:0,totalTokenCount:120},candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({suitability:'legitimate',support:'supported',reason:'Source supports this fact.'})}]}}]}}));
 await inbox.processNext(cfg,dispatch);expect(dispatch).not.toHaveBeenCalled();
 expect((await pool.query('SELECT count(*)::int n FROM knowledge_import.attempts')).rows[0].n).toBe(0);
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

async function theme(){const v=input();await service.submit(owner,v);await service.recoverOne();return (await service.status(owner,v.requestId)).theme!;}
const edit=(t:{id:string;revision:number},changes:Record<string,unknown>={title:'Aをより詳しくたどる'})=>({requestId:randomUUID(),target:{id:t.id,revision:t.revision},changes,reason:'Improve the same theme from ChatGPT'});
it('updates the same theme, keeps the original snapshot, recovers a replay after the target advanced and reads source URLs',async()=>{
 const t=await theme(),v=edit(t);await service.submit(owner,v);await service.recoverOne();
 const result=await service.status(owner,v.requestId);expect(result).toMatchObject({state:'published',operation:'update',theme:{id:t.id,revision:2,title:v.changes.title}});
 expect((await foundation().get({kind:'reader',id:'fixture'},'theme',t.id,1)).content.title).toBe('Aをたどる');
 expect((await foundation().get({kind:'reader',id:'fixture'},'theme',t.id,2)).content.recordPins).toEqual([{id:'baseline',revision:1}]);
 expect(await service.submit(owner,v)).toMatchObject({replayed:true});
 const reader=createThemeAuthoringReader(knowledge,'https://plunode.net');
 expect((await reader.read('https://plunode.net/?ktheme='+encodeURIComponent(t.id))).snapshot.sources[0].content.url).toBe('https://example.org/base');
 expect((await reader.find('theme','より詳しく',0)).items.map(i=>i.id)).toEqual([t.id]);
 const guide=JSON.stringify(themeAuthoringGuide());expect(guide).toContain('package.sources[].content.url');expect(guide).toContain('https://science.nasa.gov/mission/webb/launch/');
});
it('appends existing records, reorders and removes only membership, retaining common data and prior theme versions',async()=>{
 const t=await theme();
 await foundation().execute({kind:'operator',id:'fixture'},{action:'create-bundle',requestId:randomUUID(),entityPins:[{id:'a',revision:1}],sources:[{id:'extra-source',content:{title:'Second source',url:'https://example.org/extra'}}],records:[{id:'extra',content:{kind:'note',subjectId:'a',assertion:'A works internationally.',evidence:[{id:'proof',source:{id:'extra-source',revision:1},locator:'Work',excerpt:'A works internationally.'}]}}],reason:'Second published fact'});
 const v={...edit(t,{}),recordPins:[{id:'extra',revision:1}],recordOrder:['extra','baseline']};await service.submit(owner,v);await service.recoverOne();
 expect((await foundation().get({kind:'reader',id:'fixture'},'theme',t.id)).content.recordPins.map(p=>p.id)).toEqual(['extra','baseline']);
 const remove={...edit({...t,revision:2},{}),removeRecordIds:['baseline']};await service.submit(owner,remove);await service.recoverOne();
 expect((await foundation().get({kind:'reader',id:'fixture'},'theme',t.id)).content.recordPins).toEqual([{id:'extra',revision:1}]);
 expect((await foundation().get({kind:'reader',id:'fixture'},'theme',t.id,1)).content.recordPins).toEqual([{id:'baseline',revision:1}]);
 expect((await foundation().get({kind:'reader',id:'fixture'},'record','baseline')).revision).toBe(1);
});
it('reports concurrent edits and revocation instead of overwriting the current theme',async()=>{
 const t=await theme(),a=edit(t),b=edit(t,{description:'Concurrent intent'});await service.submit(owner,a);await service.submit(owner,b);
 await service.recoverOne();await service.recoverOne();expect(await service.status(owner,b.requestId)).toMatchObject({state:'needs-changes',theme:null});
 expect((await foundation().get({kind:'reader',id:'fixture'},'theme',t.id)).revision).toBe(2);
 await expect(service.submit(owner,edit(t))).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 const v=edit({...t,revision:2});await service.submit(owner,v);await service.cancel(owner,v.requestId);expect(await service.status(owner,v.requestId)).toMatchObject({state:'cancelled'});
 expect((await foundation().get({kind:'reader',id:'fixture'},'theme',t.id)).revision).toBe(2);
});
it('recovers a committed edit after a lost acknowledgement without a second revision',async()=>{
 const t=await theme(),v=edit(t);await service.submit(owner,v);
 service=createThemeRegistrations(pool,knowledge,web,inbox,{afterThemeCommit:async()=>{throw Error('ACK lost');}});await service.recoverOne();
 expect(await service.status(owner,v.requestId)).toMatchObject({state:'published',theme:{id:t.id,revision:2}});
 expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.revisions WHERE kind='theme' AND id=$1",[t.id])).rows[0].n).toBe(2);
});
it('accepts a new source URL and theme-only background without partially changing the theme during source verification',async()=>{
 const t=await theme();await createReviewQueue(pool).heartbeat(cfg);
 const pkg={format:'plunode-knowledge-package',schemaVersion:1,namespace:'theme.direct',packageId:'background',revision:1,sources:[{id:'source',content:{title:'Independent public source',url:'https://example.org/theme-background',language:'en'}}],items:[{key:'background',operation:'add-information',about:{kind:'theme',id:t.id,revision:1},themes:[{id:t.id,revision:1}],record:{kind:'note',aboutTheme:t.id,assertion:'This theme places A in its wider context.',evidence:[{id:'proof',source:{id:'source',revision:1},locator:'Context paragraph',excerpt:'A has a wider context.'}]}}]};
 const v={...edit(t,{}),package:pkg};await service.submit(owner,v);await service.recoverOne();
 const dispatch=vi.fn(async()=>({state:'received' as const,status:200,raw:{responseId:'fixture',modelVersion:cfg.model,usageMetadata:{promptTokenCount:100,candidatesTokenCount:20,thoughtsTokenCount:0,totalTokenCount:120},candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({suitability:'legitimate',support:'supported',reason:'The cited source supports this background.'})}]}}]}}));
 await inbox.processNext(cfg,dispatch);expect(dispatch).not.toHaveBeenCalled();
 expect((await pool.query('SELECT count(*)::int n FROM knowledge_import.attempts')).rows[0].n).toBe(0);
 expect((await foundation().get({kind:'reader',id:'fixture'},'theme',t.id)).revision).toBe(1);
 await pool.query("UPDATE knowledge_import.items SET state='published' WHERE state='applied'");await wake();await service.recoverOne();
 const result=await service.status(owner,v.requestId);expect(result,JSON.stringify(result)).toMatchObject({state:'published',theme:{id:t.id,revision:2}});
 const snapshot=await foundation().resolveTheme({kind:'reader',id:'fixture'},t.id);expect(snapshot.snapshot.records).toHaveLength(2);
 expect(snapshot.snapshot.sources.map(s=>s.content.url)).toContain('https://example.org/theme-background');
});

it('registers generic theme editorial data and image via normal intake, retains old editions and protects pending/published assets from GC',async()=>{
 await migrateMemberDatabase(pool,...Array(31).fill(true));await migrateMemberDatabase(pool,...Array(31).fill(true));
 const binary=await sharp({create:{width:240,height:120,channels:4,background:{r:10,g:90,b:120,alpha:.4}}}).png().toBuffer();
 const image=await dispatchProductAuthoring(pool,owner,{action:'upload-product-image',requestId:randomUUID(),role:'illustration',provenance:{id:'editorial-fixture',kind:'original',credit:'',terms:'Fixture only',creditDisplay:'internal'},alt:{ja:'試験の挿絵',en:'Test illustration'},base64:binary.toString('base64')});
 const id=String(image.imageId),v={...input(),presentation:[{locale:'ja',hook:'Aは、どんな組織？',lead:'資料からAを読む。',imageId:id,entityNotes:[{target:{id:'a',revision:1},text:'Aという組織。',supportingRecords:[{id:'baseline',revision:1}]}],records:[{target:{id:'baseline',revision:1},shortTitle:'Aの説明'}]}]};
 await service.submit(owner,v);await pool.query("UPDATE product_image_asset SET created_at=clock_timestamp()-interval '8 days' WHERE id=$1",[id]);await collectUnusedProductImages(pool);expect((await pool.query('SELECT 1 FROM product_image_asset WHERE id=$1',[id])).rowCount).toBe(1);
 await service.recoverOne();const status=await service.status(owner,v.requestId);expect(status).toMatchObject({state:'published',theme:{revision:1}});
 const first=await foundation().resolveTheme({kind:'reader',id:'fixture'},status.theme!.id);expect(first.theme.content.reading?.[0].image).toMatchObject({id,width:240,height:120});
 expect(themeReadingPresentation(first.theme,'ja',first.snapshot)).toMatchObject({hook:v.presentation[0].hook,entityNotes:[expect.objectContaining({text:'Aという組織。'})]});
 expect((await pool.query('SELECT published FROM theme_editorial_asset_reference WHERE request_id=$1',[v.requestId])).rows[0].published).toBe(true);
 const cleared=edit(status.theme!,{presentation:[]});await service.submit(owner,cleared);await service.recoverOne();const latest=await foundation().resolveTheme({kind:'reader',id:'fixture'},status.theme!.id);
 expect(latest.theme.revision).toBe(2);expect(latest.theme.content.reading).toEqual([]);expect(themeReadingPresentation(latest.theme,'ja',latest.snapshot)).toBeNull();expect(first.theme.content.reading?.[0].image?.id).toBe(id);
 await pool.query("UPDATE product_asset_maintenance SET last_run=clock_timestamp()-interval '2 days'");await collectUnusedProductImages(pool);expect((await pool.query('SELECT 1 FROM product_image_asset WHERE id=$1',[id])).rowCount).toBe(1);
 const bad={...edit({id:latest.theme.id,revision:2},{}),changes:{presentation:[{locale:'ja',hook:'Invalid',lead:'',records:[{target:{id:'not-in-theme',revision:1},shortTitle:'Foreign record'}]}]}};
 await service.submit(owner,bad);await service.recoverOne();expect(await service.status(owner,bad.requestId)).toMatchObject({state:'needs-changes',theme:null});
 expect((await foundation().get({kind:'reader',id:'fixture'},'theme',latest.theme.id)).revision).toBe(2);
});

it('does not treat a generic web delivery or namespace as operator theme authority',async()=>{
 const pkg={format:'plunode-knowledge-package',schemaVersion:1,namespace:'theme.fixture',packageId:'not-a-theme',revision:1,entityPins:[{id:'a',revision:1}],sources:[{id:'s',content:{title:'Source',url:'https://example.org/other'}}],items:[{key:'other',operation:'add-information',about:{kind:'entity',id:'a',revision:1},record:{kind:'note',subjectId:'a',assertion:'A has another function.',evidence:[{id:'proof',source:{id:'s',revision:1},locator:'Body',excerpt:'A has another function.'}]}}]};
 await createReviewQueue(pool).heartbeat(cfg);await pool.query('UPDATE member_knowledge.review_projects SET paused_until=NULL WHERE project_id=$1',[cfg.projectId]);
 await web.deliver(owner,randomUUID(),pkg);
 const dispatch=vi.fn(async()=>({state:'not-sent' as const}));await inbox.processNext(cfg,dispatch);expect(dispatch).toHaveBeenCalledTimes(1);
 expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.objects WHERE kind='record'")).rows[0].n).toBe(1);
});
it('blocks operator intake on a source failure, retaining its receipt with no AI attempt',async()=>{
 const {SourceCheckError}=await import('../lib/server/knowledge-source-verification');
 inbox=createKnowledgeImports(pool,knowledge,(id,c)=>webImportPrincipal(pool,id,c),{verify:async()=>{throw new SourceCheckError('Fixture 403',true);}});
 web=createWebKnowledgeImports(pool,()=>inbox);service=createThemeRegistrations(pool,knowledge,web,inbox);
 const pkg={format:'plunode-knowledge-package',schemaVersion:1,namespace:'theme.fixture',packageId:'source-fails',revision:1,entityPins:[{id:'a',revision:1}],sources:[{id:'s',content:{title:'Source',url:'https://example.org/blocked'}}],items:[{key:'blocked',operation:'add-information',about:{kind:'entity',id:'a',revision:1},record:{kind:'note',subjectId:'a',assertion:'Blocked source fact.',evidence:[{id:'proof',source:{id:'s',revision:1},locator:'Body',excerpt:'Blocked source fact.'}]}}]};
 const v={...input(),recordPins:[],package:pkg};await service.submit(owner,v);await service.recoverOne();
 const dispatch=vi.fn(async()=>({state:'not-sent' as const}));await inbox.processNext(cfg,dispatch);expect(dispatch).not.toHaveBeenCalled();
 expect(await service.status(owner,v.requestId)).toMatchObject({state:'processing',theme:null,receipt:{items:[{key:'blocked',state:'retry'}]}});
 expect((await pool.query('SELECT count(*)::int n FROM knowledge_import.attempts')).rows[0].n).toBe(0);
});

it('reuses an exact existing record on operator update without AI or a duplicate record',async()=>{
 const t=await theme();
 const pkg={format:'plunode-knowledge-package',schemaVersion:1,namespace:'theme.fixture',packageId:'duplicate',revision:1,entityPins:[{id:'a',revision:1}],sourcePins:[{id:'base',revision:1}],items:[{key:'same',operation:'add-information',about:{kind:'entity',id:'a',revision:1},record:{kind:'note',subjectId:'a',assertion:'A is an organization.',evidence:[{id:'base',source:{id:'base',revision:1},locator:'Name',excerpt:'A is an organization.'}]}}]};
 const v={...edit(t,{description:'Updated via the same theme'}),package:pkg};await service.submit(owner,v);await service.recoverOne();
 const dispatch=vi.fn(async()=>({state:'not-sent' as const}));await inbox.processNext(cfg,dispatch);expect(dispatch).not.toHaveBeenCalled();
 await pool.query("UPDATE knowledge_import.items SET state='published' WHERE state='applied'");await wake();await service.recoverOne();
 expect(await service.status(owner,v.requestId)).toMatchObject({state:'published',theme:{id:t.id,revision:2}});
 expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.objects WHERE kind='record'")).rows[0].n).toBe(1);
 expect((await foundation().get({kind:'reader',id:'fixture'},'theme',t.id,1)).content.description).toBe('資料からたどるテーマ');
});
