import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {Pool} from "pg";
const knowledgePool=new Pool({connectionString:process.env.KNOWLEDGE_CAPSULE_TEST_DATABASE_URL,max:5});
import {captureKnowledgeCapsule,withCapsuleTimeline} from "../lib/client/capsule-knowledge";
import {planCapsuleKnowledgeUpdate} from "../lib/client/capsule-knowledge-updates";
import {migrateKnowledgeTranslations} from "../lib/server/knowledge-translation-migrate";
import {createKnowledgeFoundationService} from "../lib/server/knowledge-foundation";
import {createKnowledgePublicationService} from "../lib/server/knowledge-publication";
import {capsuleShareImage} from "../lib/server/capsule-share-image";
import {readSharedPublication} from "../lib/server/member/shared-publication";
import { startMemberOidc } from "./support/member-oidc";
import { migrateMemberDatabase } from "../lib/server/member/migrate";
import { memberHandle } from "../lib/server/member/http";
import { operateCommunitySafety } from "../lib/server/member/community-site-safety";
import { operateMember } from "../lib/server/member/operations";
import type { MemberCapsuleContent } from "../lib/domain/member-capsule";
vi.mock("server-only", () => ({}));
// Only replace runtime wiring: use the real publication policy and SQL in this
// disposable member database, never the configured beta knowledge database.
vi.mock("../lib/server/knowledge-publication-preview",()=>({knowledgePublicationPreview:async()=>{
 const {createKnowledgePublicationService}=await import("../lib/server/knowledge-publication");
 return createKnowledgePublicationService(knowledgePool,{} as never);
}}));
import { memberRuntime } from "../lib/server/member/runtime";
import * as authRoute from "../app/api/auth/[...all]/route";

