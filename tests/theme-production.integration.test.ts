import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {Pool} from 'pg';
import sharp from 'sharp';
import {productAuthoringCommandSchema} from '../lib/domain/product-authoring';
import {randomUUID} from 'node:crypto';
import {migrateMemberDatabase} from '../lib/server/member/migrate';
import {createKnowledgeFoundationService} from '../lib/server/knowledge-foundation';
import {createKnowledgeImports} from '../lib/server/knowledge-import';
import {createWebKnowledgeImports,webImportPrincipal} from '../lib/server/knowledge-web-import';
import {createThemeRegistrations} from '../lib/server/knowledge-theme-registration';
import {createThemeTranslationAuthoring} from '../lib/server/knowledge-theme-translation';
import {createThemeQualityGuides} from '../lib/server/member/theme-quality-guide';
import {dispatchProductAuthoring} from '../lib/server/member/product-editorial';
import {migrateKnowledgeTranslations} from '../lib/server/knowledge-translation-migrate';
import {migrateKnowledgeIdentities} from '../lib/server/knowledge-identity-migrate';
import {ensureKnowledgePublicationSchema} from '../lib/server/knowledge-publication';
import {createThemeProductions} from '../lib/server/theme-production';
import {themeProductionRuntime} from '../lib/server/theme-production-runtime';
import {guardThemeProductionRequest} from '../lib/server/theme-production-fence';
import {themeProductionCommandSchema,themeProductionResponseSchema,type ProductionSubmissionCommand} from '../lib/domain/theme-production';

