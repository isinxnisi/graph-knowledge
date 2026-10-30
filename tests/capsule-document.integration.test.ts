import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { startMemberOidc } from "./support/member-oidc";
import { migrateMemberDatabase } from "../lib/server/member/migrate";
import { memberHandle } from "../lib/server/member/http";
import { operateCommunitySafety } from "../lib/server/member/community-site-safety";
import { operateMember } from "../lib/server/member/operations";
import type { MemberCapsuleContent } from "../lib/domain/member-capsule";
vi.mock("server-only", () => ({}));
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
  issuer = await startMemberOidc();
  await migrateMemberDatabase(pool(),true,true,true);
  a = await login('alice'); b = await login('bob'); late = await login('community-d');
},30_000);
beforeEach(async () => { await pool().query('DELETE FROM community_rate'); await pool().query('DELETE FROM member_capsule'); });
afterAll(async () => { await pool().end(); await issuer?.close(); });

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
