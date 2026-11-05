import {migrateKnowledgeIdentities} from '../lib/server/knowledge-identity-migrate';
import {ensureKnowledgePublicationSchema} from "../lib/server/knowledge-publication";
import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
vi.mock("server-only",()=>({}));
vi.mock("../lib/server/knowledge-read-runtime",()=>({knowledgeReadConfiguration:()=>({databaseUrl:process.env.KNOWLEDGE_CAPSULE_TEST_DATABASE_URL})}));
import {migrateMemberDatabase} from "../lib/server/member/migrate";
import {memberConfig} from "../lib/server/member/config";
import {memberPool} from "../lib/server/member/auth";
import {startMemberOidc} from "./support/member-oidc";
import {memberRuntime} from "../lib/server/member/runtime";
import * as auth from "../app/api/auth/[...all]/route";
import * as profile from "../app/api/member/profile/route";
import * as appealRoute from "../app/api/member/knowledge-submissions/appeals/route";
import * as operatorRoute from "../app/api/site-operations/knowledge/route";
import * as feedbackRoute from "../app/api/member/knowledge-submissions/feedback/route";
import {PUBLICATION_CONSENT_VERSION} from "../lib/domain/knowledge-review-job";
import {knowledgeSubmissionContentSchema} from "../lib/domain/knowledge-submission";
import {createKnowledgeFoundationService,ensureKnowledgeFoundationSchema,knowledgeDigest} from "../lib/server/knowledge-foundation";
import {createKnowledgeAcceptance} from "../lib/server/knowledge-acceptance";
import {runKnowledgeModeration} from "../lib/server/member/knowledge-appeals";
import {SourceCheckError} from "../lib/server/knowledge-source-verification";
import type {ReviewConfig} from "../lib/server/knowledge-review-queue";
const origin="http://127.0.0.1:3221",endpoint="/api/member/knowledge-submissions/appeals";
const request=(path:string,cookie="",method="GET",body?:unknown,headers:Record<string,string>={})=>new Request(origin+path,{method,headers:{cookie,origin,"content-type":"application/json",...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
async function login(identity:string){
 const cookies=new Map<string,string>(),receive=(r:Response)=>{for(const value of r.headers.getSetCookie()){const pair=value.split(";")[0],index=pair.indexOf("=");cookies.set(pair.slice(0,index),pair.slice(index+1));}},cookie=()=>[...cookies].map(([k,v])=>`${k}=${v}`).join("; ");
 const start=await auth.POST(request("/api/auth/sign-in/social","","POST",{provider:"fixture",callbackURL:"/",disableRedirect:true}));expect(start.status).toBe(200);receive(start);
 const authorization=new URL((await start.json()).url);authorization.searchParams.set("fixture_identity",identity);const consent=await fetch(authorization,{redirect:"manual"});expect(consent.status).toBe(302);
 const location=new URL(consent.headers.get("location")!),callback=await auth.GET(request(location.pathname+location.search,cookie()));receive(callback);
 const user=(await (await profile.GET(request("/api/member/profile",cookie()))).json()).user;return {cookie:cookie(),id:user.id as string};
}

let fixture:Awaited<ReturnType<typeof startMemberOidc>>,alice:Awaited<ReturnType<typeof login>>,bob:Awaited<ReturnType<typeof login>>;
const pool=()=>memberRuntime().pool,knowledge=new Pool({connectionString:process.env.KNOWLEDGE_CAPSULE_TEST_DATABASE_URL,max:3});
const foundation=createKnowledgeFoundationService(knowledge),actor={kind:'operator' as const,id:'appeal-integration'},entity='appeal:entity',source='appeal:source';
beforeAll(async()=>{
 const config=memberConfig();if(!config||config.provider.kind!=='fixture'||!process.env.MEMBER_TEST_CONTAINER?.startsWith('gk-member-test-'))throw Error('Use isolated --appeals harness');
 const setup=memberPool(config);try{await migrateMemberDatabase(setup,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true);const ledger=(await setup.query('SELECT name,checksum FROM member_migration ORDER BY name')).rows;await migrateMemberDatabase(setup,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true);expect((await setup.query('SELECT name,checksum FROM member_migration ORDER BY name')).rows).toEqual(ledger);}finally{await setup.end();}
 await ensureKnowledgeFoundationSchema(knowledge);await ensureKnowledgePublicationSchema(knowledge);await migrateKnowledgeIdentities(knowledge);await foundation.execute(actor,{action:'create-bundle',requestId:randomUUID(),entities:[{id:entity,content:{name:'Fixture subject',kind:'person'}}],sources:[{id:source,content:{title:'Fixture source',url:'https://example.org/source'}}],records:[{id:'appeal:seed',content:{kind:'note',subjectId:entity,assertion:'Fixture fact',evidence:[{id:'e',source:{id:source,revision:1},locator:'Body',excerpt:'Fixture fact'}]}}],reason:'isolated fixture'});
 fixture=await startMemberOidc();alice=await login('alice');bob=await login('bob');
 process.env.SITE_OPERATOR_USER_IDS=alice.id;process.env.KNOWLEDGE_REVIEW_ENABLED='1';process.env.KNOWLEDGE_REVIEW_ALLOWED_USERS=[alice.id,bob.id].join(',');process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED='1';
},30000);
afterAll(async()=>{await memberRuntime().pool.end();await knowledge.end();await fixture?.close();});
const post=(body:unknown,user=bob,headers:Record<string,string>={})=>appealRoute.POST(request(endpoint,user.cookie,'POST',body,{'x-member-user':user.id,...headers}));
const op=(body:unknown,user=alice)=>operatorRoute.POST(request('/api/site-operations/knowledge',user.cookie,'POST',body,{'x-member-user':user.id}));
const list=(query='',user=alice)=>operatorRoute.GET(request('/api/site-operations/knowledge'+query,user.cookie,'GET',undefined,{'x-member-user':user.id}));
const getFeedback=(id:string,user=bob)=>feedbackRoute.GET(request('/api/member/knowledge-submissions/feedback?submissionId='+id,user.cookie,'GET',undefined,{'x-member-user':user.id}));
async function seed(state='needs-changes',owner=bob.id){
 const id=randomUUID(),job=randomUUID(),content=knowledgeSubmissionContentSchema.parse({schemaVersion:2,attribution:'anonymous',title:'PRIVATE other title',entityPins:[{id:entity,revision:1}],sourcePins:[{id:source,revision:1}],items:[{key:'one',operation:'add-information',about:{kind:'entity',id:entity,revision:1},record:{kind:'note',subjectId:entity,assertion:'Fixture fact',evidence:[{id:'e',source:{id:source,revision:1},locator:'Body',excerpt:'Fixture fact'}]}},{key:'private-unselected',operation:'add-information',about:{kind:'entity',id:entity,revision:1},record:{kind:'note',subjectId:entity,assertion:'SECRET UNSELECTED',evidence:[]}}]});
 const context={entities:[await foundation.get(actor,'entity',entity)],sources:[await foundation.get(actor,'source',source)]},digest=knowledgeDigest(content);
 await pool().query("INSERT INTO member_knowledge.submissions(id,owner_id,current_revision,state_version,state) VALUES($1,$2,1,2,'queued')",[id,owner]);
 await pool().query('INSERT INTO member_knowledge.submission_revisions(submission_id,revision,raw_input,content,digest,reference_context) VALUES($1,1,$2,$2,$3,$4)',[id,content,digest,context]);
 await pool().query('INSERT INTO member_knowledge.submission_receipts(submission_id,revision,digest) VALUES($1,1,$2)',[id,digest]);
 await pool().query("INSERT INTO member_knowledge.review_authorizations(submission_id,revision,consent_version,consent_profile_id) VALUES($1,1,$2,'google-gemini-free-publish-v1')",[id,PUBLICATION_CONSENT_VERSION]);
 await pool().query("INSERT INTO member_knowledge.review_jobs(id,submission_id,revision,item_key,submitted_digest,consent_version,consent_profile_id,state,reason,result,attempts) VALUES($1,$2,1,'one',$3,$4,'google-gemini-free-publish-v1',$5,'Original result',$6,3)",[job,id,digest,PUBLICATION_CONSENT_VERSION,state,{suitability:'abuse',support:'unsupported',reason:'Original result'}]);
 return {id,job,content,body:{action:'appeal',requestId:randomUUID(),submissionId:id,revision:1,itemKey:'one',detail:'Please review this source passage.',shareWithOperators:true}};
}
async function open(state='needs-changes'){
 await pool().query("UPDATE member_knowledge.appeals SET created_at=clock_timestamp()-interval '25 hours'");const x=await seed(state),r=await post(x.body);expect(r.status).toBe(200);return {...x,appeal:(await r.json()).appeal};
}
const action=(id:string,revision:number,name='respond',extra:Record<string,unknown>={})=>({id,expectedRevision:revision,requestId:randomUUID(),action:name,reason:'Operator explanation for contributor',...extra});
async function inspect(id:string,revision=1){const r=await op(action(id,revision,'inspect'));expect(r.status).toBe(200);return (await r.json()).result;}
const cfg=()=>({allowedUsers:[bob.id,alice.id]} as ReviewConfig);
describe('receipt-bound appeals, real PostgreSQL and OIDC',()=>{
 it('requires current member, expected-user, Origin and explicit sharing',async()=>{
  const x=await seed();expect((await appealRoute.POST(request(endpoint,'','POST',x.body))).status).toBe(400);expect((await post(x.body,bob,{origin:'https://foreign.invalid'})).status).toBe(403);expect((await post({...x.body,shareWithOperators:false})).status).toBe(400);expect((await post(x.body,alice)).status).toBe(404);expect((await post(x.body,bob,{'x-member-user':alice.id})).status).toBe(401);
 });
 it('is idempotent and shares only the selected immutable receipt item',async()=>{
  const x=await open();expect((await post(x.body)).status).toBe(200);expect((await post({...x.body,requestId:randomUUID()})).status).toBe(409);
  const detail=await inspect(x.appeal.id);expect(detail.snapshot.item.record.assertion).toBe('Fixture fact');expect(JSON.stringify(detail)).not.toContain('SECRET UNSELECTED');expect(JSON.stringify(detail)).not.toContain('PRIVATE other title');
  await pool().query("UPDATE member_knowledge.submission_revisions SET content=jsonb_set(content,'{items,0,record,assertion}',$2::jsonb) WHERE submission_id=$1",[x.id,JSON.stringify('Edited after receipt')]);expect((await inspect(x.appeal.id)).snapshot.item.record.assertion).toBe('Fixture fact');
 });
 it('does not expose case content in lists and requires current operator on reads/replays',async()=>{
  const x=await open(),body=action(x.appeal.id,1,'inspect');expect((await list('',bob)).status).toBe(403);const text=JSON.stringify(await (await list()).json());expect(text).not.toContain('Fixture fact');expect(text).not.toContain(x.body.detail);expect((await op(body)).status).toBe(200);
  process.env.SITE_OPERATOR_USER_IDS=bob.id;expect((await op(body)).status).toBe(403);process.env.SITE_OPERATOR_USER_IDS=alice.id;
 });
 it('requires inspection and revision checks, replies notify without modifying the original job',async()=>{
  const x=await open();expect((await op(action(x.appeal.id,1))).status).toBe(409);await inspect(x.appeal.id);expect((await op(action(x.appeal.id,2))).status).toBe(409);
  const body=action(x.appeal.id,1);expect((await op(body)).status).toBe(200);expect((await op(body)).status).toBe(200);expect((await op({...body,reason:'different'})).status).toBe(409);
  const j=(await pool().query('SELECT state,reason FROM member_knowledge.review_jobs WHERE id=$1',[x.job])).rows[0];expect(j).toEqual({state:'needs-changes',reason:'Original result'});
  const result=await (await getFeedback(x.id)).json();expect(result.receipt.unread).toBe(true);expect(result.receipt.items[0].appeal.replies).toHaveLength(1);expect(result.receipt.items[0].appeal.replies[0].reason).toBe(body.reason);
 });
 it('keeps an old receipt appeal readable but never restarts a changed submission',async()=>{
  const x=await open();await inspect(x.appeal.id);await pool().query("UPDATE member_knowledge.submissions SET state='draft',state_version=state_version+1 WHERE id=$1",[x.id]);expect((await op(action(x.appeal.id,1,'recheck'))).status).toBe(409);expect((await op(action(x.appeal.id,1,'respond'))).status).toBe(200);
 });
 it('withdrawal revokes even a replayed inspection and keeps the review unchanged',async()=>{
  const x=await open(),body=action(x.appeal.id,1,'inspect');expect((await op(body)).status).toBe(200);const command={action:'withdraw',id:x.appeal.id,expectedRevision:1,requestId:randomUUID()};expect((await post(command)).status).toBe(200);expect((await post(command)).status).toBe(200);expect((await op(body)).status).toBe(409);expect((await pool().query('SELECT state FROM member_knowledge.review_jobs WHERE id=$1',[x.job])).rows[0].state).toBe('needs-changes');
 });
 it('recheck resets only the job budget, retaining charged attempts and pinned consent',async()=>{
  const x=await open('attention');await inspect(x.appeal.id);await pool().query("INSERT INTO member_knowledge.review_attempts(id,job_id,project_id,provider,model,policy,purpose,state,quota_day,quota_month,input_reserved,output_reserved) VALUES($1,$2,'fixture','gemini','fixture','fixture','submission','delivery-unknown',current_date,'2026-11',100,100)",[randomUUID(),x.job]);expect((await op(action(x.appeal.id,1,'recheck'))).status).toBe(200);
  expect((await pool().query('SELECT state,attempts,consent_profile_id FROM member_knowledge.review_jobs WHERE id=$1',[x.job])).rows[0]).toEqual({state:'queued',attempts:0,consent_profile_id:'google-gemini-free-publish-v1'});expect((await pool().query('SELECT request_charge FROM member_knowledge.review_attempts WHERE job_id=$1',[x.job])).rows[0].request_charge).toBe(1);
 });
 it('operator content confirmation preserves the AI result and still requires the original source',async()=>{
  const x=await open('declined');await inspect(x.appeal.id);expect((await op(action(x.appeal.id,1,'confirm-content'))).status).toBe(200);
  const j=(await pool().query('SELECT state,result,operator_confirmation_id FROM member_knowledge.review_jobs WHERE id=$1',[x.job])).rows[0];expect(j.state).toBe('reviewed');expect(j.result.suitability).toBe('abuse');expect(j.operator_confirmation_id).toBeTruthy();
  const verify=vi.fn(async()=>{throw new SourceCheckError('Fixture source cannot be verified');});await createKnowledgeAcceptance(pool(),knowledge,{},verify).run(cfg());expect(verify).toHaveBeenCalled();expect((await pool().query('SELECT state FROM member_knowledge.review_jobs WHERE id=$1',[x.job])).rows[0].state).toBe('needs-changes');expect((await pool().query('SELECT 1 FROM member_knowledge.publication_decisions WHERE job_id=$1',[x.job])).rowCount).toBe(0);
 });
 it('confirmed content can publish only after source and reference checks, then stops and restores by the same case',async()=>{
  const x=await open('declined');await inspect(x.appeal.id);expect((await op(action(x.appeal.id,1,'confirm-content'))).status).toBe(200);
  const verify=vi.fn(async()=>({url:'https://example.org/source',bodySha256:'proof',textSha256:'proof',excerptSha256:'proof',extractor:'fixture',checkedAt:new Date().toISOString()}));await createKnowledgeAcceptance(pool(),knowledge,{},verify).run(cfg());
  const d=(await pool().query('SELECT * FROM member_knowledge.publication_decisions WHERE job_id=$1',[x.job])).rows[0];expect(d.state).toBe('published');const record=d.command.record.id;
  let detail=await inspect(x.appeal.id);const hide=action(x.appeal.id,detail.case.revision,'hide',{statusRevision:detail.current.publication.status_revision});expect((await op(hide)).status).toBe(200);expect((await op(hide)).status).toBe(200);expect((await knowledge.query("SELECT visibility FROM knowledge75.objects WHERE kind='record' AND id=$1",[record])).rows[0].visibility).toBe('public');
  const delivery=(await pool().query("SELECT * FROM member_knowledge.moderation_decisions WHERE state='pending' ORDER BY created_at LIMIT 1")).rows[0];const applied=await foundation.execute({kind:'operator',id:'site-knowledge-operations'},delivery.command);await pool().query("UPDATE member_knowledge.moderation_decisions SET state='applied',result=$2 WHERE id=$1",[delivery.id,applied]);expect(await runKnowledgeModeration(pool(),knowledge)).toBe(true);expect((await pool().query('SELECT notified_at FROM member_knowledge.moderation_decisions WHERE id=$1',[delivery.id])).rows[0].notified_at).toBeTruthy();await expect(foundation.get({kind:'reader',id:'reader'},'record',record)).rejects.toThrow();detail=await inspect(x.appeal.id);expect(detail.moderation.state).toBe('applied');expect(detail.current.publication.visibility).toBe('hidden');
  expect((await op(action(x.appeal.id,detail.case.revision,'restore',{statusRevision:detail.current.publication.status_revision}))).status).toBe(200);await runKnowledgeModeration(pool(),knowledge);expect((await foundation.get({kind:'reader',id:'reader'},'record',record)).id).toBe(record);
 });
 it('an operator confirmation cannot bypass a stopped reference',async()=>{
  const x=await open('declined');await inspect(x.appeal.id);expect((await op(action(x.appeal.id,1,'confirm-content'))).status).toBe(200);
  const status=(await knowledge.query("SELECT status_revision FROM knowledge75.objects WHERE kind='entity' AND id=$1",[entity])).rows[0].status_revision;
  await foundation.execute(actor,{action:'set-visibility',requestId:randomUUID(),kind:'entity',id:entity,expectedStatusRevision:status,visibility:'hidden',reason:'isolated stop'});
  try{await createKnowledgeAcceptance(pool(),knowledge,{},async()=>({url:'https://example.org/source',bodySha256:'fixture',textSha256:'fixture',excerptSha256:'fixture',extractor:'fixture',checkedAt:new Date().toISOString()})).run(cfg());expect((await pool().query('SELECT state FROM member_knowledge.review_jobs WHERE id=$1',[x.job])).rows[0].state).toBe('needs-changes');expect((await pool().query('SELECT 1 FROM member_knowledge.publication_decisions WHERE job_id=$1',[x.job])).rowCount).toBe(0);}finally{await foundation.execute(actor,{action:'set-visibility',requestId:randomUUID(),kind:'entity',id:entity,expectedStatusRevision:status+1,visibility:'public',reason:'isolated restore'});}
 });
 it('retains a committed public visibility action after the private submission is erased',async()=>{
  const x=await open('published'),record='appeal:seed',command={record:{id:record}};
  await pool().query("INSERT INTO member_knowledge.publication_decisions(id,job_id,command,digest,references_json,proofs,state,result) VALUES($1,$1,$2,'fixture','[]','{}','published',$3)",[x.job,command,{id:record,revision:1}]);
  const detail=await inspect(x.appeal.id);expect((await op(action(x.appeal.id,1,'hide',{statusRevision:detail.current.publication.status_revision}))).status).toBe(200);
  await pool().query('DELETE FROM member_knowledge.submissions WHERE id=$1',[x.id]);
  expect((await pool().query("SELECT appeal_id FROM member_knowledge.moderation_decisions WHERE command->>'id'=$1 AND state='pending'",[record])).rows[0].appeal_id).toBeNull();await runKnowledgeModeration(pool(),knowledge);
  await expect(foundation.get({kind:'reader',id:'reader'},'record',record)).rejects.toThrow();
  const status=(await knowledge.query("SELECT status_revision FROM knowledge75.objects WHERE kind='record' AND id=$1",[record])).rows[0].status_revision;
  await foundation.execute(actor,{action:'set-visibility',requestId:randomUUID(),kind:'record',id:record,expectedStatusRevision:status,visibility:'public',reason:'restore shared fixture'});
 });
 it('paginates tied timestamps completely and caps repeated daily requests',async()=>{
  await pool().query("UPDATE member_knowledge.appeals SET created_at=clock_timestamp()-interval '25 hours'");
  for(let i=0;i<6;i++){const x=await seed();expect((await post(x.body)).status).toBe(i<5?200:429);}
  for(let i=0;i<52;i++){const x=await seed();await pool().query("INSERT INTO member_knowledge.appeals(id,job_id,request_id,payload_hash,snapshot,detail,created_at) VALUES($1,$2,$3,'fixture','{}','Fixture pagination','2026-01-01T00:00:00.123456Z')",[randomUUID(),x.job,randomUUID()]);}
  const ids=new Set<string>();let before:string|null=null;
  do{const r=await list('?status=all'+(before?'&before='+encodeURIComponent(before):''));expect(r.status).toBe(200);const data=await r.json();for(const row of data.items){expect(ids.has(row.id)).toBe(false);ids.add(row.id);}before=data.nextBefore;}while(before);
  expect(ids.size).toBe((await pool().query('SELECT count(*)::int AS n FROM member_knowledge.appeals')).rows[0].n);
 });
 it('rejects changed consent, inactive members and a stopped reference even on an operator exception',async()=>{
  const x=await open();await inspect(x.appeal.id);await pool().query("UPDATE member_knowledge.review_authorizations SET consent_profile_id='different' WHERE submission_id=$1",[x.id]);expect((await op(action(x.appeal.id,1,'confirm-content'))).status).toBe(409);await pool().query('UPDATE "user" SET active=false WHERE id=$1',[bob.id]);try{expect((await op(action(x.appeal.id,1,'inspect'))).status).toBe(409);}finally{await pool().query('UPDATE "user" SET active=true WHERE id=$1',[bob.id]);}
 });
});
