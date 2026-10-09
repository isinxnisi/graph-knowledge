import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { createMemberService } from "../lib/server/member/service";
import { memberHandle } from "../lib/server/member/http";
import { randomUUID } from "node:crypto";
import { migrateMemberDatabase } from "../lib/server/member/migrate";
import { getMigrations } from "better-auth/db/migration";
import { startMemberOidc } from "./support/member-oidc";
import { memberPool } from "../lib/server/member/auth";
import { memberConfig } from "../lib/server/member/config";
import type { MemberCapsuleContent } from "../lib/domain/member-capsule";

vi.mock("server-only", () => ({}));
import { memberRuntime } from "../lib/server/member/runtime";
import * as authRoute from "../app/api/auth/[...all]/route";
import * as collection from "../app/api/member/capsules/route";
import * as item from "../app/api/member/capsules/[id]/route";
import * as profile from "../app/api/member/profile/route";
import * as sharing from "../app/api/member/capsules/[id]/share/route";
import * as shared from "../app/api/shared/capsule/route";

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
  try { await migrateMemberDatabase(migrationPool); await migrateMemberDatabase(migrationPool); } finally { await migrationPool.end(); }
  const { auth } = memberRuntime();
  const plan = await getMigrations(auth.options);
  expect(plan.toBeCreated).toEqual([]);
  expect(plan.toBeAdded).toEqual([]);
  expect(plan.toBeAddedIndexes).toEqual([]);
  expect(plan.schemaProblems).toEqual([]);
  alice = await login("alice");
  bob = await login("bob");
}, 30_000);
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
    expect((await create(alice.cookies.value, { ...content(), note: "あ".repeat(33_000) })).status).toBe(413);
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
    expect(status).toEqual({ share });
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
    expect(await response.json()).toEqual({ capsule });
    for (const headers of [{}, { "x-capsule-token": "invalid" }, { "x-capsule-token": "a".repeat(43) }] as Record<string, string>[]) {
      expect((await shared.GET(request("/api/shared/capsule", alice.cookies.value, "GET", undefined, headers))).status).toBe(404);
    }
    const runtime = memberRuntime();
    const otherDataset = createMemberService(runtime.config, runtime.pool, runtime.auth, "pilot-science-v1");
    expect((await memberHandle(() => otherDataset.readShared(request("/", "", "GET", undefined, { "x-capsule-token": token })))).status).toBe(404);
    expect((await item.PUT(request("/", alice.cookies.value, "PUT", { expectedRevision: 1, content: { ...capsule.content, title: "非共有の訂正", note: "private revision" } }), ctx)).status).toBe(200);
    expect(await (await read()).json()).toEqual({ capsule });
    expect((await sharing.POST(request("/", alice.cookies.value, "POST", { expectedRevision: 1, expectedShareId: share.id }), ctx)).status).toBe(409);
    await runtime.pool.query('UPDATE "user" SET active = false WHERE id = $1', [user.id]);
    try { expect((await read()).status).toBe(404); }
    finally { await runtime.pool.query('UPDATE "user" SET active = true WHERE id = $1', [user.id]); }
    expect((await item.DELETE(request("/", alice.cookies.value, "DELETE", { expectedRevision: 2 }), ctx)).status).toBe(200);
    expect((await read()).status).toBe(404);
    expect((await runtime.pool.query("SELECT * FROM member_capsule_revision WHERE capsule_id = $1", [capsule.id])).rowCount).toBe(0);
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
    expect(await (await sharing.GET(request("/", alice.cookies.value), ctx)).json()).toEqual({ share: null });
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
    expect((await issue(latest.share.id, 51)).status).toBe(422);
    expect((await revoke(latest.share.id)).status).toBe(200);
    await item.DELETE(request("/", alice.cookies.value, "DELETE", { expectedRevision: 51 }), ctx);
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
  it("停止Userのsessionを使えず、新しいsessionも作らない", async () => {
    const { pool } = memberRuntime();
    const { user } = await (await profile.GET(request("/", bob.cookies.value))).json();
    await pool.query('UPDATE "user" SET active = false WHERE id = $1', [user.id]);
    expect((await collection.GET(request("/", bob.cookies.value))).status).toBe(401);
    const stopped = await login("bob");
    expect((await collection.GET(request("/", stopped.cookies.value))).status).toBe(401);
    await pool.query('UPDATE "user" SET active = true WHERE id = $1', [user.id]);
  });
  it("同時作成しても一所有者・datasetの10件上限を越えない", async () => {
    const responses = await Promise.all(Array.from({ length: 12 }, () => create(bob.cookies.value)));
    expect(responses.filter(response => response.status === 201)).toHaveLength(9);
    expect(responses.filter(response => response.status === 422)).toHaveLength(3);
    expect((await (await collection.GET(request("/", bob.cookies.value))).json()).capsules).toHaveLength(10);
  });
  it("同じ所有者でも別datasetの環境から保存を読めない", async () => {
    const { config, pool, auth } = memberRuntime();
    const other = createMemberService(config, pool, auth, "pilot-science-v1");
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
    try {
      await control.query("ALTER DATABASE graph_member_test ALLOW_CONNECTIONS false");
      await control.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'graph_member_test'");
      const response = await collection.GET(request("/", bob.cookies.value));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: { code: "MEMBER_UNAVAILABLE" } });
    } finally {
      await control.query("ALTER DATABASE graph_member_test ALLOW_CONNECTIONS true");
      await control.end();
      log.mockRestore();
    }
    expect((await collection.GET(request("/", bob.cookies.value))).status).toBe(200);
  });

});
