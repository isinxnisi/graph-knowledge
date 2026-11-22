import {initialWorkGuide} from '../lib/server/theme-work-guide-content';
import {themeAutomationActions,type AutomationTarget} from '../lib/domain/theme-automation';
import {createThemeAutomationWorker} from '../lib/server/theme-automation-worker';
import {assertPreviewTheme,previewGrant,PREVIEW_HEADER} from '../lib/server/theme-automation';
import {themeAutomationBuild} from '../lib/server/theme-automation-diagnostics';
import {ordinaryPublicationSnapshot,publishOrdinaryTheme} from '../lib/server/knowledge-theme-operator-publication';
import {knowledgeDigest} from '../lib/server/knowledge-foundation';
import {repairThemeCollectionRelease,type CollectionReleaseRepair} from '../lib/server/repair-theme-collection-release';
import neo4j from 'neo4j-driver';
import {createKnowledgePublicationService} from '../lib/server/knowledge-publication';
import {createThemeAuthoringReader} from '../lib/server/knowledge-theme-authoring-reader';
import {readKnowledgeTranslationById,readKnowledgeTranslation,ensureKnowledgeFoundationSchema} from '../lib/server/knowledge-foundation';
import {withOperatorThemeRead} from '../lib/server/knowledge-theme-access';
import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {Pool} from 'pg';
import sharp from 'sharp';
import {productAuthoringCommandSchema} from '../lib/domain/product-authoring';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
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
import {themeProductionCommandSchema,themeProductionResponseSchema,themeProductionListSchema,productionSubmissionCommandSchema,type ProductionSubmissionCommand} from '../lib/domain/theme-production';

type Case={id:string;version:number;lease:{executionId:string;until:string;valid:boolean}|null;phase:string;status:string;completed:boolean;progress:{brief:string;scope:string;artifacts:Record<string,unknown>;unfinished:string[];blockers:string[]};theme:{id:string;revision:number}|null;evaluationTarget:{digest:string;guide:{revision:number;criteriaRevision?:number;evidenceRevision?:number}};lastWholeThemeAssessment:{current:boolean;result:string;contentCurrent:boolean;workCurrent:boolean}|null;pendingSubmissionCount:number;submissions:{id:string;state:string}[];savedSubmission?:{wire:string;command:ProductionSubmissionCommand}};
type Response={outcome:string;case:Case|null;replayed?:boolean;leaseToken?:string;submissionId?:string};
const pool=new Pool({connectionString:process.env.MEMBER_DATABASE_URL,max:10}),knowledge=new Pool({connectionString:process.env.KNOWLEDGE_CAPSULE_TEST_DATABASE_URL,max:5});
const owner=randomUUID(),other=randomUUID(),actor={kind:'operator' as const,id:'production-fixture'};
let registrations:ReturnType<typeof createThemeRegistrations>,translations:ReturnType<typeof createThemeTranslationAuthoring>,cases:ReturnType<typeof createThemeProductions>,foundation:ReturnType<typeof createKnowledgeFoundationService>;
let failActivation=false;
let beforeActivation:(()=>Promise<unknown>)|null=null;
let lostAck=false,delay:Promise<void>|null=null;
const progress={brief:'読者の問いから制作する隔離案件',scope:'公開資料に基づく背景と着想',artifacts:{draft:'再開に必要な原稿全文',themeImage:{state:'not-needed'}},unfinished:[],blockers:[]};
const createCommand=()=>({action:'submit-theme' as const,requestId:randomUUID(),title:'New production fixture',description:'Not live',recordPins:[{id:'baseline',revision:1}]});
const execute=async(command:unknown,who=owner)=>themeProductionResponseSchema.parse(await cases.execute(who,themeProductionCommandSchema.parse(command))) as unknown as Response;
async function read(id:string){return (await execute({action:'get-theme-production',caseId:id})).case!;}
async function begin(phase:'production'|'review'='production',existing=false,workflow:'scheduled'|'manual'='scheduled',revision=1,guideContract?:2):Promise<{caseId:string;executionId:string;leaseToken:string}>{
 const created=await execute({action:'create-theme-production',requestId:randomUUID(),phase,progress,...(guideContract?{guideContract}:{}),...(workflow==='manual'?{workflow}:{}),...(existing?{theme:{id:'theme',revision}}:{})});
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
 // Apply the exact old044/045 contract and retain a live checkpoint through046.
 for(const name of ['044-theme-production.sql','045-theme-publication.sql']){const sql=await readFile(new URL('../db/member/'+name,import.meta.url),'utf8');await pool.query(sql);await pool.query('INSERT INTO member_migration(name,checksum) VALUES($1,$2)',[name,createHash('sha256').update(sql).digest('hex')]);}
 await pool.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt",active,locale) VALUES($1,$2,$3,true,now(),now(),true,$4)',[owner,'Migration fixture','migration@example.invalid','ja']);
 const preservedId=randomUUID();await pool.query("INSERT INTO theme_production.cases(id,owner_id,environment,origin,phase,status,progress,theme_id,theme_revision,execution_id,lease_token,lease_until) VALUES($1,$2,'production','https://plunode.net','production','working',$3,'theme',1,$4,$5,now()+interval '15 minutes')",[preservedId,owner,JSON.stringify(progress),randomUUID(),randomUUID()]);
 const preserved=(await pool.query('SELECT row_to_json(c)::jsonb AS value FROM theme_production.cases c WHERE id=$1',[preservedId])).rows[0].value;

 await migrateMemberDatabase(pool,...Array(35).fill(true));await migrateMemberDatabase(pool,...Array(35).fill(true));const migrated=(await pool.query('SELECT row_to_json(c)::jsonb AS value FROM theme_production.cases c WHERE id=$1',[preservedId])).rows[0].value;const {workflow,abandon_reason,...unchanged}=migrated;expect(workflow).toBe('scheduled');expect(abandon_reason).toBeNull();expect(unchanged).toEqual(preserved);expect((await pool.query("SELECT name,checksum FROM member_migration WHERE name NOT IN('044-theme-production.sql','045-theme-publication.sql','046-theme-production-workflows.sql','049-theme-production-case-management.sql') ORDER BY name")).rows).toEqual(old);
 await migrateMemberDatabase(pool,...Array(37).fill(true));
 const {guide_contract,...previousCase}=(await pool.query('SELECT row_to_json(c)::jsonb AS value FROM theme_production.cases c WHERE id=$1',[preservedId])).rows[0].value;
 expect(guide_contract).toBe(1);expect(previousCase).toEqual(migrated);
},30000);
beforeEach(async()=>{
 failActivation=false;beforeActivation=null;lostAck=false;delay=null;await pool.query('TRUNCATE theme_production.cases,knowledge_missions.theme_registrations,knowledge_missions.web_deliveries,knowledge_missions.web_importers CASCADE');await pool.query('TRUNCATE knowledge_import.packages,member_knowledge.submissions,product_editorial_request,product_editorial_version CASCADE');
 await pool.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt",active,locale) VALUES($1,$2,$3,true,now(),now(),true,$7),($4,$5,$6,true,now(),now(),true,$7) ON CONFLICT(id) DO UPDATE SET active=true',[owner,'Operator','production-owner@example.invalid',other,'Other','production-other@example.invalid','ja']);
 const guides=createThemeQualityGuides(pool),g=await guides.read(owner);if(!g.revision)await guides.update(owner,{requestId:randomUUID(),expectedRevision:0,markdown:`# 隔離品質ガイド

第10節：独立した全体評価。`,reason:'Isolated fixture'});
 await knowledge.query('DROP SCHEMA IF EXISTS knowledge75 CASCADE');foundation=createKnowledgeFoundationService(knowledge);
 await foundation.execute(actor,{action:'create-bundle',requestId:randomUUID(),entities:[{id:'a',content:{name:'A',kind:'organization'}}],sources:[{id:'s',content:{title:'Source',url:'https://example.org/source'}}],records:[{id:'baseline',content:{kind:'note',subjectId:'a',assertion:'A is a fixture.',evidence:[{id:'q',source:{id:'s',revision:1},locator:'Body',excerpt:'A is a fixture.'}]}}],reason:'Isolated source data'});
 await migrateKnowledgeTranslations(knowledge);await migrateKnowledgeIdentities(knowledge);await ensureKnowledgePublicationSchema(knowledge);
 await foundation.execute(actor,{action:'create-theme',requestId:randomUUID(),id:'theme',title:'Aの背景',recordPins:[{id:'baseline',revision:1}],reason:'Isolated existing theme'});
 const imports=createKnowledgeImports(pool,knowledge,(id,c)=>webImportPrincipal(pool,id,c)),web=createWebKnowledgeImports(pool,()=>imports);registrations=createThemeRegistrations(pool,knowledge,web,imports);translations=createThemeTranslationAuthoring(pool,knowledge,'https://plunode.net',id=>registrations.authorize(id));
 cases=createThemeProductions(pool,{environment:'production',origin:'https://plunode.net',authorize:id=>registrations.authorize(id),...(()=>{const runtime=themeProductionRuntime(pool,knowledge,'https://plunode.net',registrations,translations);return {...runtime,publish:async(owner:string,id:string)=>{if(failActivation){failActivation=false;throw Error('Isolated activation interruption');}const callback=beforeActivation;beforeActivation=null;await callback?.();await runtime.publish(owner,id);}};})(),send:ordinarySend,afterDispatch:async()=>{if(lostAck){lostAck=false;throw Error('Response lost after normal intake commit');}}});
},30000);
afterAll(async()=>{await pool.end();await knowledge.end();vi.unstubAllEnvs();});

