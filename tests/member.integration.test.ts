import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { operateMember } from "../lib/server/member/operations";
import { createMemberService } from "../lib/server/member/service";
import { memberHandle } from "../lib/server/member/http";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { hashCapsuleShareToken } from "../lib/server/member/share-token";
import { createCapsuleSharing } from "../lib/server/member/sharing";
import { migrateMemberDatabase } from "../lib/server/member/migrate";
import { getMigrations } from "better-auth/db/migration";
import { startMemberOidc } from "./support/member-oidc";
import { memberPool } from "../lib/server/member/auth";
import { memberConfig } from "../lib/server/member/config";
import { MEMBER_CAPSULE_LIMITS, type MemberCapsuleContent } from "../lib/domain/member-capsule";

vi.mock("server-only", () => ({}));
import { memberRuntime } from "../lib/server/member/runtime";
import * as authRoute from "../app/api/auth/[...all]/route";
import * as collection from "../app/api/member/capsules/route";
import * as item from "../app/api/member/capsules/[id]/route";
import * as profile from "../app/api/member/profile/route";
import * as sharing from "../app/api/member/capsules/[id]/share/route";
import * as shared from "../app/api/shared/capsule/route";
import * as revisions from "../app/api/member/capsules/[id]/revisions/route";
import * as discussion from "../app/api/capsules/[id]/discussion/route";
import * as ownPosts from "../app/api/member/posts/route";

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
const content = (): MemberCapsuleContent => ({ dataset: "demo", title: "研究のつながり", note: "自分の説明。根拠の支持ではない。", language: "ja", entityIds: [randomUUID()], claimIds: [] });
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const create = (cookie: string, value = content(), requestId = randomUUID()) => collection.POST(request("/api/member/capsules", cookie, "POST", { requestId, content: value }));
let fixture: Awaited<ReturnType<typeof startMemberOidc>>;
let alice: Awaited<ReturnType<typeof login>>;
let bob: Awaited<ReturnType<typeof login>>;

beforeAll(async () => {
  const config = memberConfig();
  if (!config || config.provider.kind !== "fixture") throw new Error("Run npm run test:member in its disposable DB");
  fixture = await startMemberOidc();
  const migrationPool = memberPool(config);
  try { await migrateMemberDatabase(migrationPool, false, false, false, false, false, true, true, true, false, false, true); await migrateMemberDatabase(migrationPool, false, false, false, false, false, true, true, true, false, false, true); } finally { await migrationPool.end(); }
  const { auth } = memberRuntime();
  const plan = await getMigrations(auth.options);
  expect(plan.toBeCreated).toEqual([]);
  expect(plan.toBeAdded).toEqual([]);
  expect(plan.toBeAddedIndexes).toEqual([]);
  expect(plan.schemaProblems).toEqual([]);
  alice = await login("alice");
  bob = await login("bob");
}, 30_000);
beforeEach(async()=>{await memberRuntime().pool.query("DELETE FROM member_capsule");});
afterAll(async () => { await memberRuntime().pool.end(); await fixture?.close(); });

