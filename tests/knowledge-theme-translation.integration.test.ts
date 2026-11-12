import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {Pool} from 'pg';
import type {SubmitThemeTranslation} from '../lib/domain/knowledge-theme-translation';
import {randomUUID} from 'node:crypto';
import {migrateMemberDatabase} from '../lib/server/member/migrate';
import {createKnowledgeFoundationService,KnowledgeError,knowledgeDigest} from '../lib/server/knowledge-foundation';
import {migrateKnowledgeTranslations} from '../lib/server/knowledge-translation-migrate';
import {migrateKnowledgeIdentities} from '../lib/server/knowledge-identity-migrate';
import {createKnowledgePublicationService,ensureKnowledgePublicationSchema} from '../lib/server/knowledge-publication';
import {createThemeTranslationAuthoring,themeTranslationOperationId} from '../lib/server/knowledge-theme-translation';
import {createKnowledgeSubmissionService} from '../lib/server/knowledge-submissions';
import {createReviewQueue,reviewConfigSchema} from '../lib/server/knowledge-review-queue';
import {runKnowledgeReviewOnce} from '../scripts/knowledge-review-worker';
import {createKnowledgeAcceptance} from '../lib/server/knowledge-acceptance';
import {captureKnowledgeCapsule} from '../lib/client/capsule-knowledge';
import {repairOperatorTranslationPrivacy} from '../lib/server/knowledge-operator-intake';
import {submissionNotificationSummary} from '../lib/server/member/knowledge-submission-feedback';
import {persistPublicationContributor,finalizePublicationContributor} from '../lib/server/member/knowledge-contributors';
import {PUBLICATION_CONSENT_VERSION} from '../lib/domain/knowledge-review-job';
const pool=new Pool({connectionString:process.env.MEMBER_DATABASE_URL,max:6}),knowledge=new Pool({connectionString:process.env.KNOWLEDGE_CAPSULE_TEST_DATABASE_URL,max:4});
const owner=randomUUID(),other=randomUUID(),operator={kind:'operator' as const,id:'fixture'};
let foundation:ReturnType<typeof createKnowledgeFoundationService>;
const queue=createReviewQueue(pool);
const cfg=reviewConfigSchema.parse({projectId:'chat-translation-fixture',billingTier:'free',verifiedAt:new Date().toISOString(),model:'gemini-3.1-flash-lite',rpm:15,tokensPerMinute:500000,requestsPerDay:300,requestsPerMonth:9000,inputTokensPerDay:1000000,outputTokensPerDay:1000000,inputTokensPerMonth:30000000,outputTokensPerMonth:30000000,apiKeyFile:'/unused',allowedUsers:[owner,other]});
const authorize=async(id:string)=>{if(!([owner,other] as string[]).includes(id)||(await pool.query('SELECT active FROM "user" WHERE id=$1',[id])).rows[0]?.active!==true)throw new KnowledgeError('運営者ではありません',403,'OPERATOR_REQUIRED');};
const service=()=>createThemeTranslationAuthoring(pool,knowledge,'https://plunode.net',authorize);
const target={kind:'theme' as const,id:'theme',revision:1,field:'title' as const};
const input=()=>({requestId:randomUUID(),theme:{id:'theme',revision:1},translation:{target,language:'en',text:'A history',expectedRevision:0},attribution:'profile' as const});
const response=()=>({state:'received' as const,status:200,raw:{responseId:'fixture',modelVersion:cfg.model,usageMetadata:{promptTokenCount:100,candidatesTokenCount:20,thoughtsTokenCount:0,totalTokenCount:120},candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({suitability:'legitimate',support:'supported',reason:'The translation preserves the original meaning.'})}]}}]}});
beforeAll(async()=>{
 expect(process.env.MEMBER_TEST_CONTAINER).toMatch(/^gk-member-test-/);expect((await pool.query('SELECT current_database() name')).rows[0].name).toBe('graph_member_test');expect((await knowledge.query('SELECT current_database() name')).rows[0].name).toBe('plunode_knowledge75_test_capsule_share');
 await migrateMemberDatabase(pool,...Array(29).fill(true));
 vi.stubEnv('KNOWLEDGE_REVIEW_ENABLED','1');vi.stubEnv('KNOWLEDGE_REVIEW_ALLOWED_USERS',owner+','+other);vi.stubEnv('KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED','1');
},30000);
beforeEach(async()=>{
 await pool.query('TRUNCATE member_knowledge.submissions CASCADE');await pool.query('DELETE FROM member_knowledge.review_attempts');await pool.query('DELETE FROM member_knowledge.review_projects');
 await pool.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt",active,locale) VALUES($1,$2,$3,true,now(),now(),true,$7),($4,$5,$6,true,now(),now(),true,$7) ON CONFLICT(id) DO UPDATE SET active=true',[owner,'Operator','translation-owner@example.org',other,'Other operator','translation-other@example.org','ja']);
 await knowledge.query('DROP SCHEMA IF EXISTS knowledge75 CASCADE');foundation=createKnowledgeFoundationService(knowledge);
 await foundation.execute(operator,{action:'create-bundle',requestId:randomUUID(),reason:'Isolated public translation originals',entities:[{id:'entity',content:{name:'対象A',kind:'person',textLanguages:{name:{tag:'ja',basis:'declared'}}}}],sources:[{id:'source',content:{title:'一次資料',url:'https://example.org/source',language:'ja'}}],records:[{id:'record',content:{kind:'note',subjectId:'entity',assertion:'対象Aは2003年に設立した。',times:[{id:'founding',time:{kind:'calendar',from:'2003',label:'設立の年'}}],textLanguages:{assertion:{tag:'ja',basis:'declared'}},evidence:[{id:'q',source:{id:'source',revision:1},locator:'本文',excerpt:'対象Aは2003年に設立した。'}]}}]});
 await migrateKnowledgeTranslations(knowledge);await migrateKnowledgeIdentities(knowledge);await ensureKnowledgePublicationSchema(knowledge);
 await foundation.execute(operator,{action:'create-theme',requestId:randomUUID(),id:'theme',title:'Aの歴史',timeline:{version:1,axes:[{id:'history',kind:'calendar',label:'設立までの歩み'}],placements:[{recordId:'record',timeId:'founding',axisId:'history'}],insets:[]},textLanguages:{title:{tag:'ja',basis:'declared'}},recordPins:[{id:'record',revision:1}],reason:'Public theme'});
 await knowledge.query("INSERT INTO knowledge75.published_revisions(kind,id,revision) SELECT kind,id,current_revision FROM knowledge75.objects ON CONFLICT DO NOTHING");
 await queue.heartbeat(cfg);
},30000);
afterAll(async()=>{await pool.end();await knowledge.end();vi.unstubAllEnvs();});
it('reads public fields belonging to the exact theme, rejecting unrelated and hidden originals',async()=>{
 const s=service(),v=input();expect(await s.read(owner,{theme:v.theme,target,language:'en'})).toMatchObject({original:{text:'Aの歴史'},translation:null,expectedRevision:0,textLimit:200});
 await expect(s.read(owner,{theme:v.theme,target:{...target,kind:'entity',id:'other',field:'name'},language:'en'})).rejects.toMatchObject({code:'THEME_MEMBER_REQUIRED'});
 await foundation.execute(operator,{action:'set-visibility',requestId:randomUUID(),kind:'source',id:'source',expectedStatusRevision:1,visibility:'hidden',reason:'Hide source'});
 await expect(s.read(owner,{theme:v.theme,target,language:'en'})).rejects.toBeTruthy();
});
it('keeps retries immutable and owner-scoped, and does not resurrect a cancellation',async()=>{
 const s=service(),v=input();const results=await Promise.all([s.submit(owner,v),s.submit(owner,v)]);expect(results.every(r=>r.state==='published')).toBe(true);
 expect((await pool.query('SELECT count(*)::int n FROM member_knowledge.submissions')).rows[0].n).toBe(1);expect((await pool.query('SELECT count(*)::int n FROM member_knowledge.review_jobs')).rows[0].n).toBe(0);
 await expect(s.submit(owner,{...v,translation:{...v.translation,text:'Different'}})).rejects.toMatchObject({code:'REQUEST_CONFLICT'});
 await expect(s.status(other,v.requestId)).rejects.toMatchObject({code:'NOT_FOUND'});
 expect(await s.cancel(owner,v.requestId)).toMatchObject({state:'published'});await s.submit(owner,v);expect(await s.status(owner,v.requestId)).toMatchObject({state:'published'});expect(await queue.claim(cfg)).toBeNull();
});
it('resumes a lost acknowledgement without silently queueing a read, and refuses changed proposals',async()=>{
 const v=input(),hook=vi.fn().mockRejectedValueOnce(Error('Lost response')),s=createThemeTranslationAuthoring(pool,knowledge,'https://plunode.net',authorize,{afterCapture:hook});
 await expect(s.submit(owner,v)).rejects.toThrow('Lost response');expect(await s.status(owner,v.requestId)).toMatchObject({state:'saved'});expect((await pool.query('SELECT count(*)::int n FROM member_knowledge.review_jobs')).rows[0].n).toBe(0);
 expect(await s.submit(owner,v)).toMatchObject({state:'published'});expect((await pool.query('SELECT count(*)::int n FROM member_knowledge.submissions')).rows[0].n).toBe(1);
});
async function publish(s:ReturnType<typeof service>,v:SubmitThemeTranslation){
 const result=await s.submit(owner,v);expect(result).toMatchObject({state:'published'});
 expect((await pool.query('SELECT count(*)::int n FROM member_knowledge.review_jobs')).rows[0].n).toBe(0);
 expect((await pool.query('SELECT count(*)::int n FROM member_knowledge.review_attempts')).rows[0].n).toBe(0);
 return result;
}
// Historical fixture deliberately recreates the superseded member-review path
// to protect compatibility/privacy repair; new operator registration never uses it.
async function legacyPublish(v:SubmitThemeTranslation){
 const s=createThemeTranslationAuthoring(pool,knowledge,'https://plunode.net',authorize,{afterCapture:async()=>{throw Error('historical capture');}});
 await expect(s.submit(owner,v)).rejects.toThrow('historical capture');
 const id=themeTranslationOperationId(owner,v.requestId,'submission');
 await pool.query("UPDATE member_knowledge.submission_revisions SET source_capsule=jsonb_set(source_capsule,'{kind}','\"selection\"'::jsonb) WHERE submission_id=$1",[id]);
 const store=createKnowledgeSubmissionService(pool,{memberStore:true,dataset:'public-kg'}),draft=await store.get(owner,id);
 const queued=await store.execute(owner,{action:'submit',requestId:themeTranslationOperationId(owner,v.requestId,'submit'),id,expectedVersion:draft.version});
 await queue.authorize(owner,{action:'review',requestId:themeTranslationOperationId(owner,v.requestId,'review'),id,expectedVersion:queued.version,consentVersion:PUBLICATION_CONSENT_VERSION});
 const dispatch=vi.fn(async()=>response());expect(await runKnowledgeReviewOnce(queue,cfg,dispatch)).toBe(true);expect(dispatch).toHaveBeenCalledTimes(1);
 const engine=createKnowledgeAcceptance(pool,knowledge,{});expect(await engine.run(cfg)).toBe(true);await engine.run(cfg);return service().status(owner,v.requestId);
}
it('publishes operator translations without member review or AI while retaining only private operator ownership',async()=>{
 const s=service(),v=input(),resolved=await foundation.resolveTheme({kind:'reader',id:'fixture'},'theme'),cap=captureKnowledgeCapsule({title:'Saved',snapshot:resolved.snapshot}),saved=knowledgeDigest(cap);
 const accepted=await publish(s,v);expect(accepted).toMatchObject({state:'published',publication:{kind:'translation',revision:1},review:null});
 const read=await s.read(owner,{theme:v.theme,target,language:'en'});expect(read.translation).toMatchObject({revision:1,text:'A history'});expect((await foundation.resolveTheme({kind:'reader',id:'fixture'},'theme')).theme).toEqual(resolved.theme);
 expect((await foundation.get({kind:'reader',id:'fixture'},'theme','theme')).revision).toBe(1);expect(knowledgeDigest(cap)).toBe(saved);
 expect((await pool.query('SELECT * FROM member_knowledge.publication_contributors WHERE submission_id=$1',[accepted.submissionId])).rows).toEqual([]);
 expect((await pool.query('SELECT owner_id FROM member_knowledge.submissions WHERE id=$1',[accepted.submissionId])).rows[0].owner_id).toBe(owner);
 expect((await pool.query("SELECT source_capsule->>'kind' AS kind FROM member_knowledge.submission_revisions WHERE submission_id=$1 AND revision=1",[accepted.submissionId])).rows[0].kind).toBe('operator-api');
 expect(await createKnowledgeSubmissionService(pool,{memberStore:true,dataset:'public-kg'}).list(owner)).toEqual([]);
 expect(await submissionNotificationSummary(pool,owner)).toMatchObject({unreadCount:0});
 await expect(s.submit(owner,{...input(),translation:{...v.translation,text:'History of A'}})).rejects.toMatchObject({code:'TRANSLATION_CONFLICT'});
 const update={...input(),translation:{...v.translation,text:'History of A',expectedRevision:1}};expect(await publish(s,update)).toMatchObject({state:'published',publication:{revision:2}});
 expect(await s.read(owner,{theme:v.theme,target,language:'en',revision:1})).toMatchObject({translation:{text:'A history',revision:1}});
 expect(await s.cancel(owner,update.requestId)).toMatchObject({state:'published'});expect((await s.read(owner,{theme:v.theme,target,language:'en'})).translation?.text).toBe('History of A');
 expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.revisions WHERE kind='theme'")).rows[0].n).toBe(1);
});
it('retains private ownership independently of the legacy attribution preference',async()=>{
 const s=service(),v={...input(),attribution:'anonymous' as const};const result=await publish(s,v);
 expect((await pool.query('SELECT * FROM member_knowledge.publication_contributors WHERE submission_id=$1',[result.submissionId])).rows).toEqual([]);
 expect((await pool.query('SELECT owner_id FROM member_knowledge.submissions WHERE id=$1',[result.submissionId])).rows[0].owner_id).toBe(owner);
});