type Case={id:string;version:number;phase:string;status:string;completed:boolean;progress:{brief:string;scope:string;artifacts:Record<string,unknown>;unfinished:string[];blockers:string[]};theme:{id:string;revision:number}|null;evaluationTarget:{digest:string;guide:{revision:number}};lastWholeThemeAssessment:{current:boolean;result:string;contentCurrent:boolean;workCurrent:boolean}|null;pendingSubmissionCount:number;submissions:{id:string;state:string}[];savedSubmission?:{wire:string;command:ProductionSubmissionCommand}};
type Response={outcome:string;case:Case|null;leaseToken?:string;submissionId?:string};
const pool=new Pool({connectionString:process.env.MEMBER_DATABASE_URL,max:10}),knowledge=new Pool({connectionString:process.env.KNOWLEDGE_CAPSULE_TEST_DATABASE_URL,max:5});
const owner=randomUUID(),other=randomUUID(),actor={kind:'operator' as const,id:'production-fixture'};
let registrations:ReturnType<typeof createThemeRegistrations>,translations:ReturnType<typeof createThemeTranslationAuthoring>,cases:ReturnType<typeof createThemeProductions>,foundation:ReturnType<typeof createKnowledgeFoundationService>;
let lostAck=false,delay:Promise<void>|null=null;
const progress={brief:'読者の問いから制作する隔離案件',scope:'公開資料に基づく背景と着想',artifacts:{draft:'再開に必要な原稿全文',themeImage:{state:'not-needed'}},unfinished:[],blockers:[]};
const createCommand=()=>({action:'submit-theme' as const,requestId:randomUUID(),title:'New production fixture',description:'Not live',recordPins:[{id:'baseline',revision:1}]});
const execute=async(command:unknown,who=owner)=>themeProductionResponseSchema.parse(await cases.execute(who,themeProductionCommandSchema.parse(command))) as unknown as Response;
async function read(id:string){return (await execute({action:'get-theme-production',caseId:id})).case!;}
async function begin(phase:'production'|'review'='production',existing=false):Promise<{caseId:string;executionId:string;leaseToken:string}>{
 const created=await execute({action:'create-theme-production',requestId:randomUUID(),phase,progress,...(existing?{theme:{id:'theme',revision:1}}:{})});
 const executionId=randomUUID(),claimed=await execute({action:'claim-theme-production',requestId:randomUUID(),caseId:created.case!.id,phase,executionId});
 return {caseId:created.case!.id,executionId,leaseToken:claimed.leaseToken!};
}
async function fenced(run:Awaited<ReturnType<typeof begin>>,fields:Record<string,unknown>){const c=await read(run.caseId);return execute({...run,requestId:randomUUID(),expectedVersion:c.version,...fields});}
async function prepare(run:Awaited<ReturnType<typeof begin>>,command:unknown){return fenced(run,{action:'prepare-theme-production-submission',command});}
async function send(run:Awaited<ReturnType<typeof begin>>,submissionId:string){return fenced(run,{action:'dispatch-theme-production-submission',submissionId});}
async function assess(run:Awaited<ReturnType<typeof begin>>,result='pass',exceptions:unknown[]=[]){const c=await read(run.caseId);return fenced(run,{action:'update-theme-production',operation:'assess',assessment:{scope:'whole-theme',targetDigest:c.evaluationTarget.digest,guideRevision:c.evaluationTarget.guide.revision,result,summary:'反映後のテーマ全体を読者の流れで評価した。',exceptions}});}
async function complete(run:Awaited<ReturnType<typeof begin>>){await assess(run);return fenced(run,{action:'update-theme-production',operation:'complete'});}
async function expire(id:string){await pool.query("UPDATE theme_production.cases SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[id]);}
async function resume(run:Awaited<ReturnType<typeof begin>>,phase:'production'|'review'){
 const executionId=randomUUID(),c=await execute({action:'claim-theme-production',requestId:randomUUID(),caseId:run.caseId,executionId,phase});return {...run,executionId,leaseToken:c.leaseToken!};
}
async function ordinaryUpdate(){await registrations.submit(owner,{requestId:randomUUID(),target:{id:'theme',revision:1},changes:{title:'Updated source theme'},reason:'Ordinary manual edit'});await registrations.recoverOne();}
async function ordinarySend(who:string,command:ProductionSubmissionCommand){
 if(delay)await delay;await guardThemeProductionRequest(pool,who,command);
 const {action,...raw}=command;
 if(action==='submit-theme'||action==='update-theme')return registrations.submit(who,raw);
 if(action==='submit-translation')return translations.submit(who,raw as Parameters<typeof translations.submit>[1]);
 if(action==='save-product'||action==='upload-product-image')return dispatchProductAuthoring(pool,who,command);
 if(action==='cancel-theme')return registrations.cancel(who,command.requestId);
 if(action==='cancel-translation')return translations.cancel(who,command.requestId);
 if(action==='amend-theme-items')return registrations.amend(who,raw);
 return registrations.controlRetry(who,raw);
}
beforeAll(async()=>{
 expect(process.env.MEMBER_TEST_CONTAINER).toMatch(/^gk-member-test-/);expect((await pool.query('SELECT current_database() n')).rows[0].n).toBe('graph_member_test');expect((await knowledge.query('SELECT current_database() n')).rows[0].n).toBe('plunode_knowledge75_test_capsule_share');
 vi.stubEnv('COMMUNITY_ENABLED','1');vi.stubEnv('SITE_OPERATIONS_ENABLED','1');vi.stubEnv('KNOWLEDGE_MISSIONS_ENABLED','1');vi.stubEnv('KNOWLEDGE_SUBMISSIONS_ENABLED','1');vi.stubEnv('KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED','1');vi.stubEnv('SITE_OPERATOR_USER_IDS',owner+','+other);
 await migrateMemberDatabase(pool,...Array(34).fill(true));const old=(await pool.query('SELECT name,checksum FROM member_migration ORDER BY name')).rows;
 await migrateMemberDatabase(pool,...Array(35).fill(true));await migrateMemberDatabase(pool,...Array(35).fill(true));expect((await pool.query("SELECT name,checksum FROM member_migration WHERE name<>'044-theme-production.sql' ORDER BY name")).rows).toEqual(old);
},30000);
beforeEach(async()=>{
 lostAck=false;delay=null;await pool.query('TRUNCATE theme_production.cases,knowledge_missions.theme_registrations,knowledge_missions.web_deliveries,knowledge_missions.web_importers CASCADE');await pool.query('TRUNCATE knowledge_import.packages,member_knowledge.submissions,product_editorial_request,product_editorial_version CASCADE');
 await pool.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt",active,locale) VALUES($1,$2,$3,true,now(),now(),true,$7),($4,$5,$6,true,now(),now(),true,$7) ON CONFLICT(id) DO UPDATE SET active=true',[owner,'Operator','production-owner@example.invalid',other,'Other','production-other@example.invalid','ja']);
 const guides=createThemeQualityGuides(pool),g=await guides.read(owner);if(!g.revision)await guides.update(owner,{requestId:randomUUID(),expectedRevision:0,markdown:`# 隔離品質ガイド

第10節：独立した全体評価。`,reason:'Isolated fixture'});
 await knowledge.query('DROP SCHEMA IF EXISTS knowledge75 CASCADE');foundation=createKnowledgeFoundationService(knowledge);
 await foundation.execute(actor,{action:'create-bundle',requestId:randomUUID(),entities:[{id:'a',content:{name:'A',kind:'organization'}}],sources:[{id:'s',content:{title:'Source',url:'https://example.org/source'}}],records:[{id:'baseline',content:{kind:'note',subjectId:'a',assertion:'A is a fixture.',evidence:[{id:'q',source:{id:'s',revision:1},locator:'Body',excerpt:'A is a fixture.'}]}}],reason:'Isolated source data'});
 await migrateKnowledgeTranslations(knowledge);await migrateKnowledgeIdentities(knowledge);await ensureKnowledgePublicationSchema(knowledge);
 await foundation.execute(actor,{action:'create-theme',requestId:randomUUID(),id:'theme',title:'Aの背景',recordPins:[{id:'baseline',revision:1}],reason:'Isolated existing theme'});
 const imports=createKnowledgeImports(pool,knowledge,(id,c)=>webImportPrincipal(pool,id,c)),web=createWebKnowledgeImports(pool,()=>imports);registrations=createThemeRegistrations(pool,knowledge,web,imports);translations=createThemeTranslationAuthoring(pool,knowledge,'https://plunode.net',id=>registrations.authorize(id));
 cases=createThemeProductions(pool,{environment:'production',origin:'https://plunode.net',authorize:id=>registrations.authorize(id),...themeProductionRuntime(pool,knowledge,'https://plunode.net',registrations,translations),send:ordinarySend,afterDispatch:async()=>{if(lostAck){lostAck=false;throw Error('Response lost after normal intake commit');}}});
},30000);
afterAll(async()=>{await pool.end();await knowledge.end();vi.unstubAllEnvs();});

it('never creates a case from get/claim and admits only one concurrent execution and one active case',async()=>{
 expect(await execute({action:'get-theme-production'})).toMatchObject({outcome:'none',case:null});expect(await execute({action:'claim-theme-production',requestId:randomUUID(),phase:'review',executionId:randomUUID()})).toMatchObject({outcome:'none'});
 const created=await execute({action:'create-theme-production',requestId:randomUUID(),progress});
 const claims=await Promise.all([randomUUID(),randomUUID()].map(executionId=>execute({action:'claim-theme-production',requestId:randomUUID(),phase:'production',executionId,caseId:created.case!.id})));
 expect(claims.map(c=>c.outcome).sort()).toEqual(['busy','claimed']);expect((await pool.query('SELECT count(*)::int n FROM theme_production.cases')).rows[0].n).toBe(1);
 await expect(execute({action:'create-theme-production',requestId:randomUUID(),progress})).rejects.toMatchObject({code:'PRODUCTION_ACTIVE_CASE'});
});
it('checks owner, environment, live permissions, state revision and expired/replaced execution fences',async()=>{
 const run=await begin();const c=await read(run.caseId);
 await expect(execute({action:'get-theme-production',caseId:run.caseId},other)).rejects.toMatchObject({code:'NOT_FOUND'});
 await expect(execute({...run,action:'update-theme-production',requestId:randomUUID(),expectedVersion:c.version-1,operation:'save'})).rejects.toMatchObject({code:'PRODUCTION_VERSION_CONFLICT'});
 await expire(run.caseId);await expect(fenced(run,{action:'update-theme-production',operation:'save'})).rejects.toMatchObject({code:'PRODUCTION_LEASE_EXPIRED'});
 const next=await resume(run,'production');expect(next.leaseToken).not.toBe(run.leaseToken);await expect(fenced(run,{action:'update-theme-production',operation:'save'})).rejects.toMatchObject({code:'PRODUCTION_LEASE_EXPIRED'});
 await fenced(next,{action:'update-theme-production',operation:'renew',leaseSeconds:1200});
 await pool.query('UPDATE "user" SET active=false WHERE id=$1',[owner]);await expect(read(run.caseId)).rejects.toMatchObject({code:'OPERATOR_REQUIRED'});await pool.query('UPDATE "user" SET active=true WHERE id=$1',[owner]);
 await pool.query("UPDATE theme_production.cases SET environment='beta' WHERE id=$1",[run.caseId]);await expect(read(run.caseId)).rejects.toMatchObject({code:'NOT_FOUND'});
});
it('persists exact request content before submission and recovers a lost ACK without creating another theme',async()=>{
 const run=await begin(),command=createCommand(),prepared=await prepare(run,command);const id=prepared.submissionId!;
 expect((await pool.query('SELECT count(*)::int n FROM knowledge_missions.theme_registrations')).rows[0].n).toBe(0);
 const saved=(await execute({action:'get-theme-production',caseId:run.caseId,submissionId:id})).case!.savedSubmission!;expect(JSON.parse(saved.wire)).toEqual(saved.command);expect(saved.command.requestId).toBe(command.requestId);
 await expect(ordinarySend(owner,saved.command)).rejects.toMatchObject({code:'PRODUCTION_FENCE_REQUIRED'});
 lostAck=true;await expect(send(run,id)).rejects.toThrow('Response lost');expect((await pool.query('SELECT count(*)::int n FROM knowledge_missions.theme_registrations')).rows[0].n).toBe(1);
 await expire(run.caseId);const next=await resume(run,'production');await send(next,id);await registrations.recoverOne();const current=await read(run.caseId);expect(current.pendingSubmissionCount).toBe(0);expect(current.theme?.revision).toBe(1);expect(current.completed).toBe(false);
 expect((await pool.query('SELECT count(*)::int n FROM knowledge_missions.theme_registrations')).rows[0].n).toBe(1);expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.objects WHERE kind='theme'")).rows[0].n).toBe(2);
 expect((await pool.query('SELECT command_wire FROM theme_production.submissions WHERE id=$1',[id])).rows[0].command_wire).toBe(saved.wire);
 await expect(pool.query('UPDATE theme_production.submissions SET command_wire=$2 WHERE id=$1',[id,'{}'])).rejects.toThrow('immutable');
});
it('rejects a send delayed beyond expiry and allows takeover before a delayed old write, while retaining the immutable send',async()=>{
 const run=await begin(),prepared=await prepare(run,createCommand());let release!:()=>void;delay=new Promise<void>(r=>{release=r;});
 const sending=send(run,prepared.submissionId!);while((await pool.query('SELECT dispatches FROM theme_production.submissions WHERE id=$1',[prepared.submissionId])).rows[0].dispatches===0)await new Promise(r=>setTimeout(r,5));
 await expire(run.caseId);const attempted=await execute({action:'claim-theme-production',requestId:randomUUID(),executionId:randomUUID(),phase:'production',caseId:run.caseId});expect(attempted.outcome).toBe('claimed');
 release();await expect(sending).rejects.toMatchObject({code:'PRODUCTION_LEASE_EXPIRED'});delay=null;expect((await pool.query('SELECT count(*)::int n FROM knowledge_missions.theme_registrations')).rows[0].n).toBe(0);
 const next={...run,executionId:(attempted.case as unknown as {lease:{executionId:string}}).lease.executionId,leaseToken:attempted.leaseToken!};await send(next,prepared.submissionId!);expect((await pool.query('SELECT count(*)::int n FROM knowledge_missions.theme_registrations')).rows[0].n).toBe(1);
});
it('keeps review phase across publication waits and requires a fresh whole-theme evaluation after revision',async()=>{
 const run=await begin('review',true),prepared=await prepare(run,{action:'update-theme',requestId:randomUUID(),target:{id:'theme',revision:1},changes:{description:'Reader-facing revised background'},reason:'Review correction'});await send(run,prepared.submissionId!);
 const waiting=await read(run.caseId);expect(waiting.phase).toBe('review');expect(waiting.status).toBe('waiting-publication');await expect(assess(run)).rejects.toMatchObject({code:'PRODUCTION_PUBLICATION_PENDING'});
 await registrations.recoverOne();const applied=await read(run.caseId);expect(applied.phase).toBe('review');expect(applied.theme?.revision).toBe(2);await expect(fenced(run,{action:'update-theme-production',operation:'complete'})).rejects.toMatchObject({code:'PRODUCTION_ASSESSMENT_STALE'});
 expect((await complete(run)).case?.completed).toBe(true);
});
it('hands production to a separate review invocation and does not treat production checks or handoff as approval',async()=>{
 const run=await begin('production',true);await expect(assess(run)).rejects.toMatchObject({code:'PRODUCTION_ASSESSMENT_REQUIRED'});
 const handoff=await fenced(run,{action:'update-theme-production',operation:'handoff'});expect(handoff.case).toMatchObject({phase:'review',completed:false});
 await expect(execute({action:'claim-theme-production',requestId:randomUUID(),caseId:run.caseId,phase:'review',executionId:run.executionId})).rejects.toMatchObject({code:'PRODUCTION_INDEPENDENT_RUN_REQUIRED'});
 const reviewer=await resume(run,'review');expect((await complete(reviewer)).case?.completed).toBe(true);
});
it.each(['theme','translation','associated-product','guide'])('invalidates historical pass when %s changes, even when the Theme revision is unchanged',async mode=>{
 const run=await begin('review',true);await complete(run);const old=await read(run.caseId);expect(old.completed).toBe(true);
 if(mode==='theme')await ordinaryUpdate();
 if(mode==='translation')await translations.submit(owner,{requestId:randomUUID(),theme:{id:'theme',revision:1},translation:{target:{kind:'theme',id:'theme',revision:1,field:'title'},language:'en',text:'The background of A',expectedRevision:0},attribution:'anonymous'});
 if(mode==='associated-product')await dispatchProductAuthoring(pool,owner,{action:'save-product',requestId:randomUUID(),expectedRevision:0,offers:[],product:{id:'fixture-product',workId:'',author:'',edition:'',title:'Reader edition',language:'ja',metadataSource:'https://example.org/product'},reason:{ja:'理解を深める',en:'Read further'},appliesTo:[{kind:'entity',id:'a'}]});
 if(mode==='guide'){const guides=createThemeQualityGuides(pool),current=await guides.read(owner);await guides.update(owner,{requestId:randomUUID(),expectedRevision:current.revision,markdown:'# Revised isolated current guide',reason:'Fixture guide revision'});}
 const stale=await read(run.caseId);expect(stale.completed).toBe(false);expect(stale.status).toBe('needs-review');expect(stale.lastWholeThemeAssessment?.current).toBe(false);const skipped=await execute({action:'claim-theme-production',requestId:randomUUID(),caseId:run.caseId,executionId:randomUUID(),phase:'production'});expect(skipped.outcome).toBe('phase-mismatch');expect((await read(run.caseId)).version).toBe(stale.version);if(mode!=='theme')expect(stale.theme?.revision).toBe(1);
 await expect(execute({action:'create-theme-production',requestId:randomUUID(),progress})).rejects.toMatchObject({code:'PRODUCTION_REVIEW_REQUIRED'});
 const reviewer=await resume(run,'review');expect((await complete(reviewer)).case?.completed).toBe(true);
});
it('checkpoint replay preserves current state, exact operation IDs cannot change input and pending sends cannot be withdrawn as success',async()=>{
 const run=await begin('production',true),c=await read(run.caseId),command={...run,action:'update-theme-production',requestId:randomUUID(),expectedVersion:c.version,operation:'save',progress:{...progress,artifacts:{draft:'Saved current manuscript'}}};
 const saved=await execute(command);expect(await execute(command)).toMatchObject({replayed:true,case:{version:saved.case!.version}});await expect(execute({...command,progress})).rejects.toMatchObject({code:'REQUEST_CHANGED'});
 const prepared=await prepare(run,{action:'update-theme',requestId:randomUUID(),target:{id:'theme',revision:1},changes:{title:'Pending'},reason:'Test'});
 await expect(fenced(run,{action:'update-theme-production',operation:'handoff'})).rejects.toMatchObject({code:'PRODUCTION_PUBLICATION_PENDING'});
 await fenced(run,{action:'update-theme-production',operation:'withdraw-submission',submissionId:prepared.submissionId,reason:'Unsent draft replaced; nothing was published'});expect((await read(run.caseId)).submissions).toEqual([]);expect((await execute({action:'get-theme-production',caseId:run.caseId,submissionId:prepared.submissionId})).case?.savedSubmission).toMatchObject({state:'withdrawn'});
 await expect(send(run,prepared.submissionId!)).rejects.toMatchObject({code:'PRODUCTION_SUBMISSION_STATE'});
});

it('rejects a late translation publication after a captured upload and permits exact recovery by a successor',async()=>{
 const run=await begin('review',true);let signal!:()=>void,release!:()=>void,once=true;const captured=new Promise<void>(r=>{signal=r;}),wait=new Promise<void>(r=>{release=r;});
 translations=createThemeTranslationAuthoring(pool,knowledge,'https://plunode.net',id=>registrations.authorize(id),{afterCapture:async()=>{if(once){once=false;signal();await wait;}}});
 const prepared=await prepare(run,{action:'submit-translation',requestId:randomUUID(),theme:{id:'theme',revision:1},translation:{target:{kind:'theme',id:'theme',revision:1,field:'title'},language:'en',text:'The background of A',expectedRevision:0},attribution:'anonymous'});
 const sending=send(run,prepared.submissionId!);await captured;await expire(run.caseId);const next=await resume(run,'review');await fenced(next,{action:'update-theme-production',operation:'save',progress:{...progress,artifacts:{draft:'Successor manuscript'}}});
 release();await expect(sending).rejects.toMatchObject({code:'PRODUCTION_LEASE_EXPIRED'});expect((await knowledge.query('SELECT count(*)::int n FROM knowledge75.text_translation_revisions')).rows[0].n).toBe(0);
 expect((await read(run.caseId)).progress.artifacts.draft).toBe('Successor manuscript');await send(next,prepared.submissionId!);
 expect((await knowledge.query('SELECT count(*)::int n FROM knowledge75.text_translation_revisions')).rows[0].n).toBe(1);
 expect((await pool.query("SELECT count(*)::int n FROM member_knowledge.review_attempts")).rows[0].n).toBe(0);
});
it('keeps current case image refs across existing GC, without retaining unrelated unused assets',async()=>{
 const bytes=await sharp({create:{width:32,height:32,channels:4,background:'#123456'}}).png().toBuffer();
 const upload=async(label:string)=>dispatchProductAuthoring(pool,owner,productAuthoringCommandSchema.parse({action:'upload-product-image',requestId:randomUUID(),role:'illustration',provenance:{id:'case-image',kind:'original',credit:'',terms:'Isolated fixture only'},alt:{ja:label,en:label},base64:bytes.toString('base64')}));
 const retained=await upload('retained'),unused=await upload('unused');
 const created=await execute({action:'create-theme-production',requestId:randomUUID(),progress:{...progress,artifacts:{themeImage:{imageId:retained.imageId}}}});
 expect((await pool.query('DELETE FROM product_image_asset WHERE id=$1',[retained.imageId])).rowCount).toBe(0);expect((await pool.query('DELETE FROM product_image_asset WHERE id=$1',[unused.imageId])).rowCount).toBe(1);
 await pool.query("UPDATE theme_production.cases SET status='completed' WHERE id=$1",[created.case!.id]);expect((await pool.query('DELETE FROM product_image_asset WHERE id=$1',[retained.imageId])).rowCount).toBe(1);
});

it('serializes simultaneous checkpoints with the same version and retains only the winning current draft',async()=>{
 const run=await begin(),c=await read(run.caseId);
 const changes=await Promise.allSettled(['A','B'].map(text=>execute({...run,action:'update-theme-production',requestId:randomUUID(),expectedVersion:c.version,operation:'save',progress:{...progress,artifacts:{draft:text}}})));
 expect(changes.filter(v=>v.status==='fulfilled')).toHaveLength(1);const failed=changes.find(v=>v.status==='rejected') as PromiseRejectedResult;expect(failed.reason).toMatchObject({code:'PRODUCTION_VERSION_CONFLICT'});
 const winner=(changes.find(v=>v.status==='fulfilled') as PromiseFulfilledResult<Response>).value;expect((await read(run.caseId)).progress).toEqual(winner.case!.progress);
});