describe("実OIDC・PostgreSQLによるprivate Capsule", () => {
  it("登録はUUID所有者を作り、provider tokenを保存せず、cookieの安全属性を持つ", async () => {
    expect(alice.callback.status).toBe(302);
    expect(new URL(alice.callback.headers.get("location")!, origin).href).toBe(`${origin}/`);
    const response = await profile.GET(request("/api/member/profile", alice.cookies.value));
    expect(response.status).toBe(200);
    const { user } = await response.json();
    expect(user.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(user.name).toBe("検証ユーザーA");
    expect(user.locale).toBe("ja");
    expect(Object.keys(user).sort()).toEqual(["id", "locale", "name"]);
    const cookie = alice.callback.headers.getSetCookie().find(value => value.includes("session_token"))!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("gk-member-fixture");
    const accounts = await memberRuntime().pool.query('SELECT "accessToken", "refreshToken", "idToken" FROM account');
    expect(accounts.rows).toHaveLength(2);
    for (const row of accounts.rows) expect(Object.values(row)).toEqual([null, null, null]);
  });
  it("表示中と異なる利用者sessionへ変わった要求を拒否する", async () => {
    const response = await profile.GET(request("/api/member/profile", alice.cookies.value));
    const { user } = await response.json();
    const mismatch = await collection.POST(request("/api/member/capsules", bob.cookies.value, "POST", { requestId: randomUUID(), content: content() }, { "x-member-user": user.id }));
    expect(mismatch.status).toBe(401);
    for (const path of ["/sign-out", "/revoke-sessions"]) {
      expect((await authRoute.POST(request(`/api/auth${path}`, bob.cookies.value, "POST", {}, { "x-member-user": user.id }))).status).toBe(401);
    }
    expect((await profile.GET(request("/api/member/profile", bob.cookies.value))).status).toBe(200);
    expect((await collection.GET(request("/api/member/capsules", bob.cookies.value, "GET", undefined, { "x-member-user": user.id }))).status).toBe(401);
    expect((await collection.GET(request("/api/member/capsules", alice.cookies.value, "GET", undefined, { "x-member-user": user.id }))).status).toBe(200);
  });
  it("本人の表示名だけ更新でき、所有者・保存物・他人・認証情報を変えない", async () => {
    const before = (await (await profile.GET(request("/api/member/profile", alice.cookies.value))).json()).user;
    const own = { "x-member-user": before.id };
    const update = (body: unknown, cookie = alice.cookies.value, headers: Record<string, string> = own) => profile.PUT(request("/api/member/profile", cookie, "PUT", body, headers));
    const created = await (await create(alice.cookies.value)).json();
    try {
      expect((await update({ name: "他人の変更" }, bob.cookies.value)).status).toBe(401);
      expect((await update({ name: "匿名" }, "")).status).toBe(401);
      expect((await update({ name: "表示名" }, alice.cookies.value, { ...own, origin: "https://other.invalid" })).status).toBe(403);
      expect((await update({ name: "表示名" }, alice.cookies.value, {})).status).toBe(400);
      for (const body of [{ name: " " }, { name: "x".repeat(81) }, { name: "a\nb" }, { name: "表示名", active: false }, { name: "表示名", id: randomUUID() }, { name: "表示名", locale: "en" }, { name: "表示名", email: "x@example.invalid" }]) expect((await update(body)).status).toBe(400);
      const changed = await update({ name: "  調査する人  " });
      expect(changed.status).toBe(200); expect(changed.headers.get("cache-control")).toBe("private, no-store");
      expect(await changed.json()).toEqual({ user: { ...before, name: "調査する人" } });
      expect((await (await profile.GET(request("/api/member/profile", alice.cookies.value))).json()).user.name).toBe("調査する人");
      const stored = await (await item.GET(request("/", alice.cookies.value), context(created.capsule.id))).json();
      expect(stored.capsule).toEqual(created.capsule);
      expect((await authRoute.POST(request("/api/auth/update-user", alice.cookies.value, "POST", { name: "迂回" }))).status).toBe(404);
    } finally {
      await update({ name: before.name });
      await item.DELETE(request("/", alice.cookies.value, "DELETE", { expectedRevision: created.capsule.revision }), context(created.capsule.id));
    }
  });
  it("本人だけが作成・一覧・読取でき、再ログインしても同じ所有物を読む", async () => {
    const saved = await create(alice.cookies.value);
    expect(saved.status).toBe(201);
    expect(saved.headers.get("cache-control")).toBe("private, no-store");
    const { capsule } = await saved.json();
    expect(capsule.revision).toBe(1);
    expect(capsule.schemaVersion).toBe(1);
    expect(capsule).not.toHaveProperty("ownerUserId");
    expect((await item.GET(request("/", alice.cookies.value), context(capsule.id))).status).toBe(200);
    for (const id of [capsule.id, randomUUID()]) {
      const response = await item.GET(request("/", bob.cookies.value), context(id));
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: { code: "NOT_FOUND" } });
    }
    expect((await (await collection.GET(request("/", bob.cookies.value))).json()).capsules).toEqual([]);
    const another = await login("alice");
    expect((await item.GET(request("/", another.cookies.value), context(capsule.id))).status).toBe(200);
  });
  it("匿名・偽造・別環境cookieを拒否する", async () => {
    for (const cookie of ["", "gk-member-fixture.session_token=forged", alice.cookies.value.replaceAll("gk-member-fixture", "gk-other")]) {
      expect((await collection.GET(request("/", cookie))).status).toBe(401);
      expect((await create(cookie)).status).toBe(401);
    }
  });
  it("所有者や受入状態の自己付与・異dataset・重複参照・過大本文を拒否する", async () => {
    for (const extra of [{ ownerUserId: randomUUID() }, { revision: 3 }, { reviewStatus: "accepted" }]) {
      expect((await collection.POST(request("/", alice.cookies.value, "POST", { requestId: randomUUID(), content: content(), ...extra }))).status).toBe(400);
    }
    expect((await create(alice.cookies.value, { ...content(), dataset: "pilot-science-v1" })).status).toBe(400);
    const id = randomUUID();
    expect((await create(alice.cookies.value, { ...content(), entityIds: [id, id.toUpperCase()] })).status).toBe(400);
    expect((await create(alice.cookies.value, { ...content(), note: "あ".repeat(33_000) })).status).toBe(400);
    expect((await create(alice.cookies.value, { ...content(), note: "x".repeat(MEMBER_CAPSULE_LIMITS.bytes) })).status).toBe(413);
  });
  it("外部origin・Origin欠落・認証の外部callbackを拒否する", async () => {
    for (const badOrigin of ["", "http://evil.invalid", "http://127.0.0.1:3220"]) {
      const response = await collection.POST(request("/", alice.cookies.value, "POST", { requestId: randomUUID(), content: content() }, { origin: badOrigin }));
      expect(response.status).toBe(403);
    }
    const malformed = await authRoute.POST(request("/api/auth/sign-in/social", "", "POST", { provider: "fixture", callbackURL: "http://[" }));
    expect(malformed.status).toBe(400);
    const external = await authRoute.POST(request("/api/auth/sign-in/social", "", "POST", { provider: "fixture", callbackURL: "http://evil.invalid" }));
    expect(external.status).toBe(403);
  });
  it("同一所有者の同時再送は一件だけ作り、別内容でのrequest ID再利用は409", async () => {
    const value = content(), requestId = randomUUID();
    const responses = await Promise.all([create(alice.cookies.value, value, requestId), create(alice.cookies.value, value, requestId)]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 201]);
    const results = await Promise.all(responses.map(response => response.json()));
    expect(results[0].capsule.id).toBe(results[1].capsule.id);
    expect((await create(alice.cookies.value, { ...value, title: "別の内容" }, requestId)).status).toBe(409);
    const other = await create(bob.cookies.value, value, requestId);
    expect(other.status).toBe(201);
    expect((await other.json()).capsule.id).not.toBe(results[0].capsule.id);
  });
  it("他人の更新・削除を404にし、同時更新の片方だけを次版にする", async () => {
    const { capsule } = await (await create(alice.cookies.value)).json();
    const updated = { ...capsule.content, title: "説明を追記" };
    expect((await item.PUT(request("/", bob.cookies.value, "PUT", { expectedRevision: 1, content: updated }), context(capsule.id))).status).toBe(404);
    expect((await item.DELETE(request("/", bob.cookies.value, "DELETE", { expectedRevision: 1 }), context(capsule.id))).status).toBe(404);
    const responses = await Promise.all([1, 2].map(() => item.PUT(request("/", alice.cookies.value, "PUT", { expectedRevision: 1, content: updated }), context(capsule.id))));
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const current = (await (await item.GET(request("/", alice.cookies.value), context(capsule.id))).json()).capsule;
    expect(current.revision).toBe(2);
    expect(current.createdAt).toBe(capsule.createdAt);
    expect(current.content.title).toBe(updated.title);
    expect((await item.DELETE(request("/", alice.cookies.value, "DELETE", { expectedRevision: 1 }), context(capsule.id))).status).toBe(409);
  });
  it("削除後の再送で内容を復活させない", async () => {
    const value = content(), requestId = randomUUID();
    const { capsule } = await (await create(alice.cookies.value, value, requestId)).json();
    expect((await item.DELETE(request("/", alice.cookies.value, "DELETE", { expectedRevision: 1 }), context(capsule.id))).status).toBe(200);
    expect((await item.GET(request("/", alice.cookies.value), context(capsule.id))).status).toBe(404);
    expect((await create(alice.cookies.value, value, requestId)).status).toBe(409);
  });
  it("限定リンクは本人が確認した版だけを固定し、匿名にownerや非共有の更新を渡さない", async () => {
    const { capsule } = await (await create(alice.cookies.value)).json();
    const ctx = context(capsule.id);
    const issue = { expectedRevision: 1, expectedShareId: null };
    for (const cookie of ["", bob.cookies.value]) {
      const status = cookie ? 404 : 401;
      expect((await sharing.GET(request("/", cookie), ctx)).status).toBe(status);
      expect((await sharing.POST(request("/", cookie, "POST", issue), ctx)).status).toBe(status);
      expect((await sharing.DELETE(request("/", cookie, "DELETE", { expectedShareId: randomUUID() }), ctx)).status).toBe(status);
    }
    expect((await sharing.POST(request("/", alice.cookies.value, "POST", issue, { origin: "https://other.invalid" }), ctx)).status).toBe(403);
    const { user } = await (await profile.GET(request("/", alice.cookies.value))).json();
    expect((await sharing.POST(request("/", bob.cookies.value, "POST", issue, { "x-member-user": user.id }), ctx)).status).toBe(401);
    expect((await sharing.POST(request("/", alice.cookies.value, "POST", { ...issue, ownerUserId: user.id }), ctx)).status).toBe(400);
    expect((await sharing.GET(request("/", alice.cookies.value), ctx)).status).toBe(200);
    const issued = await sharing.POST(request("/", alice.cookies.value, "POST", issue), ctx);
    expect(issued.status).toBe(201);
    const { share, token } = await issued.json();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const status = await (await sharing.GET(request("/", alice.cookies.value), ctx)).json();
    expect(status).toEqual({ share, token, blocked: false, commentsClosed: false });
    const rows = await memberRuntime().pool.query("SELECT * FROM member_capsule_share WHERE capsule_id = $1", [capsule.id]);
    expect(rows.rows[0].token_hash).toHaveLength(64);
    expect(JSON.stringify(rows.rows)).not.toContain(token);
    const read = () => shared.GET(request("/api/shared/capsule", "", "GET", undefined, { "x-capsule-token": token }));
    const response = await read();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("X-Capsule-Token");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(await response.json()).toEqual({ capsule, author:null, currentRevision:1, revisions:[{revision:1,publishedAt:expect.any(String)}] });
    for (const headers of [{}, { "x-capsule-token": "invalid" }, { "x-capsule-token": "a".repeat(43) }] as Record<string, string>[]) {
      expect((await shared.GET(request("/api/shared/capsule", alice.cookies.value, "GET", undefined, headers))).status).toBe(404);
    }
    const runtime = memberRuntime();
    const otherDataset = createMemberService(runtime.config, runtime.pool, runtime.auth, "pilot-science-v1");
    expect((await memberHandle(() => otherDataset.readShared(request("/", "", "GET", undefined, { "x-capsule-token": token })))).status).toBe(404);
    expect((await item.PUT(request("/", alice.cookies.value, "PUT", { expectedRevision: 1, content: { ...capsule.content, title: "非共有の訂正", note: "private revision" } }), ctx)).status).toBe(200);
    expect(await (await read()).json()).toEqual({ capsule, author:null, currentRevision:1, revisions:[{revision:1,publishedAt:expect.any(String)}] });
    expect((await sharing.POST(request("/", alice.cookies.value, "POST", { expectedRevision: 1, expectedShareId: share.id }), ctx)).status).toBe(409);
    await runtime.pool.query('UPDATE "user" SET active = false WHERE id = $1', [user.id]);
    try { expect((await read()).status).toBe(404); }
    finally { await runtime.pool.query('UPDATE "user" SET active = true WHERE id = $1', [user.id]); }
    expect((await item.DELETE(request("/", alice.cookies.value, "DELETE", { expectedRevision: 2 }), ctx)).status).toBe(200);
    expect((await read()).status).toBe(404);
    expect((await runtime.pool.query("SELECT * FROM member_capsule_revision WHERE capsule_id = $1", [capsule.id])).rowCount).toBe(1); // Trash retains the immutable snapshot.
  });
  it("同時発行・旧画面からの再発行と停止を競合にし、失効・再送・版保持を原子的に扱う", async () => {
    const { capsule } = await (await create(alice.cookies.value)).json();
    const ctx = context(capsule.id);
    const issue = (expectedShareId: string | null, expectedRevision = 1) => sharing.POST(request("/", alice.cookies.value, "POST", { expectedRevision, expectedShareId }), ctx);
    const revoke = (id: string) => sharing.DELETE(request("/", alice.cookies.value, "DELETE", { expectedShareId: id }), ctx);
    const read = (token: string) => shared.GET(request("/", "", "GET", undefined, { "x-capsule-token": token }));
    const responses = await Promise.all([issue(null), issue(null)]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    const first = await responses.find(r => r.status === 201)!.json();
    const rotated = await (await issue(first.share.id)).json();
    expect(rotated.token).not.toBe(first.token);
    expect((await read(first.token)).status).toBe(404);
    expect((await read(rotated.token)).status).toBe(200);
    expect((await revoke(first.share.id)).status).toBe(409);
    expect((await issue(first.share.id)).status).toBe(409);
    expect((await revoke(rotated.share.id)).status).toBe(200);
    expect((await revoke(rotated.share.id)).status).toBe(200);
    expect((await read(rotated.token)).status).toBe(404);
    expect(await (await sharing.GET(request("/", alice.cookies.value), ctx)).json()).toEqual({ share: null, token: null, blocked: false, commentsClosed: false });
    expect((await memberRuntime().pool.query("SELECT * FROM member_capsule_revision WHERE capsule_id = $1", [capsule.id])).rowCount).toBe(1);
    const next = await (await issue(null)).json();
    expect((await read(next.token)).status).toBe(200);
    const pool = memberRuntime().pool;
    // A bounded snapshot history must not disable revocation or same-version rotation.
    await pool.query(`INSERT INTO member_capsule_revision (capsule_id, revision, snapshot)
      SELECT $1, n, $2 FROM generate_series(2, 50) n`, [capsule.id, JSON.stringify(capsule)]);
    expect((await issue(next.share.id)).status).toBe(201);
    await pool.query("UPDATE member_capsule SET revision = 51 WHERE id = $1", [capsule.id]);
    const latest = await (await sharing.GET(request("/", alice.cookies.value), ctx)).json();
    expect((await sharing.PATCH(request("/",alice.cookies.value,"PATCH",{expectedRevision:51,expectedSharedRevision:latest.share.revision,expectedShareId:latest.share.id}),ctx)).status).toBe(422);
    expect((await revoke(latest.share.id)).status).toBe(200);
    await item.DELETE(request("/", alice.cookies.value, "DELETE", { expectedRevision: 51 }), ctx);
  });
  it("本人のリンク再取得は同じURLを返し、共有版・会話・private版・別datasetを変更しない", async () => {
    const runtime=memberRuntime(), {pool}=runtime;
    const {capsule}=await (await create(alice.cookies.value)).json(), ctx=context(capsule.id);
    const first=await (await sharing.POST(request("/",alice.cookies.value,"POST",{expectedRevision:1,expectedShareId:null}),ctx)).json();
    try {
      const post=await discussion.POST(request("/",alice.cookies.value,"POST",{revision:1,requestId:randomUUID(),body:"この版へのコメント"}),ctx);
      expect(post.status).toBe(201);
      const snapshot=async()=>({
        share:(await pool.query("SELECT * FROM member_capsule_share WHERE capsule_id=$1",[capsule.id])).rows,
        revision:(await pool.query("SELECT * FROM member_capsule_revision WHERE capsule_id=$1",[capsule.id])).rows,
        thread:(await pool.query("SELECT * FROM member_capsule_thread WHERE capsule_id=$1",[capsule.id])).rows,
        posts:(await pool.query("SELECT * FROM member_capsule_post WHERE capsule_id=$1 ORDER BY id",[capsule.id])).rows,
      });
      const before=await snapshot();
      for(let count=0;count<3;count++) {
        const response=await sharing.GET(request("/",alice.cookies.value),ctx);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(await response.json()).toMatchObject({share:first.share,token:first.token,commentsClosed:false});
      }
      expect(await snapshot()).toEqual(before);
      const other=createMemberService(runtime.config,pool,runtime.auth,"pilot-science-v1");
      expect((await memberHandle(()=>other.shareStatus(request("/",alice.cookies.value),capsule.id))).status).toBe(404);
      expect((await sharing.GET(request("/",bob.cookies.value,"GET",undefined,{"x-capsule-token":first.token}),ctx)).status).toBe(404);
      expect((await sharing.GET(request("/","","GET",undefined,{"x-capsule-token":first.token}),ctx)).status).toBe(401);
      expect((await sharing.POST(request("/",alice.cookies.value,"POST",{expectedRevision:1,expectedShareId:null}),ctx)).status).toBe(409);
      expect(await snapshot()).toEqual(before);
      expect((await item.PUT(request("/",alice.cookies.value,"PUT",{expectedRevision:1,content:{...capsule.content,title:"privateの新版"}}),ctx)).status).toBe(200);
      expect((await (await sharing.GET(request("/",alice.cookies.value),ctx)).json()).token).toBe(first.token);
      expect(await snapshot()).toEqual(before);
      const list=await (await collection.GET(request("/",alice.cookies.value))).json();
      expect(JSON.stringify(list)).not.toContain(first.token);
      const {user}=await (await profile.GET(request("/",alice.cookies.value))).json();
      // Simulate active status changing after authentication, before SQL reads.
      const authenticated=createCapsuleSharing(pool,"demo",origin,async()=>({id:user.id}),runtime.config.secret);
      await pool.query('UPDATE "user" SET active=false WHERE id=$1',[user.id]);
      try { expect((await memberHandle(()=>authenticated.shareStatus(request("/"),capsule.id))).status).toBe(404); }
      finally { await pool.query('UPDATE "user" SET active=true WHERE id=$1',[user.id]); }
    } finally { await pool.query("DELETE FROM member_capsule WHERE id=$1",[capsule.id]); }
  });
  it("旧hash-onlyリンクと鍵変更後の共有は読めるまま、再取得不能なtokenを返さない", async () => {
    const runtime=memberRuntime(), {pool}=runtime;
    const {capsule}=await (await create(alice.cookies.value)).json(),ctx=context(capsule.id);
    const first=await (await sharing.POST(request("/",alice.cookies.value,"POST",{expectedRevision:1,expectedShareId:null}),ctx)).json();
    try {
      const oldToken=randomBytes(32).toString("base64url");
      await pool.query("UPDATE member_capsule_share SET token_derivation_version=NULL,token_hash=$2 WHERE capsule_id=$1",[capsule.id,hashCapsuleShareToken(oldToken)]);
      const status=await (await sharing.GET(request("/",alice.cookies.value),ctx)).json();expect(status).toMatchObject({share:first.share,token:null});
      expect((await shared.GET(request("/","","GET",undefined,{"x-capsule-token":oldToken}))).status).toBe(200);
      const fresh=await (await sharing.POST(request("/",alice.cookies.value,"POST",{expectedRevision:1,expectedShareId:first.share.id}),ctx)).json();
      expect((await pool.query("SELECT token_derivation_version FROM member_capsule_share WHERE capsule_id=$1",[capsule.id])).rows[0].token_derivation_version).toBe(1);
      await expect(pool.query("UPDATE member_capsule_share SET token_derivation_version=2 WHERE capsule_id=$1",[capsule.id])).rejects.toMatchObject({code:"23514"});
      expect((await discussion.POST(request("/",alice.cookies.value,"POST",{revision:1,requestId:randomUUID(),body:"鍵の変更前の会話"}),ctx)).status).toBe(201);
      const before=(await pool.query("SELECT * FROM member_capsule_share WHERE capsule_id=$1",[capsule.id])).rows;
      // Reuse the authenticated owner to isolate capability key rotation from
      // the separate session-key reauthentication policy.
      const rotated=createMemberService({...runtime.config,secret:runtime.config.secret+"-rotated"},pool,runtime.auth,"demo");
      expect((await (await rotated.shareStatus(request("/",alice.cookies.value),capsule.id)).json()).token).toBeNull();
      const bearer=request("/?revision=1","","GET",undefined,{"x-capsule-token":fresh.token});
      expect((await (await rotated.readShared(bearer)).json()).capsule).toEqual(capsule);
      const conversation=await (await rotated.readDiscussion(bearer,capsule.id)).json();
      expect(conversation.posts[0].body).toBe("鍵の変更前の会話");
      expect((await pool.query("SELECT * FROM member_capsule_share WHERE capsule_id=$1",[capsule.id])).rows).toEqual(before);
      expect((await (await sharing.GET(request("/",alice.cookies.value),ctx)).json()).token).toBe(fresh.token);
    } finally { await pool.query("DELETE FROM member_capsule WHERE id=$1",[capsule.id]); }
  });
  it("nonce・issuer不一致とメール一致だけの別identityを受け入れない", async () => {
    for (const mode of ["nonce", "issuer"]) {
      const rejected = await login("alice", mode);
      expect((await collection.GET(request("/", rejected.cookies.value))).status).toBe(401);
    }
    const sameEmail = await login("impostor");
    expect((await collection.GET(request("/", sameEmail.cookies.value))).status).toBe(401);
    expect((await memberRuntime().pool.query('SELECT count(*) FROM "user"')).rows[0].count).toBe("2");
  });
  it("state改変でsessionを発行せず、有効期限切れも拒否する", async () => {
    const cookies = jar();
    const start = await authRoute.POST(request("/api/auth/sign-in/social", "", "POST", { provider: "fixture", callbackURL: "/", disableRedirect: true }));
    cookies.receive(start);
    const url = new URL((await start.json()).url);
    url.searchParams.set("fixture_identity", "alice");
    const consent = await fetch(url, { redirect: "manual" });
    const callback = new URL(consent.headers.get("location")!);
    callback.searchParams.set("state", "forged-state");
    cookies.receive(await authRoute.GET(request(callback.pathname + callback.search, cookies.value)));
    expect((await collection.GET(request("/", cookies.value))).status).toBe(401);
    const valid = await login("alice");
    const { pool, auth } = memberRuntime();
    const session = await auth.api.getSession({ headers: request("/", valid.cookies.value).headers });
    await pool.query(`UPDATE session SET "expiresAt" = now() - interval '1 second' WHERE id = $1`, [session!.session.id]);
    expect((await collection.GET(request("/", valid.cookies.value))).status).toBe(401);
  });
  it("所有者だけが共有済み版を一覧・再閲覧でき、失効後もprivate更新と混同しない", async () => {
    const { pool, config, auth } = memberRuntime();
    const original = content();
    const { capsule } = await (await create(alice.cookies.value, original)).json();
    const ctx = context(capsule.id);
    const path = `/api/member/capsules/${capsule.id}/revisions`;
    const read = (query = "", cookie = alice.cookies.value, headers: Record<string, string> = {}) => revisions.GET(request(path + query, cookie, "GET", undefined, headers), ctx);
    const update = (revision: number, note: string) => item.PUT(request("/", alice.cookies.value, "PUT", { expectedRevision: revision, content: { ...original, note } }), ctx);
    try {
      expect(await (await read()).json()).toEqual({ revisions: [] });
      expect((await read("?revision=1")).status).toBe(404);
      const first = await (await sharing.POST(request("/", alice.cookies.value, "POST", { expectedRevision: 1, expectedShareId: null }), ctx)).json();
      expect((await update(1, "共有しなかった中間版")).status).toBe(200);
      expect((await update(2, "次に共有する説明")).status).toBe(200);
      const third = await (await sharing.POST(request("/", alice.cookies.value, "POST", { expectedRevision: 3, expectedShareId: first.share.id }), ctx)).json();
      expect((await sharing.PATCH(request("/",alice.cookies.value,"PATCH",{expectedRevision:3,expectedSharedRevision:1,expectedShareId:third.share.id}),ctx)).status).toBe(200);
      expect((await update(3, "現在のprivate説明")).status).toBe(200);
      const response = await read();
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      const listed = await response.json();
      expect(listed.revisions.map((value: { revision: number }) => value.revision)).toEqual([3, 1]);
      expect(Object.keys(listed.revisions[0]).sort()).toEqual(["revision", "title", "updatedAt"]);
      expect(JSON.stringify(listed)).not.toContain("private説明");
      expect(await (await read("?revision=1")).json()).toEqual({ capsule });
      expect((await (await read("?revision=3")).json()).capsule.content.note).toBe("次に共有する説明");
      for (const revision of [2, 4, 99]) expect((await read(`?revision=${revision}`)).status).toBe(404);
      for (const query of ["?revision=0", "?revision=-1", "?revision=1.1", "?revision=01", "?revision=", "?revision=1&revision=3", "?revision=9007199254740992"]) expect((await read(query)).status).toBe(400);
      for (const query of ["", "?revision=1", "?revision=3"]) {
        expect((await read(query, "", { "x-capsule-token": third.token })).status).toBe(401);
        expect((await read(query, bob.cookies.value, { "x-capsule-token": third.token })).status).toBe(404);
        expect((await read(query, alice.cookies.value, { "x-member-user": randomUUID() })).status).toBe(401);
      }
      expect((await sharing.DELETE(request("/", alice.cookies.value, "DELETE", { expectedShareId: third.share.id }), ctx)).status).toBe(200);
      expect(await (await read("?revision=1")).json()).toEqual({ capsule });
      expect((await shared.GET(request("/", "", "GET", undefined, { "x-capsule-token": third.token }))).status).toBe(404);
      const otherDataset = createMemberService(config, pool, auth, "pilot-science-v1");
      expect((await memberHandle(() => otherDataset.readSharedRevisions(request(path, alice.cookies.value), capsule.id))).status).toBe(404);
      const { user } = await (await profile.GET(request("/", alice.cookies.value))).json();
      await pool.query('UPDATE "user" SET active=false WHERE id=$1', [user.id]);
      try { expect((await read()).status).toBe(401); expect((await read("?revision=1")).status).toBe(401); }
      finally { await pool.query('UPDATE "user" SET active=true WHERE id=$1', [user.id]); }
    } finally { await pool.query("DELETE FROM member_capsule WHERE id=$1", [capsule.id]); }
    expect((await read()).status).toBe(404);
    expect((await read("?revision=1")).status).toBe(404);
  });
  it("Capsuleの同じ版で2 Userが会話し、private版・別版・他人の撤回を拒否する", async () => {
    const { pool } = memberRuntime();
    const created = await create(alice.cookies.value);
    expect(created.status).toBe(201);
    const { capsule } = await created.json();
    const path = `/api/capsules/${capsule.id}/discussion`;
    try {
      const issued = await sharing.POST(request("/", alice.cookies.value, "POST", { expectedRevision: 1, expectedShareId: null }), context(capsule.id));
      const { token, share } = await issued.json();
      const headers = { "x-capsule-token": token };
      expect((await (await discussion.GET(request(path + "?revision=1", bob.cookies.value, "GET", undefined, headers), context(capsule.id))).json()).closed).toBe(false);
      expect((await discussion.PATCH(request(path, alice.cookies.value, "PATCH", { closed: false, expectedClosed: false }), context(capsule.id))).status).toBe(200);
      const read = (cookie = "", revision = 1, extra: Record<string, string> = headers) => discussion.GET(request(`${path}?revision=${revision}`, cookie, "GET", undefined, extra), context(capsule.id));
      const post = (cookie: string, body: string, revision = 1, requestId = randomUUID(), extra: Record<string, string> = headers) => discussion.POST(request(path, cookie, "POST", { requestId, revision, body }, extra), context(capsule.id));
      expect((await post("", "匿名投稿")).status).toBe(401);
      expect((await post(bob.cookies.value, "tokenなし", 1, randomUUID(), {} as typeof headers)).status).toBe(404);
      expect((await post(bob.cookies.value, "改ざん", 2)).status).toBe(404);
      expect((await post(bob.cookies.value, "origin", 1, randomUUID(), { ...headers, origin: "https://evil.invalid" })).status).toBe(403);
      for (const body of ["  ", "あ".repeat(2001)]) expect((await post(bob.cookies.value, body)).status).toBe(400);
      const requestId = randomUUID();
      const responses = await Promise.all([post(bob.cookies.value, "根拠の期間を確認したい", 1, requestId), post(bob.cookies.value, "根拠の期間を確認したい", 1, requestId)]);
      expect(responses.map(r => r.status).sort()).toEqual([200, 201]);
      const posted = await responses[0].json();
      expect((await post(bob.cookies.value, "違う内容", 1, requestId)).status).toBe(409);
      expect((await post(alice.cookies.value, "引用箇所を開いて確認できます")).status).toBe(201);
      const publicResponse = await read();
      expect(publicResponse.headers.get("cache-control")).toContain("no-store");
      expect(publicResponse.headers.get("vary")).toContain("X-Capsule-Token");
      const anonymous = await publicResponse.json();
      expect(anonymous.posts).toHaveLength(2);
      expect(anonymous.viewer).toBeNull();
      expect(anonymous.posts.map((p: { authorName: string }) => p.authorName).sort()).toEqual(["検証ユーザーA", "検証ユーザーB"]);
      expect(JSON.stringify(anonymous)).not.toMatch(/author_user_id|email|request_id|content_hash/);
      const asBob = await (await read(bob.cookies.value)).json();
      expect(asBob.posts.find((p: { id: string }) => p.id === posted.postId).own).toBe(true);
      expect(asBob.canManage).toBe(false);
      expect((await read(bob.cookies.value, 1, { ...headers, "x-member-user": randomUUID() })).status).toBe(401);
      await pool.query('UPDATE "user" SET active=false WHERE id=$1', [asBob.viewer.id]);
      try {
        expect((await post(bob.cookies.value, "停止Userの投稿")).status).toBe(401);
        const stopped = await (await read()).json();
        expect(stopped.posts.find((p: { id: string }) => p.id === posted.postId).body).toBeNull();
      } finally { await pool.query('UPDATE "user" SET active=true WHERE id=$1', [asBob.viewer.id]); }
      expect((await discussion.DELETE(request(path, alice.cookies.value, "DELETE", { postId: posted.postId }), context(capsule.id))).status).toBe(404);
      expect((await discussion.PATCH(request(path, bob.cookies.value, "PATCH", { closed: true, expectedClosed: false }), context(capsule.id))).status).toBe(404);
      expect((await discussion.PATCH(request(path, alice.cookies.value, "PATCH", { closed: true, expectedClosed: false }), context(capsule.id))).status).toBe(200);
      expect((await post(bob.cookies.value, "停止中")).status).toBe(403);
      expect((await discussion.PATCH(request(path, alice.cookies.value, "PATCH", { closed: false, expectedClosed: false }), context(capsule.id))).status).toBe(409);
      expect((await discussion.PATCH(request(path, alice.cookies.value, "PATCH", { closed: false, expectedClosed: true }), context(capsule.id))).status).toBe(200);
      const original = capsule.content;
      expect((await item.PUT(request("/", alice.cookies.value, "PUT", { expectedRevision: 1, content: { ...original, note: "非共有版" } }), context(capsule.id))).status).toBe(200);
      expect((await read(bob.cookies.value, 2)).status).toBe(404);
      const next = await (await sharing.POST(request("/", alice.cookies.value, "POST", { expectedRevision: 2, expectedShareId: share.id }), context(capsule.id))).json();
      expect((await read(bob.cookies.value)).status).toBe(404);
      expect((await post(bob.cookies.value, "旧リンクで投稿")).status).toBe(404);
      const newHeaders = { "x-capsule-token": next.token };
      expect((await read(bob.cookies.value, 1, newHeaders)).status).toBe(200);
      expect((await read(bob.cookies.value, 2, newHeaders)).status).toBe(404);
      expect((await sharing.PATCH(request("/",alice.cookies.value,"PATCH",{expectedRevision:2,expectedSharedRevision:1,expectedShareId:next.share.id}),context(capsule.id))).status).toBe(200);
      expect((await (await read(bob.cookies.value, 2, newHeaders)).json()).posts.some((p:{id:string})=>p.id===posted.postId)).toBe(true);
      // Author can withdraw a known post after losing access; no old body is returned.
      const withdrawn = await discussion.DELETE(request(path, bob.cookies.value, "DELETE", { postId: posted.postId }), context(capsule.id));
      expect(await withdrawn.json()).toEqual({ withdrawn: true });
      const old = await (await read(alice.cookies.value, 1, {} as typeof headers)).json();
      const tombstone = old.posts.find((p: { id: string }) => p.id === posted.postId);
      expect(tombstone.body).toBeNull(); expect(tombstone.authorName).toBeNull(); expect(tombstone.withdrawnAt).not.toBeNull();
      const stored = await pool.query("SELECT body, withdrawn_at FROM member_capsule_post WHERE id=$1", [posted.postId]);
      expect(stored.rows[0].body).toBeNull();
      // Dedicated dataset and suspended owner cannot expose the thread.
      const runtime = memberRuntime();
      const other = createMemberService(runtime.config, pool, runtime.auth, "pilot-science-v1");
      expect((await memberHandle(() => other.readDiscussion(request(`${path}?revision=2`, "", "GET", undefined, newHeaders), capsule.id))).status).toBe(404);
      const owner = old.viewer.id;
      await pool.query('UPDATE "user" SET active=false WHERE id=$1', [owner]);
      try { expect((await read("", 2, newHeaders)).status).toBe(404); }
      finally { await pool.query('UPDATE "user" SET active=true WHERE id=$1', [owner]); }
    } finally {
      await pool.query("DELETE FROM member_capsule WHERE id=$1", [capsule.id]);
      expect((await pool.query("SELECT id FROM member_capsule_post WHERE capsule_id=$1", [capsule.id])).rowCount).toBe(0);
      expect((await pool.query("SELECT capsule_id FROM member_capsule_thread WHERE capsule_id=$1", [capsule.id])).rowCount).toBe(0);
    }
  });
  it("新規共有は受付ON、未作成threadもONで整合し、明示OFFと旧版固定を再発行後も保つ", async () => {
    const { pool } = memberRuntime();
    const { capsule } = await (await create(alice.cookies.value)).json(), ctx = context(capsule.id);
    const path = `/api/capsules/${capsule.id}/discussion`;
    try {
      const first = await (await sharing.POST(request("/", alice.cookies.value, "POST", { expectedRevision: 1, expectedShareId: null }), ctx)).json();
      const read = () => discussion.GET(request(path + "?revision=1", alice.cookies.value), ctx);
      expect((await (await read()).json()).closed).toBe(false);
      expect((await pool.query("SELECT closed FROM member_capsule_thread WHERE capsule_id=$1", [capsule.id])).rows[0].closed).toBe(false);
      await pool.query("DELETE FROM member_capsule_thread WHERE capsule_id=$1", [capsule.id]);
      expect((await (await read()).json()).closed).toBe(false);
      // The DB default is verified independently of the service's explicit insert.
      await pool.query("INSERT INTO member_capsule_thread(capsule_id) VALUES($1)", [capsule.id]);
      expect((await pool.query("SELECT closed FROM member_capsule_thread WHERE capsule_id=$1", [capsule.id])).rows[0].closed).toBe(false);
      expect((await discussion.PATCH(request(path, alice.cookies.value, "PATCH", { closed: true, expectedClosed: false }), ctx)).status).toBe(200);
      await migrateMemberDatabase(pool, false, false, false, false, false, true);
      const next = await (await sharing.POST(request("/", alice.cookies.value, "POST", { expectedRevision: 1, expectedShareId: first.share.id }), ctx)).json();
      expect((await (await read()).json()).closed).toBe(true);
      expect((await discussion.POST(request(path, bob.cookies.value, "POST", { requestId: randomUUID(), revision: 1, body: "停止を越えられない" }, { "x-capsule-token": next.token }), ctx)).status).toBe(403);
      const reopened = await sharing.POST(request("/", alice.cookies.value, "POST", { expectedRevision: 1, expectedShareId: next.share.id, commentsClosed: false }), ctx);
      expect(reopened.status).toBe(201); expect((await (await read()).json()).closed).toBe(false);
      expect((await pool.query("SELECT snapshot FROM member_capsule_revision WHERE capsule_id=$1", [capsule.id])).rows[0].snapshot).toEqual(capsule);
      expect((await sharing.POST(request("/", bob.cookies.value, "POST", { expectedRevision: 1, expectedShareId: (await reopened.json()).share.id, commentsClosed: true }), ctx)).status).toBe(404);
    } finally { await pool.query("DELETE FROM member_capsule WHERE id=$1", [capsule.id]); }
  });
  it("投稿の頻度とCapsule全体上限を同時書込でも守り、撤回で上限をリセットしない", async () => {
    const { pool } = memberRuntime();
    const { capsule } = await (await create(alice.cookies.value)).json();
    const path = `/api/capsules/${capsule.id}/discussion`;
    try {
      const { token } = await (await sharing.POST(request("/", alice.cookies.value, "POST", { expectedRevision: 1, expectedShareId: null }), context(capsule.id))).json();
      expect((await discussion.PATCH(request(path, alice.cookies.value, "PATCH", { closed: false, expectedClosed: false }), context(capsule.id))).status).toBe(200);
      const post = () => discussion.POST(request(path, bob.cookies.value, "POST", { requestId: randomUUID(), revision: 1, body: "上限の確認" }, { "x-capsule-token": token }), context(capsule.id));
      const results = await Promise.all(Array.from({ length: 6 }, post));
      expect(results.map(r => r.status).sort()).toEqual([201, 201, 201, 201, 201, 429]);
      const { user } = await (await profile.GET(request("/", bob.cookies.value))).json();
      await pool.query("UPDATE member_capsule_post SET created_at=now()-interval '2 minutes' WHERE capsule_id=$1", [capsule.id]);
      await pool.query(`INSERT INTO member_capsule_post (id,capsule_id,revision,author_user_id,request_id,content_hash,body,created_at)
        SELECT gen_random_uuid(),$1,1,$2,gen_random_uuid(),'test','fixture',now()-interval '2 minutes' FROM generate_series(1,194)`, [capsule.id, user.id]);
      const last = await Promise.all([post(), post()]);
      expect(last.map(r => r.status).sort()).toEqual([201, 422]);
      const ownPost = (await pool.query("SELECT id FROM member_capsule_post WHERE capsule_id=$1 LIMIT 1", [capsule.id])).rows[0].id;
      expect((await discussion.DELETE(request(path, bob.cookies.value, "DELETE", { postId: ownPost }), context(capsule.id))).status).toBe(200);
      expect((await post()).status).toBe(422);
    } finally { await pool.query("DELETE FROM member_capsule WHERE id=$1", [capsule.id]); }
  });
  it("共有失効・owner停止後も作者だけが投稿を一覧し、撤回できる", async () => {
    const { pool } = memberRuntime();
    const { capsule } = await (await create(alice.cookies.value)).json();
    const path = `/api/capsules/${capsule.id}/discussion`, listPath = "/api/member/posts";
    const { user: author } = await (await profile.GET(request("/", bob.cookies.value))).json();
    const { user: owner } = await (await profile.GET(request("/", alice.cookies.value))).json();
    const list = (cookie = bob.cookies.value, headers: Record<string, string> = {}) => ownPosts.GET(request(listPath, cookie, "GET", undefined, headers));
    try {
      const { token, share } = await (await sharing.POST(request("/", alice.cookies.value, "POST", { expectedRevision: 1, expectedShareId: null }), context(capsule.id))).json();
      expect((await discussion.PATCH(request(path, alice.cookies.value, "PATCH", { closed: false, expectedClosed: false }), context(capsule.id))).status).toBe(200);
      const post = async (cookie: string, body: string) => discussion.POST(request(path, cookie, "POST", { requestId: randomUUID(), revision: 1, body }, { "x-capsule-token": token }), context(capsule.id));
      const posted = await post(bob.cookies.value, "失効後も管理する本人の文章");
      expect(posted.status).toBe(201); const { postId } = await posted.json();
      expect((await post(alice.cookies.value, "返さない他人の文章")).status).toBe(201);
      expect((await list("")).status).toBe(401);
      expect((await list("", { "x-capsule-token": token })).status).toBe(401);
      expect((await list(bob.cookies.value, { "x-member-user": owner.id })).status).toBe(401);
      expect((await sharing.DELETE(request("/", alice.cookies.value, "DELETE", { expectedShareId: share.id }), context(capsule.id))).status).toBe(200);
      expect((await discussion.GET(request(`${path}?revision=1`, bob.cookies.value, "GET", undefined, { "x-capsule-token": token }), context(capsule.id))).status).toBe(404);
      await pool.query('UPDATE "user" SET active=false WHERE id=$1', [owner.id]);
      const response = await list(bob.cookies.value, { "x-member-user": author.id });
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("vary")).toBe("Cookie, X-Member-User");
      expect(response.headers.get("x-robots-tag")).toContain("noindex");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      const result = await response.json();
      expect(result.posts).toHaveLength(1); expect(result.nextCursor).toBeNull();
      expect(result.posts[0]).toMatchObject({ id: postId, capsuleId: capsule.id, revision: 1, body: "失効後も管理する本人の文章", withdrawnAt: null });
      expect(Object.keys(result.posts[0]).sort()).toEqual(["body", "capsuleId", "createdAt", "id", "revision", "withdrawnAt"]);
      expect(JSON.stringify(result)).not.toMatch(/返さない他人|研究のつながり|自分の説明|owner|author|email|token/);
      const runtime = memberRuntime();
      const other = createMemberService(runtime.config, pool, runtime.auth, "pilot-science-v1");
      expect(await (await other.listOwnDiscussionPosts(request(listPath, bob.cookies.value))).json()).toEqual({ posts: [], nextCursor: null });
      const withdraw = (cookie: string, headers: Record<string, string> = {}) => discussion.DELETE(request(path, cookie, "DELETE", { postId }, headers), context(capsule.id));
      expect((await withdraw(bob.cookies.value, { origin: "https://evil.invalid" })).status).toBe(403);
      expect((await withdraw(bob.cookies.value, { "x-member-user": owner.id })).status).toBe(401);
      expect((await withdraw(bob.cookies.value)).status).toBe(200);
      expect((await withdraw(bob.cookies.value)).status).toBe(200);
      const withdrawn = (await (await list()).json()).posts[0];
      expect(withdrawn.body).toBeNull(); expect(withdrawn.withdrawnAt).not.toBeNull();
      await pool.query('UPDATE "user" SET active=false WHERE id=$1', [author.id]);
      expect((await list()).status).toBe(401);
      expect((await withdraw(bob.cookies.value)).status).toBe(401);
      await pool.query('UPDATE "user" SET active=true WHERE id=$1', [author.id]);
      await pool.query("DELETE FROM member_capsule WHERE id=$1", [capsule.id]);
      expect(await (await list()).json()).toEqual({ posts: [], nextCursor: null });
    } finally {
      await pool.query('UPDATE "user" SET active=true WHERE id=ANY($1::uuid[])', [[owner.id, author.id]]);
      await pool.query("DELETE FROM member_capsule WHERE id=$1", [capsule.id]);
    }
  });
  it("本人投稿を時刻とIDで20件ずつ辿り、同時刻・microsecond・削除・不正cursorを扱う", async () => {
    const { pool } = memberRuntime();
    const { capsule } = await (await create(alice.cookies.value)).json();
    const { user } = await (await profile.GET(request("/", bob.cookies.value))).json();
    const list = (query = "", cookie = bob.cookies.value) => ownPosts.GET(request(`/api/member/posts${query}`, cookie));
    try {
      await sharing.POST(request("/", alice.cookies.value, "POST", { expectedRevision: 1, expectedShareId: null }), context(capsule.id));
      await pool.query("INSERT INTO member_capsule_thread(capsule_id) VALUES ($1) ON CONFLICT DO NOTHING", [capsule.id]);
      await pool.query(`INSERT INTO member_capsule_post(id,capsule_id,revision,author_user_id,request_id,content_hash,body,created_at)
        SELECT gen_random_uuid(),$1,1,$2,gen_random_uuid(),'test','投稿 '||n,
          '2026-10-09T00:00:00.123456Z'::timestamptz - greatest(n-23,0)*interval '1 microsecond' FROM generate_series(1,43) n`, [capsule.id, user.id]);
      const expected = (await pool.query("SELECT id FROM member_capsule_post WHERE capsule_id=$1 ORDER BY created_at DESC,id DESC", [capsule.id])).rows.map(row => row.id);
      const first = await (await list()).json();
      expect(first.posts.map((p: { id: string }) => p.id)).toEqual(expected.slice(0,20));
      expect(first.nextCursor).not.toBeNull();
      // Cursors are bounded filters, not capabilities. Another user sees only their own rows.
      expect((await (await list(`?cursor=${first.nextCursor}`, alice.cookies.value)).json()).posts).toEqual([]);
      // The cursor is self-contained, so losing its boundary post does not lose the next page.
      await pool.query("DELETE FROM member_capsule_post WHERE id=$1", [expected[19]]);
      const second = await (await list(`?cursor=${first.nextCursor}`)).json();
      expect(second.posts.map((p: { id: string }) => p.id)).toEqual(expected.slice(20,40));
      const third = await (await list(`?cursor=${second.nextCursor}`)).json();
      expect(third.posts.map((p: { id: string }) => p.id)).toEqual(expected.slice(40));
      expect(third.nextCursor).toBeNull();
      for (const query of ["?cursor=", "?cursor=not-json", "?cursor=" + "a".repeat(513), `?cursor=${first.nextCursor}&cursor=${first.nextCursor}`, "?author=" + user.id, "?limit=999", "?cursor=" + Buffer.from(JSON.stringify({ at: "0000-01-01T00:00:00.000000Z", id: randomUUID() })).toString("base64url")]) {
        expect((await list(query)).status).toBe(400);
      }
    } finally { await pool.query("DELETE FROM member_capsule WHERE id=$1", [capsule.id]); }
  });
  it("停止Userのsessionを使えず、新しいsessionも作らない", async () => {
    const { pool } = memberRuntime();
    const { user } = await (await profile.GET(request("/", bob.cookies.value))).json();
    await pool.query('UPDATE "user" SET active = false WHERE id = $1', [user.id]);
    expect((await collection.GET(request("/", bob.cookies.value))).status).toBe(401);
    const stopped = await login("bob");
    expect((await collection.GET(request("/", stopped.cookies.value))).status).toBe(401);
    await pool.query('UPDATE "user" SET active = true WHERE id = $1', [user.id]);
  });
  it("同時作成しても一所有者・datasetの20件上限を越えない", async () => {
    const {user} = await (await profile.GET(request("/", bob.cookies.value))).json();
    const count = Number((await memberRuntime().pool.query("SELECT count(*) FROM member_capsule WHERE owner_user_id=$1 AND dataset='demo'",[user.id])).rows[0].count);
    await memberRuntime().pool.query("INSERT INTO member_capsule(id,owner_user_id,dataset,content) SELECT gen_random_uuid(),$1,'demo',$2::jsonb FROM generate_series(1,$3)",[user.id,JSON.stringify(content()),11-count]);
    const responses = await Promise.all(Array.from({ length: 12 }, () => create(bob.cookies.value)));
    expect(responses.filter(response => response.status === 201)).toHaveLength(9);
    expect(responses.filter(response => response.status === 422)).toHaveLength(3);
    expect((await (await collection.GET(request("/", bob.cookies.value))).json()).capsules).toHaveLength(20);
  });
  it("同じ所有者でも別datasetの環境から保存を読めない", async () => {
    const { config, pool, auth } = memberRuntime();
    const other = createMemberService(config, pool, auth, "pilot-science-v1");
    await create(alice.cookies.value);
    const { capsules } = await (await collection.GET(request("/", alice.cookies.value))).json();
    expect((await other.list(request("/", alice.cookies.value))).status).toBe(200);
    expect((await (await other.list(request("/", alice.cookies.value))).json()).capsules).toEqual([]);
    expect((await memberHandle(() => other.read(request("/", alice.cookies.value), capsules[0].id))).status).toBe(404);
  });
  it("認証入口から追加scope・直接token・許可していないaccount操作を使えない", async () => {
    for (const extra of [{ scopes: ["drive"] }, { idToken: { token: "forged" } }, { additionalData: { active: true } }]) {
      expect((await authRoute.POST(request("/api/auth/sign-in/social", "", "POST", { provider: "fixture", callbackURL: "/", ...extra }))).status).toBe(400);
    }
    expect((await authRoute.POST(request("/api/auth/update-user", alice.cookies.value, "POST", { active: true }))).status).toBe(404);
  });
  it("ログアウト・全端末失効を次のprivate操作へ即時反映する", async () => {
    const other = await login("alice");
    const cookie = other.cookies.value;
    expect((await authRoute.POST(request("/api/auth/sign-out", cookie, "POST", {}))).status).toBe(200);
    expect((await collection.GET(request("/", cookie))).status).toBe(401);
    expect((await collection.GET(request("/", alice.cookies.value))).status).toBe(200);
    const all = await authRoute.POST(request("/api/auth/revoke-sessions", alice.cookies.value, "POST", {}));
    expect(all.status).toBe(200);
    expect((await collection.GET(request("/", alice.cookies.value))).status).toBe(401);
  });
  it("運営DB停止を匿名扱いせず503とし、回復後は同じsessionで読める", async () => {
    const config = memberConfig()!;
    const controlUrl = new URL(config.databaseUrl);
    controlUrl.pathname = "/postgres";
    const control = new Pool({ connectionString: controlUrl.href, connectionTimeoutMillis: 3000 });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const held = await memberRuntime().pool.connect();
    const disconnected = new Promise<void>(resolve => held.once("end", resolve));
    try {
      await control.query("ALTER DATABASE graph_member_test ALLOW_CONNECTIONS false");
      await control.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'graph_member_test'");
      // No active query owns the error here. Without a client error listener
      // this real backend termination becomes an uncaught process exception.
      await disconnected;
      await expect(held.query("SELECT 1")).rejects.toThrow();
      const response = await collection.GET(request("/", bob.cookies.value));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: { code: "MEMBER_UNAVAILABLE" } });
    } finally {
      held.release(true);
      await control.query("ALTER DATABASE graph_member_test ALLOW_CONNECTIONS true");
      await control.end();
      log.mockRestore();
    }
    // Disconnected idle connections may still be draining after DB recovery.
    // Retry reads only; never replay a write to hide the outage.
    await vi.waitFor(async () => {
      expect((await collection.GET(request("/", bob.cookies.value))).status).toBe(200);
    }, { timeout: 5000, interval: 100 });
  }, 15_000);

});