it('keeps completed system history outside personal draft capacity and system pending capacity',async()=>{
 const s=service(),v=input(),accepted=await publish(s,v),ids=Array.from({length:100},()=>randomUUID());
 await pool.query("INSERT INTO member_knowledge.submissions(id,owner_id,current_revision,state_version,state) SELECT id,$2,1,1,'queued' FROM unnest($1::uuid[]) id",[ids,owner]);
 await pool.query("INSERT INTO member_knowledge.submission_revisions(submission_id,revision,raw_input,content,digest,source_capsule,reference_context) SELECT id,1,r.raw_input,r.content,r.digest,r.source_capsule,r.reference_context FROM unnest($1::uuid[]) id CROSS JOIN member_knowledge.submission_revisions r WHERE r.submission_id=$2 AND r.revision=1",[ids,accepted.submissionId]);
 await pool.query("INSERT INTO member_knowledge.submission_receipts(submission_id,revision,digest,submitted_at) SELECT id,1,'fixture',clock_timestamp()-interval '2 days' FROM unnest($1::uuid[]) id",[ids]);
 await pool.query("INSERT INTO member_knowledge.review_jobs(id,submission_id,revision,item_key,submitted_digest,consent_version,consent_profile_id,state) SELECT gen_random_uuid(),id,1,'translation','fixture',$2,'google-gemini-free-publish-v1','published' FROM unnest($1::uuid[]) id",[ids,PUBLICATION_CONSENT_VERSION]);
 const store=createKnowledgeSubmissionService(pool,{memberStore:true,dataset:'public-kg'}),draft=await store.get(owner,accepted.submissionId),manual=randomUUID();
 await expect(store.execute(owner,{action:'save',requestId:randomUUID(),id:manual,expectedVersion:0,content:{...draft.content,title:'個人の草稿'}})).resolves.toMatchObject({id:manual});
 expect((await store.list(owner)).map(x=>x.id)).toEqual([manual]);
 await expect(s.submit(owner,{...input(),translation:{...v.translation,text:'History of A',expectedRevision:1}})).resolves.toMatchObject({state:'published'});
});

