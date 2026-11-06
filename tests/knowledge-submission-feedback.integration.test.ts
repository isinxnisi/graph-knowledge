import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {migrateMemberDatabase} from "../lib/server/member/migrate";
import {memberConfig} from "../lib/server/member/config";
import {memberPool} from "../lib/server/member/auth";
import {startMemberOidc} from "./support/member-oidc";
import {createReviewQueue,type ReviewConfig} from "../lib/server/knowledge-review-queue";
import {PUBLICATION_CONSENT_VERSION} from "../lib/domain/knowledge-review-job";
const publicRead=vi.hoisted(()=>({records:new Map<string,{revision:number;assertion:string}>(),entities:new Set<string>(),themes:new Map<string,{revision:number;records:{id:string;revision:number}[]}>(),afterGraph:null as null|(()=>Promise<void>)}));
vi.mock("../lib/server/knowledge-read-runtime",()=>({knowledgeReadGuard:()=>{}}));
vi.mock("../lib/server/knowledge-publication-preview",async()=>{
 const {KnowledgeError}=await import("../lib/server/knowledge-foundation");
 const missing=()=>new KnowledgeError("not public",404,"NOT_FOUND"),dto=(id:string)=>{const r=publicRead.records.get(id);if(!r)throw missing();return {record:{id,revision:r.revision,content:{assertion:r.assertion}}};};
 return {knowledgePublicationPreview:async()=>({
  detail:async({recordId}:{recordId:string})=>({record:dto(recordId)}),
  recordVersion:async(id:string,revision:number)=>{const value=dto(id);if(value.record.revision!==revision)throw missing();return {record:value};},
  graph:async({recordIds}:{recordIds:string[]})=>{const records=recordIds.filter(id=>publicRead.records.has(id)).map(dto);const hook=publicRead.afterGraph;publicRead.afterGraph=null;await hook?.();return {records};},
  entities:async({entityId}:{entityId:string})=>({entities:publicRead.entities.has(entityId)?[{id:entityId}]:[]}),
  theme:async({themeId,revision}:{themeId:string;revision?:number})=>{const r=publicRead.themes.get(themeId);if(!r||revision&&revision!==r.revision)throw missing();return {theme:{id:themeId,revision:r.revision},snapshot:{records:r.records}};},
 })};
});
vi.mock("server-only",()=>({}));
import {memberRuntime} from "../lib/server/member/runtime";
import * as auth from "../app/api/auth/[...all]/route";
import * as profile from "../app/api/member/profile/route";
import * as feedback from "../app/api/member/knowledge-submissions/feedback/route";
import * as contributors from "../app/api/knowledge/contributors/route";
import {persistPublicationContributor,finalizePublicationContributor} from "../lib/server/member/knowledge-contributors";
const origin="http://127.0.0.1:3221",endpoint="/api/member/knowledge-submissions/feedback";
const request=(path:string,cookie="",method="GET",body?:unknown,headers:Record<string,string>={})=>new Request(origin+path,{method,headers:{cookie,origin,"content-type":"application/json",...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
async function login(identity:string){
 const cookies=new Map<string,string>(),receive=(r:Response)=>{for(const value of r.headers.getSetCookie()){const pair=value.split(";")[0],index=pair.indexOf("=");cookies.set(pair.slice(0,index),pair.slice(index+1));}},cookie=()=>[...cookies].map(([k,v])=>`${k}=${v}`).join("; ");
 const start=await auth.POST(request("/api/auth/sign-in/social","","POST",{provider:"fixture",callbackURL:"/",disableRedirect:true}));expect(start.status).toBe(200);receive(start);
 const authorization=new URL((await start.json()).url);authorization.searchParams.set("fixture_identity",identity);const consent=await fetch(authorization,{redirect:"manual"});expect(consent.status).toBe(302);
 const location=new URL(consent.headers.get("location")!),callback=await auth.GET(request(location.pathname+location.search,cookie()));receive(callback);
 const user=(await (await profile.GET(request("/api/member/profile",cookie()))).json()).user;return {cookie:cookie(),id:user.id as string};
}
let fixture:Awaited<ReturnType<typeof startMemberOidc>>,alice:Awaited<ReturnType<typeof login>>,bob:Awaited<ReturnType<typeof login>>;
const pool=()=>memberRuntime().pool;
beforeAll(async()=>{
 const config=memberConfig();if(!config||config.provider.kind!=="fixture"||!process.env.MEMBER_TEST_CONTAINER?.startsWith("gk-member-test-")||process.env.KNOWLEDGE_SUBMISSIONS_ENABLED!=="1")throw Error("Use the disposable --submissions --feedback harness");
 const setup=memberPool(config);try{
  await migrateMemberDatabase(setup,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true);
  const ledger=(await setup.query("SELECT name,checksum FROM member_migration ORDER BY name")).rows;
  await migrateMemberDatabase(setup,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true);
  expect((await setup.query("SELECT name,checksum FROM member_migration ORDER BY name")).rows).toEqual(ledger);
 }finally{await setup.end();}
 fixture=await startMemberOidc();alice=await login("alice");bob=await login("bob");
},30000);
afterAll(async()=>{await memberRuntime().pool.end();await fixture?.close();});
beforeEach(()=>{publicRead.records.clear();publicRead.entities.clear();publicRead.themes.clear();publicRead.afterGraph=null;});
async function seed(owner=alice.id){
 const id=randomUUID(),jobs=[randomUUID(),randomUUID()],content={title:"結果通知の検証",items:[{key:"one",record:{assertion:"送信した時点の内容1"}},{key:"two",record:{assertion:"送信した時点の内容2"}}]};
 await pool().query("INSERT INTO member_knowledge.submissions(id,owner_id,current_revision,state_version,state) VALUES($1,$2,1,1,'queued')",[id,owner]);
 await pool().query("INSERT INTO member_knowledge.submission_revisions(submission_id,revision,raw_input,content,digest) VALUES($1,1,$2,$2,'receipt-digest')",[id,content]);
 await pool().query("INSERT INTO member_knowledge.submission_receipts(submission_id,revision,digest) VALUES($1,1,'receipt-digest')",[id]);
 await pool().query("INSERT INTO member_knowledge.review_authorizations(submission_id,revision,consent_version,consent_profile_id) VALUES($1,1,$2,'google-gemini-free-publish-v1')",[id,PUBLICATION_CONSENT_VERSION]);
 for(let i=0;i<2;i++)await pool().query("INSERT INTO member_knowledge.review_jobs(id,submission_id,revision,item_key,submitted_digest,consent_version,consent_profile_id,state) VALUES($1,$2,1,$3,'receipt-digest',$4,'google-gemini-free-publish-v1','queued')",[jobs[i],id,i===0?"one":"two",PUBLICATION_CONSENT_VERSION]);
 return {id,jobs};
}
const get=(id?:string,user=alice,revision?:number)=>feedback.GET(request(endpoint+(id?`?submissionId=${id}${revision?`&revision=${revision}`:""}`:""),user.cookie,"GET",undefined,{"x-member-user":user.id}));
const acknowledge=(id:string,cursor:string,user=alice,revision=1,headers:Record<string,string>={})=>feedback.POST(request(endpoint,user.cookie,"POST",{action:"acknowledge",submissionId:id,revision,throughEventId:cursor},{"x-member-user":user.id,...headers}));
const outcome=(job:string,state:string,reason="根拠の該当部分を加えてください。")=>pool().query("UPDATE member_knowledge.review_jobs SET state=$2,reason=$3 WHERE id=$1",[job,state,reason]);
describe("receipt feedback, real OIDC sessions and PostgreSQL",()=>{
 it("keeps owner boundaries and explicit Origin/expected-user checks",async()=>{
  const {id,jobs}=await seed();await outcome(jobs[0],"needs-changes");const cursor=(await (await get(id)).json()).receipt.eventCursor;
  expect((await feedback.GET(request(endpoint))).status).toBe(401);
  expect((await feedback.GET(request(endpoint,alice.cookie))).status).toBe(400);
  expect((await get(id,bob)).status).toBe(404);
  expect((await feedback.GET(request(endpoint,bob.cookie,"GET",undefined,{"x-member-user":alice.id}))).status).toBe(401);
  expect((await acknowledge(id,cursor,bob)).status).toBe(404);
  expect((await acknowledge(id,cursor,alice,1,{origin:"https://foreign.invalid"})).status).toBe(403);
  expect((await acknowledge(id,cursor,alice,2)).status).toBe(404);
  expect((await acknowledge(id,"9223372036854775808")).status).toBe(400);
 });
 it("GET is side-effect-free, duplicate outcomes deduplicate, and explicit ack preserves ordering",async()=>{
  const {id,jobs}=await seed();await outcome(jobs[0],"needs-changes");await outcome(jobs[0],"needs-changes");
  const updated=(await pool().query("SELECT updated_at FROM member_knowledge.submissions WHERE id=$1",[id])).rows[0].updated_at;
  const first=await get(id);expect(first.headers.get("cache-control")).toBe("private, no-store");const receipt=(await first.json()).receipt;
  expect(receipt).toMatchObject({revision:1,title:"結果通知の検証",current:true,unread:true,disclosure:{profileId:"google-gemini-free-publish-v1"}});
  expect((await (await get()).json()).submissionIds).toContain(id);await get(id);expect((await (await get(id)).json()).receipt.unread).toBe(true);
  expect((await pool().query("SELECT count(*)::int AS n FROM member_knowledge.feedback_events WHERE submission_id=$1",[id])).rows[0].n).toBe(1);
  expect((await acknowledge(id,receipt.eventCursor)).status).toBe(200);expect((await acknowledge(id,receipt.eventCursor)).status).toBe(200);
  expect((await (await get(id)).json()).receipt.unread).toBe(false);expect((await (await get()).json()).submissionIds).not.toContain(id);
  expect((await pool().query("SELECT updated_at FROM member_knowledge.submissions WHERE id=$1",[id])).rows[0].updated_at).toEqual(updated);
 });
 it("an acknowledgement only covers the displayed cursor; a later new result stays unread",async()=>{
  const {id,jobs}=await seed();await outcome(jobs[0],"needs-changes");const old=(await (await get(id)).json()).receipt.eventCursor;
  await outcome(jobs[0],"published","公開しました。");const latest=(await (await get(id)).json()).receipt.eventCursor;expect(BigInt(latest)).toBeGreaterThan(BigInt(old));
  expect((await acknowledge(id,old)).status).toBe(200);expect((await (await get(id)).json()).receipt.unread).toBe(true);
  await acknowledge(id,latest);expect((await (await get(id)).json()).receipt.unread).toBe(false);
  await acknowledge(id,old);expect((await pool().query("SELECT through_event_id::text FROM member_knowledge.feedback_seen WHERE submission_id=$1 AND revision=1",[id])).rows[0].through_event_id).toBe(latest);
 });
 it("a new draft or cancellation keeps the original receipt and its context available",async()=>{
  const {id,jobs}=await seed();await outcome(jobs[0],"declined","資料の内容と一致しません。");
  await pool().query("INSERT INTO member_knowledge.submission_revisions(submission_id,revision,raw_input,content,digest) VALUES($1,2,$2,$2,'draft-digest')",[id,{title:"まだ送っていない変更",items:[{key:"one",record:{assertion:"非公開の編集中の文章"}}]}]);
  await pool().query("UPDATE member_knowledge.submissions SET current_revision=2,state='draft' WHERE id=$1",[id]);
  const data=await (await get(id)).json();expect(data.receipt).toMatchObject({revision:1,current:false,title:"結果通知の検証",unread:true});expect(JSON.stringify(data)).not.toContain("非公開の編集中");
  expect(data.receipts).toHaveLength(1);await pool().query("UPDATE member_knowledge.submissions SET state='cancelled' WHERE id=$1",[id]);
  expect((await (await get(id,alice,1)).json()).receipt).toMatchObject({revision:1,cancelled:true,unread:true});
 });
 it("concurrent job outcomes allocate cursors in commit order and do not hide an uncommitted earlier result",async()=>{
  const {id,jobs}=await seed(),a=await pool().connect(),b=await pool().connect();let pending:Promise<unknown>|undefined;
  try{
   await a.query("BEGIN");await b.query("BEGIN");await a.query("UPDATE member_knowledge.review_jobs SET state='attention' WHERE id=$1",[jobs[0]]);
   const pid=(await b.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
   pending=b.query("UPDATE member_knowledge.review_jobs SET state='attention' WHERE id=$1",[jobs[1]]);
   let blocked=false;for(let i=0;i<100;i++){blocked=(await pool().query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted) AS blocked",[pid])).rows[0].blocked;if(blocked)break;await new Promise(resolve=>setTimeout(resolve,10));}expect(blocked).toBe(true);
   expect((await (await get(id)).json()).receipt.eventCursor).toBeNull();await a.query("COMMIT");await pending;await b.query("COMMIT");
   const events=(await pool().query("SELECT job_id,id::text FROM member_knowledge.feedback_events WHERE submission_id=$1 ORDER BY id",[id])).rows;expect(events.map(e=>e.job_id)).toEqual(jobs);
  }finally{await a.query("ROLLBACK");await b.query("ROLLBACK");a.release();b.release();}
 });
 it("deleting a submission removes result events and unread state without affecting unrelated owners",async()=>{
  const {id,jobs}=await seed();await outcome(jobs[0],"attention");const cursor=(await (await get(id)).json()).receipt.eventCursor;await acknowledge(id,cursor);
  const other=await seed(bob.id);await outcome(other.jobs[0],"needs-changes");
  await pool().query("DELETE FROM member_knowledge.submissions WHERE id=$1",[id]);expect((await get(id)).status).toBe(404);
  expect((await pool().query("SELECT count(*)::int AS n FROM member_knowledge.feedback_events WHERE submission_id=$1",[id])).rows[0].n).toBe(0);
  expect((await pool().query("SELECT count(*)::int AS n FROM member_knowledge.feedback_seen WHERE submission_id=$1",[id])).rows[0].n).toBe(0);
  expect((await (await get(undefined,bob)).json()).submissionIds).toContain(other.id);
 });
});

describe("legacy pending review jobs",()=>{
 it("returns an old receipt to changes-needed before AI attempt/quota reservation, preserving receipt and body",async()=>{
  const legacyOwner=await login("notification-owner"),v=await seed(legacyOwner.id);
  const legacy={title:"旧入力のままの受付",entities:[],sources:[{id:"old-source",content:{title:"旧資料",url:"https://example.invalid/source",bibliography:"",language:"ja"}}],items:[{key:"one",record:{kind:"note",assertion:"対象に紐付いていなかった古い事実",evidence:[{id:"old-evidence",source:{id:"old-source",revision:1},locator:"第1段落",excerpt:"根拠の原文",stance:"support"}] }},{key:"two",record:{kind:"note",assertion:"旧入力の二つ目の事実",evidence:[]}}]};
  await pool().query("UPDATE member_knowledge.submission_revisions SET raw_input=$2,content=$2 WHERE submission_id=$1 AND revision=1",[v.id,legacy]);
  const before=(await pool().query("SELECT v.content,v.raw_input,v.digest,r.digest AS receipt_digest,r.submitted_at FROM member_knowledge.submission_revisions v JOIN member_knowledge.submission_receipts r ON r.submission_id=v.submission_id AND r.revision=v.revision WHERE v.submission_id=$1",[v.id])).rows[0];
  const cfg:ReviewConfig={projectId:'not-contacted-'+randomUUID(),billingTier:'free',verifiedAt:new Date().toISOString(),model:'gemini-3.5-flash-lite',rpm:15,tokensPerMinute:100000,requestsPerDay:80,requestsPerMonth:100,inputTokensPerDay:250000,outputTokensPerDay:160000,inputTokensPerMonth:1000000,outputTokensPerMonth:1000000,apiKeyFile:'/not-used-in-fixture',allowedUsers:[legacyOwner.id]};
  const prior=process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED;process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED='1';
  try{expect(await createReviewQueue(pool()).claim(cfg)).toBeNull();}finally{if(prior===undefined)delete process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED;else process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED=prior;}
  const jobs=(await pool().query("SELECT state,reason,attempts FROM member_knowledge.review_jobs WHERE submission_id=$1 ORDER BY item_key",[v.id])).rows;expect(jobs).toHaveLength(2);for(const job of jobs){expect(job).toMatchObject({state:"needs-changes",attempts:0});expect(job.reason).toContain("投稿先と操作");}
  const usage=(await pool().query("SELECT count(*)::int AS attempts,COALESCE(sum(request_charge),0)::int AS charge FROM member_knowledge.review_attempts WHERE job_id=ANY($1::uuid[])",[v.jobs])).rows[0];expect(usage).toEqual({attempts:0,charge:0});
  expect((await pool().query("SELECT v.content,v.raw_input,v.digest,r.digest AS receipt_digest,r.submitted_at FROM member_knowledge.submission_revisions v JOIN member_knowledge.submission_receipts r ON r.submission_id=v.submission_id AND r.revision=v.revision WHERE v.submission_id=$1",[v.id])).rows[0]).toEqual(before);
  expect((await (await get(v.id,legacyOwner)).json()).receipt).toMatchObject({revision:1,unread:true,title:legacy.title});
 });
});

async function publicContribution(owner=alice.id,attribution:"profile"|"anonymous"="profile",published=true,revision=1){
 const source=await seed(owner),decisionId=randomUUID(),recordId="public-record:"+randomUUID(),entityId="public-entity:"+randomUUID(),themeId="public-theme:"+randomUUID();
 await pool().query("INSERT INTO member_knowledge.publication_decisions(id,job_id,command,digest,references_json,proofs,state) VALUES($1,$2,'{}','fixture-public-decision','[]','[]','pending')",[decisionId,source.jobs[0]]);
 const input={decisionId,ownerId:owner,attribution,recordId,submissionId:source.id,submissionRevision:1,operation:"create-relation",entityIds:[entityId],themeIds:[themeId]},client=await pool().connect();
 try{await client.query("BEGIN");await persistPublicationContributor(client,input);await persistPublicationContributor(client,input);if(published){await finalizePublicationContributor(client,decisionId,{id:recordId,revision});await finalizePublicationContributor(client,decisionId,{id:recordId,revision});}await client.query("COMMIT");}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
 publicRead.records.set(recordId,{revision,assertion:"公開された知識の内容"});publicRead.entities.add(entityId);publicRead.themes.set(themeId,{revision:1,records:[{id:recordId,revision}]});
 const handle=(await pool().query("UPDATE public_profile SET timeline_public=true WHERE user_id=$1 RETURNING handle",[owner])).rows[0].handle;
 return {...input,handle,source};
}
const publicGet=(kind:string,id:string,revision?:number)=>contributors.GET(request('/api/knowledge/contributors?'+new URLSearchParams({kind,...(kind==='profile'?{handle:id}:{id}),...(revision?{revision:String(revision)}:{})})));
describe("public attribution with real member PostgreSQL and fixture KG visibility gates",()=>{
 it("only finalized accepted publications show a profile; private owner/submission IDs never project",async()=>{
  const draft=await publicContribution(alice.id,"profile",false);expect((await (await publicGet("record",draft.recordId)).json()).contributors).toEqual([]);
  const v=await publicContribution();const response=await publicGet("record",v.recordId),data=await response.json();expect(data.contributors).toHaveLength(1);expect(data.contributors[0]).toMatchObject({recordId:v.recordId,revision:1,anonymous:false,person:{handle:v.handle}});
  for(const privateId of [alice.id,v.source.id,v.source.jobs[0]])expect(JSON.stringify(data)).not.toContain(privateId);
  expect((await (await publicGet("entity",v.entityIds[0])).json()).contributors.map((r:{id:string})=>r.id)).toContain(v.decisionId);
  expect((await (await publicGet("theme",v.themeIds[0])).json()).contributors.map((r:{id:string})=>r.id)).toContain(v.decisionId);
 });
 it("anonymous attribution is absent from the account timeline and cannot disclose a profile identity",async()=>{
  const v=await publicContribution(alice.id,"anonymous"),data=await (await publicGet("record",v.recordId)).json();expect(data.contributors[0]).toMatchObject({anonymous:true,person:null});
  for(const privateValue of [alice.id,v.source.id,v.handle])expect(JSON.stringify(data)).not.toContain(privateValue);
  const timeline=await (await publicGet("profile",v.handle)).json();expect(timeline.available).toBe(true);expect(timeline.activities.some((r:{id:string})=>r.id===v.decisionId)).toBe(false);
 });
 it("timeline privacy hides the activity collection while public record authorship remains separate",async()=>{
  const v=await publicContribution();expect((await (await publicGet("profile",v.handle)).json()).activities.some((r:{id:string})=>r.id===v.decisionId)).toBe(true);
  await pool().query("UPDATE public_profile SET timeline_public=false WHERE user_id=$1",[alice.id]);expect(await (await publicGet("profile",v.handle)).json()).toEqual({available:false,activities:[],nextCursor:null});
  expect((await (await publicGet("record",v.recordId)).json()).contributors[0].person?.handle).toBe(v.handle);
  await pool().query("UPDATE public_profile SET timeline_public=true WHERE user_id=$1",[alice.id]);
 });
 it("record, entity and theme read gates are checked again instead of trusting accepted receipts",async()=>{
  const v=await publicContribution();publicRead.records.delete(v.recordId);expect((await publicGet("record",v.recordId)).status).toBe(404);
  expect((await (await publicGet("entity",v.entityIds[0])).json()).contributors).toEqual([]);
  publicRead.records.set(v.recordId,{revision:1,assertion:"公開された知識の内容"});publicRead.afterGraph=async()=>{publicRead.entities.delete(v.entityIds[0]);};expect((await publicGet("entity",v.entityIds[0])).status).toBe(404);
  publicRead.afterGraph=async()=>{publicRead.themes.delete(v.themeIds[0]);};expect((await publicGet("theme",v.themeIds[0])).status).toBe(404);
 });
 it("a pinned older theme does not credit contributions made to a later record version",async()=>{
  const v=await publicContribution(alice.id,"profile",true,2);publicRead.themes.set(v.themeIds[0],{revision:1,records:[{id:v.recordId,revision:1}]});
  expect((await (await publicGet("theme",v.themeIds[0],1)).json()).contributors).toEqual([]);expect((await publicGet("theme",v.themeIds[0],2)).status).toBe(404);
 });
 it("account deactivation during KG lookup removes profile activity and public author identity",async()=>{
  const v=await publicContribution();publicRead.afterGraph=async()=>{await pool().query('UPDATE "user" SET active=false WHERE id=$1',[alice.id]);};
  expect(await (await publicGet("profile",v.handle)).json()).toEqual({available:false,activities:[],nextCursor:null});
  expect((await (await publicGet("record",v.recordId)).json()).contributors[0]).toMatchObject({person:null,anonymous:false});
  await pool().query('UPDATE "user" SET active=true WHERE id=$1',[alice.id]);
 });
 it("accepted public authorship survives private submission erasure without leaking its old ID",async()=>{
  const v=await publicContribution();await pool().query("DELETE FROM member_knowledge.submissions WHERE id=$1",[v.source.id]);
  const data=await (await publicGet("record",v.recordId)).json();expect(data.contributors[0].person?.handle).toBe(v.handle);expect(JSON.stringify(data)).not.toContain(v.source.id);
  expect((await pool().query("SELECT submission_id FROM member_knowledge.publication_contributors WHERE decision_id=$1",[v.decisionId])).rows[0].submission_id).toBeNull();
 });
 it("account erasure keeps the accepted public event but removes its former profile identity",async()=>{
  const retired=await login("delete"),v=await publicContribution(retired.id);await pool().query('DELETE FROM "user" WHERE id=$1',[retired.id]);
  const data=await (await publicGet("record",v.recordId)).json();expect(data.contributors[0]).toMatchObject({person:null,anonymous:false});
  for(const old of [retired.id,v.handle,v.source.id])expect(JSON.stringify(data)).not.toContain(old);
  expect(await (await publicGet("profile",v.handle)).json()).toEqual({available:false,activities:[],nextCursor:null});
  const row=(await pool().query("SELECT owner_id,submission_id FROM member_knowledge.publication_contributors WHERE decision_id=$1",[v.decisionId])).rows[0];expect(row).toEqual({owner_id:null,submission_id:null});
 });

});
