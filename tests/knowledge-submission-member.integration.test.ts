import {entityCorrectionSummary} from '../lib/domain/knowledge-entity-correction';
import {readKnowledgeRecordVersion} from '../lib/server/knowledge-record-version';
import {migrateKnowledgeIdentities} from '../lib/server/knowledge-identity-migrate';
import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {Pool} from "pg";
import {createReviewQueue,reviewConfigSchema,quotaDate,type ReviewConfig} from "../lib/server/knowledge-review-queue";
import {knowledgeSubmissionSchema} from "../lib/domain/knowledge-submission";
import {buildKnowledgePublishedRecord} from "../lib/domain/knowledge-publication";
import {captureKnowledgeCapsule} from "../lib/client/capsule-knowledge";
import type {KnowledgeSnapshot} from "../lib/domain/knowledge-foundation";
import {createKnowledgeContributors} from "../lib/server/member/knowledge-contributors";
import {createKnowledgeAcceptance} from "../lib/server/knowledge-acceptance";
import {migrateKnowledgeTranslations} from "../lib/server/knowledge-translation-migrate";
import {readKnowledgeTranslationById,readKnowledgeTextOriginal,readKnowledgeTranslation,createKnowledgeFoundationService} from "../lib/server/knowledge-foundation";
import {ensureKnowledgePublicationSchema} from "../lib/server/knowledge-publication";
import {matchSourceExcerpt,SourceCheckError} from "../lib/server/knowledge-source-verification";
import {REVIEW_CONSENT_VERSION,PUBLICATION_CONSENT_VERSION} from "../lib/domain/knowledge-review-job";
import {runKnowledgeReviewOnce} from "../scripts/knowledge-review-worker";
import {migrateMemberDatabase} from "../lib/server/member/migrate";
import {memberConfig} from "../lib/server/member/config";
import {memberPool} from "../lib/server/member/auth";
import {operateMember} from "../lib/server/member/operations";
import {startMemberOidc} from "./support/member-oidc";
const publicRead=vi.hoisted(()=>({dto:null as unknown,detail:null as null|((id:string)=>Promise<unknown>),entities:null as null|((id:string)=>Promise<unknown>),translationById:null as null|((id:string,revision?:number)=>Promise<unknown>),recordVersion:null as null|((id:string,revision:number)=>Promise<unknown>),textOriginal:null as null|((target:unknown)=>Promise<unknown>),textTranslation:null as null|((target:unknown,language:string)=>Promise<unknown>)}));
vi.mock("../lib/server/knowledge-publication-preview",()=>({knowledgePublicationPreview:async()=>({detail:async(q:{recordId:string})=>(publicRead.dto as {record?:{id:string}}|null)?.record?.id===q.recordId?({generation:"fixture",record:publicRead.dto}):publicRead.detail!(q.recordId),entities:async(q:{entityId:string})=>publicRead.entities!(q.entityId),recordVersion:async(id:string,revision:number)=>publicRead.recordVersion!(id,revision),translationById:async(id:string,revision?:number)=>publicRead.translationById!(id,revision),textOriginal:async(t:unknown)=>publicRead.textOriginal!(t),textTranslation:async(t:unknown,l:string)=>publicRead.textTranslation!(t,l)})}));
vi.mock("server-only",()=>({}));
import {memberRuntime} from "../lib/server/member/runtime";
import * as authRoute from "../app/api/auth/[...all]/route";
import * as api from "../app/api/member/knowledge-submissions/route";
import * as item from "../app/api/member/knowledge-submissions/[id]/route";
import * as candidates from "../app/api/member/knowledge-submissions/capsule/route";
import * as adviceApi from "../app/api/member/knowledge-submissions/advice/route";
import * as profile from "../app/api/member/profile/route";
import * as capsules from "../app/api/member/capsules/route";
import * as capsuleItem from "../app/api/member/capsules/[id]/route";
const origin = "http://127.0.0.1:3221";
function request(path: string, cookie = "", method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`${origin}${path}`, { method, headers: { cookie, origin, "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
function jar() {
  const cookies = new Map<string, string>();
  return {
    receive(response: Response) {
      for (const header of response.headers.getSetCookie()) {
        const pair = header.split(";")[0];
        const index = pair.indexOf("=");
        cookies.set(pair.slice(0, index), pair.slice(index + 1));
      }
    },
    get value() { return [...cookies].map(([key, value]) => `${key}=${value}`).join("; "); },
  };
}
async function login(identity: string, mode = "valid") {
  const cookies = jar();
  const start = await authRoute.POST(request("/api/auth/sign-in/social", "", "POST", { provider: "fixture", callbackURL: "/", disableRedirect: true }));
  expect(start.status).toBe(200);
  cookies.receive(start);
  const authorization = new URL((await start.json()).url);
  authorization.searchParams.set("fixture_identity", identity);
  authorization.searchParams.set("fixture_mode", mode);
  const consent = await fetch(authorization, { redirect: "manual" });
  expect(consent.status).toBe(302);
  const callback = await authRoute.GET(request(new URL(consent.headers.get("location")!).pathname + new URL(consent.headers.get("location")!).search, cookies.value));
  cookies.receive(callback);
  return { cookies, callback };
}

let acceptanceKnowledge:Pool;
let fixture:Awaited<ReturnType<typeof startMemberOidc>>,alice:Awaited<ReturnType<typeof login>>,bob:Awaited<ReturnType<typeof login>>,aliceId:string,bobId:string;
const ctx=(id:string)=>({params:Promise.resolve({id})});
const content=(assertion="架空の観測所の設立について。")=>({schemaVersion:2,attribution:"anonymous",title:"投稿の検証",entities:[{id:"new-observatory",content:{name:"架空の観測所",kind:"organization"}}],sources:[{id:"source-a",content:{title:"検証用資料",url:"https://example.invalid/public"}}],items:[{key:"record-a",operation:"create-entity",record:{kind:"note",subjectId:"new-observatory",assertion,evidence:[{id:"evidence-a",source:{id:"source-a",revision:1},locator:"冒頭",excerpt:"架空の観測所は2003年に設立された。",stance:"support"}]}}]});
const save=(id=randomUUID(),expectedVersion=0,value:unknown=content())=>({action:"save",requestId:randomUUID(),id,expectedVersion,content:value});
const post=(body:unknown,cookie=alice.cookies.value,user=aliceId,headers:Record<string,string>={})=>api.POST(request("/api/member/knowledge-submissions",cookie,"POST",body,{"x-member-user":user,...headers}));
const current=async(id:string,cookie=alice.cookies.value,user=aliceId)=>item.GET(request("/api/member/knowledge-submissions/"+id,cookie,"GET",undefined,{"x-member-user":user}),ctx(id));
beforeAll(async()=>{
 const config=memberConfig();if(!config||config.provider.kind!=="fixture"||process.env.KNOWLEDGE_SUBMISSIONS_ENABLED!=="1")throw Error("Use the disposable --submissions harness");
 acceptanceKnowledge=new Pool({connectionString:process.env.KNOWLEDGE_CAPSULE_TEST_DATABASE_URL});await ensureKnowledgePublicationSchema(acceptanceKnowledge);await migrateKnowledgeIdentities(acceptanceKnowledge);await migrateKnowledgeTranslations(acceptanceKnowledge);
 fixture=await startMemberOidc();const pool=memberPool(config);
 const foundation=createKnowledgeFoundationService(acceptanceKnowledge);
 publicRead.detail=async id=>{const record=await foundation.get({kind:'reader',id:'public'},'record',id),all=await foundation.list({kind:'reader',id:'public'});return {generation:'fixture',record:buildKnowledgePublishedRecord(record,{entities:all.entities.filter(e=>e.id===record.content.subjectId||e.id===record.content.objectId),sources:all.sources.filter(source=>record.content.evidence.some(e=>e.source.id===source.id)),mappings:[]})};};
 publicRead.translationById=async(id,revision)=>{const c=await acceptanceKnowledge.connect();try{return await readKnowledgeTranslationById(c,id,revision);}finally{c.release();}};
 publicRead.textOriginal=async target=>{const c=await acceptanceKnowledge.connect();try{return await readKnowledgeTextOriginal(c,target as import('../lib/domain/knowledge-translation').KnowledgeTextTarget,true);}finally{c.release();}};
 publicRead.textTranslation=async(target,language)=>{const c=await acceptanceKnowledge.connect();try{return await readKnowledgeTranslation(c,target as import('../lib/domain/knowledge-translation').KnowledgeTextTarget,language);}finally{c.release();}};
 publicRead.recordVersion=async(id,revision)=>{const c=await acceptanceKnowledge.connect();try{return await readKnowledgeRecordVersion(c,{id,revision});}finally{c.release();}};
 publicRead.entities=async id=>({generation:'fixture',entities:[await foundation.get({kind:'reader',id:'public'},'entity',id)]});
 try{await migrateMemberDatabase(pool,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true);}finally{await pool.end();}
 alice=await login("alice");bob=await login("bob");
 aliceId=(await (await profile.GET(request("/api/member/profile",alice.cookies.value))).json()).user.id;
 bobId=(await (await profile.GET(request("/api/member/profile",bob.cookies.value))).json()).user.id;
 process.env.KNOWLEDGE_REVIEW_ENABLED="1";process.env.KNOWLEDGE_REVIEW_ALLOWED_USERS=[aliceId,bobId].join(",");
},30000);
afterAll(async()=>{await acceptanceKnowledge?.end();await memberRuntime().pool.end();await fixture?.close();});
describe("private knowledge submission with real OIDC and PostgreSQL",()=>{
 it("rejects anonymous, mismatched identities, foreign origins and self-granted acceptance",async()=>{
  expect((await api.GET(request("/api/member/knowledge-submissions"))).status).toBe(401);
  expect((await post(save(),bob.cookies.value,aliceId)).status).toBe(401);
  expect((await post(save(),alice.cookies.value,aliceId,{origin:"https://foreign.invalid"})).status).toBe(403);
  expect((await post({...save(),ownerId:bobId})).status).toBe(400);
  expect((await post({...save(),state:"accepted"})).status).toBe(400);
  expect((await api.POST(request("/api/member/knowledge-submissions",alice.cookies.value,"POST",save()))).status).toBe(400);
 });
 it("saves the original text, keeps drafts private and provides metadata-only lists",async()=>{
  const command=save(randomUUID(),0,content("  元の入力。  "));const r=await post(command);expect(r.status).toBe(200);expect(r.headers.get("cache-control")).toBe("private, no-store");
  const stored=(await r.json()).submission;expect(stored.content.items[0].record.assertion).toBe("元の入力。");
  expect((await memberRuntime().pool.query("SELECT raw_input FROM member_knowledge.submission_revisions WHERE submission_id=$1",[command.id])).rows[0].raw_input.items[0].record.assertion).toBe("  元の入力。  ");
  const list=await (await api.GET(request("/api/member/knowledge-submissions",alice.cookies.value))).json();
  expect(list.submissions.find((s:{id:string})=>s.id===command.id)).not.toHaveProperty("content");
  expect((await current(command.id,bob.cookies.value,bobId)).status).toBe(404);
  expect((await post(save(command.id,1),bob.cookies.value,bobId)).status).toBe(404);
  expect((await current(randomUUID(),bob.cookies.value,bobId)).status).toBe(404);
 });
 it("deduplicates concurrent requests and detects stale edits",async()=>{
  const command=save();const responses=await Promise.all([post(command),post(command)]);const data=await Promise.all(responses.map(r=>r.json()));expect(data[0]).toEqual(data[1]);
  expect((await post({...command,content:content("別の本文")})).status).toBe(409);
  const edits=await Promise.all([post(save(command.id,1,content("A"))),post(save(command.id,1,content("B")))]);expect(edits.map(r=>r.status).sort()).toEqual([200,409]);
 });
 it("pins receipts and never attaches an old submit to a newer draft",async()=>{
  const command=save();await post(command);const submit={action:"submit",requestId:randomUUID(),id:command.id,expectedVersion:1};
  expect((await (await post(submit)).json()).submission).toMatchObject({state:"queued",revision:1,version:2});
  await post(save(command.id,2,content("改訂した内容")));
  expect((await (await post(submit)).json()).submission).toMatchObject({state:"queued",revision:1});
  expect((await (await current(command.id)).json()).submission).toMatchObject({state:"draft",revision:2});
  const receipt=(await memberRuntime().pool.query("SELECT r.digest,v.digest AS version_digest FROM member_knowledge.submission_receipts r JOIN member_knowledge.submission_revisions v ON v.submission_id=r.submission_id AND v.revision=r.revision WHERE r.submission_id=$1",[command.id])).rows[0];expect(receipt.digest).toBe(receipt.version_digest);
 });
 it("captures only selected server-owned Capsule content and does not modify the Capsule",async()=>{
  const a=randomUUID(),b=randomUUID(),r=randomUUID(),other=randomUUID(),text=randomUUID();
  const capsuleContent={dataset:"demo",title:"Capsuleの検証",note:"選択しない説明",language:"ja",entityIds:[],claimIds:[],document:{schemaVersion:1,nodes:[{key:a,title:"A",description:"",badge:"",origin:{kind:"local"}},{key:b,title:"B",description:"",badge:"",origin:{kind:"local"}}],relations:[{key:r,source:a,target:b,label:"研究した",note:"選択した主張",origin:{kind:"local"}},{key:other,source:b,target:a,label:"未選択の関係",note:"未選択の秘密",origin:{kind:"local"}}],texts:[{key:text,text:"未選択の私有メモ",style:"note"}],evidence:[],unresolvedClaimIds:[],layout:{positions:{},pan:{x:0,y:0},zoom:1}}};
  const created=await capsules.POST(request("/api/member/capsules",alice.cookies.value,"POST",{requestId:randomUUID(),content:capsuleContent}));expect(created.status).toBe(201);const {capsule}=await created.json();
  const capPath="/api/member/knowledge-submissions/capsule?capsuleId="+capsule.id;
  expect((await candidates.GET(request(capPath,bob.cookies.value))).status).toBe(404);
  expect((await (await candidates.GET(request(capPath,alice.cookies.value))).json()).candidates).toHaveLength(2);
  const command={action:"capture",id:randomUUID(),requestId:randomUUID(),expectedVersion:0,capsuleId:capsule.id,capsuleRevision:1,keys:["capsule-relation:"+r]};
  expect((await post({...command,requestId:randomUUID(),capsuleRevision:9})).status).toBe(409);
  expect((await post({...command,requestId:randomUUID(),keys:["not-a-record"]})).status).toBe(400);
  const response=await post(command);expect(response.status).toBe(200);const saved=(await response.json()).submission;
  expect(saved.origin).toMatchObject({capsuleId:capsule.id,capsuleRevision:1});expect(saved.content.items).toHaveLength(1);expect(saved.content.items[0].record.assertion).toBe("選択した主張");
  const raw=(await memberRuntime().pool.query("SELECT source_capsule FROM member_knowledge.submission_revisions WHERE submission_id=$1",[command.id])).rows[0].source_capsule;
  expect(JSON.stringify(raw)).not.toContain("未選択の秘密");expect(JSON.stringify(raw)).not.toContain("未選択の私有メモ");
  const read=await capsuleItem.GET(request("/",alice.cookies.value),ctx(capsule.id));expect((await read.json()).capsule).toEqual(capsule);
  const updated=await capsuleItem.PUT(request("/",alice.cookies.value,"PUT",{expectedRevision:1,content:{...capsule.content,title:"Capsuleを改訂"}}),ctx(capsule.id));expect(updated.status).toBe(200);
  expect((await (await post(command)).json()).submission).toEqual(saved);
  expect((await (await current(command.id)).json()).submission.origin.capsuleRevision).toBe(1);
 });
 it("cancels even when rate limited and never revives cancelled receipts",async()=>{
  const command=save();await post(command);await post({action:"submit",id:command.id,requestId:randomUUID(),expectedVersion:1});
  await memberRuntime().pool.query(`INSERT INTO member_knowledge.submission_requests(owner_id,request_id,submission_id,digest,response) SELECT $1,gen_random_uuid(),$2,'test','{}'::jsonb FROM generate_series(1,120)`,[aliceId,command.id]);
  expect((await post(save())).status).toBe(429);
  const cancel={action:"cancel",id:command.id,requestId:randomUUID(),expectedVersion:2};expect((await (await post(cancel)).json()).submission.state).toBe("cancelled");expect((await post(cancel)).status).toBe(200);
  expect((await post(save(command.id,3))).status).toBe(409);
  await memberRuntime().pool.query("DELETE FROM member_knowledge.submission_requests WHERE owner_id=$1 AND digest='test'",[aliceId]);
 });
 it("suspension cancels queued and draft work, including a concurrent save; resume does not revive it",async()=>{
  let user=await login("suspend");const id=(await (await profile.GET(request("/api/member/profile",user.cookies.value))).json()).user.id;
  const command=save();await post(command,user.cookies.value,id);await post({action:"submit",id:command.id,requestId:randomUUID(),expectedVersion:1},user.cookies.value,id);
  await Promise.all([post(save(),user.cookies.value,id),operateMember(memberRuntime().pool,{action:"suspend-user",target:id,actor:"test",reason:"security"},true)]);
  expect((await current(command.id,user.cookies.value,id)).status).toBe(401);
  expect((await memberRuntime().pool.query("SELECT count(*)::int AS n FROM member_knowledge.submissions WHERE owner_id=$1 AND state<>'cancelled'",[id])).rows[0].n).toBe(0);
  await operateMember(memberRuntime().pool,{action:"resume-user",target:id,actor:"test",reason:"correction"},true);user=await login("suspend");
  expect((await (await current(command.id,user.cookies.value,id)).json()).submission.state).toBe("cancelled");
 });
 it("account deletion erases private revisions, captured context and operation responses",async()=>{
  const user=await login("delete"),id=(await (await profile.GET(request("/api/member/profile",user.cookies.value))).json()).user.id;
  const command=save();await post(command,user.cookies.value,id);await post({action:"submit",id:command.id,requestId:randomUUID(),expectedVersion:1},user.cookies.value,id);
  const deleted=await profile.DELETE(request("/api/member/profile",user.cookies.value,"DELETE",{confirmation:"delete-account"},{"x-member-user":id}));expect(deleted.status).toBe(200);
  for(const table of ["submissions","submission_revisions","submission_receipts","submission_requests"]){const field=table==="submissions"?"id":"submission_id";expect((await memberRuntime().pool.query(`SELECT count(*)::int AS n FROM member_knowledge.${table} WHERE ${field}=$1`,[command.id])).rows[0].n).toBe(0);}
  expect((await current(command.id,user.cookies.value,id)).status).toBe(401);
 });
 const reviewConfig=(overrides:Partial<ReviewConfig>={}):ReviewConfig=>({projectId:'test-'+randomUUID(),billingTier:'free',verifiedAt:new Date().toISOString(),model:'gemini-3.5-flash-lite',rpm:15,tokensPerMinute:100000,requestsPerDay:80,requestsPerMonth:100,inputTokensPerDay:250000,outputTokensPerDay:160000,inputTokensPerMonth:1000000,outputTokensPerMonth:1000000,apiKeyFile:'/not-used-in-fixture',allowedUsers:[aliceId,bobId],...overrides});
 const reviewContent=()=>({schemaVersion:2,attribution:'anonymous',title:'公開知識の確認',entities:[{id:'new-observatory',content:{name:'架空の観測所',kind:'organization',description:'',aliases:[],language:'ja'}}],sources:[{id:'source-a',content:{title:'検証用資料',url:'https://example.invalid/public',bibliography:'',language:'ja'}}],items:[{key:'record-a',operation:'create-entity',record:{kind:'note',subjectId:'new-observatory',assertion:'架空の観測所は2003年に設立された。',evidence:[{id:'evidence-a',source:{id:'source-a',revision:1},locator:'冒頭',excerpt:'架空の観測所は2003年に設立された。',stance:'support'}]}}]});
 const reviewedResponse=(support='supported')=>({state:'received' as const,status:200,raw:{responseId:'fixture-response',modelVersion:'gemini-3.5-flash-lite',usageMetadata:{promptTokenCount:100,candidatesTokenCount:30,totalTokenCount:130},candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({suitability:'legitimate',support,reason:'資料の記述と一致しています。'})}]}}]}});
 async function enqueueReview(value:unknown=reviewContent()){
  await memberRuntime().pool.query("UPDATE member_knowledge.review_jobs SET state='cancelled',lease_token=NULL WHERE state IN('queued','running','retry','quota')");
  const command=save(randomUUID(),0,value);expect((await post(command)).status).toBe(200);expect((await post({action:'submit',id:command.id,requestId:randomUUID(),expectedVersion:1})).status).toBe(200);
  const authorize={action:'review',id:command.id,requestId:randomUUID(),expectedVersion:2,consentVersion:REVIEW_CONSENT_VERSION};expect((await post(authorize)).status).toBe(200);return {command,authorize};
 }
 it('keeps local advice private and optional when Kev is unavailable',async()=>{
  const command=save();await post(command);const body={id:command.id,revision:1,key:'record-a'};
  expect((await adviceApi.POST(request('/api/member/knowledge-submissions/advice','','POST',body))).status).toBe(400);
  expect((await adviceApi.POST(request('/api/member/knowledge-submissions/advice',alice.cookies.value,'POST',body,{'x-member-user':aliceId,origin:'https://foreign.invalid'}))).status).toBe(403);
  expect((await adviceApi.POST(request('/api/member/knowledge-submissions/advice',bob.cookies.value,'POST',body,{'x-member-user':bobId}))).status).toBe(404);
  const real=globalThis.fetch,spy=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>String(input)==='http://127.0.0.1:8009/v1/systemone'?Promise.reject(Error('fixture offline')):real(input,init));
  try{const r=await adviceApi.POST(request('/api/member/knowledge-submissions/advice',alice.cookies.value,'POST',body,{'x-member-user':aliceId}));expect(r.status).toBe(200);expect(await r.json()).toMatchObject({available:false,blocking:false,hints:[]});expect((await post({action:'submit',id:command.id,requestId:randomUUID(),expectedVersion:1})).status).toBe(200);}finally{spy.mockRestore();}
 });
 it('creates jobs only after explicit authorization and deduplicates authorization',async()=>{
  const command=save(randomUUID(),0,reviewContent());await post(command);await post({action:'submit',id:command.id,requestId:randomUUID(),expectedVersion:1});
  expect((await memberRuntime().pool.query('SELECT count(*)::int AS n FROM member_knowledge.review_jobs WHERE submission_id=$1',[command.id])).rows[0].n).toBe(0);
  const authorize={action:'review',id:command.id,requestId:randomUUID(),expectedVersion:2,consentVersion:REVIEW_CONSENT_VERSION};
  expect((await post({...authorize,consentVersion:'old'})).status).toBe(400);expect((await post(authorize,bob.cookies.value,bobId)).status).toBe(404);
  const responses=await Promise.all([post(authorize),post(authorize)]);expect(await responses[0].json()).toEqual(await responses[1].json());
  expect((await memberRuntime().pool.query('SELECT count(*)::int AS n FROM member_knowledge.review_jobs WHERE submission_id=$1',[command.id])).rows[0].n).toBe(1);
 });
 it('runs the authenticated receipt through a durable worker and exposes the pinned result',async()=>{
  const {command}=await enqueueReview(),cfg=reviewConfig(),queue=createReviewQueue(memberRuntime().pool);let sent=0;
  expect(await runKnowledgeReviewOnce(queue,cfg,async lease=>{sent++;expect(lease.wire).toContain('2003');return reviewedResponse();})).toBe(true);expect(sent).toBe(1);
  const value=(await (await current(command.id)).json()).submission;expect(value.state).toBe('queued');expect(value.review.items[0]).toMatchObject({state:'reviewed',attempts:1,result:{support:'supported'}});
  const usage=(await memberRuntime().pool.query("SELECT input_actual,output_actual,output_reserved,thoughts_actual,candidates_actual FROM member_knowledge.review_attempts WHERE project_id=$1",[cfg.projectId])).rows[0];expect(usage).toMatchObject({input_actual:100,output_actual:null,output_reserved:2048,thoughts_actual:null,candidates_actual:30});
  expect(await queue.claim(cfg)).toBeNull();
 });
 it('does not lease twice and discards a result after the author edits the receipt',async()=>{
  const {command}=await enqueueReview(),cfg=reviewConfig(),queue=createReviewQueue(memberRuntime().pool);await queue.heartbeat(cfg);
  const leases=await Promise.all([queue.claim(cfg),queue.claim(cfg)]);expect(leases.filter(Boolean)).toHaveLength(1);const lease=leases.find(Boolean)!;
  expect((await post(save(command.id,2,content('編集した別の内容')))).status).toBe(200);expect(await queue.canSend(lease)).toBe(false);expect(await queue.finish(lease,reviewedResponse())).toBe(false);
  expect((await (await current(command.id)).json()).submission).toMatchObject({state:'draft',revision:2});expect((await (await current(command.id)).json()).submission.review).toBeUndefined();
  expect((await memberRuntime().pool.query('SELECT state FROM member_knowledge.review_jobs WHERE id=$1',[lease.jobId])).rows[0].state).toBe('cancelled');
 });
 it('uses the explicitly configured 3.1 model and charges its attempt to the same project',async()=>{
  await enqueueReview();const cfg=reviewConfig({model:'gemini-3.1-flash-lite'}),queue=createReviewQueue(memberRuntime().pool),pool=memberRuntime().pool;
  expect(reviewConfigSchema.parse(cfg).model).toBe('gemini-3.1-flash-lite');
  expect(reviewConfigSchema.safeParse({...cfg,model:'gemini-unreviewed'}).success).toBe(false);
  await queue.heartbeat(cfg);const lease=(await queue.claim(cfg))!;expect(lease.model).toBe(cfg.model);
  expect((await pool.query('SELECT project_id,model,request_charge FROM member_knowledge.review_attempts WHERE id=$1',[lease.attemptId])).rows[0]).toMatchObject({project_id:cfg.projectId,model:cfg.model,request_charge:1});
  const response=reviewedResponse();response.raw.modelVersion=cfg.model;await queue.finish(lease,response);
  expect((await pool.query('SELECT state FROM member_knowledge.review_jobs WHERE id=$1',[lease.jobId])).rows[0].state).toBe('reviewed');
 });
 it('does not accept a 3.5 response as a 3.1 result or silently replace a live project profile',async()=>{
  await enqueueReview();const cfg=reviewConfig({model:'gemini-3.1-flash-lite'}),queue=createReviewQueue(memberRuntime().pool),pool=memberRuntime().pool;
  await queue.heartbeat(cfg);await expect(queue.heartbeat({...cfg,model:'gemini-3.5-flash-lite'})).rejects.toThrow();
  const lease=(await queue.claim(cfg))!;await queue.finish(lease,reviewedResponse());
  expect((await pool.query('SELECT state,result FROM member_knowledge.review_jobs WHERE id=$1',[lease.jobId])).rows[0]).toMatchObject({state:'attention',result:null});
  expect((await pool.query('SELECT model,request_charge FROM member_knowledge.review_attempts WHERE id=$1',[lease.attemptId])).rows[0]).toMatchObject({model:cfg.model,request_charge:1});
 });
 it('retains uncertain consumption across a crash and observes Retry-After without approving',async()=>{
  await enqueueReview();const cfg=reviewConfig(),queue=createReviewQueue(memberRuntime().pool);await queue.heartbeat(cfg);const first=(await queue.claim(cfg))!;
  await memberRuntime().pool.query("UPDATE member_knowledge.review_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[first.jobId]);
  const restarted=createReviewQueue(memberRuntime().pool);await restarted.recoverExpired();expect(await restarted.claim(cfg)).toBeNull();
  expect((await memberRuntime().pool.query('SELECT state,input_actual,output_actual,request_charge FROM member_knowledge.review_attempts WHERE id=$1',[first.attemptId])).rows[0]).toMatchObject({state:'delivery-unknown',input_actual:null,output_actual:null,request_charge:1});
  await memberRuntime().pool.query("UPDATE member_knowledge.review_jobs SET not_before=clock_timestamp()-interval '1 second' WHERE id=$1",[first.jobId]);await memberRuntime().pool.query("UPDATE member_knowledge.review_attempts SET started_at=clock_timestamp()-interval '2 minutes' WHERE id=$1",[first.attemptId]);
  const second=(await restarted.claim(cfg))!;expect(second.attemptId).not.toBe(first.attemptId);await restarted.finish(second,{state:'http-error',status:429,raw:{},retryAfter:'90',category:'rate-limit'});
  const job=(await memberRuntime().pool.query('SELECT state,not_before FROM member_knowledge.review_jobs WHERE id=$1',[first.jobId])).rows[0];expect(job.state).toBe('quota');expect(new Date(job.not_before).getTime()-Date.now()).toBeGreaterThan(85000);expect(await restarted.claim(cfg)).toBeNull();
 });
 it('replays a retained response after a crash without sending another inference',async()=>{
  const {command}=await enqueueReview(),cfg=reviewConfig(),queue=createReviewQueue(memberRuntime().pool);await queue.heartbeat(cfg);const lease=(await queue.claim(cfg))!;
  await memberRuntime().pool.query("UPDATE member_knowledge.review_attempts SET state='received' WHERE id=$1",[lease.attemptId]);await memberRuntime().pool.query("UPDATE member_knowledge.review_payloads SET response=$2 WHERE attempt_id=$1",[lease.attemptId,reviewedResponse().raw]);await memberRuntime().pool.query("UPDATE member_knowledge.review_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[lease.jobId]);
  const restarted=createReviewQueue(memberRuntime().pool);await restarted.recoverExpired();expect(await restarted.claim(cfg)).toBeNull();expect((await (await current(command.id)).json()).submission.review.items[0].state).toBe('reviewed');expect((await memberRuntime().pool.query('SELECT count(*)::int AS n FROM member_knowledge.review_attempts WHERE job_id=$1',[lease.jobId])).rows[0].n).toBe(1);
 });
 it('imports earlier evaluation usage once and enforces the project allowance atomically',async()=>{
  const {command}=await enqueueReview(),cfg=reviewConfig({requestsPerDay:1}),queue=createReviewQueue(memberRuntime().pool);await queue.heartbeat(cfg);
  const ledger={projectId:cfg.projectId,attempts:{previous:{day:quotaDate(new Date()),state:'delivery-unknown',startedAt:new Date().toISOString(),inputReserved:300,outputReserved:2048,inputActual:null,outputActual:null}}};
  expect(await queue.importEvaluation(ledger,'a'.repeat(64),cfg)).toBe(1);expect(await queue.importEvaluation(ledger,'a'.repeat(64),cfg)).toBe(0);
  expect(await queue.claim(cfg)).toBeNull();expect((await (await current(command.id)).json()).submission.review.items[0].state).toBe('quota');
  expect((await memberRuntime().pool.query("SELECT count(*)::int AS n FROM member_knowledge.review_attempts WHERE project_id=$1",[cfg.projectId])).rows[0].n).toBe(1);
 });
 it('keeps independent item results and never calls a partially supported item accepted',async()=>{
  const value=reviewContent();value.items.push({...value.items[0],key:'record-b',record:{...value.items[0].record,assertion:'根拠が一部しかない別の主張。'}});
  const {command}=await enqueueReview(value),cfg=reviewConfig(),queue=createReviewQueue(memberRuntime().pool);
  await runKnowledgeReviewOnce(queue,cfg,async()=>reviewedResponse());await memberRuntime().pool.query("UPDATE member_knowledge.review_attempts SET started_at=clock_timestamp()-interval '2 minutes' WHERE project_id=$1",[cfg.projectId]);
  await runKnowledgeReviewOnce(queue,cfg,async()=>reviewedResponse('unclear'));
  const results=(await (await current(command.id)).json()).submission.review.items;expect(results.map((r:{state:string})=>r.state).sort()).toEqual(['needs-changes','reviewed']);
 });
 it('continues transient 503 retries beyond three attempts and then accepts a normal reply',async()=>{
  await enqueueReview();const cfg=reviewConfig(),queue=createReviewQueue(memberRuntime().pool),pool=memberRuntime().pool;await queue.heartbeat(cfg);let jobId='';
  for(let i=0;i<3;i++){
   const lease=(await queue.claim(cfg))!;expect(lease).not.toBeNull();jobId=lease.jobId;
   await queue.finish(lease,{state:'http-error',status:503,category:'unavailable',retryAfter:'600',raw:{error:{message:'private upstream echo'}}});
   const j=(await pool.query('SELECT state,result,not_before FROM member_knowledge.review_jobs WHERE id=$1',[jobId])).rows[0];expect(j).toMatchObject({state:'retry',result:null});expect(new Date(j.not_before).getTime()).toBeGreaterThan(Date.now()+599000);
   const diag=(await pool.query('SELECT response FROM member_knowledge.review_payloads WHERE attempt_id=$1',[lease.attemptId])).rows[0].response;
   expect(diag).toMatchObject({kind:'attempt-failure',httpStatus:503,category:'unavailable'});expect(JSON.stringify(diag)).not.toContain('private');
   expect(await queue.claim(cfg)).toBeNull();
   await pool.query("UPDATE member_knowledge.review_jobs SET not_before=clock_timestamp()-interval '1 second' WHERE id=$1",[jobId]);
   await pool.query("UPDATE member_knowledge.review_projects SET paused_until=NULL WHERE project_id=$1",[cfg.projectId]);
   await pool.query("UPDATE member_knowledge.review_attempts SET started_at=clock_timestamp()-interval '2 minutes' WHERE project_id=$1",[cfg.projectId]);
  }
  const lease=(await queue.claim(cfg))!;expect(lease).not.toBeNull();await queue.finish(lease,reviewedResponse());
  expect((await pool.query('SELECT state,attempts FROM member_knowledge.review_jobs WHERE id=$1',[jobId])).rows[0]).toMatchObject({state:'reviewed',attempts:4});
 });
 it('waits for the next quota day after eight uncertain sends and never marks the content declined',async()=>{
  await enqueueReview();const cfg=reviewConfig(),queue=createReviewQueue(memberRuntime().pool),pool=memberRuntime().pool;await queue.heartbeat(cfg);let jobId='';
  for(let i=0;i<8;i++){const lease=(await queue.claim(cfg))!;expect(lease).not.toBeNull();jobId=lease.jobId;await queue.finish(lease,{state:'delivery-unknown',transport:{category:'timeout',code:'TIMEOUT'}});await pool.query("UPDATE member_knowledge.review_jobs SET not_before=clock_timestamp()-interval '1 second' WHERE id=$1",[jobId]);await pool.query("UPDATE member_knowledge.review_projects SET paused_until=NULL WHERE project_id=$1",[cfg.projectId]);await pool.query("UPDATE member_knowledge.review_attempts SET started_at=clock_timestamp()-interval '2 minutes' WHERE project_id=$1",[cfg.projectId]);}
  expect(await queue.claim(cfg)).toBeNull();expect((await pool.query('SELECT state,result,attempts,not_before FROM member_knowledge.review_jobs WHERE id=$1',[jobId])).rows[0]).toMatchObject({state:'quota',result:null,attempts:8});
  expect((await pool.query('SELECT count(*)::int n FROM member_knowledge.review_attempts WHERE job_id=$1',[jobId])).rows[0].n).toBe(8);
  await pool.query("UPDATE member_knowledge.review_attempts SET quota_day=$2 WHERE job_id=$1",[jobId,quotaDate(new Date(Date.now()-86400000))]);await pool.query("UPDATE member_knowledge.review_jobs SET not_before=clock_timestamp()-interval '1 second' WHERE id=$1",[jobId]);
  const next=(await queue.claim(cfg))!;expect(next).not.toBeNull();await queue.finish(next,reviewedResponse());
  expect((await pool.query('SELECT state FROM member_knowledge.review_jobs WHERE id=$1',[jobId])).rows[0].state).toBe('reviewed');
 });
 it.each(['送信を3回試しました。AI接続の確認を待っています。','前の送信結果を確認できません。重複を避けて間隔を空けて再試行します。'])('automatically resumes only a former transient stop: %s',async legacyReason=>{
  await enqueueReview();const cfg=reviewConfig(),queue=createReviewQueue(memberRuntime().pool),pool=memberRuntime().pool;await queue.heartbeat(cfg);
  const lease=(await queue.claim(cfg))!;await queue.finish(lease,{state:'delivery-unknown'});
  await pool.query("UPDATE member_knowledge.review_jobs SET state='attention',reason=$2,attempts=3,not_before=clock_timestamp()-interval '1 second' WHERE id=$1",[lease.jobId,legacyReason]);
  await queue.recoverExpired();expect((await pool.query('SELECT state FROM member_knowledge.review_jobs WHERE id=$1',[lease.jobId])).rows[0].state).toBe('retry');
  await pool.query("UPDATE member_knowledge.review_projects SET paused_until=NULL WHERE project_id=$1",[cfg.projectId]);await pool.query("UPDATE member_knowledge.review_attempts SET started_at=clock_timestamp()-interval '2 minutes' WHERE project_id=$1",[cfg.projectId]);
  const next=(await queue.claim(cfg))!;expect(next).not.toBeNull();await queue.finish(next,{state:'http-error',status:403,category:'authorization',retryAfter:null,raw:{error:'credential secret'}});
  await queue.recoverExpired();expect((await pool.query('SELECT state FROM member_knowledge.review_jobs WHERE id=$1',[lease.jobId])).rows[0].state).toBe('attention');expect(await queue.claim(cfg)).toBeNull();
 });
 it('recovers an expired uncertain lease beyond three attempts with backoff and safe diagnostics',async()=>{
  await enqueueReview();const cfg=reviewConfig(),queue=createReviewQueue(memberRuntime().pool),pool=memberRuntime().pool;await queue.heartbeat(cfg);
  const lease=(await queue.claim(cfg))!;await pool.query("UPDATE member_knowledge.review_jobs SET attempts=3,lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[lease.jobId]);
  await queue.recoverExpired();
  expect((await pool.query('SELECT state,result,not_before FROM member_knowledge.review_jobs WHERE id=$1',[lease.jobId])).rows[0]).toMatchObject({state:'retry',result:null});
  expect((await pool.query('SELECT response FROM member_knowledge.review_payloads WHERE attempt_id=$1',[lease.attemptId])).rows[0].response).toMatchObject({kind:'attempt-failure',transportCode:'LEASE_EXPIRED'});
  expect(await queue.claim(cfg)).toBeNull();
 });
 it('invalidates an in-flight review on suspension and does not revive it on resume',async()=>{
  await memberRuntime().pool.query("UPDATE member_knowledge.review_jobs SET state='cancelled',lease_token=NULL WHERE state IN('queued','running','retry','quota')");
  const command=save(randomUUID(),0,reviewContent());await post(command,bob.cookies.value,bobId);await post({action:'submit',id:command.id,requestId:randomUUID(),expectedVersion:1},bob.cookies.value,bobId);await post({action:'review',id:command.id,requestId:randomUUID(),expectedVersion:2,consentVersion:REVIEW_CONSENT_VERSION},bob.cookies.value,bobId);
  const cfg=reviewConfig({allowedUsers:[bobId]}),queue=createReviewQueue(memberRuntime().pool);await queue.heartbeat(cfg);const lease=(await queue.claim(cfg))!;
  await operateMember(memberRuntime().pool,{action:'suspend-user',target:bobId,actor:'test',reason:'security'},true);expect(await queue.canSend(lease)).toBe(false);expect(await queue.finish(lease,reviewedResponse())).toBe(false);
  await operateMember(memberRuntime().pool,{action:'resume-user',target:bobId,actor:'test',reason:'correction'},true);bob=await login('bob');expect((await (await current(command.id,bob.cookies.value,bobId)).json()).submission.state).toBe('cancelled');expect(await queue.claim(cfg)).toBeNull();
 });
 it('removes payloads on account deletion while preserving anonymous quota consumption',async()=>{
  await memberRuntime().pool.query("UPDATE member_knowledge.review_jobs SET state='cancelled',lease_token=NULL WHERE state IN('queued','running','retry','quota')");
  const user=await login('delete'),owner=(await (await profile.GET(request('/api/member/profile',user.cookies.value))).json()).user.id;
  const old=process.env.KNOWLEDGE_REVIEW_ALLOWED_USERS;process.env.KNOWLEDGE_REVIEW_ALLOWED_USERS=old+','+owner;
  try{
   const command=save(randomUUID(),0,reviewContent());await post(command,user.cookies.value,owner);await post({action:'submit',id:command.id,requestId:randomUUID(),expectedVersion:1},user.cookies.value,owner);await post({action:'review',id:command.id,requestId:randomUUID(),expectedVersion:2,consentVersion:REVIEW_CONSENT_VERSION},user.cookies.value,owner);
   const cfg=reviewConfig({allowedUsers:[owner]}),queue=createReviewQueue(memberRuntime().pool);await queue.heartbeat(cfg);const lease=(await queue.claim(cfg))!;
   expect((await profile.DELETE(request('/api/member/profile',user.cookies.value,'DELETE',{confirmation:'delete-account'},{'x-member-user':owner}))).status).toBe(200);
   await queue.finish(lease,reviewedResponse());expect((await memberRuntime().pool.query('SELECT count(*)::int AS n FROM member_knowledge.review_payloads WHERE attempt_id=$1',[lease.attemptId])).rows[0].n).toBe(0);
   expect((await memberRuntime().pool.query('SELECT job_id,input_actual,request_charge FROM member_knowledge.review_attempts WHERE id=$1',[lease.attemptId])).rows[0]).toMatchObject({job_id:null,input_actual:100,request_charge:1});
  }finally{process.env.KNOWLEDGE_REVIEW_ALLOWED_USERS=old;}
 });

 async function acceptedCandidate(value:unknown=reviewContent()){
  process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED='1';
  await memberRuntime().pool.query("UPDATE member_knowledge.submission_receipts SET submitted_at=clock_timestamp()-interval '2 hours'");
  await memberRuntime().pool.query("UPDATE member_knowledge.review_jobs SET state='cancelled' WHERE state IN('queued','running','retry','quota','reviewed','verifying','source-retry')");
  const command=save(randomUUID(),0,value);expect((await post(command)).status).toBe(200);await post({action:'submit',id:command.id,requestId:randomUUID(),expectedVersion:1});
  expect((await post({action:'review',id:command.id,requestId:randomUUID(),expectedVersion:2,consentVersion:REVIEW_CONSENT_VERSION})).status).toBe(409);
  expect((await post({action:'review',id:command.id,requestId:randomUUID(),expectedVersion:2,consentVersion:PUBLICATION_CONSENT_VERSION})).status).toBe(200);
  const cfg=reviewConfig(),entityCorrection=JSON.stringify(value).includes('"correct-entity"'),engine=createKnowledgeAcceptance(memberRuntime().pool,acceptanceKnowledge,{},fixtureVerify);
  await runKnowledgeReviewOnce(createReviewQueue(memberRuntime().pool,entityCorrection?{duplicates:(v,key)=>engine.duplicates(v,key)}:{}),cfg,async lease=>{
   const result=reviewedResponse(),material=JSON.parse(JSON.parse(lease.wire).contents[0].parts[0].text);
   if(material.duplicateCheck)result.raw.candidates[0].content.parts[0].text=JSON.stringify({suitability:'legitimate',support:'supported',reason:'Fixture evidence agrees',duplicate:{sameAs:null,reason:'An explicit original correction'}});
   return result;
  });
  return {command,cfg};
 }
 const fixtureVerify=async(url:string,excerpt:string)=>matchSourceExcerpt({url,type:'text/html',body:Buffer.from('<article><p>'+excerpt+'</p></article>')},excerpt);
 const knowledgeCount=async()=>Number((await acceptanceKnowledge.query("SELECT count(*) AS n FROM knowledge75.objects WHERE kind='record'")).rows[0].n);
 it('automatically accepts verified public material and uses the same receipt on retry',async()=>{
  const {command,cfg}=await acceptedCandidate(),before=await knowledgeCount();const engine=createKnowledgeAcceptance(memberRuntime().pool,acceptanceKnowledge,{},fixtureVerify);
  expect(await engine.run(cfg)).toBe(true);expect(await knowledgeCount()).toBe(before+1);
  const value=(await (await current(command.id)).json()).submission;expect(value.review.items[0]).toMatchObject({state:'accepted',publication:{state:'published',revision:1}});
  expect(await engine.run(cfg)).toBe(false);expect(await knowledgeCount()).toBe(before+1);
  const decision=(await memberRuntime().pool.query('SELECT command,proofs FROM member_knowledge.publication_decisions WHERE job_id=(SELECT id FROM member_knowledge.review_jobs WHERE submission_id=$1)',[command.id])).rows[0];
  expect(JSON.stringify(decision)).not.toContain(aliceId);expect(decision.proofs.sources[0].extractor).toBe('public-text-v1');
 });
 it('captures a private translation, reviews equivalence and publishes without creating or correcting a fact',async()=>{
  process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED='1';
  const rid='translation-original-'+randomUUID(),eid='translation-person-'+randomUUID(),sid='translation-source-'+randomUUID(),foundation=createKnowledgeFoundationService(acceptanceKnowledge);
  await foundation.execute({kind:'operator',id:'fixture'},{action:'create-bundle',requestId:randomUUID(),reason:'翻訳用の公開原本',entities:[{id:eid,content:{name:'ある人物',kind:'person'}}],sources:[{id:sid,content:{title:'資料',url:'https://example.org/original'}}],records:[{id:rid,content:{kind:'note',subjectId:eid,assertion:'この人物は2003年に設立した。',textLanguages:{assertion:{tag:'ja',basis:'declared'}},evidence:[{id:'q',source:{id:sid,revision:1},locator:'冒頭',excerpt:'2003年に設立した。'}]}}]});
  await acceptanceKnowledge.query("INSERT INTO knowledge75.published_revisions(kind,id,revision) SELECT kind,id,current_revision FROM knowledge75.objects WHERE id=ANY($1::text[]) ON CONFLICT DO NOTHING",[[eid,sid,rid]]);
  const target={kind:'record',id:rid,revision:1,field:'assertion'},id=randomUUID(),captured=await post({action:'capture-translation',requestId:randomUUID(),id,expectedVersion:0,target,language:'en'});
  expect(captured.status).toBe(200);const draft=knowledgeSubmissionSchema.parse((await captured.json()).submission);
  expect(draft.context?.texts?.[0].text).toBe('この人物は2003年に設立した。');
  expect((await current(id,bob.cookies.value,bobId)).status).toBe(404);
  draft.content.items[0].translation!.text='This person founded it in 2003.';
  const before=await knowledgeCount(),{command,cfg}=await acceptedCandidate(draft.content);
  const verify=vi.fn(fixtureVerify),engine=createKnowledgeAcceptance(memberRuntime().pool,acceptanceKnowledge,{},verify);
  expect(await engine.run(cfg)).toBe(true);expect(verify).not.toHaveBeenCalled();expect(await knowledgeCount()).toBe(before);
  await engine.run(cfg);const value=(await (await current(command.id)).json()).submission;
  expect(value.review.items[0]).toMatchObject({state:'published',publication:{revision:1,state:'published'}});
  expect((await foundation.get({kind:'reader',id:'test'},'record',rid)).revision).toBe(1);
  const contribution=(await memberRuntime().pool.query("SELECT operation,attribution FROM member_knowledge.publication_contributors WHERE submission_id=$1",[command.id])).rows[0];expect(contribution).toEqual({operation:'translate-text',attribution:'profile'});
  const oldRuntime=process.env.KNOWLEDGE_RUNTIME,oldEnabled=process.env.KNOWLEDGE_PUBLICATION_ENABLED,oldOrigin=process.env.KNOWLEDGE_PUBLIC_ORIGIN;
  process.env.KNOWLEDGE_RUNTIME='beta';process.env.KNOWLEDGE_PUBLICATION_ENABLED='1';process.env.KNOWLEDGE_PUBLIC_ORIGIN='https://graph-beta.isinxnisi.com';
  try{
   const url='https://graph-beta.isinxnisi.com/api/knowledge/contributors?'+new URLSearchParams({kind:'translation',id:value.review.items[0].publication.id,revision:'1'}),read=()=>createKnowledgeContributors(memberRuntime().pool).read(new Request(url,{headers:{host:'graph-beta.isinxnisi.com'}}));
   const named=await (await read()).json();expect(named.contributors).toHaveLength(1);expect(named.contributors[0]).toMatchObject({operation:'translate-text',anonymous:false});expect(named.contributors[0].person.handle).toBeTruthy();
   await memberRuntime().pool.query("UPDATE member_knowledge.publication_contributors SET attribution='anonymous',activity_public=false WHERE submission_id=$1",[command.id]);
   expect((await (await read()).json()).contributors[0]).toMatchObject({anonymous:true,person:null});
  }finally{process.env.KNOWLEDGE_RUNTIME=oldRuntime;process.env.KNOWLEDGE_PUBLICATION_ENABLED=oldEnabled;process.env.KNOWLEDGE_PUBLIC_ORIGIN=oldOrigin;}

 });
 it('publishes a new person with the submitted classification and a source-backed note',async()=>{
  const v=reviewContent();Object.assign(v,{entities:[{id:'new-person',content:{name:'架空の人物',kind:'人物',description:'',aliases:[],language:'ja'}}]});Object.assign(v.items[0].record,{subjectId:'new-person',assertion:'架空の人物はこの観測所の設立者。'});v.items[0].record.evidence[0].excerpt='架空の人物はこの観測所の設立者。';
  const {command,cfg}=await acceptedCandidate(v);expect(await createKnowledgeAcceptance(memberRuntime().pool,acceptanceKnowledge,{},fixtureVerify).run(cfg)).toBe(true);
  const d=(await memberRuntime().pool.query('SELECT command FROM member_knowledge.publication_decisions WHERE job_id=(SELECT id FROM member_knowledge.review_jobs WHERE submission_id=$1)',[command.id])).rows[0].command;
  const foundation=createKnowledgeFoundationService(acceptanceKnowledge),person=await foundation.get({kind:'reader',id:'public'},'entity',d.record.content.subjectId);
  expect(person.content).toMatchObject({name:'架空の人物',kind:'人物'});expect(d.record.content.kind).toBe('note');expect(d.record.content.evidence).toHaveLength(1);
 });

 it('returns source mismatch for supplementation without making any public changes',async()=>{
  const {command,cfg}=await acceptedCandidate(),before=await knowledgeCount();
  const engine=createKnowledgeAcceptance(memberRuntime().pool,acceptanceKnowledge,{},async()=>{throw new SourceCheckError('抜粋が本文にありません。');});await engine.run(cfg);
  expect(await knowledgeCount()).toBe(before);expect((await (await current(command.id)).json()).submission.review.items[0]).toMatchObject({state:'needs-changes',reason:'抜粋が本文にありません。'});
 });
 it('retains temporary source failures as retryable rather than declining content',async()=>{
  const {command,cfg}=await acceptedCandidate();const engine=createKnowledgeAcceptance(memberRuntime().pool,acceptanceKnowledge,{},async()=>{throw new SourceCheckError('サイトが混雑しています。',true,300000);});await engine.run(cfg);
  expect((await (await current(command.id)).json()).submission.review.items[0].state).toBe('source-retry');expect(await engine.run(cfg)).toBe(false);
 });
 it('does not accept a cancelled receipt while the source request is in flight',async()=>{
  const {command,cfg}=await acceptedCandidate(),before=await knowledgeCount();
  const engine=createKnowledgeAcceptance(memberRuntime().pool,acceptanceKnowledge,{},async(url,quote)=>{await post({action:'cancel',id:command.id,requestId:randomUUID(),expectedVersion:2});return fixtureVerify(url,quote);});await engine.run(cfg);
  expect(await knowledgeCount()).toBe(before);expect((await (await current(command.id)).json()).submission.state).toBe('cancelled');
 });
 it('recovers a member decision committed before the knowledge transaction is committed',async()=>{
  const {command,cfg}=await acceptedCandidate(),before=await knowledgeCount();
  await createKnowledgeAcceptance(memberRuntime().pool,acceptanceKnowledge,{afterPrepare:async()=>{throw Error('simulated process loss');}},fixtureVerify).run(cfg);
  expect(await knowledgeCount()).toBe(before);expect((await (await current(command.id)).json()).submission.review.items[0].state).toBe('accepted');
  await post({action:'cancel',id:command.id,requestId:randomUUID(),expectedVersion:2});
  await createKnowledgeAcceptance(memberRuntime().pool,acceptanceKnowledge,{},fixtureVerify).run(cfg);expect(await knowledgeCount()).toBe(before+1);
  expect((await memberRuntime().pool.query('SELECT state FROM member_knowledge.publication_decisions WHERE job_id=(SELECT id FROM member_knowledge.review_jobs WHERE submission_id=$1)',[command.id])).rows[0].state).toBe('published');
 });
 it('recovers a committed knowledge operation without duplicating it after acknowledgement loss',async()=>{
  const {cfg}=await acceptedCandidate(),before=await knowledgeCount();await createKnowledgeAcceptance(memberRuntime().pool,acceptanceKnowledge,{afterDecision:async()=>{throw Error('ack lost');}},fixtureVerify).run(cfg);expect(await knowledgeCount()).toBe(before+1);
  await createKnowledgeAcceptance(memberRuntime().pool,acceptanceKnowledge,{},fixtureVerify).run(cfg);expect(await knowledgeCount()).toBe(before+1);process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED='0';
 });

 async function correctionCandidate(options:{unchanged?:boolean;newRelation?:boolean;fact?:{text:string;language:string};evidence?:{excerpt?:string;locator?:string}}={}){
  process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED='1';await memberRuntime().pool.query("UPDATE member_knowledge.submission_receipts SET submitted_at=clock_timestamp()-interval '2 hours'");
  const foundation=createKnowledgeFoundationService(acceptanceKnowledge),prefix='correct:'+randomUUID(),a=prefix+':a',b=prefix+':b',src=prefix+':source',rid=prefix+':record';
  const created=await foundation.execute({kind:'operator',id:'fixture'}, {action:'create-bundle',requestId:randomUUID(),reason:'fixture',entities:[{id:a,content:{name:'A',kind:'人物'}},{id:b,content:{name:'B',kind:'作品'}}],sources:[{id:src,content:{title:'公開資料',url:'https://example.org/source'}}],records:[{id:rid,content:{kind:'relation',subjectId:a,objectId:b,relation:'制作した',assertion:'AはBを制作した。',textLanguages:{assertion:{tag:'ja',basis:'declared'},relation:{tag:'ja',basis:'declared'}},evidence:[{id:'quote',source:{id:src,revision:1},locator:'本文',excerpt:'Aは資料で説明された作品Bを制作した。'}]}}]}) as {entities:KnowledgeSnapshot['entities'];sources:KnowledgeSnapshot['sources'];records:KnowledgeSnapshot['records']};
  const snapshot:KnowledgeSnapshot={schemaVersion:1,...created,mappings:[],initialView:'graph'};const local=captureKnowledgeCapsule({snapshot,title:'公開記録の訂正'});
  const createdCap=await capsules.POST(request('/api/member/capsules',alice.cookies.value,'POST',{requestId:randomUUID(),content:{dataset:'demo',title:local.title,note:local.note,language:local.language,entityIds:local.entityIds,claimIds:local.claimIds,document:local.document}}));expect(createdCap.status).toBe(201);const cap=(await createdCap.json()).capsule;
  const id=randomUUID();const capture=await post({action:'capture',id,requestId:randomUUID(),expectedVersion:0,capsuleId:cap.id,capsuleRevision:1,keys:[rid]});expect(capture.status).toBe(200);const v=(await capture.json()).submission;
  const edited={...v.content,schemaVersion:2,items:v.content.items.map((item:{record:{evidence:{excerpt:string;locator:string}[]};correction:{id:string;revision:number}})=>({...item,operation:options.newRelation?'create-relation':'correct-record',...(options.newRelation?{correction:undefined,about:undefined}:{about:{kind:'record',...item.correction}}),record:{...item.record,...(!options.unchanged?{assertion:'Aは作品Bを制作した。'}:{}),...(options.fact?{assertion:options.fact.text,textLanguages:{assertion:{tag:options.fact.language,basis:'declared'},relation:{tag:'ja',basis:'declared'}}}:{}),...(options.evidence?{evidence:item.record.evidence.map((e,index)=>index===0?{...e,...options.evidence}:e)}:{})}}))};expect((await post(save(id,1,edited))).status).toBe(200);
  expect((await post({action:'submit',id,requestId:randomUUID(),expectedVersion:2})).status).toBe(200);expect((await post({action:'review',id,requestId:randomUUID(),expectedVersion:3,consentVersion:PUBLICATION_CONSENT_VERSION})).status).toBe(200);
  const cfg=reviewConfig();await runKnowledgeReviewOnce(createReviewQueue(memberRuntime().pool),cfg,async()=>reviewedResponse());return {id,cfg,foundation,src,rid};
 }
 it('accepts a correction from the owned Capsule without replacing its original saved snapshot',async()=>{
  const {id,cfg,foundation,rid}=await correctionCandidate();await createKnowledgeAcceptance(memberRuntime().pool,acceptanceKnowledge,{},fixtureVerify).run(cfg);
  const record=await foundation.get({kind:'reader',id:'public'},'record',rid);expect(record.revision).toBe(2);expect(record.content.assertion).toBe('Aは作品Bを制作した。');
  const value=(await (await current(id)).json()).submission;expect(value.review.items[0]).toMatchObject({state:'accepted',publication:{id:rid,revision:2}});
  expect((await foundation.get({kind:'reader',id:'public'},'record',rid,1)).content.assertion).toBe('AはBを制作した。');
 });
 it.each([['excerpt','AはBを制作した。'],['locator','第二章「作品B」']] as const)('accepts an explicit %s-only correction and retains its original citation version',async(field,replacement)=>{
  const {id,cfg,foundation,rid}=await correctionCandidate({unchanged:true,evidence:{[field]:replacement}}),before=await knowledgeCount();
  const original=await foundation.get({kind:'reader',id:'public'},'record',rid,1),engine=createKnowledgeAcceptance(memberRuntime().pool,acceptanceKnowledge,{},fixtureVerify);
  expect(await engine.run(cfg)).toBe(true);
  const record=await foundation.get({kind:'reader',id:'public'},'record',rid);
  expect(await knowledgeCount()).toBe(before);expect(record.revision).toBe(2);
  expect(record.content).toEqual({...original.content,evidence:[{...original.content.evidence[0],[field]:replacement}]});
  expect((await foundation.get({kind:'reader',id:'public'},'record',rid,1)).content).toEqual(original.content);
  expect((await (await current(id)).json()).submission.review.items[0].publication).toMatchObject({id:rid,revision:2,disposition:'updated'});
  expect((await memberRuntime().pool.query('SELECT record_id,record_revision,operation FROM member_knowledge.publication_contributors WHERE submission_id=$1',[id])).rows).toEqual([{record_id:rid,record_revision:2,operation:'correct-record'}]);
  expect(await engine.run(cfg)).toBe(false);expect((await foundation.get({kind:'reader',id:'public'},'record',rid)).revision).toBe(2);
 });
 it('retains the Japanese original when accepting an English factual correction and pins its author and language',async()=>{
  const {id,cfg,foundation,rid}=await correctionCandidate({fact:{text:'A created work B.',language:'en'}});
  await createKnowledgeAcceptance(memberRuntime().pool,acceptanceKnowledge,{},fixtureVerify).run(cfg);
  const old=await foundation.get({kind:'reader',id:'public'},'record',rid,1),next=await foundation.get({kind:'reader',id:'public'},'record',rid);
  expect(old.content).toMatchObject({assertion:'AはBを制作した。',textLanguages:{assertion:{tag:'ja',basis:'declared'}}});
  expect(next.revision).toBe(2);expect(next.content).toMatchObject({assertion:'A created work B.',textLanguages:{assertion:{tag:'en',basis:'declared'},relation:{tag:'ja',basis:'declared'}}});
  expect(next.content.evidence).toEqual(old.content.evidence);
  expect((await memberRuntime().pool.query('SELECT record_id,record_revision,operation FROM member_knowledge.publication_contributors WHERE submission_id=$1',[id])).rows).toEqual([{record_id:rid,record_revision:2,operation:'correct-record'}]);
  const submission=(await (await current(id)).json()).submission;
  const cap=(await (await capsuleItem.GET(request('/api/member/capsules/'+submission.origin.capsuleId,alice.cookies.value),{params:Promise.resolve({id:submission.origin.capsuleId})})).json()).capsule;
  expect(cap.content.document.knowledge.snapshot.records[0].content.assertion).toBe('AはBを制作した。');
 });
 it('does not create another record, content revision or contributor activity for a newly submitted identical fact',async()=>{
  const {id,cfg,foundation,rid}=await correctionCandidate({unchanged:true,newRelation:true,evidence:{excerpt:'AはBを制作した。',locator:'別の箇所'}}),before=await knowledgeCount();
  await createKnowledgeAcceptance(memberRuntime().pool,acceptanceKnowledge,{},fixtureVerify).run(cfg);
  const record=await foundation.get({kind:'reader',id:'public'},'record',rid);
  expect(await knowledgeCount()).toBe(before);expect(record.revision).toBe(1);expect(record.content.evidence[0]).toMatchObject({excerpt:'Aは資料で説明された作品Bを制作した。',locator:'本文'});
  const value=(await (await current(id)).json()).submission;expect(value.review.items[0].publication).toMatchObject({id:rid,revision:1,disposition:'existing'});
  expect((await memberRuntime().pool.query('SELECT count(*)::int AS n FROM member_knowledge.publication_contributors WHERE submission_id=$1',[id])).rows[0].n).toBe(0);
 });
 it('does not make a revision for an unchanged correction',async()=>{
  const {id,cfg,foundation,rid}=await correctionCandidate({unchanged:true});await createKnowledgeAcceptance(memberRuntime().pool,acceptanceKnowledge,{},fixtureVerify).run(cfg);
  expect((await foundation.get({kind:'reader',id:'public'},'record',rid)).revision).toBe(1);
  expect((await (await current(id)).json()).submission.review.items[0].publication).toMatchObject({id:rid,revision:1,disposition:'existing'});
  expect((await memberRuntime().pool.query('SELECT count(*)::int AS n FROM member_knowledge.publication_contributors WHERE submission_id=$1',[id])).rows[0].n).toBe(0);
 });
 it('does not publish a correction when a referenced source becomes hidden during source checking',async()=>{
  const {id,cfg,foundation,src,rid}=await correctionCandidate();
  await createKnowledgeAcceptance(memberRuntime().pool,acceptanceKnowledge,{},async(url,quote)=>{
   await foundation.execute({kind:'operator',id:'fixture'},{action:'set-visibility',requestId:randomUUID(),kind:'source',id:src,expectedStatusRevision:1,visibility:'hidden',reason:'fixture boundary'});return fixtureVerify(url,quote);
  }).run(cfg);
  expect((await foundation.get({kind:'operator',id:'fixture'},'record',rid)).revision).toBe(1);
  expect((await (await current(id)).json()).submission.review.items[0].state).toBe('needs-changes');process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED='0';
 });

 it('captures a public record on the server for correction and rejects client snapshots or stale revisions',async()=>{
  const {foundation,rid}=await correctionCandidate();const record=await foundation.get({kind:'reader',id:'public'},'record',rid);const all=await foundation.list({kind:'reader',id:'public'});
  publicRead.dto=buildKnowledgePublishedRecord(record,{entities:all.entities.filter(e=>e.id===record.content.subjectId||e.id===record.content.objectId),sources:all.sources.filter(source=>record.content.evidence.some(e=>e.source.id===source.id)),mappings:[]});
  const command={action:'capture-public',requestId:randomUUID(),id:randomUUID(),expectedVersion:0,recordId:rid,recordRevision:1};
  expect((await post({...command,recordRevision:99})).status).toBe(409);expect((await post({...command,snapshot:{}})).status).toBe(400);
  const captured=await post(command);expect(captured.status).toBe(200);const value=(await captured.json()).submission;expect(value.content.items[0].correction).toEqual({id:rid,revision:1});expect(value.origin).toBeNull();expect(value.context.entities).toHaveLength(2);expect((await post(command)).status).toBe(200);
  const submitted=(await (await post({action:'submit',id:value.id,requestId:randomUUID(),expectedVersion:value.version})).json()).submission;
  const review={action:'review',id:value.id,requestId:randomUUID(),expectedVersion:submitted.version,consentVersion:PUBLICATION_CONSENT_VERSION};
  for(let attempt=0;attempt<2;attempt++){const response=await post({...review,requestId:randomUUID()});expect(response.status).toBe(200);const dto=knowledgeSubmissionSchema.parse((await response.json()).submission);expect(dto.origin).toBeNull();expect(dto.review?.items).toHaveLength(1);}
  await post({action:'cancel',id:value.id,requestId:randomUUID(),expectedVersion:submitted.version});process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED='0';
 });
 it('does not send a forged correction target to the external AI provider',async()=>{
  process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED='1';await memberRuntime().pool.query("UPDATE member_knowledge.submission_receipts SET submitted_at=clock_timestamp()-interval '2 hours'");
  await memberRuntime().pool.query("UPDATE member_knowledge.review_jobs SET state='cancelled' WHERE state IN('queued','running','retry','quota','reviewed','verifying','source-retry')");
  const v=reviewContent(),id=randomUUID();Object.assign(v.items[0],{operation:'correct-record',correction:{id:'forged-target',revision:1},about:{kind:'record',id:'forged-target',revision:1}});
  const saved=await post(save(id,0,v));expect([400,404,409]).toContain(saved.status);
  const cfg=reviewConfig(),queue=createReviewQueue(memberRuntime().pool),engine=createKnowledgeAcceptance(memberRuntime().pool,acceptanceKnowledge,{},fixtureVerify),send=vi.fn(async()=>reviewedResponse());
  await runKnowledgeReviewOnce(queue,cfg,send,lease=>engine.validateReview(lease.jobId));expect(send).not.toHaveBeenCalled();
  expect((await memberRuntime().pool.query('SELECT count(*)::int AS n FROM member_knowledge.review_jobs WHERE submission_id=$1',[id])).rows[0].n).toBe(0);process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED='0';
 });
 it('retains an accepted public operation after account deletion without retaining private payloads',async()=>{
  process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED='1';const user=await login('delete'),owner=(await (await profile.GET(request('/api/member/profile',user.cookies.value))).json()).user.id;
  const old=process.env.KNOWLEDGE_REVIEW_ALLOWED_USERS;process.env.KNOWLEDGE_REVIEW_ALLOWED_USERS=old+','+owner;
  try{
   const command=save(randomUUID(),0,reviewContent());await post(command,user.cookies.value,owner);await post({action:'submit',id:command.id,requestId:randomUUID(),expectedVersion:1},user.cookies.value,owner);await post({action:'review',id:command.id,requestId:randomUUID(),expectedVersion:2,consentVersion:PUBLICATION_CONSENT_VERSION},user.cookies.value,owner);
   const cfg=reviewConfig({allowedUsers:[owner]});await runKnowledgeReviewOnce(createReviewQueue(memberRuntime().pool),cfg,async()=>reviewedResponse());const before=await knowledgeCount();
   await createKnowledgeAcceptance(memberRuntime().pool,acceptanceKnowledge,{afterPrepare:async()=>{expect((await profile.DELETE(request('/api/member/profile',user.cookies.value,'DELETE',{confirmation:'delete-account'},{'x-member-user':owner}))).status).toBe(200);throw Error('restart between commits');}},fixtureVerify).run(cfg);
   expect(await knowledgeCount()).toBe(before);expect((await memberRuntime().pool.query('SELECT 1 FROM member_knowledge.submissions WHERE id=$1',[command.id])).rowCount).toBe(0);
   await createKnowledgeAcceptance(memberRuntime().pool,acceptanceKnowledge,{},fixtureVerify).run(cfg);expect(await knowledgeCount()).toBe(before+1);
   const accepted=(await memberRuntime().pool.query('SELECT command FROM member_knowledge.publication_decisions ORDER BY created_at DESC LIMIT 1')).rows[0];expect(JSON.stringify(accepted)).not.toContain(owner);
  }finally{process.env.KNOWLEDGE_REVIEW_ALLOWED_USERS=old;process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED='0';}
 });
 it('keeps a member original-Entity correction attributable while preserving subject identity and history',async()=>{
  await memberRuntime().pool.query("UPDATE member_knowledge.submission_requests SET created_at=clock_timestamp()-interval '20 minutes' WHERE owner_id=$1",[aliceId]);
  const eid='entity-correction-'+randomUUID(),foundation=createKnowledgeFoundationService(acceptanceKnowledge);
  await foundation.execute({kind:'operator',id:'fixture'},{action:'create-bundle',requestId:randomUUID(),reason:'fixture',entities:[{id:eid,content:{name:'Original subject',kind:'person'}}],sources:[{id:eid+'-source',content:{title:'Original source',url:'https://example.org/original'}}],records:[{id:eid+'-record',content:{kind:'note',subjectId:eid,assertion:'Original subject is recorded.',evidence:[{id:'q',source:{id:eid+'-source',revision:1},locator:'Opening',excerpt:'Original subject'}]}}]});
  const before=await foundation.get({kind:'reader',id:'fixture'},'entity',eid,1),after={...before.content,name:'Correct subject',description:'The source describes this subject.'},base=reviewContent();
  const value={...base,attribution:'profile',entities:[],entityPins:[{id:eid,revision:1}],items:[{...base.items[0],operation:'correct-entity',about:{kind:'entity',id:eid,revision:1},entityCorrection:{target:{id:eid,revision:1},content:after,reason:'Official spelling'},record:{...base.items[0].record,kind:'note',subjectId:eid,objectId:null,relation:'',assertion:entityCorrectionSummary(before.content,after)}}]};
  const {command,cfg}=await acceptedCandidate(value);expect(await createKnowledgeAcceptance(memberRuntime().pool,acceptanceKnowledge,{},fixtureVerify).run(cfg)).toBe(true);
  expect((await memberRuntime().pool.query('SELECT state,reason FROM member_knowledge.review_jobs WHERE submission_id=$1',[command.id])).rows).toMatchObject([{state:'accepted'}]);
  expect((await foundation.get({kind:'reader',id:'fixture'},'entity',eid)).content.name).toBe('Correct subject');expect((await foundation.get({kind:'reader',id:'fixture'},'entity',eid,1)).content.name).toBe('Original subject');
  const contribution=(await memberRuntime().pool.query('SELECT owner_id,operation,attribution,entity_ids FROM member_knowledge.publication_contributors WHERE submission_id=$1',[command.id])).rows[0];
  expect(contribution).toMatchObject({owner_id:aliceId,operation:'correct-entity',attribution:'profile'});expect(contribution.entity_ids).toContain(eid);
  const policy=(await memberRuntime().pool.query("SELECT policy FROM member_knowledge.review_attempts WHERE job_id=(SELECT id FROM member_knowledge.review_jobs WHERE submission_id=$1)",[command.id])).rows[0].policy;expect(policy).toBe('entity-original-correction-v1');
  await memberRuntime().pool.query("UPDATE member_knowledge.submission_requests SET created_at=clock_timestamp()-interval '20 minutes' WHERE owner_id=$1",[aliceId]);
 });
 it("restores the migrated database separately and reapplies checksums unchanged",async()=>{
  const container=process.env.MEMBER_TEST_CONTAINER!;expect(container).toMatch(/^gk-member-test-[a-f0-9-]+$/);
  const database="u5_restore_"+randomUUID().replaceAll("-","");const dir=".local/u5-member/"+database;await mkdir(dir,{recursive:true,mode:0o700});
  const docker=(args:string[])=>{const r=spawnSync("docker",args,{timeout:60000,maxBuffer:30_000_000});if(r.status!==0)throw Error("Disposable restore command failed");return r.stdout;};
  const dump=docker(["exec",container,"pg_dump","-U","gk_member","-d","graph_member_test","--format=custom","--no-owner","--no-acl"]);await writeFile(dir+"/member.dump",dump,{mode:0o600});
  docker(["exec",container,"createdb","-U","gk_member",database]);
  const restore=spawnSync("docker",["exec","-i",container,"pg_restore","-U","gk_member","-d",database,"--no-owner","--no-acl","--exit-on-error"],{input:dump,timeout:60000});expect(restore.status).toBe(0);
  const url=new URL(memberConfig()!.databaseUrl);url.pathname="/"+database;const pool=new Pool({connectionString:url.toString()});
  try{
   const fingerprint=async(p:Pool)=>{const out:Record<string,string>={};const tables=(await p.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','member_knowledge') ORDER BY 1,2")).rows;for(const table of tables){const name=table.schemaname+"."+table.tablename;if(!/^[a-z_]+\.[a-z_]+$/.test(name))throw Error("Unexpected test table");out[name]=(await p.query(`SELECT md5(COALESCE(string_agg(row_to_json(t)::text,chr(10) ORDER BY row_to_json(t)::text),'')) AS digest FROM ${name} t`)).rows[0].digest;}return out;};
   const before=await fingerprint(memberRuntime().pool);expect(await fingerprint(pool)).toEqual(before);await migrateMemberDatabase(pool,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true);expect(await fingerprint(pool)).toEqual(before);await writeFile(dir+"/result.json",JSON.stringify({restored:true,reappliedUnchanged:true,tables:Object.keys(before).length,fingerprints:before},null,2),{mode:0o600});
  }finally{await pool.end();docker(["exec",container,"dropdb","-U","gk_member",database]);}
 },60000);
});