it('repairs old API credits without modifying originals, personal form drafts, ownership or immutable retries',async()=>{
 const s=service(),v=input(),result=await legacyPublish(v),publication=result.review!.items[0].publication!;
 // The old API captured the exact same server template without a route marker.
 await pool.query("UPDATE member_knowledge.submission_revisions SET source_capsule=(source_capsule-'requestId')||'{\"kind\":\"selection\"}'::jsonb WHERE submission_id=$1",[result.submissionId]);
 const decision=(await pool.query('SELECT id FROM member_knowledge.publication_decisions WHERE job_id=(SELECT id FROM member_knowledge.review_jobs WHERE submission_id=$1)',[result.submissionId])).rows[0].id;
 const c=await pool.connect();try{await persistPublicationContributor(c,{decisionId:decision,ownerId:owner,attribution:'profile',recordId:publication.id!,submissionId:result.submissionId,submissionRevision:1,operation:'translate-text',entityIds:[],themeIds:['theme']});await finalizePublicationContributor(c,decision,{id:publication.id!,revision:publication.revision!});}finally{c.release();}
 const store=createKnowledgeSubmissionService(pool,{memberStore:true,dataset:'public-kg'}),draft=await store.get(owner,result.submissionId);
 const manualId=randomUUID();await store.execute(owner,{action:'save',requestId:randomUUID(),id:manualId,expectedVersion:0,content:{...draft.content,title:'訳文の投稿',items:draft.content.items.map(i=>({...i,about:undefined}))}},{content:{...draft.content,title:'訳文の投稿',items:draft.content.items.map(i=>({...i,about:undefined}))},captured:draft.context});
 const before=(await pool.query('SELECT raw_input,content,digest FROM member_knowledge.submission_revisions WHERE submission_id=$1',[result.submissionId])).rows;
 expect(await repairOperatorTranslationPrivacy(pool,[owner])).toMatchObject({systemIntakes:1,personalCredits:1,applied:false});
 expect(await repairOperatorTranslationPrivacy(pool,[owner],true)).toMatchObject({systemIntakes:1,personalCredits:1,applied:true});
 expect(await repairOperatorTranslationPrivacy(pool,[owner],true)).toMatchObject({systemIntakes:1,personalCredits:0});
 expect((await pool.query('SELECT raw_input,content,digest FROM member_knowledge.submission_revisions WHERE submission_id=$1',[result.submissionId])).rows).toEqual(before);
 expect((await pool.query('SELECT * FROM member_knowledge.publication_contributors WHERE submission_id=$1',[result.submissionId])).rows).toEqual([]);
 expect((await pool.query('SELECT owner_id FROM member_knowledge.submissions WHERE id=$1',[result.submissionId])).rows[0].owner_id).toBe(owner);
 expect((await store.list(owner)).map(x=>x.id)).toEqual([manualId]);
 expect(await s.submit(owner,v)).toMatchObject({state:'published',submissionId:result.submissionId});
});
it('never submits a later member edit when retrying an interrupted capture',async()=>{
 const v=input(),s=createThemeTranslationAuthoring(pool,knowledge,'https://plunode.net',authorize,{afterCapture:async()=>{throw Error('lost');}});await expect(s.submit(owner,v)).rejects.toThrow('lost');
 const store=createKnowledgeSubmissionService(pool,{memberStore:true,dataset:'public-kg'}),draft=await store.get(owner,themeTranslationOperationId(owner,v.requestId,'submission'));
 await store.execute(owner,{action:'save',id:draft.id,expectedVersion:draft.version,requestId:randomUUID(),content:{...draft.content,title:'Later user edit'}});
 await expect(service().submit(owner,v)).rejects.toMatchObject({code:'VERSION_CONFLICT'});expect((await pool.query('SELECT count(*)::int n FROM member_knowledge.review_jobs')).rows[0].n).toBe(0);
});

