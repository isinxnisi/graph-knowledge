import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {Pool} from "pg";
import {migrateMemberDatabase} from "../lib/server/member/migrate";
import {memberConfig} from "../lib/server/member/config";
import {memberPool} from "../lib/server/member/auth";
import {operateMember} from "../lib/server/member/operations";
import {startMemberOidc} from "./support/member-oidc";
vi.mock("server-only",()=>({}));
import {memberRuntime} from "../lib/server/member/runtime";
import * as authRoute from "../app/api/auth/[...all]/route";
import * as api from "../app/api/member/knowledge-submissions/route";
import * as item from "../app/api/member/knowledge-submissions/[id]/route";
import * as candidates from "../app/api/member/knowledge-submissions/capsule/route";
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

let fixture:Awaited<ReturnType<typeof startMemberOidc>>,alice:Awaited<ReturnType<typeof login>>,bob:Awaited<ReturnType<typeof login>>,aliceId:string,bobId:string;
const ctx=(id:string)=>({params:Promise.resolve({id})});
const content=(assertion="架空の観測所の設立について。")=>({title:"投稿の検証",items:[{key:"record-a",record:{kind:"note",assertion,evidence:[]}}]});
const save=(id=randomUUID(),expectedVersion=0,value=content())=>({action:"save",requestId:randomUUID(),id,expectedVersion,content:value});
const post=(body:unknown,cookie=alice.cookies.value,user=aliceId,headers:Record<string,string>={})=>api.POST(request("/api/member/knowledge-submissions",cookie,"POST",body,{"x-member-user":user,...headers}));
const current=async(id:string,cookie=alice.cookies.value,user=aliceId)=>item.GET(request("/api/member/knowledge-submissions/"+id,cookie,"GET",undefined,{"x-member-user":user}),ctx(id));
beforeAll(async()=>{
 const config=memberConfig();if(!config||config.provider.kind!=="fixture"||process.env.KNOWLEDGE_SUBMISSIONS_ENABLED!=="1")throw Error("Use the disposable --submissions harness");
 fixture=await startMemberOidc();const pool=memberPool(config);
 try{await migrateMemberDatabase(pool,true,true,true,true,true,true,true,true,true,true,true,true,true);}finally{await pool.end();}
 alice=await login("alice");bob=await login("bob");
 aliceId=(await (await profile.GET(request("/api/member/profile",alice.cookies.value))).json()).user.id;
 bobId=(await (await profile.GET(request("/api/member/profile",bob.cookies.value))).json()).user.id;
},30000);
afterAll(async()=>{await memberRuntime().pool.end();await fixture?.close();});
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
   const before=await fingerprint(memberRuntime().pool);expect(await fingerprint(pool)).toEqual(before);await migrateMemberDatabase(pool,true,true,true,true,true,true,true,true,true,true,true,true,true);expect(await fingerprint(pool)).toEqual(before);await writeFile(dir+"/result.json",JSON.stringify({restored:true,reappliedUnchanged:true,tables:Object.keys(before).length,fingerprints:before},null,2),{mode:0o600});
  }finally{await pool.end();docker(["exec",container,"dropdb","-U","gk_member",database]);}
 },60000);
});