it('discovers only owned cases for an exact theme, with paged history and a separate public edition',async()=>{
 const released=await begin('review',true);
 await complete(released);
 const run=await begin('review',true,'manual');
 await pool.query(`INSERT INTO theme_production.cases(id,owner_id,environment,origin,phase,status,progress,theme_id,theme_revision)
  VALUES($1,$2,'production','https://plunode.net','review','completed',$3,'theme',1),
        ($4,$5,'beta','https://graph-beta.isinxnisi.com','review','working',$3,'theme',1),
        ($6,$5,'production','https://another.example','review','completed',$3,'theme',1)`,
  [randomUUID(),other,progress,randomUUID(),owner,randomUUID()]);
 const list={action:'list-theme-productions' as const,themeId:'theme',cursor:0};
 const result=themeProductionListSchema.parse(await cases.execute(owner,list));
 expect(result.items).toMatchObject([{id:run.caseId,workflow:'manual',phase:'review',publication:{publishedRevision:1,workingRevision:1}},{id:released.caseId,status:'completed'}]);
 expect(result.items[0].lease).not.toHaveProperty('leaseToken');
 expect(await cases.execute(owner,{...list,cursor:5})).toEqual({items:[],nextCursor:null});
 expect((await execute({action:'get-theme-production',caseId:run.caseId,includeSettledSubmissions:true,operationCursor:0})).case).toMatchObject({
  operationHistory:{items:expect.arrayContaining([expect.objectContaining({outcome:'claimed'})])},
 });
 expect((await execute({action:'get-theme-production'})).outcome).toBe('none');
});

it('ends a live case without publishing, preserving stored work and allowing a successor',async()=>{
 await complete(await begin('review',true,'manual'));
 const run=await begin('review',true);
 const command={action:'abandon-theme-production',requestId:randomUUID(),caseId:run.caseId,expectedVersion:(await read(run.caseId)).version,reason:'Superseded by current public work'};
 await expect(execute(command,other)).rejects.toMatchObject({code:'NOT_FOUND'});
 await expect(execute(command)).rejects.toMatchObject({code:'PRODUCTION_BUSY'});
 const prepared=await prepare(run,{action:'update-theme',requestId:randomUUID(),target:{id:'theme',revision:1},changes:{title:'Pending change'},reason:'Draft'});
 await fenced(run,{action:'update-theme-production',operation:'release'});
 command.expectedVersion=(await read(run.caseId)).version;
 await expect(execute(command)).rejects.toMatchObject({code:'PRODUCTION_PUBLICATION_PENDING'});
 const nextRun=await resume(run,'review');
 await fenced(nextRun,{action:'update-theme-production',operation:'withdraw-submission',submissionId:prepared.submissionId,reason:'No longer needed'});
 await fenced(nextRun,{action:'update-theme-production',operation:'release'});
 await expect(execute(command)).rejects.toMatchObject({code:'PRODUCTION_VERSION_CONFLICT'});
 command.expectedVersion=(await read(run.caseId)).version;
 const ended=await execute(command);
 expect(ended.case).toMatchObject({status:'abandoned',completed:false,lease:null,abandonReason:command.reason,progress,publication:{publishedRevision:1,workingRevision:1}});
 expect(await execute(command)).toMatchObject({outcome:'abandoned',replayed:true});
 await expect(execute({...command,reason:'Changed'})).rejects.toMatchObject({code:'REQUEST_CHANGED'});
 expect(await execute({action:'claim-theme-production',caseId:run.caseId,executionId:randomUUID(),requestId:randomUUID(),phase:'review'})).toMatchObject({outcome:'found',case:{status:'abandoned'}});
 expect((await execute({action:'get-theme-production'})).outcome).toBe('none');
 expect((await begin('review',true)).caseId).not.toBe(run.caseId);
 expect((await execute({action:'get-theme-production',caseId:run.caseId,includeSettledSubmissions:true})).case?.submissions).toMatchObject([{id:prepared.submissionId,state:'withdrawn'}]);
},30_000);

it('blocks closure while automation may be claimed or is unsettled',async()=>{
 await migrateMemberDatabase(pool,...Array(36).fill(true));
 const run=await begin('review',true,'manual');
 const digest='f'.repeat(64),preview=randomUUID();
 await pool.query("INSERT INTO theme_production.automation_requests(id,case_id,execution_id,kind,digest,input) VALUES($1,$2,$3,'preview',$4,'{}')",[preview,run.caseId,run.executionId,digest]);
 await fenced(run,{action:'update-theme-production',operation:'release'});
 const command={action:'abandon-theme-production',requestId:randomUUID(),caseId:run.caseId,expectedVersion:(await read(run.caseId)).version,reason:'Audit test'};
 await expect(execute(command)).rejects.toMatchObject({code:'PRODUCTION_AUTOMATION_PENDING'});
 await pool.query("UPDATE theme_production.automation_requests SET state='blocked',reason='PREVIEW_INTERRUPTED' WHERE id=$1",[preview]);
 const worker=await pool.connect();
 try{
  await worker.query('BEGIN');
  await worker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['theme-automation:https://plunode.net']);
  await expect(execute(command)).rejects.toMatchObject({code:'PRODUCTION_BUSY'});
 }finally{await worker.query('ROLLBACK');worker.release();}
 expect(await execute(command)).toMatchObject({outcome:'abandoned'});
 expect((await pool.query('SELECT state FROM theme_production.automation_requests WHERE id=$1',[preview])).rows).toEqual([{state:'blocked'}]);
});