it('serves only public fixed-version translations in the same theme catalogue without replacing originals',async()=>{
 const s=service(),v=input();await publish(s,v);
 const catalogue=createKnowledgePublicationService(knowledge,{} as never);
 const page=await catalogue.themes();expect(page.themes[0]).toMatchObject({title:'Aの歴史',revision:1,translations:[{text:'A history',language:'en',target}]});
 await knowledge.query("UPDATE knowledge75.text_translation_heads SET visibility='hidden'");
 expect((await catalogue.themes()).themes[0].translations).toBeUndefined();
});

it('publishes temporal headings and time labels through the operator route without editing the original Theme or dates',async()=>{
 const s=service(),before=await foundation.resolveTheme({kind:'reader',id:'fixture'},'theme');
 for(const [target,text] of [[{kind:'theme',id:'theme',revision:1,field:'axisLabel',axisId:'history'},'History before founding'],[{kind:'record',id:'record',revision:1,field:'timeLabel',timeId:'founding'},'Year of founding']] as const){
  const v={...input(),translation:{target,language:'en',text,expectedRevision:0}};
  expect(await publish(s,v)).toMatchObject({state:'published'});
  expect((await s.read(owner,{theme:v.theme,target,language:'en'})).translation?.text).toBe(text);
 }
 expect(await foundation.resolveTheme({kind:'reader',id:'fixture'},'theme')).toEqual(before);
 await foundation.execute(operator,{action:'set-visibility',requestId:randomUUID(),kind:'source',id:'source',expectedStatusRevision:1,visibility:'hidden',reason:'Hide source'});
 await expect(s.read(owner,{theme:{id:'theme',revision:1},target:{kind:'theme',id:'theme',revision:1,field:'axisLabel',axisId:'history'},language:'en'})).rejects.toBeTruthy();
});