describe("退会と最小運営操作（実PostgreSQL）", () => {
  const operation = (action: "suspend-user" | "resume-user" | "block-sharing" | "hide-post", target: string, apply = true) =>
    operateMember(memberRuntime().pool, { action, target, actor: "test-operator", reason: "security" }, apply);
  beforeAll(async () => {
    await memberRuntime().pool.query("DELETE FROM member_capsule");
    alice = await login("alice"); bob = await login("bob");
    expect((await memberRuntime().pool.query("SELECT count(*) FROM member_migration")).rows[0].count).toBe("9");
  });
  it("停止のdry-runは無変更。適用で全sessionと共有が失効し、再開しても復活しない", async () => {
    const { pool } = memberRuntime();
    const user = (await (await profile.GET(request("/", bob.cookies.value))).json()).user;
    const { capsule } = await (await create(bob.cookies.value)).json();
    const link = await (await sharing.POST(request("/", bob.cookies.value, "POST", { expectedRevision: 1, expectedShareId: null }), context(capsule.id))).json();
    const read = () => shared.GET(request("/", "", "GET", undefined, { "x-capsule-token": link.token }));
    const args = ["--import", "tsx", "scripts/member-ops.ts", "suspend-user", user.id, "--actor", "test-cli", "--reason", "security", "--origin", origin];
    const dryRun = spawnSync(process.execPath, args, { encoding: "utf8" });
    expect(dryRun.status).toBe(0); expect(JSON.parse(dryRun.stdout)).toMatchObject({ applied: false, target: user.id });
    expect(spawnSync(process.execPath, [...args, "--apply"], { encoding: "utf8" }).status).toBe(1);
    expect(await operation("suspend-user", user.id, false)).toMatchObject({ applied: false, changed: true });
    expect((await profile.GET(request("/", bob.cookies.value))).status).toBe(200);
    expect((await read()).status).toBe(200);
    await operation("suspend-user", user.id); await operation("suspend-user", user.id);
    expect((await pool.query("SELECT count(*) FROM member_operation WHERE target_id=$1", [user.id])).rows[0].count).toBe("1");
    expect((await profile.GET(request("/", bob.cookies.value))).status).toBe(401);
    expect((await read()).status).toBe(404);
    const stopped = await login("bob");
    expect((await profile.GET(request("/", stopped.cookies.value))).status).toBe(401);
    await expect(pool.query(`INSERT INTO session(id,"expiresAt",token,"updatedAt","userId") VALUES ($1,now()+interval '1 hour',$2,now(),$3)`, [randomUUID(), randomUUID(), user.id])).rejects.toMatchObject({ code: "23514" });
    await operation("resume-user", user.id);
    expect((await profile.GET(request("/", bob.cookies.value))).status).toBe(401);
    expect((await read()).status).toBe(404);
    bob = await login("bob");
    expect((await item.GET(request("/", bob.cookies.value), context(capsule.id))).status).toBe(200);
  }, 30_000);
  it("共有停止は本人のprivate保存を保持し、再発行・会話再開を拒否する", async () => {
    const { capsule } = await (await create(alice.cookies.value)).json();
    const input = { expectedRevision: 1, expectedShareId: null };
    const link = await (await sharing.POST(request("/", alice.cookies.value, "POST", input), context(capsule.id))).json();
    await operation("block-sharing", capsule.id);
    expect((await shared.GET(request("/", "", "GET", undefined, { "x-capsule-token": link.token }))).status).toBe(404);
    const issue = await sharing.POST(request("/", alice.cookies.value, "POST", input), context(capsule.id));
    expect(issue.status).toBe(403); expect(await issue.json()).toEqual({ error: { code: "SHARING_BLOCKED" } });
    expect((await discussion.PATCH(request("/", alice.cookies.value, "PUT", { closed: false, expectedClosed: false }), context(capsule.id))).status).toBe(404);
    expect((await item.GET(request("/", alice.cookies.value), context(capsule.id))).status).toBe(200);
    expect(await (await sharing.GET(request("/", alice.cookies.value), context(capsule.id))).json()).toMatchObject({ blocked: true, token: null });
  });
  it("投稿非表示は本人撤回と区別され、本文・名前をどちらの読取APIにも返さない", async () => {
    const { capsule } = await (await create(alice.cookies.value)).json();
    const { token } = await (await sharing.POST(request("/", alice.cookies.value, "POST", { expectedRevision: 1, expectedShareId: null }), context(capsule.id))).json();
    await discussion.PATCH(request("/", alice.cookies.value, "PUT", { closed: false, expectedClosed: false }), context(capsule.id));
    const result = await discussion.POST(request("/", bob.cookies.value, "POST", { revision: 1, requestId: randomUUID(), body: "運営確認対象の本文" }, { "x-capsule-token": token }), context(capsule.id));
    const { postId } = await result.json(); expect(result.status).toBe(201);
    await operation("hide-post", postId); await operation("hide-post", postId);
    const read = await (await discussion.GET(request("/?revision=1", "", "GET", undefined, { "x-capsule-token": token }), context(capsule.id))).json();
    expect(read.posts[0]).toMatchObject({ body: null, authorName: null, withdrawnAt: null });
    const own = await (await ownPosts.GET(request("/", bob.cookies.value))).json();
    expect(own.posts.find((p: { id: string }) => p.id === postId)).toMatchObject({ body: null, withdrawnAt: null });
    expect((await discussion.DELETE(request("/", bob.cookies.value, "DELETE", { postId }), context(capsule.id))).status).toBe(200);
    expect((await memberRuntime().pool.query("SELECT body FROM member_capsule_post WHERE id=$1", [postId])).rows[0].body).toBeNull();
  });
  it("退会はOrigin・期待User・明示確認・直近ログインを要求する", async () => {
    const { pool } = memberRuntime();
    const user = (await (await profile.GET(request("/", alice.cookies.value))).json()).user;
    const body = { confirmation: "delete-account" }, headers = { "x-member-user": user.id };
    expect((await profile.DELETE(request("/", alice.cookies.value, "DELETE", body, { ...headers, origin: "https://evil.invalid" }))).status).toBe(403);
    expect((await profile.DELETE(request("/", bob.cookies.value, "DELETE", body, headers))).status).toBe(401);
    expect((await profile.DELETE(request("/", alice.cookies.value, "DELETE", body))).status).toBe(400);
    expect((await profile.DELETE(request("/", alice.cookies.value, "DELETE", { ...body, userId: user.id }, headers))).status).toBe(400);
    await pool.query(`UPDATE session SET "createdAt"=now()-interval '31 minutes' WHERE "userId"=$1`, [user.id]);
    const stale = await profile.DELETE(request("/", alice.cookies.value, "DELETE", body, headers));
    expect(stale.status).toBe(403); expect((await stale.json()).error.code).toBe("RECENT_LOGIN_REQUIRED");
    alice = await login("alice");
  });
  it("退会で全dataset・共有・本人投稿・認証情報を削除し、他人のCapsuleを残す", async () => {
    const { config, pool, auth } = memberRuntime();
    const user = (await (await profile.GET(request("/", alice.cookies.value))).json()).user;
    const own = await (await create(alice.cookies.value)).json();
    const link = await (await sharing.POST(request("/", alice.cookies.value, "POST", { expectedRevision: 1, expectedShareId: null }), context(own.capsule.id))).json();
    const anotherDataset = createMemberService(config, pool, auth, "pilot-science-v1");
    await anotherDataset.create(request("/", alice.cookies.value, "POST", { requestId: randomUUID(), content: { ...content(), dataset: "pilot-science-v1" } }));
    const other = await (await create(bob.cookies.value)).json();
    const otherLink = await (await sharing.POST(request("/", bob.cookies.value, "POST", { expectedRevision: 1, expectedShareId: null }), context(other.capsule.id))).json();
    await discussion.PATCH(request("/", bob.cookies.value, "PUT", { closed: false, expectedClosed: false }), context(other.capsule.id));
    await discussion.POST(request("/", alice.cookies.value, "POST", { requestId: randomUUID(), revision: 1, body: "本人の他所への投稿" }, { "x-capsule-token": otherLink.token }), context(other.capsule.id));
    const deleted = await profile.DELETE(request("/", alice.cookies.value, "DELETE", { confirmation: "delete-account" }, { "x-member-user": user.id }));
    expect(deleted.status).toBe(200); expect(deleted.headers.get("cache-control")).toContain("no-store");
    expect((await profile.GET(request("/", alice.cookies.value))).status).toBe(401);
    expect((await pool.query("SELECT action,target_id,actor,reason FROM member_operation WHERE target_id=$1 AND action='delete-account'", [user.id])).rows).toEqual([{ action: "delete-account", target_id: user.id, actor: "self", reason: "request" }]);
    for (const [table, column] of [["user", "id"], ["account", "userId"], ["session", "userId"], ["member_capsule", "owner_user_id"], ["member_capsule_request", "owner_user_id"], ["member_capsule_post", "author_user_id"]]) {
      expect((await pool.query(`SELECT count(*) FROM "${table}" WHERE "${column}"=$1`, [user.id])).rows[0].count).toBe("0");
    }
    expect((await shared.GET(request("/", "", "GET", undefined, { "x-capsule-token": link.token }))).status).toBe(404);
    expect((await item.GET(request("/", bob.cookies.value), context(other.capsule.id))).status).toBe(200);
    const again = await login("alice");
    const replacement = (await (await profile.GET(request("/", again.cookies.value))).json()).user;
    expect(replacement.id).not.toBe(user.id);
    expect((await (await collection.GET(request("/", again.cookies.value))).json()).capsules).toEqual([]);
  });
  it("共有停止と発行が競合しても、停止後のtokenは残らない", async () => {
    const session = await login("alice");
    const { capsule } = await (await create(session.cookies.value)).json();
    const [issued] = await Promise.all([
      sharing.POST(request("/", session.cookies.value, "POST", { expectedRevision: 1, expectedShareId: null }), context(capsule.id)),
      operation("block-sharing", capsule.id),
    ]);
    expect([201, 403]).toContain(issued.status);
    expect((await memberRuntime().pool.query("SELECT count(*) FROM member_capsule_share WHERE capsule_id=$1", [capsule.id])).rows[0].count).toBe("0");
  });
  it("相互に投稿した二人の同時退会を完了し、共有・投稿を残さない", async () => {
    const sessions = [await login("alice"), await login("bob")];
    const users = await Promise.all(sessions.map(async session => (await (await profile.GET(request("/", session.cookies.value))).json()).user));
    const capsules = [];
    for (const session of sessions) {
      const { capsule } = await (await create(session.cookies.value)).json();
      const link = await (await sharing.POST(request("/", session.cookies.value, "POST", { expectedRevision: 1, expectedShareId: null }), context(capsule.id))).json();
      await discussion.PATCH(request("/", session.cookies.value, "PATCH", { closed: false, expectedClosed: false }), context(capsule.id));
      capsules.push({ ...capsule, token: link.token });
    }
    for (let index = 0; index < 2; index++) {
      const target = capsules[1-index];
      expect((await discussion.POST(request("/", sessions[index].cookies.value, "POST", { requestId: randomUUID(), revision: 1, body: "相互投稿" }, { "x-capsule-token": target.token }), context(target.id))).status).toBe(201);
    }
    const responses = await Promise.all(sessions.map((session, index) => profile.DELETE(request("/", session.cookies.value, "DELETE", { confirmation: "delete-account" }, { "x-member-user": users[index].id }))));
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect((await memberRuntime().pool.query('SELECT count(*) FROM "user" WHERE id=ANY($1::uuid[])', [users.map(user => user.id)])).rows[0].count).toBe("0");
    expect((await memberRuntime().pool.query("SELECT count(*) FROM member_capsule_post")).rows[0].count).toBe("0");
  });

});
