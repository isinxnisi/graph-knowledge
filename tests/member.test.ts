import { describe, expect, it, vi, afterEach } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { memberConfig } from "../lib/server/member/config";
import { memberCreateSchema } from "../lib/domain/member-capsule";
import { memberHandle, memberInput } from "../lib/server/member/http";

vi.mock("server-only", () => ({}));
import { GET as status } from "../app/api/member/status/route";
import { GET } from "../app/api/member/capsules/route";
import { GET as ownPosts } from "../app/api/member/posts/route";

const fixtureEnv = (): NodeJS.ProcessEnv => ({ NODE_ENV: "test", MEMBER_STORAGE_ENABLED: "1", MEMBER_FIXTURE_ENABLED: "1", MEMBER_AUTH_PROVIDER: "fixture",
  MEMBER_ORIGIN: "http://127.0.0.1:3221", MEMBER_COOKIE_PREFIX: "gk-member-fixture", MEMBER_AUTH_SECRET: randomBytes(32).toString("hex"),
  MEMBER_DATABASE_URL: "postgresql://test@127.0.0.1:55432/graph_member_test" });
afterEach(() => vi.unstubAllEnvs());
describe("会員保存の境界", () => {
  it("無設定は無効で、会員APIだけ503となる", async () => {
    expect(memberConfig({})).toBeNull();
    vi.stubEnv("MEMBER_STORAGE_ENABLED", "0");
    const response = await GET(new Request("http://localhost/api/member/capsules"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "MEMBER_UNAVAILABLE" } });
    const posts = await ownPosts(new Request("http://localhost/api/member/posts"));
    expect(posts.status).toBe(503);
    expect(posts.headers.get("cache-control")).toContain("no-store");
    expect(posts.headers.get("x-robots-tag")).toContain("noindex");
  });
  it("公開capabilityはproviderだけを返し、無効時はno-storeの503", async () => {
    for (const [key, value] of Object.entries(fixtureEnv())) vi.stubEnv(key, value!);
    const response = await status();
    expect(await response.json()).toEqual({ provider: "fixture" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    vi.stubEnv("MEMBER_STORAGE_ENABLED", "0");
    expect((await status()).status).toBe(503);
  });
  it("fixtureを本番・外部origin・別DB・別cookie namespaceで起動できない", () => {
    expect(memberConfig(fixtureEnv())?.provider.kind).toBe("fixture");
    for (const extra of [
      { NODE_ENV: "production" }, { MEMBER_FIXTURE_ENABLED: "0" }, { MEMBER_ORIGIN: "http://evil.invalid" },
      { MEMBER_DATABASE_URL: "postgresql://test@127.0.0.1:5432/graph_member_test" },
      { MEMBER_DATABASE_URL: "postgresql://test@127.0.0.1:55432/important" },
      { MEMBER_COOKIE_PREFIX: "gk-other" }, { MEMBER_AUTH_SECRET: "short" },
    ]) expect(() => memberConfig({ ...fixtureEnv(), ...extra } as NodeJS.ProcessEnv)).toThrow("Member service unavailable");
  });
  it("Google設定は明示credentialとHTTPSを要求する", () => {
    const base = { ...fixtureEnv(), MEMBER_AUTH_PROVIDER: "google", MEMBER_ORIGIN: "https://example.invalid" };
    expect(() => memberConfig(base)).toThrow();
    expect(memberConfig({ ...base, MEMBER_GOOGLE_CLIENT_ID: "test-id", MEMBER_GOOGLE_CLIENT_SECRET: "test-only" })?.provider.kind).toBe("google");
    expect(() => memberConfig({ ...base, MEMBER_ORIGIN: "http://example.invalid", MEMBER_GOOGLE_CLIENT_ID: "test-id", MEMBER_GOOGLE_CLIENT_SECRET: "test-only" })).toThrow();
  });
  it("owner・時刻・版を含むlocal形式をそのまま受け入れない", () => {
    const value = { requestId: randomUUID(), content: { dataset: "demo", title: " メモ ", note: "", language: "ja", entityIds: [randomUUID()], claimIds: [] } };
    expect(memberCreateSchema.parse(value).content.title).toBe("メモ");
    for (const extra of [{ id: randomUUID() }, { ownerUserId: randomUUID() }, { revision: 1 }, { createdAt: new Date().toISOString() }]) {
      expect(memberCreateSchema.safeParse({ ...value, ...extra }).success).toBe(false);
      expect(memberCreateSchema.safeParse({ ...value, content: { ...value.content, ...extra } }).success).toBe(false);
    }
  });
  it("Content-Lengthがなくてもstream本文を上限で停止する", async () => {
    let canceled = false;
    const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(16_001)); }, cancel() { canceled = true; } });
    const request = new Request("http://localhost/", { method: "POST", headers: { "Content-Type": "application/json" }, body, duplex: "half" } as RequestInit);
    const response = await memberHandle(async () => { await memberInput(request, memberCreateSchema); return Response.json({}); });
    expect(response.status).toBe(413);
    expect(canceled).toBe(true);
  });
  it("DB接続エラーへ機密内容を含めない", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const error of [
        Object.assign(new Error("private database details"), { code: "ECONNREFUSED" }),
        new Error("Client has encountered a connection error and is not queryable"),
      ]) {
        const response = await memberHandle(async () => { throw error; });
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: { code: "MEMBER_UNAVAILABLE" } });
      }
    } finally { spy.mockRestore(); }
  });
});