it('rejects accidental operator review authorization and never claims an old operator job',async()=>{
 const v=input(),s=createThemeTranslationAuthoring(pool,knowledge,'https://plunode.net',authorize,{afterCapture:async()=>{throw Error('pause');}});
 await expect(s.submit(owner,v)).rejects.toThrow('pause');
 const store=createKnowledgeSubmissionService(pool,{memberStore:true,dataset:'public-kg'}),draft=await store.get(owner,themeTranslationOperationId(owner,v.requestId,'submission'));
 const queued=await store.execute(owner,{action:'submit',requestId:randomUUID(),id:draft.id,expectedVersion:draft.version});
 await expect(queue.authorize(owner,{action:'review',requestId:randomUUID(),id:draft.id,expectedVersion:queued.version,consentVersion:PUBLICATION_CONSENT_VERSION})).rejects.toMatchObject({code:'OPERATOR_INTAKE_NOT_REVIEWABLE'});
 await pool.query("INSERT INTO member_knowledge.review_jobs(id,submission_id,revision,item_key,submitted_digest,consent_version,consent_profile_id,state) VALUES(gen_random_uuid(),$1,$2,'translation',$3,$4,'google-gemini-free-publish-v1','queued')",[draft.id,draft.revision,draft.digest,PUBLICATION_CONSENT_VERSION]);
 expect(await queue.claim(cfg)).toBeNull();expect((await pool.query('SELECT count(*)::int n FROM member_knowledge.review_attempts')).rows[0].n).toBe(0);
});
it('publishes an operator translation while the member AI review feature is disabled',async()=>{
 vi.stubEnv('KNOWLEDGE_REVIEW_ENABLED','0');try{expect(await service().submit(owner,input())).toMatchObject({state:'published'});}finally{vi.stubEnv('KNOWLEDGE_REVIEW_ENABLED','1');}
});

it('keeps an interrupted translation cancellable before any publication',async()=>{
 const v=input(),s=createThemeTranslationAuthoring(pool,knowledge,'https://plunode.net',authorize,{afterCapture:async()=>{throw Error('capture-only');}});
 await expect(s.submit(owner,v)).rejects.toThrow('capture-only');expect(await service().cancel(owner,v.requestId)).toMatchObject({state:'cancelled'});
 expect(await service().submit(owner,v)).toMatchObject({state:'cancelled'});
 expect((await service().read(owner,{theme:v.theme,target,language:'en'})).translation).toBeNull();
});