const origin = "http://127.0.0.1:3221";
type Person = { id: string; cookie: string };
let issuer: Awaited<ReturnType<typeof startMemberOidc>>, a: Person, b: Person, late: Person;
function request(who?: Person, body?: unknown, path = "/") {
  return new Request(origin + path, { method: body === undefined ? "GET" : "POST", headers: { origin, "Content-Type": "application/json", ...(who ? { cookie: who.cookie, "x-member-user": who.id } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const service = () => memberRuntime().service;
const pool = () => memberRuntime().pool;
const call = (fn: () => Promise<Response>) => memberHandle(fn);
async function login(identity: string): Promise<Person> {
  const cookies = new Map<string, string>();
  const receive = (r: Response) => { for (const header of r.headers.getSetCookie()) { const pair = header.split(';')[0], n = pair.indexOf('='); cookies.set(pair.slice(0,n),pair.slice(n+1)); } };
  const cookie = () => [...cookies].map(([k,v]) => k + '=' + v).join('; ');
  const start = await authRoute.POST(new Request(origin + '/api/auth/sign-in/social', { method:'POST', headers:{ origin, 'Content-Type':'application/json' }, body:JSON.stringify({provider:'fixture',callbackURL:'/',disableRedirect:true}) }));
  expect(start.status).toBe(200); receive(start);
  const authorization = new URL((await start.json()).url); authorization.searchParams.set('fixture_identity',identity);
  const consent = await fetch(authorization,{redirect:'manual'}); expect(consent.status).toBe(302);
  const callbackUrl = new URL(consent.headers.get('location')!);
  const callback = await authRoute.GET(new Request(callbackUrl.href,{headers:{cookie:cookie()}}));
  expect(callback.status).toBe(302); receive(callback);
  const profile = await service().profile(new Request(origin + '/api/member/profile',{headers:{cookie:cookie()}}));
  return {id:(await profile.json()).user.id,cookie:cookie()};
}
const legacy = (title = '旧参照'): MemberCapsuleContent => ({dataset:'demo',title,note:'',language:'ja',entityIds:[randomUUID()],claimIds:[]});
function local(title = '手元の図', count = 2): MemberCapsuleContent {
  const nodes = Array.from({length:count}, (_, i) => ({key:randomUUID(),title:'ノード'+i,description:'資料メモ'.repeat(250),badge:'',origin:{kind:'local' as const}}));
  return {dataset:'demo',title,note:'保存した版',language:'ja',entityIds:[],claimIds:[],document:{schemaVersion:1,nodes,relations:[{key:randomUUID(),source:nodes[0].key,target:nodes[1].key,label:'仮説',note:'未申請',origin:{kind:'local'}}],texts:[{key:randomUUID(),text:'独立した説明',style:'note'}],evidence:[{key:randomUUID(),targetKey:nodes[0].key,supports:'identity',title:'紙の資料',url:null,locator:'p.12',note:'反例の候補',stance:'refute'}],unresolvedClaimIds:[],layout:{positions:{[nodes[0].key]:{x:10,y:20}},pan:{x:3,y:4},zoom:1}}};
}
async function create(content: MemberCapsuleContent = local(), who = a) {
  const r = await call(() => service().create(request(who,{requestId:randomUUID(),content}))); expect(r.status).toBe(201); return (await r.json()).capsule;
}
async function community(visibility = 'public') {
  const r = await call(() => service().community.create(request(a,{requestId:randomUUID(),title:'Capsuleの場',description:'',visibility}))); expect(r.status).toBe(201); return (await r.json()).community;
}
async function place(id: string, who = a) { return (await (await call(() => service().community.read(request(who),id))).json()).community; }
async function communityChange(id: string, action: string, who = a, extra = {}) {
  const p = await place(id,who); return call(() => service().community.change(request(who,{expectedRevision:p.revision,...extra}),id,action));
}
async function list(id: string, who?: Person, path = '/') { return call(() => service().community.listCapsules(request(who,undefined,path),id)); }
async function publish(id: string, capsule: {id:string;revision:number}, audience = 'public') {
  const p = await place(id); const input = {requestId:randomUUID(),expectedRevision:p.revision,capsuleId:capsule.id,capsuleRevision:capsule.revision,audience,description:'保存版の紹介'};
  const r = await call(() => service().community.createCapsuleListing(request(a,input),id)); expect(r.status).toBe(201); return (await r.json()).listing;
}
beforeAll(async () => {
  if (process.env.MEMBER_FIXTURE_ENABLED !== '1') throw new Error('Dedicated member fixture database required');
  expect(process.env.KNOWLEDGE_CAPSULE_TEST_DATABASE_URL).toBeTruthy();
  expect((await knowledgePool.query("SELECT current_database() AS name")).rows[0].name).toBe("plunode_knowledge75_test_capsule_share");
  issuer = await startMemberOidc();
  await migrateMemberDatabase(pool(),true,true,true);
  a = await login('alice'); b = await login('bob'); late = await login('community-d');
},30_000);
beforeEach(async () => { await pool().query('DELETE FROM community_rate'); await pool().query('DELETE FROM member_capsule'); });
afterAll(async () => { await pool().end(); await knowledgePool.end(); await issuer?.close(); });

it('明示追加migration前は新writerを閉じ、旧保存・共有snapshotを改変せず011/012を冪等適用する', async () => {
  const beforeCaps = await (await service().capabilities(request(a))).json(); expect(beforeCaps).toMatchObject({documents:false,community:false,totalBytes:64_000_000});
  const old = await create(legacy());
  const unavailable = await call(()=>service().issueShare(request(a,{expectedRevision:1,expectedShareId:null}),old.id));
  expect(unavailable.status).toBe(503); expect(await unavailable.json()).toEqual({error:{code:'SHARE_RECOVERY_UNAVAILABLE'}});
  expect((await (await service().shareStatus(request(a),old.id)).json()).token).toBeNull();
  await migrateMemberDatabase(pool(),true,true,true,false,false,true,true,true);
  const share = await service().issueShare(request(a,{expectedRevision:1,expectedShareId:null}),old.id); expect(share.status).toBe(201);
  const token = (await share.json()).token;
  const before = (await pool().query('SELECT snapshot::text FROM member_capsule_revision WHERE capsule_id=$1',[old.id])).rows[0].snapshot;
  expect((await call(() => service().create(request(a,{requestId:randomUUID(),content:local()})))).status).toBe(503);
  await migrateMemberDatabase(pool(),true,true,true,true,true,true,true,true,true,true,true);
  await migrateMemberDatabase(pool(),true,true,true,true,true,true,true,true,true,true,true);
  expect((await pool().query('SELECT snapshot::text FROM member_capsule_revision WHERE capsule_id=$1',[old.id])).rows[0].snapshot).toBe(before);
  expect((await service().capabilities(request(a))).status).toBe(200);
  const shared = await service().readShared(new Request(origin,{headers:{'x-capsule-token':token}})); expect((await shared.json()).capsule).toEqual(old);
  expect((await pool().query('SELECT count(*) FROM member_migration')).rows[0].count).toBe('19');
});
it('local-only内容・根拠・配置と32kを超える100/200参照を切り捨てず保存し、一覧から文書を除外する', async () => {
  const content = local('大きなlocal図',100); const capsule = await create(content); expect(capsule.schemaVersion).toBe(2); expect(capsule.content).toEqual(content);
  const response = await service().list(request(a)); const body = await response.json();
  const summary = body.capsules.find((c:{id:string}) => c.id === capsule.id); expect(summary.hasDocument).toBe(true); expect(summary.schemaVersion).toBe(2); expect(summary.content).not.toHaveProperty('document');
  expect(Buffer.byteLength(JSON.stringify(summary))).toBeLessThan(10_000);
  const refs = {...legacy(),note:'説明'.repeat(2000),entityIds:Array.from({length:100},()=>randomUUID()),claimIds:Array.from({length:200},()=>randomUUID())};
  expect(Buffer.byteLength(JSON.stringify(refs))).toBeGreaterThan(20_000);
  expect((await create(refs)).content).toEqual(refs);
  const read = await service().read(request(a),capsule.id); expect((await read.json()).capsule.content.document).toEqual(content.document);
});
it('更新再送・結果不明照会・同時編集が版を二重更新せず、別内容でrequestIdを再利用できない', async () => {
  const capsule = await create(), input = {requestId:randomUUID(),expectedRevision:1,content:{...capsule.content,title:'明示保存'}};
  const results = await Promise.all([call(()=>service().update(request(a,input),capsule.id)),call(()=>service().update(request(a,input),capsule.id))]);
  expect(results.map(r=>r.status)).toEqual([200,200]);
  const saved = await Promise.all(results.map(r=>r.json())); expect(saved.map(r=>r.capsule.revision)).toEqual([2,2]); expect(saved.filter(r=>r.replayed)).toHaveLength(1);
  expect((await call(()=>service().update(request(a,{...input,content:{...input.content,title:'別の内容'}}),capsule.id))).status).toBe(409);
  const status = await service().updateStatus(request(a),capsule.id,input.requestId); expect((await status.json()).operation.revision).toBe(2);
  expect((await call(()=>service().update(request(a,{expectedRevision:2,content:legacy('旧writer')}),capsule.id))).status).toBe(409);
  expect((await call(()=>service().updateStatus(request(b),capsule.id,input.requestId))).status).toBe(404);
  const winner = {...input,requestId:randomUUID(),expectedRevision:2,content:{...input.content,title:'次の版'}};
  expect((await call(()=>service().update(request(a,winner),capsule.id))).status).toBe(200);
  const replay = await (await service().update(request(a,input),capsule.id)).json(); expect(replay.appliedRevision).toBe(2); expect(replay.capsule.revision).toBe(3);
});
it('本人一覧の限定リンク・コミュニティ状態を独立して返し、共有tokenや停止済み固定版を返さない', async () => {
  const capsule = await create(), c = await community();
  const summary = async () => (await (await service().list(request(a))).json()).capsules.find((item:{id:string})=>item.id===capsule.id);
  expect(await summary()).toMatchObject({shared:false,published:false});
  const issued = await (await service().issueShare(request(a,{expectedRevision:1,expectedShareId:null}),capsule.id)).json();
  const linked = await summary();expect(linked).toMatchObject({shared:true,published:false});
  expect(linked).not.toHaveProperty('token');expect(linked).not.toHaveProperty('token_hash');expect(linked).not.toHaveProperty('share');
  expect(JSON.stringify(linked)).not.toContain(issued.token);
  expect((await (await service().list(request(b))).json()).capsules.some((item:{id:string})=>item.id===capsule.id)).toBe(false);
  expect((await call(()=>service().list(request()))).status).toBe(401);
  await publish(c.id,capsule);expect(await summary()).toMatchObject({shared:true,published:true});
  expect((await service().revokeShare(request(a,{expectedShareId:issued.share.id}),capsule.id)).status).toBe(200);
  expect(await summary()).toMatchObject({shared:false,published:true});
  await service().issueShare(request(a,{expectedRevision:1,expectedShareId:null}),capsule.id);
  await service().update(request(a,{requestId:randomUUID(),expectedRevision:1,content:{...capsule.content,title:'非公開の新版'}}),capsule.id);
  expect(await summary()).toMatchObject({revision:2,shared:true,published:true});
  await pool().query('UPDATE member_capsule_revision SET sharing_blocked=true WHERE capsule_id=$1 AND revision=1',[capsule.id]);
  expect(await summary()).toMatchObject({revision:2,shared:false,published:false});
  expect((await (await service().shareStatus(request(a),capsule.id)).json()).token).toBeNull();
  expect((await service().read(request(a),capsule.id)).status).toBe(200);
});
it('固定共有版はprivate再編集から独立し、更新と再発行の期待版を照合する', async () => {
  const content = local(); content.document!.nodes[0].shape = 'circle'; content.document!.nodes[1].shape = 'diamond';
  const capsule = await create(content); const input = {expectedRevision:1,expectedShareId:null};
  const first = await (await service().issueShare(request(a,input),capsule.id)).json();
  const changed = structuredClone(capsule.content); changed.document.nodes[0].shape = 'rectangle'; changed.title = 'privateの後編集';
  await service().update(request(a,{requestId:randomUUID(),expectedRevision:1,content:changed}),capsule.id);
  const readToken = (token:string) => call(()=>service().readShared(new Request(origin,{headers:{'x-capsule-token':token}})));
  expect((await (await readToken(first.token)).json()).capsule).toEqual(capsule);
  expect((await (await service().read(request(a),capsule.id)).json()).capsule.content.document.nodes[0].shape).toBe('rectangle');
  expect((await call(()=>service().issueShare(request(a,{expectedRevision:1,expectedShareId:first.share.id}),capsule.id))).status).toBe(409);
  const second = await (await service().issueShare(request(a,{expectedRevision:2,expectedShareId:first.share.id}),capsule.id)).json();
  expect((await readToken(first.token)).status).toBe(404); expect((await (await readToken(second.token)).json()).capsule.revision).toBe(1);
  const inputPublish={expectedRevision:2,expectedSharedRevision:1,expectedShareId:second.share.id};
  expect((await service().publishShare(request(a,inputPublish),capsule.id)).status).toBe(200);
  expect((await service().publishShare(request(a,inputPublish),capsule.id)).status).toBe(200);
  expect((await (await readToken(second.token)).json()).capsule.content).toEqual(changed);
  expect((await (await service().shareStatus(request(a),capsule.id)).json()).token).toBe(second.token);
});
it('public掲載は保存した版だけを返し、第三者が他人のCapsuleを掲載/更新できない', async () => {
  const c = await community(), capsule = await create(), listing = await publish(c.id,capsule);
  const anon = await (await list(c.id)).json(); expect(anon.listings[0].id).toBe(listing.id); expect(anon.listings[0].canManage).toBe(false);
  await service().update(request(a,{requestId:randomUUID(),expectedRevision:1,content:{...capsule.content,title:'非公開変更'}}),capsule.id);
  const fixed = await service().community.readCapsule(request(),listing.id); expect((await fixed.json()).capsule).toEqual(capsule);
  await communityChange(c.id,'join',b);
  const p = await place(c.id,b);
  expect((await call(()=>service().community.createCapsuleListing(request(b,{requestId:randomUUID(),expectedRevision:p.revision,capsuleId:capsule.id,capsuleRevision:1,audience:'public',description:''}),c.id))).status).toBe(404);
  expect((await call(()=>service().community.changeCapsuleListing(request(b,{requestId:randomUUID(),expectedRevision:1}),listing.id,'withdraw'))).status).toBe(404);
});
it('cohort後参加・離脱再参加・公開→限定→公開でも題名/件数/時刻を漏らさない', async () => {
  const c = await community(); await communityChange(c.id,'join',b);
  const capsule = await create(), listing = await publish(c.id,capsule,'cohort');
  expect((await service().community.readCapsule(request(b),listing.id)).status).toBe(200);
  expect((await call(()=>service().community.readCapsule(request(),listing.id))).status).toBe(404);
  await communityChange(c.id,'join',late);
  expect((await (await list(c.id,late)).json()).listings).toEqual([]);
  await communityChange(c.id,'leave',b); await communityChange(c.id,'join',b);
  expect((await (await list(c.id,b)).json()).listings).toEqual([]);
  const publicListing = await publish(c.id,capsule);
  await communityChange(c.id,'settings',a,{title:'Capsuleの場',description:'',visibility:'members'});
  await communityChange(c.id,'settings',a,{title:'Capsuleの場',description:'',visibility:'public'});
  expect((await (await list(c.id)).json()).listings).toEqual([]);
  expect((await call(()=>service().community.readCapsule(request(),publicListing.id))).status).toBe(404);
});
it('掲載更新は明示した保存版へだけ進み、撤去再送とCapsule削除は会話を消さない', async () => {
  const c = await community(), capsule = await create();
  const thread = await service().community.createThread(request(a,{requestId:randomUUID(),expectedRevision:c.revision,title:'独立の会話',body:'残る本文',audience:'public'}),c.id); const tid = (await thread.json()).id;
  const listing = await publish(c.id,capsule);
  const updated = await (await service().update(request(a,{requestId:randomUUID(),expectedRevision:1,content:{...capsule.content,title:'新しい保存版'}}),capsule.id)).json();
  const v = {requestId:randomUUID(),expectedRevision:listing.revision,capsuleRevision:updated.capsule.revision,description:'新版を明示掲載',threadId:tid};
  const result = await service().community.changeCapsuleListing(request(a,v),listing.id,'update'); expect((await result.json()).listing.capsuleRevision).toBe(2);
  const withdrawn = {requestId:randomUUID(),expectedRevision:2};
  for (let n=0;n<2;n++) expect((await service().community.changeCapsuleListing(request(a,withdrawn),listing.id,'withdraw')).status).toBe(200);
  expect((await call(()=>service().community.readCapsule(request(),listing.id))).status).toBe(404);
  await service().remove(request(a,{expectedRevision:2}),capsule.id);
  expect((await service().community.thread(request(),tid)).status).toBe(200);
});
it('通報版を固定し、後編集/掲載更新後の停止が新しいprivate版へ広がらない', async () => {
  const c = await community(), capsule = await create(), listing = await publish(c.id,capsule);
  await communityChange(c.id,'join',b);
  const share = await (await service().issueShare(request(a,{expectedRevision:1,expectedShareId:null}),capsule.id)).json();
  const report = await service().community.report(request(b,{requestId:randomUUID(),kind:'capsule',targetId:listing.id,expectedRevision:1,category:'privacy',detail:'この保存版について'})); expect(report.status).toBe(201); const reportId = (await report.json()).id;
  await service().update(request(a,{requestId:randomUUID(),expectedRevision:1,content:{...capsule.content,title:'新しいprivate版'}}),capsule.id);
  await service().community.changeCapsuleListing(request(a,{requestId:randomUUID(),expectedRevision:1,capsuleRevision:2,description:'新版'}),listing.id,'update');
  const operation = {reportId,expectedReportRevision:1,expectedRevision:1,action:'block-capsule' as const,actor:'test',caseReference:'case.capsule',reason:'reported revision only'};
  await operateCommunitySafety(pool(),operation,true);
  const rows = (await pool().query('SELECT revision,sharing_blocked FROM member_capsule_revision WHERE capsule_id=$1 ORDER BY revision',[capsule.id])).rows;
  expect(rows.map(r=>[Number(r.revision),r.sharing_blocked])).toEqual([[1,true],[2,false]]);
  expect((await call(()=>service().readShared(new Request(origin,{headers:{'x-capsule-token':share.token}})))).status).toBe(404);
  expect((await service().community.readCapsule(request(),listing.id)).status).toBe(200);
  expect((await service().read(request(a),capsule.id)).status).toBe(200);
});
it('公開停止した固定版を共有再発行・別掲載から公開できず、元のprivate保存は維持する', async () => {
  const c = await community(), capsule = await create(), listing = await publish(c.id,capsule);
  await communityChange(c.id,'join',b);
  const report = await service().community.report(request(b,{requestId:randomUUID(),kind:'capsule',targetId:listing.id,expectedRevision:1,category:'privacy',detail:'保存版の公開停止'})); const reportId = (await report.json()).id;
  await operateCommunitySafety(pool(),{reportId,expectedReportRevision:1,expectedRevision:1,action:'block-capsule',actor:'test',caseReference:'case.stop',reason:'stop exact version'},true);
  expect((await (await list(c.id)).json()).listings).toEqual([]);
  expect((await call(()=>service().community.readCapsule(request(),listing.id))).status).toBe(404);
  expect((await call(()=>service().issueShare(request(a,{expectedRevision:1,expectedShareId:null}),capsule.id))).status).toBe(403);
  const p = await place(c.id);
  expect((await call(()=>service().community.createCapsuleListing(request(a,{requestId:randomUUID(),expectedRevision:p.revision,capsuleId:capsule.id,capsuleRevision:1,audience:'public',description:''}),c.id))).status).toBe(403);
  expect((await (await service().read(request(a),capsule.id)).json()).capsule).toEqual(capsule);
});
it('会員停止から再開・再参加しても旧掲載grantが復活せず、独立の会話は残る', async () => {
  const who = await login('community-b');
  const made = await service().community.create(request(who,{requestId:randomUUID(),title:'停止試験',description:'',visibility:'public'})); const c = (await made.json()).community;
  const capsule = await create(local(),who);
  const published = await service().community.createCapsuleListing(request(who,{requestId:randomUUID(),expectedRevision:c.revision,capsuleId:capsule.id,capsuleRevision:1,audience:'public',description:'停止で失効'}),c.id); const listing = (await published.json()).listing;
  expect((await list(c.id)).status).toBe(200);
  await operateMember(pool(),{action:'suspend-user',target:who.id,actor:'test',reason:'security'},true);
  expect((await (await list(c.id)).json()).listings).toEqual([]);
  await operateMember(pool(),{action:'resume-user',target:who.id,actor:'test',reason:'correction'},true);
  expect((await call(()=>service().community.readCapsule(request(),listing.id))).status).toBe(404);
  expect((await service().read(request(await login('community-b')),capsule.id)).status).toBe(200);
});
it('Capsule削除は掲載本文を再解決不能にし、会話カードと再送から復元されない', async () => {
  const c = await community(), capsule = await create();
  const tr = await service().community.createThread(request(a,{requestId:randomUUID(),expectedRevision:c.revision,title:'独立保存',body:'Capsuleを消しても残る',audience:'public'}),c.id); const tid = (await tr.json()).id;
  const p = await place(c.id);
  const r = await service().community.createCapsuleListing(request(a,{requestId:randomUUID(),expectedRevision:p.revision,capsuleId:capsule.id,capsuleRevision:1,audience:'public',description:'関連図',threadId:tid}),c.id); const listing = (await r.json()).listing;
  expect((await (await service().community.thread(request(),tid)).json()).capsules).toHaveLength(1);
  await service().remove(request(a,{expectedRevision:1}),capsule.id);
  expect((await (await service().community.thread(request(),tid)).json()).capsules).toEqual([]);
  expect((await call(()=>service().community.readCapsule(request(),listing.id))).status).toBe(404);
  expect((await (await list(c.id)).json()).listings).toEqual([]);
});
it('停止commitを待つ読取がtransaction内でactiveUserを再確認する', async () => {
  const c = await community(), capsule = await create(), listing = await publish(c.id,capsule), lock = await pool().connect();
  try {
    await lock.query('BEGIN'); await lock.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[b.id]);
    const pending = call(()=>service().community.readCapsule(request(b),listing.id));
    await new Promise(resolve=>setTimeout(resolve,60));
    await lock.query('UPDATE "user" SET active=false WHERE id=$1',[b.id]); await lock.query('COMMIT');
    expect((await pending).status).toBe(401);
  } finally { await lock.query('ROLLBACK'); await pool().query('UPDATE "user" SET active=true WHERE id=$1',[b.id]); lock.release(); }
});
it('private本文と固定版を合算した保存総量を超える作成・共有を確定しない', async () => {
  const capsule = await create(), content = local('容量境界の有効文書',200);
  for (const node of content.document!.nodes) node.description='x'.repeat(7400);
  const seeded = (await pool().query("INSERT INTO member_capsule(id,owner_user_id,dataset,schema_version,content,trashed_at) SELECT gen_random_uuid(),$1,'demo',2,$2::jsonb,now() FROM generate_series(1,44) RETURNING id",[a.id,JSON.stringify(content)])).rows.map(r=>r.id);
  try {
    const usage = await (await service().capabilities(request(a))).json(); expect(usage.storageBytes).toBeGreaterThan(usage.totalBytes);
    const response = await call(()=>service().create(request(a,{requestId:randomUUID(),content:local()})));
    expect(response.status).toBe(422); expect((await response.json()).error.code).toBe('CAPSULE_STORAGE_LIMIT');
    expect((await call(()=>service().issueShare(request(a,{expectedRevision:1,expectedShareId:null}),capsule.id))).status).toBe(422);
    expect((await pool().query('SELECT count(*) FROM member_capsule_revision WHERE capsule_id=$1',[capsule.id])).rows[0].count).toBe('0');
  } finally { await pool().query('DELETE FROM member_capsule WHERE id=ANY($1::uuid[])',[seeded]); }
},15_000);

it('同じURLへの明示反映は公開履歴と投稿時の図を保持し、私有・別範囲・停止後の内容を漏らさない',async()=>{
  await pool().query('DELETE FROM member_capsule_post WHERE author_user_id=$1',[b.id]);
  const cap=await create(local('最初の公開図')), c=await community(), listing=await publish(c.id,cap);
  const issued=await(await service().issueShare(request(a,{expectedRevision:1,expectedShareId:null}),cap.id)).json();
  const shared=(revision?:number,token=issued.token)=>call(()=>service().readShared(new Request(origin+(revision?`/?revision=${revision}`:''),{headers:{'x-capsule-token':token}})));
  const conversation=(revision:number,body?:unknown,token=issued.token)=>{
    const req=request(b,body,`/?revision=${revision}`);req.headers.set('x-capsule-token',token);
    return call(()=>body?service().createDiscussionPost(req,cap.id):service().readDiscussion(req,cap.id));
  };
  expect((await conversation(1,{requestId:randomUUID(),revision:1,body:'最初の図へのコメント'})).status).toBe(201);
  await service().update(request(a,{requestId:randomUUID(),expectedRevision:1,content:{...cap.content,title:'コミュニティだけの版'}}),cap.id);
  await publish(c.id,{id:cap.id,revision:2},'cohort');
  await service().update(request(a,{requestId:randomUUID(),expectedRevision:2,content:{...cap.content,title:'改善した公開図'}}),cap.id);
  expect((await(await shared()).json()).capsule.revision).toBe(1);
  expect((await shared(2)).status).toBe(404);expect((await shared(3)).status).toBe(404);
  const publication={expectedRevision:3,expectedSharedRevision:1,expectedShareId:issued.share.id};
  expect((await call(()=>service().publishShare(request(b,publication),cap.id))).status).toBe(404);
  const applied=await Promise.all([service().publishShare(request(a,publication),cap.id),service().publishShare(request(a,publication),cap.id)]);expect(applied.map(r=>r.status)).toEqual([200,200]);
  expect((await(await service().shareStatus(request(a),cap.id)).json()).token).toBe(issued.token);
  const view=await(await shared()).json();expect(view.capsule.content.title).toBe('改善した公開図');expect(view.revisions.map((r:{revision:number})=>r.revision)).toEqual([3,1]);
  expect((await(await shared(1)).json()).capsule).toEqual(cap);expect((await shared(2)).status).toBe(404);
  expect((await(await service().community.readCapsule(request(),listing.id)).json()).capsule.revision).toBe(1);
  expect((await conversation(1,{requestId:randomUUID(),revision:1,body:'旧図を見たままの投稿'})).status).toBe(201);
  expect((await conversation(3,{requestId:randomUUID(),revision:3,body:'改善後へのコメント'})).status).toBe(201);
  const posts=(await(await conversation(3)).json()).posts;expect(posts.map((post:{revision:number})=>post.revision)).toEqual([1,1,3]);
  expect((await(await conversation(1)).json()).posts).toEqual(posts);expect((await conversation(2)).status).toBe(404);
  await pool().query('UPDATE member_capsule_revision SET sharing_blocked=true WHERE capsule_id=$1 AND revision=1',[cap.id]);
  expect((await shared(1)).status).toBe(404);expect((await(await shared()).json()).revisions.map((r:{revision:number})=>r.revision)).toEqual([3]);
  expect((await(await conversation(3)).json()).posts.map((post:{revision:number})=>post.revision)).toEqual([3]);
  await service().revokeShare(request(a,{expectedShareId:issued.share.id}),cap.id);
  expect((await shared()).status).toBe(404);expect((await shared(3)).status).toBe(404);expect((await conversation(3)).status).toBe(404);
  await service().update(request(a,{requestId:randomUUID(),expectedRevision:3,content:{...cap.content,title:'停止後の新しい共有'}}),cap.id);
  const fresh=await(await service().issueShare(request(a,{expectedRevision:4,expectedShareId:null}),cap.id)).json();
  expect((await shared(3,fresh.token)).status).toBe(404);expect((await(await shared(undefined,fresh.token)).json()).revisions.map((r:{revision:number})=>r.revision)).toEqual([4]);
  expect((await(await conversation(4,undefined,fresh.token)).json()).posts).toEqual([]);
});

it('ごみ箱はリンクと掲載だけを止め、復元・再送・保存枠と旧版を保護する',async()=>{
 const cap=await create(),c=await community(),listing=await publish(c.id,cap);
 const share=await(await service().issueShare(request(a,{expectedRevision:1,expectedShareId:null}),cap.id)).json();
 const saved=(await pool().query('SELECT snapshot FROM member_capsule_revision WHERE capsule_id=$1',[cap.id])).rows[0].snapshot;
 expect((await call(()=>service().remove(request(b,{expectedRevision:1}),cap.id))).status).toBe(404);
 for(let n=0;n<2;n++)expect((await service().remove(request(a,{expectedRevision:1}),cap.id)).status).toBe(200);
 expect((await call(()=>service().read(request(a),cap.id))).status).toBe(404);
 expect((await call(()=>service().readShared(new Request(origin,{headers:{'x-capsule-token':share.token}})))).status).toBe(404);
 const trashed=(await(await service().list(request(a))).json()).capsules.find((v:{id:string})=>v.id===cap.id);expect(trashed.trashedAt).toBeTruthy();expect(trashed.revision).toBe(2);
 expect((await call(()=>service().restore(request(b,{expectedRevision:2}),cap.id))).status).toBe(404);
 for(let n=0;n<2;n++){const restored=await(await service().restore(request(a,{expectedRevision:2}),cap.id)).json();expect(restored.capsule.revision).toBe(3);expect(restored.capsule.content).toEqual(cap.content);}
 expect((await call(()=>service().remove(request(a,{expectedRevision:1}),cap.id))).status).toBe(409);
 expect((await call(()=>service().community.readCapsule(request(),listing.id))).status).toBe(404);
 expect((await(await service().shareStatus(request(a),cap.id)).json()).token).toBeNull();
 expect((await pool().query('SELECT snapshot FROM member_capsule_revision WHERE capsule_id=$1 AND revision=1',[cap.id])).rows[0].snapshot).toEqual(saved);
 const ids=[];for(let n=0;n<19;n++)ids.push((await create(legacy('保存枠'+n))).id);
 const overflow=await call(()=>service().create(request(a,{requestId:randomUUID(),content:legacy()})));expect(overflow.status).toBe(422);
 await service().remove(request(a,{expectedRevision:3}),cap.id);await create(legacy('空いた枠'));
 expect((await call(()=>service().restore(request(a,{expectedRevision:4}),cap.id))).status).toBe(422);
 await service().remove(request(a,{expectedRevision:1}),ids[0]);expect((await service().restore(request(a,{expectedRevision:4}),cap.id)).status).toBe(200);
 // Existing users above the new limit retain all records and may still edit.
 await pool().query('INSERT INTO member_capsule(id,owner_user_id,dataset,content,schema_version) VALUES($1,$2,$3,$4,1)',[randomUUID(),a.id,'demo',JSON.stringify(legacy('既存21件目'))]);
 const all=(await(await service().list(request(a))).json()).capsules;expect(all.filter((v:{trashedAt:string|null})=>!v.trashedAt)).toHaveLength(21);
 expect((await service().update(request(a,{expectedRevision:5,content:{...cap.content,title:'上限を超えても編集可'}}),cap.id)).status).toBe(200);
});

it('共有の作者とコメントは公開プロフィールだけを返し、撤回・非表示の人物情報を出さない',async()=>{
 const cap=await create(),place=await community(),listing=await publish(place.id,cap);
 const issued=await(await service().issueShare(request(a,{expectedRevision:1,expectedShareId:null}),cap.id)).json();
 const shared=await(await service().readShared(new Request(origin,{headers:{'x-capsule-token':issued.token}}))).json();
 expect(shared.author.handle).toBeTruthy();expect(shared.author.displayName).toBeTruthy();expect(Object.keys(shared.author)).not.toContain('email');expect(Object.keys(shared.author)).not.toContain('userId');
 const published=await(await service().community.readCapsule(request(),listing.id)).json();expect(published.listing.creator.handle).toBe(shared.author.handle);
 const postReq=request(b,{requestId:randomUUID(),revision:1,body:'公開プロフィール付きの投稿'});postReq.headers.set('x-capsule-token',issued.token);expect((await service().createDiscussionPost(postReq,cap.id)).status).toBe(201);
 const read=async()=>{const req=request(b,undefined,'/?revision=1');req.headers.set('x-capsule-token',issued.token);return(await(await service().readDiscussion(req,cap.id)).json()).posts;};
 const posts=await read();expect(posts[0].author.handle).toBeTruthy();
 await pool().query('UPDATE member_capsule_post SET hidden_at=now() WHERE id=$1',[posts[0].id]);const hidden=await read();expect(hidden[0].author).toBeNull();expect(hidden[0].authorName).toBeNull();expect(hidden[0].body).toBeNull();
});

it('所有者の掲載先は複数のコミュニティと保存版を区別し、失効した掲載・停止中の場所・別所有者を返さない',async()=>{
 const cap=await create(), first=await community(), second=await community('members');
 const one=await publish(first.id,cap),two=await publish(second.id,cap,'cohort');
 const destinations=async(who=a)=>(await call(()=>service().community.ownCapsuleDestinations(request(who),cap.id)));
 let result=await (await destinations()).json();expect(result.destinations.map((r:{id:string})=>r.id).sort()).toEqual([one.id,two.id].sort());
 expect(result.destinations.find((r:{id:string})=>r.id===two.id)).toMatchObject({communityId:second.id,audience:'cohort',revision:1});
 expect((await destinations(b)).status).toBe(404);
 await pool().query("UPDATE community SET status='suspended' WHERE id=$1",[first.id]);
 result=await (await destinations()).json();expect(result.destinations.map((r:{id:string})=>r.id)).toEqual([two.id]);
 await pool().query("UPDATE community_member SET generation=generation+1 WHERE community_id=$1 AND user_id=$2",[second.id,a.id]);
 expect((await (await destinations()).json()).destinations).toEqual([]);
});

async function reportingFixture() {
 await migrateMemberDatabase(pool(),true,true,true,true,true,true,true,true,true,true,true,true);
 const cap=await create(local('非公開の図の題名は運営へ渡さない'));
 const issued=await(await service().issueShare(request(a,{expectedRevision:1,expectedShareId:null}),cap.id)).json();
 const postRequest=request(b,{requestId:randomUUID(),revision:1,body:'通報対象のコメント'});postRequest.headers.set('x-capsule-token',issued.token);
 const post=(await(await service().createDiscussionPost(postRequest,cap.id)).json()).postId;
 const input={requestId:randomUUID(),postId:post,revision:1,expectedRevision:1,category:'other',detail:'テスト用の確認理由'};
 const report=(body=input,token=issued.token,who=b)=>{const req=request(who,body);req.headers.set('x-capsule-token',token);return call(()=>service().reportDiscussionPost(req,cap.id));};
 return {cap,issued,post,input,report};
}
it('Capsuleコメント通報は同じ受付へ再送でき、運営受信箱・監査・非表示・解除・本人受付を一貫させる',async()=>{
 const {cap,issued,post,input,report}=await reportingFixture();
 const old=await pool().query('SELECT name,checksum FROM member_migration ORDER BY name');
 await migrateMemberDatabase(pool(),true,true,true,true,true,true,true,true,true,true,true,true);
 expect((await pool().query('SELECT name,checksum FROM member_migration ORDER BY name')).rows).toEqual(old.rows);expect(old.rows).toHaveLength(20);
 expect((await report(input,'wrong-token')).status).toBe(404);
 const receipts=await Promise.all([report(),report()]);expect(receipts.map(r=>r.status).sort()).toEqual([200,201]);
 const ids=await Promise.all(receipts.map(async r=>(await r.json()).id));expect(ids[0]).toBe(ids[1]);const id=ids[0];
 expect((await report({...input,detail:'別の内容'})).status).toBe(409);
 expect((await report({...input,requestId:randomUUID()})).status).toBe(409);
 const own=await(await service().community.reports(request(b))).json();expect(own.reports).toContainEqual({id,kind:'capsule-post',status:'open'});expect(JSON.stringify(own)).not.toContain('非公開の図');
 vi.stubEnv('SITE_OPERATIONS_ENABLED','1');vi.stubEnv('SITE_OPERATOR_USER_IDS',late.id);
 try {
  expect((await call(()=>service().operator.read(request(b),'reports'))).status).toBe(403);
  const queue=await(await service().operator.read(request(late),'reports')).json();const item=queue.items.find((r:{id:string})=>r.id===id);
  expect(item.target_kind).toBe('capsule-post');expect(item.community_id).toBeNull();expect(JSON.stringify(queue)).not.toContain('通報対象のコメント');
  expect((await(await service().operator.read(request(late),'summary')).json()).reports).toBeGreaterThan(0);
  const action=(action:string,expectedRevision=1,requestId=randomUUID())=>call(()=>service().operator.act(request(late,{kind:'report',requestId,id,action,expectedRevision,expectedReportRevision:1,reason:'隔離fixtureの検証'})));
  const rid=randomUUID();let inspected=await(await action('inspect',1,rid)).json();expect(inspected.result.content).toEqual({body:'通報対象のコメント'});expect(inspected.result.authorAccountId).toBe(b.id);expect(JSON.stringify(inspected)).not.toContain('非公開の図');
  expect((await action('suspend-community')).status).toBe(400);
  expect((await action('hide-post')).status).toBe(200);
  const read=request(b,undefined,'/?revision=1');read.headers.set('x-capsule-token',issued.token);
  const hidden=await(await service().readDiscussion(read,cap.id)).json();expect(hidden.posts[0].body).toBeNull();expect(hidden.posts[0].author).toBeNull();expect(hidden.posts[0].canReport).toBe(false);
  expect((await action('unhide-post',2)).status).toBe(200);
  expect((await action('inspect',1)).status).toBe(409);
  expect((await action('inspect',3)).status).toBe(200);
  await service().withdrawDiscussionPost(request(b,{postId:post}),cap.id);
  inspected=await(await action('inspect',1,rid)).json();expect(inspected.replayed).toBe(true);expect(inspected.result.content).toBeNull();expect(inspected.result.authorAccountId).toBeNull();expect(inspected.result.detail).toBeNull();
  expect((await action('unhide-post',3)).status).toBe(409);
  expect((await action('resolve',3)).status).toBe(200);
  const receipt=(await pool().query('SELECT result FROM site_operation_request WHERE request_id=$1',[rid])).rows[0].result;expect(receipt.content).toBeUndefined();expect(receipt.authorAccountId).toBeUndefined();
 } finally {vi.unstubAllEnvs();}
},30_000);

it.each(['revoke','reissue','trash','expire','block-version'] as const)('通報後の%sで元の内容確認権限を失い、新しい共有にも付け替えない',async change=>{
 const {cap,issued,report}=await reportingFixture();const id=(await(await report()).json()).id;
 const inspect=()=>operateCommunitySafety(pool(),{reportId:id,expectedReportRevision:1,expectedRevision:1,action:'inspect',actor:'fixture',caseReference:'test',reason:'隔離検証'},true);
 expect((await inspect()).content).toEqual({body:'通報対象のコメント'});
 if(change==='revoke')await service().revokeShare(request(a,{expectedShareId:issued.share.id}),cap.id);
 if(change==='reissue')await service().issueShare(request(a,{expectedRevision:1,expectedShareId:issued.share.id}),cap.id);
 if(change==='trash')await service().remove(request(a,{expectedRevision:1}),cap.id);
 if(change==='expire')await pool().query("UPDATE community_report SET expires_at=now()-interval '1 second' WHERE id=$1",[id]);
 if(change==='block-version')await pool().query('UPDATE member_capsule_revision SET sharing_blocked=true WHERE capsule_id=$1',[cap.id]);
 const result=await inspect();expect(result.content).toBeNull();expect(result.authorAccountId).toBeNull();expect(result.detail).toBeNull();
 if(change==='revoke'||change==='trash'){
  if(change==='trash')await service().restore(request(a,{expectedRevision:2}),cap.id);
  await service().issueShare(request(a,{expectedRevision:change==='trash'?3:1,expectedShareId:null}),cap.id);
  expect((await inspect()).content).toBeNull();
 }
},30_000);

it('同じ共有URLの更新では旧版コメントを通報できるが、未共有版や別Capsuleの投稿は指定できない',async()=>{
 const {cap,issued,post,report,input}=await reportingFixture();
 await service().update(request(a,{expectedRevision:1,content:{...cap.content,title:'保存した私有版'}}),cap.id);
 expect((await report({...input,revision:2})).status).toBe(404);
 await service().publishShare(request(a,{expectedRevision:2,expectedSharedRevision:1,expectedShareId:issued.share.id}),cap.id);
 const read=request(b,undefined,'/?revision=2');read.headers.set('x-capsule-token',issued.token);
 const posts=(await(await service().readDiscussion(read,cap.id)).json()).posts;expect(posts.find((p:{id:string})=>p.id===post).canReport).toBe(true);
 const response=await report({...input,revision:2});expect(response.status).toBe(201);
 const id=(await response.json()).id;
 const context=(await pool().query('SELECT target_capsule_revision,capsule_share_id FROM community_report WHERE id=$1',[id])).rows[0];expect(Number(context.target_capsule_revision)).toBe(1);expect(context.capsule_share_id).toBe(issued.share.id);
 const other=await create();const bad=request(b,{...input,requestId:randomUUID()});bad.headers.set('x-capsule-token',issued.token);expect((await call(()=>service().reportDiscussionPost(bad,other.id))).status).toBe(404);
},30_000);

it('新原記録の私有断面は保存でき、公開原本と一致しない断面の共有を拒否する',async()=>{
 const version={revision:1,createdAt:"2026-11-03T00:00:00.000Z",reason:"初回"};
 const value=captureKnowledgeCapsule({title:"期間だけのCapsule",view:"timeline",snapshot:{schemaVersion:1,initialView:"timeline",entities:[],mappings:[],sources:[{...version,id:"source:test",content:{title:"資料",url:"https://example.org/source",bibliography:"",language:"ja"}}],records:[{...version,id:"record:period",content:{kind:"note",subjectId:null,objectId:null,assertion:"年表専用の期間",relation:"",polarity:"affirmed",scope:"",times:[{id:"time:period",time:{kind:"calendar",from:"2020",to:"2021",label:"期間",meaning:"duration"}}],evidence:[{id:"cite",source:{id:"source:test",revision:1},locator:"本文",excerpt:"",stance:"support"}]}}]}});
 const content:MemberCapsuleContent={dataset:"demo",title:value.title,note:"",language:"ja",entityIds:[],claimIds:[],document:value.document};
 const cap=await create(content);
 const read=await call(()=>service().read(request(a),cap.id));expect(read.status).toBe(200);expect((await read.json()).capsule.content.document.knowledge.snapshot).toEqual(value.document!.knowledge!.snapshot);
 expect((await call(()=>service().read(request(b),cap.id))).status).toBe(404);
 const changed={...content,title:"作者によるタイトル変更"};
 const update=await call(()=>service().update(request(a,{requestId:randomUUID(),expectedRevision:1,content:changed}),cap.id));expect(update.status).toBe(200);
 expect((await update.json()).capsule.content.document.knowledge.snapshot).toEqual(value.document!.knowledge!.snapshot);
 expect((await call(()=>service().update(request(a,{expectedRevision:1,content}),cap.id))).status).toBe(409);
 const shared=await call(()=>service().issueShare(request(a,{expectedRevision:2,expectedShareId:null}),cap.id));expect(shared.status).toBe(403);expect((await shared.json()).error.code).toBe("KNOWLEDGE_REFERENCE_UNAVAILABLE");
});

it('通常Graphに追加した時期を本人だけが保存でき、元のGraphを変えず再訪できる',async()=>{
 const content=local('年表を任意追加');content.document=withCapsuleTimeline(content.document!);content.document.relations[0].times=[{id:'authored-time',time:{kind:'calendar',from:'1991',to:'1993',meaning:'occurrence-window',label:'この期間のどこか'}}];
 const cap=await create(content);const read=await call(()=>service().read(request(a),cap.id));expect((await read.json()).capsule.content.document).toEqual(content.document);expect((await call(()=>service().read(request(b),cap.id))).status).toBe(404);
});

async function knowledgeFixture() {
 const prefix=randomUUID()+":";
 const foundation=createKnowledgeFoundationService(knowledgePool);
 const execute=(action:string,rest:Record<string,unknown>)=>foundation.execute({kind:"operator",id:"isolated-fixture"},{requestId:randomUUID(),reason:"隔離した共有検証",action,...rest});
 await execute("create-bundle",{entities:[{id:prefix+"a",content:{name:"人物A",kind:"person"}},{id:prefix+"b",content:{name:"組織B",kind:"organization"}}],sources:[{id:prefix+"s",content:{title:"公開根拠",bibliography:"初版"}}],records:[{id:prefix+"r",content:{kind:"relation",subjectId:prefix+"a",objectId:prefix+"b",relation:"共同観測した",assertion:"具体的な関係",times:[{id:"period",time:{kind:"calendar",from:"1991",to:"1993",meaning:"duration",label:"観測期間"}}],evidence:[{id:"cite",source:{id:prefix+"s",revision:1},locator:"本文"}]}}]});
 await execute("set-mapping",{recordId:prefix+"r",expectedMappingRevision:0,recordRevision:1,concept:{id:"observe",revision:1,label:"観測",definition:"共同で観測"}});
 await execute("create-theme",{id:prefix+"t",title:"年表付きテーマ",recordPins:[{id:prefix+"r",revision:1}],initialView:"split"});
 const publication=createKnowledgePublicationService(knowledgePool,{} as never);
 const fixed=await publication.theme({themeId:prefix+"t",revision:1});
 const value=captureKnowledgeCapsule({...fixed,title:"年表の共有",view:"split"});
 const content:MemberCapsuleContent={dataset:"demo",title:value.title,note:"公開した期間と根拠",language:"ja",entityIds:[],claimIds:[],document:value.document};
 return {prefix,execute,publication,content};
}

it('年表Capsuleを同じURLで明示更新し、会話の対象版とコミュニティ固定版を保持する',async()=>{
 const f=await knowledgeFixture(),cap=await create(f.content),place=await community(),listing=await publish(place.id,cap);
 const issued=await(await service().issueShare(request(a,{expectedRevision:1,expectedShareId:null}),cap.id)).json();
 const preview=await readSharedPublication(pool(),"demo",issued.token);
 expect((await capsuleShareImage(preview.capsule)).headers.get("cache-control")).toBe("private, no-store");
 const shared=(rev?:number)=>{const req=new Request(origin+(rev?`/?revision=${rev}`:"/"),{headers:{"x-capsule-token":issued.token}});return call(()=>service().readShared(req));};
 const post=async(revision:number,body:string)=>{const req=request(b,{requestId:randomUUID(),revision,body});req.headers.set("x-capsule-token",issued.token);return call(()=>service().createDiscussionPost(req,cap.id));};
 expect((await post(1,"更新前の年表を見て投稿")).status).toBe(201);
 await service().update(request(a,{expectedRevision:1,content:{...f.content,title:"作者の改善後"}}),cap.id);
 expect((await(await shared()).json()).capsule.content.title).toBe("年表の共有");
 expect((await call(()=>service().publishShare(request(a,{expectedRevision:2,expectedSharedRevision:1,expectedShareId:issued.share.id}),cap.id))).status).toBe(200);
 expect((await(await service().shareStatus(request(a),cap.id)).json()).token).toBe(issued.token);
 expect((await(await shared()).json()).capsule.content.title).toBe("作者の改善後");
 expect((await(await shared(1)).json()).capsule.content.title).toBe("年表の共有");
 expect((await post(1,"旧版への追記")).status).toBe(201);expect((await post(2,"更新後の年表を見て投稿")).status).toBe(201);
 const req=request(b,undefined,"/?revision=2");req.headers.set("x-capsule-token",issued.token);
 const posts=(await(await service().readDiscussion(req,cap.id)).json()).posts;expect(posts.map((p:{revision:number})=>p.revision)).toEqual([1,1,2]);
 const fixed=await(await service().community.readCapsule(request(),listing.id)).json();expect(fixed.capsule.revision).toBe(1);expect(fixed.capsule.content.title).toBe("年表の共有");
 await service().revokeShare(request(a,{expectedShareId:issued.share.id}),cap.id);expect((await shared()).status).toBe(404);
 expect((await call(()=>service().community.readCapsule(request(),listing.id))).status).toBe(200);
},30000);

it('R5: fixed Theme translations and authored time axes survive sharing, explicit updates and withdrawal',async()=>{
 const f=await knowledgeFixture();await migrateKnowledgeTranslations(knowledgePool);
 const target={kind:"theme" as const,id:f.prefix+"t",revision:1,field:"title" as const};
 const original=await f.publication.textOriginal(target);
 await f.execute("accept-translation",{target,language:"en",text:"Captured timeline",originalHash:original.hash,expectedRevision:0});
 const query={recordIds:[f.prefix+"r"],entityIds:[],theme:{id:target.id,revision:1},includeTheme:true,translations:[{target,language:"en"}]};
 const initial=await f.publication.capsuleUpdates(query);
 const saved=captureKnowledgeCapsule({snapshot:initial.snapshot,theme:initial.theme,title:"R5の固定断面"});
 const doc=saved.document!;
 doc.relations[0].times=[...doc.knowledge!.snapshot.records[0].content.times,
  {id:"clock",time:{kind:"calendar",meaning:"point",from:"2021-12-25T12:20Z",label:"打上げ"}},
  {id:"cycle",time:{kind:"cycle",axis:"一日の活動",period:24,unit:"時間",from:22,to:2,wrap:true,label:"夜間"}},
  {id:"stage",time:{kind:"qualitative",axis:"工程",coordinateMeaning:"進行段階",from:"準備",to:"完了",label:"工程の進行"}}];
 doc.knowledge!.timeline={version:1,axes:[{id:"clock-axis",kind:"calendar",label:"時刻"},{id:"stage-axis",kind:"qualitative",label:"工程",order:["準備","完了"]}],placements:[{axisId:"clock-axis",recordId:f.prefix+"r",timeId:"clock"},{axisId:"stage-axis",recordId:f.prefix+"r",timeId:"stage"}],insets:[{axisId:"stage-axis",parentRecordId:f.prefix+"r",parentTimeId:"clock",label:"工程"}]};
 const content={...f.content,title:saved.title,document:doc},cap=await create(content),place=await community(),listing=await publish(place.id,cap);
 const issueResponse=await call(()=>service().issueShare(request(a,{expectedRevision:1,expectedShareId:null}),cap.id));expect(issueResponse.status).toBe(201);const issued=await issueResponse.json();
 const shared=()=>call(()=>service().readShared(new Request(origin,{headers:{"x-capsule-token":issued.token}})));
 const read=await(await shared()).json();expect(read.capsule.content.document.knowledge.snapshot.theme.revision).toBe(1);expect(read.capsule.content.document.relations[0].times).toEqual(doc.relations[0].times);
 const post=request(b,{requestId:randomUUID(),revision:1,body:"原文と訳文の固定版を読んだコメント"});post.headers.set("x-capsule-token",issued.token);expect((await service().createDiscussionPost(post,cap.id)).status).toBe(201);
 const translation=initial.snapshot.translations![0];await f.execute("accept-translation",{target,language:"en",text:"Revised timeline",originalHash:original.hash,expectedRevision:1});
 const latest=await f.publication.capsuleUpdates(query);expect(latest.snapshot.translations![0].revision).toBe(2);
 expect(planCapsuleKnowledgeUpdate(doc,latest,true).document.knowledge!.snapshot.translations![0].revision).toBe(1);
 const plan=planCapsuleKnowledgeUpdate(doc,latest,true,[translation.id]);expect(plan.document.relations[0].times).toEqual(doc.relations[0].times);expect(plan.document.knowledge!.timeline).toEqual(doc.knowledge!.timeline);
 const updated={...content,document:plan.document};expect((await service().update(request(a,{expectedRevision:1,content:updated}),cap.id)).status).toBe(200);
 expect((await(await shared()).json()).capsule.content.document.knowledge.snapshot.translations[0].revision).toBe(1);
 expect((await service().publishShare(request(a,{expectedRevision:2,expectedSharedRevision:1,expectedShareId:issued.share.id}),cap.id)).status).toBe(200);
 expect((await(await service().shareStatus(request(a),cap.id)).json()).token).toBe(issued.token);
 expect((await(await shared()).json()).capsule.content.document.knowledge.snapshot.translations[0].revision).toBe(2);
 const pinned=await(await service().community.readCapsule(request(),listing.id)).json();expect(pinned.capsule.content.document.knowledge.snapshot.translations[0].revision).toBe(1);
 const discussion=request(b,undefined,"/?revision=2");discussion.headers.set("x-capsule-token",issued.token);expect((await(await service().readDiscussion(discussion,cap.id)).json()).posts.map((p:{revision:number})=>p.revision)).toEqual([1]);
 await f.execute("set-translation-visibility",{id:translation.id,expectedStatusRevision:1,visibility:"hidden"});
 expect((await shared()).status).toBe(404);expect((await call(()=>service().community.readCapsule(request(),listing.id))).status).toBe(404);
 expect((await service().read(request(a),cap.id)).status).toBe(200);
},30000);

it.each(["theme","record","entity","source","mapping"] as const)('%s停止は共有の現行・旧版・会話・固定掲載・掲載先・通報検査へ反映し、本人の保存は残す',async kind=>{
 const f=await knowledgeFixture(),cap=await create(f.content),place=await community(),listing=await publish(place.id,cap);
 const issued=await(await service().issueShare(request(a,{expectedRevision:1,expectedShareId:null}),cap.id)).json();
 const req=request(b,{requestId:randomUUID(),revision:1,body:"停止前の文脈"});req.headers.set("x-capsule-token",issued.token);
 const post=(await(await service().createDiscussionPost(req,cap.id)).json()).postId;
 const reportReq=request(b,{requestId:randomUUID(),postId:post,revision:1,expectedRevision:1,category:"other",detail:"表示停止の検証"});reportReq.headers.set("x-capsule-token",issued.token);
 const report=await call(()=>service().reportDiscussionPost(reportReq,cap.id));expect(report.status).toBe(201);const reportId=(await report.json()).id;
 const inspect=()=>operateCommunitySafety(pool(),{reportId,expectedReportRevision:1,expectedRevision:1,action:"inspect",actor:"fixture",caseReference:"u4",reason:"隔離検証"},true);
 expect((await inspect()).content).toEqual({body:"停止前の文脈"});
 const suffix={theme:"t",record:"r",entity:"a",source:"s",mapping:"r"}[kind];
 if(kind==="mapping")await knowledgePool.query("UPDATE knowledge75.objects SET visibility='hidden' WHERE kind='mapping' AND id=$1",[f.prefix+suffix]);
 else await f.execute("set-visibility",{kind,id:f.prefix+suffix,visibility:"hidden",expectedStatusRevision:1});
 const shared=new Request(origin,{headers:{"x-capsule-token":issued.token}});
 expect((await call(()=>service().readShared(shared))).status).toBe(404);
 await expect(readSharedPublication(pool(),"demo",issued.token,1)).rejects.toMatchObject({status:404});
 const old=new Request(origin+"/?revision=1",{headers:{"x-capsule-token":issued.token}});expect((await call(()=>service().readShared(old))).status).toBe(404);
 const read=request(b,undefined,"/?revision=1");read.headers.set("x-capsule-token",issued.token);expect((await call(()=>service().readDiscussion(read,cap.id))).status).toBe(404);
 const stoppedPost=request(b,{requestId:randomUUID(),revision:1,body:"停止後の新しい投稿"});stoppedPost.headers.set("x-capsule-token",issued.token);
 expect((await call(()=>service().createDiscussionPost(stoppedPost,cap.id))).status).toBe(404);
 expect((await call(()=>service().community.readCapsule(request(),listing.id))).status).toBe(404);
 expect((await(await list(place.id)).json()).listings).toEqual([]);
 expect((await(await service().community.ownCapsuleDestinations(request(a),cap.id)).json()).destinations).toEqual([]);
 const inspected=await inspect();expect(inspected.content).toBeNull();expect(inspected.detail).toBeNull();
 expect((await service().read(request(a),cap.id)).status).toBe(200);expect((await(await service().shareStatus(request(a),cap.id)).json()).sourceAvailable).toBe(false);
 expect((await service().withdrawDiscussionPost(request(b,{postId:post}),cap.id)).status).toBe(200);
 expect((await service().revokeShare(request(a,{expectedShareId:issued.share.id}),cap.id)).status).toBe(200);
},30000);

it('停止した旧文脈の会話と履歴だけを除外し、別の公開断面への明示更新は同じURLで読める',async()=>{
 const old=await knowledgeFixture(),next=await knowledgeFixture(),cap=await create(old.content),issued=await(await service().issueShare(request(a,{expectedRevision:1,expectedShareId:null}),cap.id)).json();
 const req=request(b,{requestId:randomUUID(),revision:1,body:"停止後には返さない本文"});req.headers.set("x-capsule-token",issued.token);expect((await service().createDiscussionPost(req,cap.id)).status).toBe(201);
 await service().update(request(a,{expectedRevision:1,content:next.content}),cap.id);
 await service().publishShare(request(a,{expectedRevision:2,expectedSharedRevision:1,expectedShareId:issued.share.id}),cap.id);
 await old.execute("set-visibility",{kind:"source",id:old.prefix+"s",visibility:"hidden",expectedStatusRevision:1});
 const shared=await(await service().readShared(new Request(origin,{headers:{"x-capsule-token":issued.token}}))).json();expect(shared.revisions.map((r:{revision:number})=>r.revision)).toEqual([2]);
 const read=request(b,undefined,"/?revision=2");read.headers.set("x-capsule-token",issued.token);const discussion=await(await service().readDiscussion(read,cap.id)).json();expect(discussion.posts).toEqual([]);expect(JSON.stringify(discussion)).not.toContain("停止後には");
},30000);

it('公開ピンを借りた原文の改竄と一度も公開していない版を共有できない',async()=>{
 const f=await knowledgeFixture(),forged=structuredClone(f.content);forged.document!.knowledge!.snapshot.records[0].content.assertion="偽の原文";
 const cap=await create(forged),issue=()=>call(()=>service().issueShare(request(a,{expectedRevision:1,expectedShareId:null}),cap.id));expect((await issue()).status).toBe(403);
 await f.execute("set-visibility",{kind:"record",id:f.prefix+"r",visibility:"private",expectedStatusRevision:1});
 const original=f.content.document!.knowledge!.snapshot.records[0];await f.execute("correct",{kind:"record",id:f.prefix+"r",expectedRevision:1,content:{...original.content,assertion:"未公開の版"}});
 await f.execute("correct",{kind:"record",id:f.prefix+"r",expectedRevision:2,content:{...original.content,assertion:"公開する版"}});
 await f.execute("set-visibility",{kind:"record",id:f.prefix+"r",visibility:"public",expectedStatusRevision:Number((await knowledgePool.query("SELECT status_revision FROM knowledge75.objects WHERE kind='record' AND id=$1",[f.prefix+"r"])).rows[0].status_revision)});
 expect(await f.publication.capsulesReadable([[{kind:"record",id:f.prefix+"r",revision:1}],[{kind:"record",id:f.prefix+"r",revision:2}],[{kind:"record",id:f.prefix+"r",revision:3}]])).toEqual([true,false,true]);
});