it('never creates a case from get/claim and admits only one concurrent execution and one active scheduled case',async()=>{
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
 const sending=send(run,prepared.submissionId!).then(value=>({value}),error=>({error}));while((await pool.query('SELECT dispatches FROM theme_production.submissions WHERE id=$1',[prepared.submissionId])).rows[0].dispatches===0)await new Promise(r=>setTimeout(r,5));
 await expire(run.caseId);const attempted=await execute({action:'claim-theme-production',requestId:randomUUID(),executionId:randomUUID(),phase:'production',caseId:run.caseId});expect(attempted.outcome).toBe('claimed');
 release();expect(await sending).toMatchObject({error:{code:'PRODUCTION_LEASE_EXPIRED'}});delay=null;expect((await pool.query('SELECT count(*)::int n FROM knowledge_missions.theme_registrations')).rows[0].n).toBe(0);
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
it.each(['theme','translation','associated-product','guide'])('reports a stale assessment after %s without reopening the completed case',async mode=>{
 const run=await begin('review',true);await complete(run);const old=await read(run.caseId);expect(old.completed).toBe(true);
 if(mode==='theme')await ordinaryUpdate();
 if(mode==='translation')await translations.submit(owner,{requestId:randomUUID(),theme:{id:'theme',revision:1},translation:{target:{kind:'theme',id:'theme',revision:1,field:'title'},language:'en',text:'The background of A',expectedRevision:0},attribution:'anonymous'});
 if(mode==='associated-product')await dispatchProductAuthoring(pool,owner,{action:'save-product',requestId:randomUUID(),expectedRevision:0,offers:[],product:{id:'fixture-product',workId:'',author:'',edition:'',title:'Reader edition',language:'ja',metadataSource:'https://example.org/product'},reason:{ja:'理解を深める',en:'Read further'},appliesTo:[{kind:'entity',id:'a'}]});
 if(mode==='guide'){const guides=createThemeQualityGuides(pool),current=await guides.read(owner);await guides.update(owner,{requestId:randomUUID(),expectedRevision:current.revision,markdown:'# Revised isolated current guide',reason:'Fixture guide revision'});}
 const stale=await read(run.caseId);expect(stale.completed).toBe(true);expect(stale.status).toBe('completed');expect(stale.lastWholeThemeAssessment?.current).toBe(false);
 const skipped=await execute({action:'claim-theme-production',requestId:randomUUID(),caseId:run.caseId,executionId:randomUUID(),phase:'production'});
 expect(skipped.outcome).toBe('found');expect((await read(run.caseId)).version).toBe(stale.version);
 await expect(execute({action:'create-theme-production',requestId:randomUUID(),progress})).resolves.toMatchObject({outcome:'created'});
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

const publicReader={kind:'reader' as const,id:'anonymous'};
const driver=neo4j.driver('bolt://127.0.0.1:1');
const publicService=()=>createKnowledgePublicationService(knowledge,driver);
afterAll(async()=>{await driver.close();});
it('keeps new themes and every direct revision private while common knowledge remains publicly readable',async()=>{
 await expect(foundation.get(publicReader,'theme','theme')).rejects.toMatchObject({status:404});
 await expect(foundation.resolveTheme(publicReader,'theme',1)).rejects.toMatchObject({status:404});
 expect((await publicService().themes()).themes).toEqual([]);
 expect((await foundation.get(publicReader,'record','baseline')).content.assertion).toBe('A is a fixture.');
 expect((await createThemeAuthoringReader(knowledge,'https://plunode.net').read('theme')).publication.state).toBe('private');
 await expect(withOperatorThemeRead(()=>publicService().theme({themeId:'theme',revision:1,language:'en'}))).rejects.toMatchObject({status:404});
 const run=await begin('production',true);await expect(complete(run)).rejects.toMatchObject({code:'PRODUCTION_ASSESSMENT_REQUIRED'});
 await fenced(run,{action:'update-theme-production',operation:'handoff'});const reviewer=await resume(run,'review');
 await assess(reviewer,'needs-changes');await expect(fenced(reviewer,{action:'update-theme-production',operation:'complete'})).rejects.toMatchObject({code:'PRODUCTION_ASSESSMENT_STALE'});
 await complete(reviewer);expect((await publicService().theme({themeId:'theme',language:'ja'})).theme.revision).toBe(1);
 expect((await pool.query('SELECT count(*)::int n FROM member_knowledge.review_attempts')).rows[0].n).toBe(0);
});
it('serves the last approved edition while private updates and their direct old/new URLs are independently gated',async()=>{
 const run=await begin('review',true);await complete(run);await ordinaryUpdate();
 expect((await publicService().theme({themeId:'theme',language:'ja'})).theme.content.title).toBe('Aの背景');
 expect((await publicService().themes()).themes[0]).toMatchObject({id:'theme',revision:1,title:'Aの背景'});
 expect((await foundation.get(publicReader,'theme','theme')).revision).toBe(1);
 await expect(publicService().theme({themeId:'theme',revision:2})).rejects.toMatchObject({status:404});
 expect(await publicService().capsulesReadable([[{kind:'theme',id:'theme',revision:1}],[{kind:'theme',id:'theme',revision:2}]])).toEqual([true,false]);
 expect((await createThemeAuthoringReader(knowledge,'https://plunode.net').read('theme')).theme.revision).toBe(2);
 expect((await publicService().theme({themeId:'theme',revision:1})).theme.revision).toBe(1);
 const review=await begin('review',true,'manual',2);await complete(review);
 expect((await publicService().theme({themeId:'theme'})).theme.revision).toBe(2);
 expect((await publicService().theme({themeId:'theme',revision:1})).theme.revision).toBe(1);
});
it('freezes theme translations independently of working edits and retains previously approved translation pins',async()=>{
 const sendTranslation=(text:string,expectedRevision:number)=>translations.submit(owner,{requestId:randomUUID(),theme:{id:'theme',revision:1},translation:{target:{kind:'theme',id:'theme',revision:1,field:'title'},language:'en',text,expectedRevision},attribution:'anonymous'});
 const first=await sendTranslation('Approved English',0),run=await begin('review',true);await complete(run);
 const second=await sendTranslation('PRIVATE DRAFT ENGLISH',1);
 expect((await read(run.caseId)).completed).toBe(true);
 const published=await publicService().theme({themeId:'theme',language:'en'});expect(published.displayTranslations?.find(t=>t.target.kind==='theme')?.text).toBe('Approved English');
 const c=await knowledge.connect();try{
  await expect(readKnowledgeTranslationById(c,second.publication!.id,2)).rejects.toMatchObject({status:404});
  expect((await readKnowledgeTranslation(c,{kind:'theme',id:'theme',revision:1,field:'title'},'en')).translation?.revision).toBe(1);
 }finally{c.release();}
 const reviewer=await begin('review',true,'manual');await complete(reviewer);
 expect((await publicService().theme({themeId:'theme',language:'en'})).displayTranslations?.find(t=>t.target.kind==='theme')?.text).toBe('PRIVATE DRAFT ENGLISH');
 const historical=await knowledge.connect();try{expect((await readKnowledgeTranslationById(historical,first.publication!.id,1)).text).toBe('Approved English');}finally{historical.release();}
},15000);

it('keeps committed review completion private on activation failure and resumes the exact durable intent without a second approval',async()=>{
 const run=await begin('review',true);await assess(run);failActivation=true;
 const current=await read(run.caseId),command={...run,action:'update-theme-production',operation:'complete',requestId:randomUUID(),expectedVersion:current.version};
 const failed=await execute(command);expect(failed.case?.completed).toBe(false);expect(failed.case?.status).toBe('waiting-publication');
 await expect(publicService().theme({themeId:'theme'})).rejects.toMatchObject({status:404});
 const saved=await cases.execute(owner,themeProductionCommandSchema.parse({action:'get-theme-production',caseId:run.caseId})) as {case:{publication:{pending:boolean;retryCommand:unknown}}};
 expect(saved.case.publication.pending).toBe(true);
 await expect(execute({action:'create-theme-production',requestId:randomUUID(),progress})).rejects.toMatchObject({code:'PRODUCTION_PUBLICATION_PENDING'});
 expect((await execute(saved.case.publication.retryCommand)).case?.completed).toBe(true);await execute(command);
 expect((await knowledge.query('SELECT count(*)::int n FROM knowledge75.theme_release_approvals')).rows[0].n).toBe(1);
});
it('rejects stale activation after a post-completion edit and requires a new independent whole-target evaluation',async()=>{
 const run=await begin('review',true);await assess(run);failActivation=true;
 const c=await read(run.caseId),command={...run,action:'update-theme-production',operation:'complete',requestId:randomUUID(),expectedVersion:c.version};await execute(command);await ordinaryUpdate();
 expect((await execute(command)).case?.completed).toBe(false);await expect(publicService().theme({themeId:'theme'})).rejects.toMatchObject({status:404});
 const reviewer=await resume(run,'review');await complete(reviewer);const published=await publicService().theme({themeId:'theme'});expect(published.theme.revision).toBe(2);
 await execute(command);expect((await publicService().theme({themeId:'theme'})).theme.revision).toBe(2);
});
it('migrates existing approved editions without changing content, except withholding the specified unfinished Dragon Quest theme',async()=>{
 const dq='theme:1ab040a3a68b1e5666de0ba354fa484891d56e95d5e6bda3';await foundation.execute(actor,{action:'create-theme',requestId:randomUUID(),id:dq,title:'制作途中',recordPins:[{id:'baseline',revision:1}],reason:'Isolated migration target'});
 const before=(await knowledge.query('SELECT kind,id,revision,content FROM knowledge75.revisions ORDER BY kind,id,revision')).rows;
 await knowledge.query("DROP TRIGGER knowledge_new_theme_draft ON knowledge75.objects;DROP FUNCTION knowledge75.new_theme_draft();DROP TABLE knowledge75.theme_operator_drafts,knowledge75.theme_editorial_lineage,knowledge75.theme_knowledge_revisions,knowledge75.theme_release_approvals,knowledge75.theme_releases,knowledge75.theme_publications;DROP FUNCTION knowledge75.immutable_theme_approval();DELETE FROM knowledge75.migrations WHERE name IN('010-theme-publication.sql','011-theme-knowledge-updates.sql','013-theme-editorial-drafts.sql')");
 await ensureKnowledgeFoundationSchema(knowledge);await ensureKnowledgeFoundationSchema(knowledge);
 expect((await knowledge.query('SELECT kind,id,revision,content FROM knowledge75.revisions ORDER BY kind,id,revision')).rows).toEqual(before);
 expect((await publicService().themes()).themes.map(t=>t.id)).toEqual(['theme']);await expect(publicService().theme({themeId:dq,revision:1})).rejects.toMatchObject({status:404});
 expect((await createThemeAuthoringReader(knowledge,'https://plunode.net').read(dq)).theme.content.title).toBe('制作途中');
});

it('reopens an old completed but unapproved case for review instead of treating stored completion as a public release',async()=>{
 const run=await begin('review',true);await assess(run);await pool.query("UPDATE theme_production.cases SET status='completed',execution_id=NULL,lease_token=NULL,lease_until=NULL WHERE id=$1",[run.caseId]);
 expect((await read(run.caseId)).completed).toBe(false);const reviewer=await resume(run,'review');expect(reviewer.leaseToken).toBeTruthy();await complete(reviewer);expect((await publicService().theme({themeId:'theme'})).theme.revision).toBe(1);
});

it('keeps a completed review current when a new translation request only reuses identical stored text',async()=>{
 const v={theme:{id:'theme',revision:1},translation:{target:{kind:'theme' as const,id:'theme',revision:1,field:'title' as const},language:'en',text:'Unchanged title',expectedRevision:0},attribution:'anonymous' as const};
 await translations.submit(owner,{...v,requestId:randomUUID()});const run=await begin('review',true);await complete(run);
 await translations.submit(owner,{...v,requestId:randomUUID(),translation:{...v.translation,expectedRevision:1}});expect((await read(run.caseId)).completed).toBe(true);
});


it('keeps independent manual cases out of default scheduled selection, including before any scheduled case exists',async()=>{
 const first=await execute({action:'create-theme-production',requestId:randomUUID(),workflow:'manual',progress});
 expect(first.case).toMatchObject({workflow:'manual'});
 expect(await execute({action:'get-theme-production'})).toMatchObject({outcome:'none',case:null});
 expect(await execute({action:'claim-theme-production',requestId:randomUUID(),executionId:randomUUID(),phase:'production'})).toMatchObject({outcome:'none',case:null});
 const scheduled=await begin(),before=await read(scheduled.caseId);
 const manual=await begin('production',false,'manual');await fenced(manual,{action:'update-theme-production',operation:'save',progress:{...progress,brief:'別チャットの変更'}});
 expect((await execute({action:'get-theme-production'})).case?.id).toBe(scheduled.caseId);
 expect(await read(scheduled.caseId)).toMatchObject({version:before.version,phase:before.phase,lease:before.lease,progress:before.progress});
 expect((await read(manual.caseId)).progress.brief).toBe('別チャットの変更');
});
it('admits concurrent independent manual case creation without relaxing the scheduled single-case boundary',async()=>{
 await begin();const created=await Promise.all([1,2].map(()=>execute({action:'create-theme-production',workflow:'manual',requestId:randomUUID(),progress})));
 expect(created.map(v=>v.outcome)).toEqual(['created','created']);expect(new Set(created.map(v=>v.case!.id)).size).toBe(2);
 await expect(execute({action:'create-theme-production',requestId:randomUUID(),progress})).rejects.toMatchObject({code:'PRODUCTION_ACTIVE_CASE'});
});
it('updates and approves an unrelated manual theme while the scheduled case retains its live lease and progress',async()=>{
 const scheduled=await begin('production',true),before=await read(scheduled.caseId);
 await foundation.execute(actor,{action:'create-theme',requestId:randomUUID(),id:'other-theme',title:'別テーマ',recordPins:[{id:'baseline',revision:1}],reason:'Manual workflow fixture'});
 const created=await execute({action:'create-theme-production',workflow:'manual',requestId:randomUUID(),phase:'review',theme:{id:'other-theme',revision:1},progress});
 const executionId=randomUUID(),claimed=await execute({action:'claim-theme-production',requestId:randomUUID(),caseId:created.case!.id,executionId,phase:'review'}),manual={caseId:created.case!.id,executionId,leaseToken:claimed.leaseToken!};
 const prepared=await prepare(manual,{action:'update-theme',requestId:randomUUID(),target:{id:'other-theme',revision:1},changes:{title:'別チャットで更新したテーマ'},reason:'Normal manual editing'});
 await send(manual,prepared.submissionId!);await registrations.recoverOne();
 expect((await read(manual.caseId)).theme).toMatchObject({id:'other-theme',revision:2});
 const done=await complete(manual);expect(done.case?.completed).toBe(true);
 expect((await foundation.resolveTheme({kind:'reader',id:'public-reader'},'other-theme')).theme.revision).toBe(2);
 expect(await read(scheduled.caseId)).toMatchObject({version:before.version,lease:before.lease,progress:before.progress});
 expect((await pool.query('SELECT count(*)::integer n FROM member_knowledge.review_jobs')).rows[0].n).toBe(0);
});
it('rejects duplicate unfinished cases only for the same theme, preserving ownership and exact leases',async()=>{
 const scheduled=await begin('production',true);
 await expect(execute({action:'create-theme-production',workflow:'manual',requestId:randomUUID(),theme:{id:'theme',revision:1},progress})).rejects.toMatchObject({code:'PRODUCTION_THEME_ACTIVE'});
 const manual=await begin('production',false,'manual');await expect(execute({action:'get-theme-production',caseId:manual.caseId},other)).rejects.toMatchObject({code:'NOT_FOUND'});
 await expire(manual.caseId);await expect(fenced(manual,{action:'update-theme-production',operation:'save'})).rejects.toMatchObject({code:'PRODUCTION_LEASE_EXPIRED'});
 expect((await read(scheduled.caseId)).lease?.valid).toBe(true);
});
it('keeps exact saved-request fences for manual work and leaves ordinary unrelated direct updates usable',async()=>{
 const scheduled=await begin(),manual=await begin('production',false,'manual'),command=createCommand();
 await prepare(manual,command);await expect(ordinarySend(owner,productionSubmissionCommandSchema.parse(command))).rejects.toMatchObject({code:'PRODUCTION_FENCE_REQUIRED'});
 await ordinaryUpdate();expect((await createThemeAuthoringReader(knowledge,'https://plunode.net').read('theme')).theme.revision).toBe(2);
 expect((await execute({action:'get-theme-production'})).case?.id).toBe(scheduled.caseId);
});
it('replays pre-workflow create request bodies without changing their digest or creating another case',async()=>{
 const command={action:'create-theme-production',requestId:randomUUID(),progress};const first=await execute(command),again=await execute(command);
 expect(again.replayed).toBe(true);expect(again.case?.id).toBe(first.case?.id);expect(again.case).toMatchObject({workflow:'scheduled'});
 await expect(execute({...command,workflow:'manual'})).rejects.toMatchObject({code:'REQUEST_CHANGED'});
});

// Accepted collection updates are ordinary public knowledge, not a new production turn.
it('keeps a completed scheduled case completed after accepted knowledge, without relabelling its old assessment as current',async()=>{
 const run=await begin('review',true);await complete(run);
 await foundation.execute({kind:'collection',id:'verified-background'},{action:'accept-record',requestId:randomUUID(),entities:[],sources:[],entityPins:[{id:'a',revision:1}],sourcePins:[{id:'s',revision:1}],record:{id:'accepted-background',content:{kind:'note',subjectId:'a',assertion:'A has accepted background.',evidence:[{id:'q',source:{id:'s',revision:1},locator:'Body',excerpt:'A has accepted background.'}]}},themes:[{id:'theme',revision:1}],reason:'Accepted collection background'},{verify:async()=>{},prepare:async()=>{}});
 const updated=await read(run.caseId);expect(updated.completed).toBe(true);expect(updated.status).toBe('completed');expect(updated.lastWholeThemeAssessment).toMatchObject({current:false,contentCurrent:false});
 const next=await execute({action:'create-theme-production',requestId:randomUUID(),progress});expect(next.outcome).toBe('created');
 // Further editorial changes leave the historic case complete.
 await registrations.submit(owner,{requestId:randomUUID(),target:{id:'theme',revision:2},changes:{description:'A new unpublished editorial draft'},reason:'Manual editorial change'});await registrations.recoverOne();
 expect((await read(run.caseId)).completed).toBe(true);expect((await read(run.caseId)).status).toBe('completed');
});

async function legacyCollectionArtifact(){
 const run=await begin('review',true);await complete(run);
 await foundation.execute(actor,{action:'create-bundle',requestId:randomUUID(),entityPins:[{id:'a',revision:1}],records:[{id:'legacy-added',content:{kind:'note',subjectId:'a',assertion:'Accepted old collection artifact.',evidence:[{id:'q',source:{id:'s',revision:1},locator:'Body',excerpt:'Accepted old collection artifact.'}]}}],reason:'Legacy accepted record fixture'});
 const parent=await foundation.get(actor,'theme','theme'),record=await foundation.get(actor,'record','legacy-added'),requestId=randomUUID(),packageId=randomUUID();
 const content={...parent.content,recordPins:[...parent.content.recordPins,{id:record.id,revision:record.revision}]};
 const result={...record,themes:[{id:'theme',revision:2}]},input={action:'accept-record',requestId,record:{id:record.id,content:record.content},themes:[{id:'theme',revision:1}]};
 await knowledge.query("INSERT INTO knowledge75.operations(actor_id,request_id,actor_kind,digest,input,result) VALUES('legacy-import',$1,'import',$2,$3,$4)",[requestId,knowledgeDigest(input),JSON.stringify(input),JSON.stringify(result)]);
 await knowledge.query("INSERT INTO knowledge75.revisions(kind,id,revision,content,reason,actor_id,actor_kind) VALUES('theme','theme',2,$1,'Legacy collection addition','legacy-import','import');",[JSON.stringify(content)]);
 await knowledge.query("UPDATE knowledge75.objects SET current_revision=2 WHERE kind='theme' AND id='theme';INSERT INTO knowledge75.published_revisions(kind,id,revision) VALUES('theme','theme',2);UPDATE knowledge75.theme_publications SET draft_updated_at=clock_timestamp() WHERE theme_id='theme'");
 await pool.query('INSERT INTO knowledge_import.packages(id,principal_id,namespace,package_id,revision,digest,payload,resource_issues) VALUES($1,$2,$3,$4,1,$5,$6,$7)',[packageId,'mission:legacy-fixture','fixture','legacy',knowledgeDigest(input),'{}','[]']);
 await pool.query("INSERT INTO knowledge_import.items(id,package_id,ordinal,item_key,input_digest,normalized,state,reason,result) VALUES($1,$2,0,'background',$3,$4,'published','Legacy accepted source',$5)",[requestId,packageId,knowledgeDigest(input),'{}',JSON.stringify(result)]);
 const expected:CollectionReleaseRepair={themeId:'theme',parent:1,revision:2,parentDigest:knowledgeDigest(parent.content),digest:knowledgeDigest(content),actorId:'legacy-import',principalId:'mission:legacy-fixture',requestId,record:{id:record.id,revision:1}};
 return {expected,parent};
}
it('repairs only a proven legacy collection-only edition and preserves immutable content, receipts and old releases',async()=>{
 const {expected,parent}=await legacyCollectionArtifact(),before=(await knowledge.query('SELECT kind,id,revision,content FROM knowledge75.revisions ORDER BY kind,id,revision')).rows;
 expect(await repairThemeCollectionRelease(pool,knowledge,expected)).toMatchObject({outcome:'verified'});expect((await read((await pool.query('SELECT id FROM theme_production.cases LIMIT 1')).rows[0].id)).completed).toBe(true);
 expect(await repairThemeCollectionRelease(pool,knowledge,expected,true)).toMatchObject({outcome:'repaired',publication:{publishedRevision:2,workingRevision:2,workingChanges:false}});
 expect(await repairThemeCollectionRelease(pool,knowledge,expected,true)).toMatchObject({outcome:'already-repaired'});
 expect((await knowledge.query('SELECT kind,id,revision,content FROM knowledge75.revisions ORDER BY kind,id,revision')).rows).toEqual(before);expect(await foundation.get(actor,'theme','theme',1)).toEqual(parent);
 expect((await pool.query('SELECT state FROM knowledge_import.items WHERE id=$1',[expected.requestId])).rows[0].state).toBe('published');
});
it('refuses a legacy repair with pending intake or altered content',async()=>{
 const {expected}=await legacyCollectionArtifact();
 await expect(repairThemeCollectionRelease(pool,knowledge,{...expected,digest:'0'.repeat(64)},true)).rejects.toMatchObject({code:'COLLECTION_REPAIR_CONFLICT'});
 await pool.query("UPDATE knowledge_import.items SET state='applied' WHERE id=$1",[expected.requestId]);await expect(repairThemeCollectionRelease(pool,knowledge,expected,true)).rejects.toMatchObject({code:'COLLECTION_REPAIR_CONFLICT'});
 await pool.query("UPDATE knowledge_import.items SET state='published' WHERE id=$1",[expected.requestId]);
 expect((await knowledge.query("SELECT published_revision FROM knowledge75.theme_publications WHERE theme_id='theme'")).rows[0].published_revision).toBe(1);
});

it('repairs accepted knowledge during a live independent review without approving or disturbing its pending editorial submission',async()=>{
 const {expected}=await legacyCollectionArtifact();
 const created=await execute({action:'create-theme-production',requestId:randomUUID(),workflow:'manual',phase:'review',theme:{id:'theme',revision:2},progress});
 const caseId=created.case!.id,executionId=randomUUID(),claimed=await execute({action:'claim-theme-production',requestId:randomUUID(),caseId,phase:'review',executionId});
 const run={caseId,executionId,leaseToken:claimed.leaseToken!};
 const pending=await prepare(run,{action:'update-theme',requestId:randomUUID(),target:{id:'theme',revision:2},changes:{title:'Unapproved review draft'},reason:'A genuine editorial revision remains pending'});await send(run,pending.submissionId!);
 const beforeCases=(await pool.query('SELECT row_to_json(c) AS value FROM theme_production.cases c ORDER BY id')).rows;
 const beforeSubmissions=(await pool.query('SELECT row_to_json(s) AS value FROM theme_production.submissions s ORDER BY id')).rows;
 expect(await repairThemeCollectionRelease(pool,knowledge,expected)).toMatchObject({outcome:'verified'});
 expect(await repairThemeCollectionRelease(pool,knowledge,expected,true)).toMatchObject({outcome:'repaired',publication:{publishedRevision:2,workingRevision:2,workingChanges:false}});
 expect(await repairThemeCollectionRelease(pool,knowledge,expected,true)).toMatchObject({outcome:'already-repaired'});
 expect((await pool.query('SELECT row_to_json(c) AS value FROM theme_production.cases c ORDER BY id')).rows).toEqual(beforeCases);
 expect((await pool.query('SELECT row_to_json(s) AS value FROM theme_production.submissions s ORDER BY id')).rows).toEqual(beforeSubmissions);
 const reviewing=await read(caseId);expect(reviewing.phase).toBe('review');expect(reviewing.completed).toBe(false);expect(reviewing.lease?.valid).toBe(true);expect(reviewing.pendingSubmissionCount).toBe(1);
 await registrations.recoverOne();
 expect((await foundation.get({kind:'reader',id:'public-reader'},'theme','theme')).content.title).toBe('Aの背景');
 expect((await foundation.get(actor,'theme','theme')).content.title).toBe('Unapproved review draft');
 expect((await knowledge.query("SELECT published_revision FROM knowledge75.theme_publications WHERE theme_id='theme'")).rows[0].published_revision).toBe(2);
 expect((await read(caseId)).completed).toBe(false);await fenced(run,{action:'update-theme-production',operation:'renew',leaseSeconds:1200});
});

it('retains both completed cases when a reviewed knowledge-derived edition later receives another accepted collection update',async()=>{
 const {expected}=await legacyCollectionArtifact();await repairThemeCollectionRelease(pool,knowledge,expected,true);
 const created=await execute({action:'create-theme-production',requestId:randomUUID(),workflow:'manual',phase:'review',theme:{id:'theme',revision:2},progress});
 const caseId=created.case!.id,executionId=randomUUID(),claimed=await execute({action:'claim-theme-production',requestId:randomUUID(),caseId,phase:'review',executionId});
 await complete({caseId,executionId,leaseToken:claimed.leaseToken!});
 await foundation.execute({kind:'collection',id:'verified-next-background'},{action:'accept-record',requestId:randomUUID(),entities:[],sources:[],entityPins:[{id:'a',revision:1}],sourcePins:[{id:'s',revision:1}],record:{id:'next-background',content:{kind:'note',subjectId:'a',assertion:'The next source adds accepted background.',evidence:[{id:'q',source:{id:'s',revision:1},locator:'Body',excerpt:'The next source adds accepted background.'}]}},themes:[{id:'theme',revision:2}],reason:'Next accepted collection background'},{verify:async()=>{},prepare:async()=>{}});
 const reviewed=await read(caseId);expect(reviewed.completed).toBe(true);expect(reviewed.lastWholeThemeAssessment).toMatchObject({current:false,contentCurrent:false});
 const scheduledId=(await pool.query("SELECT id FROM theme_production.cases WHERE workflow='scheduled'")).rows[0].id;expect((await read(scheduledId)).completed).toBe(true);expect(await execute({action:'get-theme-production'})).toMatchObject({outcome:'none',case:null});
 expect((await execute({action:'create-theme-production',requestId:randomUUID(),progress})).outcome).toBe('created');
});

it('repairs the proven accepted edition while preserving a later private editorial head and deliberate record removal',async()=>{
 const {expected}=await legacyCollectionArtifact();
 await foundation.execute(actor,{action:'edit-theme',requestId:randomUUID(),id:'theme',expectedRevision:2,title:'Unapproved later prose',description:'Private',recordPins:[{id:'baseline',revision:1}],initialView:'graph',reason:'Real manual draft'});
 const draft=await foundation.get(actor,'theme','theme');
 expect(await repairThemeCollectionRelease(pool,knowledge,expected,true)).toMatchObject({outcome:'repaired',publication:{publishedRevision:2,workingRevision:3,workingChanges:true}});
 expect(await foundation.get(actor,'theme','theme')).toEqual(draft);
 const publicTheme=await foundation.get({kind:'reader',id:'public-reader'},'theme','theme');expect(publicTheme.content.title).toBe('Aの背景');expect(publicTheme.content.recordPins.map(p=>p.id)).toContain('legacy-added');
 await expect(foundation.get({kind:'reader',id:'public-reader'},'theme','theme',3)).rejects.toMatchObject({status:404});
 expect(await repairThemeCollectionRelease(pool,knowledge,expected,true)).toMatchObject({outcome:'already-repaired',publication:{publishedRevision:2,workingRevision:3,workingChanges:true}});
});

const readEdition=(view:'working'|'editorial'|'published')=>createThemeAuthoringReader(knowledge,'https://plunode.net').read('theme',undefined,view);
async function saveOrdinary(changes:Record<string,unknown>,restart=false){
 const current=await readEdition(restart?'published':'editorial');
 const requestId=randomUUID();
 await registrations.submit(owner,{requestId,target:current.target,editorial:{base:current.edition!.published,...(restart?{replaceDraftRevision:current.edition!.draft!.revision}:{})},changes,reason:'通常編集'});
 await registrations.recoverOne();
 expect(await registrations.status(owner,requestId)).toMatchObject({state:'published'});
 return (await readEdition('editorial')).publicationCandidate!;
}
const publishOrdinary=(candidate:NonNullable<Awaited<ReturnType<typeof ordinaryPublicationSnapshot>>>['candidate'],requestId=randomUUID(),who=owner)=>
 publishOrdinaryTheme(pool,knowledge,who,{...candidate,requestId,reason:'通常版を公開'},registrations.authorize);

it('publishes an exact ordinary edition without a case, persists the receipt, and protects first publication',async()=>{
 const requestId=randomUUID();
 await registrations.submit(owner,{requestId,title:'案件不要の新規テーマ',description:'初版',recordPins:[{id:'baseline',revision:1}],editorial:true});
 await registrations.recoverOne();
 const {theme}=await registrations.status(owner,requestId);
 const author=createThemeAuthoringReader(knowledge,'https://plunode.net');
 const initial=await author.read(theme!.id,undefined,'editorial');
 const pixels=await sharp({create:{width:180,height:120,channels:3,background:'teal'}}).png().toBuffer();
 const image=await dispatchProductAuthoring(pool,owner,{action:'upload-product-image',requestId:randomUUID(),role:'illustration',
  alt:{ja:'記録の挿絵',en:'Record illustration'},base64:pixels.toString('base64'),
  provenance:{id:'ordinary-record-fixture',kind:'original',terms:'Fixture',credit:'Plunode Original',creditDisplay:'public'}});
 const recordImage={target:{id:'baseline',revision:1},imageId:image.imageId};
 await expect(publicService().theme({themeId:theme!.id})).rejects.toMatchObject({status:404});
 const updated=randomUUID();
 await registrations.submit(owner,{requestId:updated,target:initial.target,editorial:{base:initial.edition!.published},changes:{description:'更新済み初版',presentation:[{locale:'ja',hook:'初版の案内',lead:'',records:[recordImage]}]},reason:'同じ下書きを更新'});
 await registrations.recoverOne();
 const candidate=(await author.read(theme!.id,undefined,'editorial')).publicationCandidate!;
 const requests=[randomUUID(),randomUUID()];
 const attempts=await Promise.allSettled(requests.map(id=>publishOrdinary(candidate,id)));
 expect(attempts.filter(a=>a.status==='fulfilled')).toHaveLength(1);
 expect(attempts.find(a=>a.status==='rejected')).toMatchObject({reason:{code:'THEME_OPERATOR_DRAFT_REQUIRED'}});
 const publishId=requests[attempts.findIndex(a=>a.status==='fulfilled')];
 const replay=await publishOrdinary(candidate,publishId);
 expect(replay).toMatchObject({theme:{revision:2},replayed:true});
 await expect(publishOrdinary(candidate,publishId,other)).rejects.toMatchObject({code:'REQUEST_CHANGED'});
 const publicEdition=await publicService().theme({themeId:theme!.id});
 expect(publicEdition.theme.content.description).toBe('更新済み初版');
 expect(publicEdition.theme.content.reading?.[0].records[0]).toMatchObject({target:recordImage.target,image:{id:image.imageId,credit:'Plunode Original'}});
 expect((await knowledge.query('SELECT image_ids FROM knowledge75.theme_releases WHERE theme_id=$1',[theme!.id])).rows[0].image_ids).toEqual([image.imageId]);
 await expect(publicService().theme({themeId:theme!.id,revision:1})).rejects.toMatchObject({status:404});
 expect(await execute({action:'get-theme-production'})).toMatchObject({outcome:'none'});
});

it('publishes a correction on the same theme during production and requires explicit reconciliation before reviewed release',async()=>{
 await complete(await begin('review',true));
 const production=await begin('production',true);
 const prepared=await prepare(production,{action:'update-theme',requestId:randomUUID(),target:{id:'theme',revision:1},changes:{description:'Private production prose'},reason:'制作の原稿'});
 await send(production,prepared.submissionId!);
 await expire(production.caseId);
 await registrations.recoverOne();
 const working=await readEdition('working');
 expect(working.theme.content.description).toBe('Private production prose');
 const draft=await saveOrdinary({title:'Corrected public title'});
 expect((await readEdition('editorial')).theme.content.description).not.toBe('Private production prose');
 await expect(publishOrdinary({...draft,target:working.target})).rejects.toMatchObject({code:'THEME_OPERATOR_DRAFT_REQUIRED'});
 const saved=await publishOrdinary(draft);
 const published=await readEdition('published');
 expect(published.target).toEqual(saved.theme);
 expect(published.theme.content.title).toBe('Corrected public title');
 expect((await readEdition('working')).target).toEqual(working.target);
 await expect(publicService().theme({themeId:'theme',revision:working.target.revision})).rejects.toMatchObject({status:404});
 const resumed=await resume(production,'production');
 await fenced(resumed,{action:'update-theme-production',operation:'handoff'});
 const review=await resume(production,'review');
 await assess(review);
 await expect(fenced(review,{action:'update-theme-production',operation:'complete'})).rejects.toMatchObject({code:'THEME_PUBLICATION_CONFLICT'});
 const reconciled=await prepare(review,{action:'update-theme',requestId:randomUUID(),target:working.target,
  reconcilePublished:published.edition!.published,changes:{title:'Corrected public title'},reason:'訂正を保持して原稿を照合'});
 await send(review,reconciled.submissionId!);await registrations.recoverOne();
 expect((await complete(review)).case?.completed).toBe(true);
 expect((await readEdition('published')).theme.content).toMatchObject({title:'Corrected public title',description:'Private production prose'});
 await publishOrdinary(await saveOrdinary({description:'Later ordinary edit'}));
 expect((await read(review.caseId)).completed).toBe(true);
 expect((await execute({action:'create-theme-production',requestId:randomUUID(),progress})).outcome).toBe('created');
},20000);

it('keeps the ordinary draft private when accepted knowledge advances the public base',async()=>{
 await complete(await begin('review',true));
 const draft=await saveOrdinary({title:'Ordinary draft'});
 await foundation.execute({kind:'collection',id:'verified-background'},{action:'accept-record',requestId:randomUUID(),entities:[],sources:[],entityPins:[{id:'a',revision:1}],sourcePins:[{id:'s',revision:1}],record:{id:'new-source-note',content:{kind:'note',subjectId:'a',assertion:'New accepted background.',evidence:[{id:'q',source:{id:'s',revision:1},locator:'Body',excerpt:'New accepted background.'}]}},themes:[{id:'theme',revision:1}],reason:'Accepted collection background'},{verify:async()=>{},prepare:async()=>{}});
 expect((await readEdition('published')).theme.content.recordPins).toContainEqual({id:'new-source-note',revision:1});
 expect((await readEdition('editorial')).theme.content.title).toBe('Ordinary draft');
 await expect(publishOrdinary(draft)).rejects.toMatchObject({code:'THEME_PUBLICATION_CONFLICT'});
 const rebased=await saveOrdinary({title:'Ordinary draft'},true);
 await publishOrdinary(rebased);
 const latest=await readEdition('published');
 expect(latest.theme.content.title).toBe('Ordinary draft');
 expect(latest.theme.content.recordPins).toContainEqual({id:'new-source-note',revision:1});
});

it('inherits only the released translation and rejects a stale ordinary publication digest',async()=>{
 const translate=async(revision:number,text:string,expectedRevision:number)=>withOperatorThemeRead(()=>translations.submit(owner,{
  requestId:randomUUID(),theme:{id:'theme',revision},
  translation:{target:{kind:'theme',id:'theme',revision,field:'title'},language:'en',text,expectedRevision},attribution:'anonymous',
 }));
 await translate(1,'Approved English',0);
 await complete(await begin('review',true));
 await translate(1,'Private production translation',1);
 const first=await saveOrdinary({description:'Ordinary description'});
 const revised=await translate(first.target.revision,'Ordinary approved translation',0);
 await expect(publishOrdinary(first)).rejects.toMatchObject({code:'THEME_PUBLICATION_CONFLICT'});
 const current=(await readEdition('editorial')).publicationCandidate!;
 await publishOrdinary(current);
 const published=await publicService().theme({themeId:'theme',language:'en'});
 expect(published.displayTranslations?.find(v=>v.target.kind==='theme')?.text).toBe('Ordinary approved translation');
 const c=await knowledge.connect();try{
  const row=(await c.query('SELECT inherited_translations FROM knowledge75.theme_editorial_lineage WHERE theme_id=$1 AND revision=$2',['theme',first.target.revision])).rows[0];
  expect(row.inherited_translations.find((v:{language:string})=>v.language==='en')?.text).toBe('Approved English');
  expect((await readKnowledgeTranslationById(c,revised.publication!.id,1)).text).toBe('Ordinary approved translation');
 }finally{c.release();}
},20000);

it('reopens an interrupted review when ordinary publication advances after its completion record',async()=>{
 await complete(await begin('review',true));
 const review=await begin('review',true);
 const prepared=await prepare(review,{action:'update-theme',requestId:randomUUID(),target:{id:'theme',revision:1},changes:{description:'Private production prose'},reason:'制作の原稿'});
 await send(review,prepared.submissionId!);await registrations.recoverOne();
 const working=await readEdition('working');
 const draft=await saveOrdinary({title:'Late public correction'});
 beforeActivation=()=>publishOrdinary(draft);

 const interrupted=await complete(review);
 expect(interrupted.case).toMatchObject({completed:false,status:'needs-review'});
 const interruptedRead=themeProductionResponseSchema.parse(await cases.execute(owner,themeProductionCommandSchema.parse({action:'get-theme-production',caseId:review.caseId})));
 expect(interruptedRead.case).toMatchObject({publication:{pending:true}});
 expect(interruptedRead.case?.publication).not.toHaveProperty('retryCommand');
 expect((await readEdition('published')).theme.content.title).toBe('Late public correction');
 expect((await readEdition('working')).target).toEqual(working.target);
 await expect(publicService().theme({themeId:'theme',revision:working.target.revision})).rejects.toMatchObject({status:404});
 const reopened=await execute({action:'claim-theme-production',requestId:randomUUID(),caseId:review.caseId,executionId:randomUUID(),phase:'review'});
 expect(reopened.outcome).toBe('claimed');
 const nextReview={caseId:review.caseId,executionId:reopened.case!.lease!.executionId,leaseToken:reopened.leaseToken!};
 const published=await readEdition('published');
 const reconciled=await prepare(nextReview,{action:'update-theme',requestId:randomUUID(),target:working.target,
  reconcilePublished:published.edition!.published,changes:{title:'Late public correction'},reason:'訂正を保持して原稿を照合'});
 await send(nextReview,reconciled.submissionId!);await registrations.recoverOne();
 await assess(nextReview);
 const reassessed=themeProductionResponseSchema.parse(await cases.execute(owner,themeProductionCommandSchema.parse({action:'get-theme-production',caseId:review.caseId})));
 expect(reassessed.case?.publication).not.toHaveProperty('retryCommand');
 expect((await fenced(nextReview,{action:'update-theme-production',operation:'complete'})).case?.completed).toBe(true);
 expect((await readEdition('published')).theme.content).toMatchObject({title:'Late public correction',description:'Private production prose'});
 expect((await execute({action:'create-theme-production',requestId:randomUUID(),progress})).outcome).toBe('created');
},20000);

it('registers generated bytes once, binds the material on prepare and rejects stale or unread review evidence',async()=>{
 const previous=process.env.THEME_AUTOMATION_ENABLED;process.env.THEME_AUTOMATION_ENABLED='1';
 try{
  await migrateMemberDatabase(pool,...Array(36).fill(true));
  const run=await begin(),imageRequest=randomUUID();
  const auto=async(execution:typeof run,input:Record<string,unknown>,who=owner)=>cases.executeAutomation(who,themeAutomationActions.parse({
   ...execution,requestId:randomUUID(),expectedVersion:(await read(execution.caseId)).version,...input,
  }));
  const bytes=await sharp({create:{width:120,height:80,channels:3,background:'navy'}}).png().toBuffer();
  const legacyProvenance={id:'theme-generation:fixture:fixture-v1',kind:'generated' as const,
   terms:'β検証用の代替画像。',credit:'fixture fixture-v1',creditDisplay:'internal' as const};
  const legacy=await dispatchProductAuthoring(pool,owner,{action:'upload-product-image',requestId:randomUUID(),
   role:'illustration',alt:{ja:'隔離挿絵',en:'Fixture illustration'},base64:bytes.toString('base64'),provenance:legacyProvenance});
  const generate=vi.fn(async()=>({bytes}));
  const capture=vi.fn(async(target:AutomationTarget,token:string)=>{
   expect(await previewGrant(pool,'https://plunode.net',new Headers({[PREVIEW_HEADER]:token}))).toEqual(target);
   await expect(previewGrant(pool,'https://graph-beta.isinxnisi.com',new Headers({[PREVIEW_HEADER]:token}))).rejects.toMatchObject({code:'NOT_FOUND'});
   expect(()=>assertPreviewTheme(target,target.theme.id,target.theme.revision+1)).toThrow();
   return {result:{build:themeAutomationBuild(),complete:true,names:['ja-1440-overview.png','ja-390-overview.png']},
    evidence:new Map([['ja-1440-overview.png',bytes],['ja-390-overview.png',bytes]])};
  });
  const worker=()=>createThemeAutomationWorker(pool,'https://plunode.net',{name:'fixture',model:'fixture-v1',dailyLimit:2,generate},capture);
  const idea={action:'generate-theme-image',requestId:imageRequest,alt:{ja:'隔離挿絵',en:'Fixture illustration'},prompt:'Draw a historical scene for the isolated test.'};
  await expect(auto(run,idea,other)).rejects.toMatchObject({code:'NOT_FOUND'});
  await expect(auto(run,idea)).resolves.toMatchObject({automationId:imageRequest,replayed:false});
  await expect(auto(run,{...idea,requestId:randomUUID()})).resolves.toMatchObject({automationId:imageRequest,replayed:true});
  expect(await worker().runOnce()).toBe(true);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(await worker().runOnce()).toBe(true);
  expect(generate).toHaveBeenCalledTimes(1);
  const status=async(id:string)=>cases.executeAutomation(owner,{action:'read-theme-automation',caseId:run.caseId,automationId:id});
  const ready=await status(imageRequest) as {requests:{imageId:string}[]};
  const imageId=ready.requests[0].imageId;
  expect(imageId).toMatch(/^[a-f0-9]{64}$/);
  expect(imageId).not.toBe(legacy.imageId);
  expect(ready.requests[0]).toMatchObject({result:{provider:'fixture',model:'fixture-v1'}});
  expect((await pool.query('SELECT content FROM product_image_provenance WHERE id=$1',[legacyProvenance.id])).rows[0].content).toEqual(legacyProvenance);
  const prepared=await fenced(run,{action:'prepare-theme-production-submission',generatedImage:{automationId:imageRequest,locales:['ja']},
   command:{...createCommand(),presentation:[{locale:'ja',hook:'題材',lead:'説明'}]}});
  expect(prepared.case?.savedSubmission?.command).toMatchObject({presentation:[{imageId}]});
  await send(run,prepared.submissionId!);await registrations.recoverOne();
  const author=createThemeAuthoringReader(knowledge,'https://plunode.net');
  const initial=await author.read((await read(run.caseId)).theme!.id);
  expect(initial.theme.content.reading?.[0].image).toMatchObject({id:imageId,credit:'Plunode Original'});
  const record=initial.theme.content.recordPins[0];
  const recordCommand={action:'update-theme',requestId:randomUUID(),target:initial.target,reason:'Bind the same image to the Record',
   changes:{presentation:[{locale:'ja',hook:'題材',lead:'説明',records:[{target:record}]}]}};
  const targetImage={automationId:imageRequest,locales:['ja'],target:record};
  await expect(fenced(run,{action:'prepare-theme-production-submission',command:recordCommand,
   generatedImage:{...targetImage,target:{...record,revision:record.revision+1}}})).rejects.toMatchObject({code:'GENERATED_IMAGE_PRESENTATION'});
  const recordBinding=await fenced(run,{action:'prepare-theme-production-submission',generatedImage:targetImage,command:recordCommand});
  expect(recordBinding.case?.savedSubmission?.command).toMatchObject({changes:{presentation:[{records:[{target:record,imageId}]}]}});
  await send(run,recordBinding.submissionId!);await registrations.recoverOne();
  await fenced(run,{action:'update-theme-production',operation:'handoff'});
  const review=await resume(run,'review'),current=await read(run.caseId),target=current.evaluationTarget;
  const working=await author.read(current.theme!.id);
  expect(working.theme.content.reading?.[0].image).toBeUndefined();
  expect(working.theme.content.reading?.[0].records[0]).toMatchObject({target:record,image:{id:imageId,credit:'Plunode Original'}});
  const evidenceId=randomUUID();
  await auto(review,{action:'capture-theme-preview',targetDigest:target.digest,requestId:evidenceId});
  expect(await worker().runOnce()).toBe(true);
  expect(capture).toHaveBeenCalledOnce();
  expect(capture.mock.calls[0][0].imageIds).toEqual([imageId]);
  const grant=capture.mock.calls[0][1];
  await expect(previewGrant(pool,'https://plunode.net',new Headers({[PREVIEW_HEADER]:grant}))).rejects.toMatchObject({code:'NOT_FOUND'});
  await expect(assess(review)).rejects.toMatchObject({code:'PREVIEW_EVIDENCE_REQUIRED'});
  const assessment={scope:'whole-theme',targetDigest:target.digest,guideRevision:target.guide.revision,result:'pass',summary:'Reviewed fixture',reviewEvidenceId:evidenceId};
  const approve=()=>fenced(review,{action:'update-theme-production',operation:'assess',assessment});
  await expect(approve()).rejects.toMatchObject({code:'PREVIEW_EVIDENCE_UNREAD'});
  const readEvidence=(name:string)=>auto(review,{action:'read-theme-evidence',automationId:evidenceId,name});
  for(const name of ['ja-1440-overview.png','ja-390-overview.png'])await expect(readEvidence(name)).resolves.toMatchObject({image:bytes});
  await expect(approve()).resolves.toMatchObject({case:{lastWholeThemeAssessment:{current:true}}});
  await expect(fenced(review,{action:'update-theme-production',operation:'complete'})).resolves.toMatchObject({case:{completed:true}});
  await expect(status(evidenceId)).resolves.toMatchObject({requests:[{state:'ready'}]});
 }finally{if(previous===undefined)delete process.env.THEME_AUTOMATION_ENABLED;else process.env.THEME_AUTOMATION_ENABLED=previous;}
},45_000);

it('replays a legacy image registration if the previous Worker stopped before settling',async()=>{
 const previous=process.env.THEME_AUTOMATION_ENABLED;process.env.THEME_AUTOMATION_ENABLED='1';
 try{
  const run=await begin(),requestId=randomUUID(),alt={ja:'旧挿絵',en:'Legacy illustration'};
  await cases.executeAutomation(owner,{action:'generate-theme-image',...run,requestId,expectedVersion:(await read(run.caseId)).version,
   alt,prompt:'Test a previously registered legacy image.'});
  const bytes=await sharp({create:{width:120,height:80,channels:3,background:'navy'}}).png().toBuffer();
  const legacy=await dispatchProductAuthoring(pool,owner,{action:'upload-product-image',requestId,role:'illustration',
   alt,base64:bytes.toString('base64'),provenance:{id:'theme-generation:fixture:fixture-v1',kind:'generated',
    terms:'β検証用の代替画像。',credit:'fixture fixture-v1',creditDisplay:'internal'}});
  const result={provider:'fixture',model:'fixture-v1'};
  await pool.query("UPDATE theme_production.automation_requests SET state='storing',generated_bytes=$2,result=$3,lease_until=now()-interval '1 second' WHERE id=$1",
   [requestId,bytes,JSON.stringify(result)]);
  expect(await createThemeAutomationWorker(pool,'https://plunode.net',null,vi.fn()).runOnce()).toBe(true);
  await expect(cases.executeAutomation(owner,{action:'read-theme-automation',caseId:run.caseId,automationId:requestId})).resolves.toMatchObject({
   requests:[{state:'ready',imageId:legacy.imageId,result}],
  });
 }finally{if(previous===undefined)delete process.env.THEME_AUTOMATION_ENABLED;else process.env.THEME_AUTOMATION_ENABLED=previous;}
});

it('records an interrupted image send as uncertain and preserves it across later workers',async()=>{
 const previous=process.env.THEME_AUTOMATION_ENABLED;process.env.THEME_AUTOMATION_ENABLED='1';
 try{
  const run=await begin(),id=randomUUID();
  await cases.executeAutomation(owner,{action:'generate-theme-image',...run,requestId:id,expectedVersion:(await read(run.caseId)).version,
   alt:{ja:'試験画像',en:'Test image'},prompt:'Test a previously interrupted provider request.'});
  await pool.query("UPDATE theme_production.automation_requests SET state='running',lease_until=now()-interval '10 seconds' WHERE id=$1",[id]);
  const generate=vi.fn();
  const worker=createThemeAutomationWorker(pool,'https://plunode.net',{name:'fixture',model:'fixture-v1',dailyLimit:2,generate},vi.fn());
  expect(await worker.runOnce()).toBe(false);
  expect(generate).not.toHaveBeenCalled();
  await expect(cases.executeAutomation(owner,{action:'read-theme-automation',caseId:run.caseId,automationId:id})).resolves.toMatchObject({
   requests:[{state:'blocked',reason:'IMAGE_GENERATION_UNKNOWN'}],events:expect.arrayContaining([expect.objectContaining({code:'IMAGE_GENERATION_UNKNOWN'})]),
  });
 }finally{if(previous===undefined)delete process.env.THEME_AUTOMATION_ENABLED;else process.env.THEME_AUTOMATION_ENABLED=previous;}
});

it('runs only the pinned beta receipt, saves metering across worker instances, and never resends it',async()=>{
 const previous=process.env.THEME_AUTOMATION_ENABLED;process.env.THEME_AUTOMATION_ENABLED='1';
 try{
  await migrateMemberDatabase(pool,...Array(36).fill(true));
  const origin='https://graph-beta.isinxnisi.com';
  const service=createThemeProductions(pool,{environment:'beta',origin,authorize:id=>registrations.authorize(id),
   ...themeProductionRuntime(pool,knowledge,origin,registrations,translations),send:ordinarySend});
  async function enqueue(workflow:'manual'|'scheduled',prompt:string){
   const created=themeProductionResponseSchema.parse(await service.execute(owner,{action:'create-theme-production',requestId:randomUUID(),workflow,phase:'production',progress}));
   const caseId=created.case!.id,executionId=randomUUID(),requestId=randomUUID();
   const claimed=themeProductionResponseSchema.parse(await service.execute(owner,{action:'claim-theme-production',requestId:randomUUID(),executionId,phase:'production',caseId,leaseSeconds:900}));
   await service.executeAutomation(owner,{action:'generate-theme-image',requestId,caseId,executionId,leaseToken:claimed.leaseToken!,expectedVersion:claimed.case!.version,
    alt:{ja:'βの画像',en:'Beta image'},prompt});
   return requestId;
  }
  const otherReceipt=await enqueue('manual','An older image request for different material.');
  const scheduledReceipt=await enqueue('scheduled','An unrelated scheduled request for an illustration.');
  const requestId=await enqueue('manual','A cutaway view of a small historic wooden ship.');
  const bytes=await sharp({create:{width:120,height:80,channels:3,background:'navy'}}).png().toBuffer();
  const usage={total_tokens:423,input_tokens:17,output_tokens:406};
  const generate=vi.fn(async()=>({bytes,usage,providerRequestId:'req_fixture'}));
  const provider={name:'openai',model:'gpt-image-2.6-flare',dailyLimit:24,generate};
  const worker=(id=requestId)=>createThemeAutomationWorker(pool,origin,provider,vi.fn(),id);
  expect(await worker(scheduledReceipt).runOnce()).toBe(false);
  expect(await worker(scheduledReceipt).trialResult()).toBeNull();
  expect(generate).not.toHaveBeenCalled();
  expect(await worker().runOnce()).toBe(true);
  expect(await worker().trialResult()).toMatchObject({state:'generated',result:{usage,providerRequestId:'req_fixture',providerAttemptId:expect.any(String)}});
  expect(await worker().runOnce()).toBe(true);
  expect(await worker().runOnce()).toBe(false);
  expect(await worker().trialResult()).toMatchObject({state:'ready',imageId:expect.stringMatching(/^[a-f0-9]{64}$/),result:{usage,providerRequestId:'req_fixture'}});
  expect(await worker(otherReceipt).runOnce()).toBe(false);
  expect(await worker(otherReceipt).trialResult()).toMatchObject({state:'queued',reason:'IMAGE_DAILY_LIMIT'});
  expect(generate).toHaveBeenCalledTimes(1);
  const ids=(await pool.query("SELECT request_id,code FROM theme_production.diagnostics WHERE stage='image-provider' AND case_id IS NOT NULL AND request_id=ANY($1::uuid[])",[[requestId,otherReceipt,scheduledReceipt]])).rows;
  expect(ids).toEqual([{request_id:requestId,code:'SEND_STARTED'}]);
 }finally{if(previous===undefined)delete process.env.THEME_AUTOMATION_ENABLED;else process.env.THEME_AUTOMATION_ENABLED=previous;}
},30_000);

it('serves mandatory review guidance regardless of focus and shares legacy CAS, receipts and restore history',async()=>{
 const guides=createThemeQualityGuides(pool);
 const legacy=await guides.read(owner);
 const command={expectedRevision:legacy.revision,requestId:randomUUID(),reason:'Structured fixture',changes:initialWorkGuide};
 const saved=await guides.updateWork(owner,command);
 await expect(guides.updateWork(owner,command)).resolves.toMatchObject({revision:saved.revision,replayed:true});
 await expect(guides.update(owner,{expectedRevision:legacy.revision,requestId:command.requestId,reason:'Different API',markdown:'Changed input'})).rejects.toMatchObject({code:'REQUEST_REUSED'});
 await expect(guides.update(owner,{expectedRevision:legacy.revision,requestId:randomUUID(),reason:'Concurrent edit',markdown:'Legacy'})).rejects.toMatchObject({code:'GUIDE_CHANGED'});
 const run=await begin('review',true,'manual',1,2);
 const origin='https://plunode.net';
 for(const focuses of [[],['images'],['unrecognized']]){
  const guide=await guides.readWork(owner,origin,{phase:'review',caseId:run.caseId,focuses,knownVersions:{principles:saved.revision,'whole-theme-review':saved.revision,images:saved.revision}});
  expect(guide.required).toEqual(initialWorkGuide.required);
  expect(guide.safety.join()).toContain('現行lease');
  if(focuses.includes('images'))expect(guide.sections).toContainEqual({key:'images',revision:saved.revision});
  if(focuses.includes('unrecognized'))expect(guide.unknownFocuses).toEqual(focuses);
 }
 await expect(guides.readWork(owner,origin,{phase:'production',caseId:run.caseId,focuses:[]})).rejects.toMatchObject({code:'PRODUCTION_PHASE_MISMATCH'});
 await expect(guides.readWork(owner,'https://graph-beta.isinxnisi.com',{phase:'review',caseId:run.caseId,focuses:[]})).rejects.toMatchObject({code:'NOT_FOUND'});
 const fallback=await guides.update(owner,{expectedRevision:saved.revision,requestId:randomUUID(),reason:'Unstructured legacy edit',markdown:'# Free-form revision'});
 const full=await guides.readWork(owner,origin,{phase:'review',caseId:run.caseId,focuses:['images']});
 expect(full).toMatchObject({mode:'full-text',markdown:'# Free-form revision',sections:[],assistance:[],versions:{criteriaRevision:fallback.revision,evidenceRevision:fallback.revision}});
 const restored=await guides.updateWork(owner,{expectedRevision:fallback.revision,requestId:randomUUID(),reason:'Restore the structured content',restoreRevision:saved.revision});
 expect(restored).toMatchObject({markdown:saved.markdown,restoredFrom:saved.revision,versions:{criteriaRevision:restored.revision,evidenceRevision:restored.revision}});
 expect((await guides.read(owner)).markdown).toBe(restored.markdown);
 const history=await guides.readWork(owner,origin,{phase:'review',focuses:[],revision:saved.revision,historyBefore:restored.revision,management:true});
 expect(history).toMatchObject({content:initialWorkGuide,currentRevision:restored.revision,history:[{revision:fallback.revision},{revision:saved.revision},...history.history!.slice(2)]});
});

it('fences a scheduled dynamic assessment and activation across assistance, mandatory and evidence edits',async()=>{
 const previous=process.env.THEME_AUTOMATION_ENABLED;process.env.THEME_AUTOMATION_ENABLED='1';
 try{
  const guides=createThemeQualityGuides(pool);
  let content=structuredClone(initialWorkGuide);
  const edit=async()=>{
   const {revision}=await guides.read(owner);
   return guides.updateWork(owner,{expectedRevision:revision,requestId:randomUUID(),reason:'Isolated guide revision',changes:content});
  };
  await edit();
  const run=await begin('production',true,'scheduled',1,2);
  const automation=async(who:typeof run,fields:Record<string,unknown>)=>cases.executeAutomation(owner,
   themeAutomationActions.parse({...who,requestId:randomUUID(),expectedVersion:(await read(run.caseId)).version,...fields}));
  const capture=(who:typeof run,requestId=randomUUID())=>automation(who,{action:'capture-theme-preview',requestId,targetDigest:(targetDigest!)});
  const targetDigest=(await read(run.caseId)).evaluationTarget.digest;
  await expect(capture(run)).rejects.toMatchObject({code:'PREVIEW_REVIEW_REQUIRED'});
  await fenced(run,{action:'update-theme-production',operation:'handoff'});
  const review=await resume(run,'review');
  const assessment=async(reviewEvidenceId?:string)=>{
   const target=(await read(run.caseId)).evaluationTarget;
   return fenced(review,{action:'update-theme-production',operation:'assess',assessment:{
    scope:'whole-theme',targetDigest:target.digest,guideRevision:target.guide.revision,
    criteriaRevision:target.guide.criteriaRevision,evidenceRevision:target.guide.evidenceRevision,
    result:'pass',summary:'Independent fixture assessment.',reviewEvidenceId,
   }});
  };
  await expect(assess(review)).rejects.toMatchObject({code:'PRODUCTION_ASSESSMENT_STALE'});
  await expect(assessment()).rejects.toMatchObject({code:'PREVIEW_EVIDENCE_REQUIRED'});
  const evidenceId=randomUUID();
  await capture(review,evidenceId);
  const bytes=await sharp({create:{width:16,height:16,channels:3,background:'navy'}}).png().toBuffer();
  const names=['ja-1440-overview.png','ja-390-overview.png'];
  const worker=createThemeAutomationWorker(pool,'https://plunode.net',null,async target=>{
   const screens=[...names,...(target.requirements?.requiredScreens.includes('image')?['ja-1440-image.png','ja-390-image.png']:[])];
   return {evidence:new Map(screens.map(name=>[name,bytes])),result:{build:themeAutomationBuild(),complete:true,names:screens,target}};
  });
  expect(await worker.runOnce()).toBe(true);
  await expect(assessment(evidenceId)).rejects.toMatchObject({code:'PREVIEW_EVIDENCE_UNREAD'});
  const readEvidence=(name:string)=>automation(review,{action:'read-theme-evidence',automationId:evidenceId,name});
  for(const name of names)await readEvidence(name);
  await assessment(evidenceId);
  content.assistance.push({key:'observed-model',enabled:true,profiles:['test-model'],phases:['review'],focuses:['review'],
   observation:'Repeated title forms',retireWhen:'Varied titles',revisitOn:'2027-01-01',markdown:'Consider alternatives.'});
  await edit();
  expect((await read(run.caseId)).lastWholeThemeAssessment?.current).toBe(true);
  await expect(capture(review,evidenceId)).resolves.toMatchObject({automationId:evidenceId,replayed:true});
  const profile=await guides.readWork(owner,'https://plunode.net',{phase:'review',caseId:run.caseId,focuses:['review'],profile:'test-model'});
  expect(profile.assistance).toHaveLength(1);
  expect((await guides.readWork(owner,'https://plunode.net',{phase:'review',focuses:['review']})).assistance).toEqual([]);
  const original=content.required.principles;
  content.required.principles='Read the revised criteria.';
  content.sections[0].markdown=original;
  await edit();
  expect((await read(run.caseId)).lastWholeThemeAssessment?.current).toBe(false);
  await expect(readEvidence(names[0])).resolves.toMatchObject({image:bytes});
  await expect(fenced(review,{action:'update-theme-production',operation:'complete'})).rejects.toMatchObject({code:'PRODUCTION_ASSESSMENT_STALE'});
  await assessment(evidenceId);
  beforeActivation=async()=>{
   content={...content,evidence:{requiredLocales:[],requiredScreens:['image']}};
   return edit();
  };
  await expect(fenced(review,{action:'update-theme-production',operation:'complete'})).resolves.toMatchObject({
   publicationError:{code:'PRODUCTION_ASSESSMENT_STALE'},case:{status:'needs-review',completed:false},
  });
  const next=await resume(review,'review');
  await expect(automation(next,{action:'read-theme-evidence',automationId:evidenceId,name:names[0]})).rejects.toMatchObject({code:'PREVIEW_TARGET_CHANGED'});
  const freshId=randomUUID();
  await capture(next,freshId);
  expect(await worker.runOnce()).toBe(true);
  for(const name of [...names,'ja-1440-image.png','ja-390-image.png'])
   await automation(next,{action:'read-theme-evidence',automationId:freshId,name});
  const target=(await read(run.caseId)).evaluationTarget;
  await fenced(next,{action:'update-theme-production',operation:'assess',assessment:{
   scope:'whole-theme',targetDigest:target.digest,guideRevision:target.guide.revision,
   criteriaRevision:target.guide.criteriaRevision,evidenceRevision:target.guide.evidenceRevision,
   result:'pass',summary:'Independently reassessed with current evidence',reviewEvidenceId:freshId,
  }});
  await expect(fenced(next,{action:'update-theme-production',operation:'complete'})).resolves.toMatchObject({case:{completed:true}});
  content.required.principles='Published history remains closed.';
  await edit();
  expect((await read(run.caseId)).completed).toBe(true);
  expect((await execute({action:'get-theme-production'})).outcome).toBe('none');
 }finally{if(previous===undefined)delete process.env.THEME_AUTOMATION_ENABLED;else process.env.THEME_AUTOMATION_ENABLED=previous;}
},45_000);
