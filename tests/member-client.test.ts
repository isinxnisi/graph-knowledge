import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { memberImportRequest, memberReaderCapsule, memberRequest, memberItemSchema } from "../lib/client/member-api";
import type { LocalCapsule } from "../lib/client/local-capsules";

const local = (): LocalCapsule => ({ id: randomUUID(), dataset: "demo", revision: 1, createdAt: "2026-10-09T00:00:00Z", title: "保存した説明", note: "失敗しても残す", language: "ja", entityIds: [randomUUID()], claimIds: [] });
function storage() { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; }
afterEach(() => vi.unstubAllGlobals());
describe("会員保存クライアントの境界", () => {
  it("同一利用者・local版の再送は同じキーで、別利用者・新版は独立する", () => {
    const store = storage(), value = local(), user = randomUUID();
    const first = memberImportRequest(store, user, value);
    expect(memberImportRequest(store, user, value)).toEqual(first);
    expect(first.content).not.toHaveProperty("id"); expect(first.content).not.toHaveProperty("revision"); expect(first).not.toHaveProperty("owner");
    expect(memberImportRequest(store, randomUUID(), value).requestId).not.toBe(first.requestId);
    expect(memberImportRequest(store, user, { ...value, revision: 2, updatedAt: "2026-10-09T01:00:00Z" }).requestId).not.toBe(first.requestId);
    expect(() => memberImportRequest(store, user, { ...value, note: "同じ版の改変" })).toThrow();
  });
  it("再送キーを保持できない場合は失敗する", () => {
    expect(() => memberImportRequest({ getItem: () => null, setItem: () => { throw new Error("quota"); } }, randomUUID(), local())).toThrow("quota");
  });
  it("server版を再解決用に変換しdataset混入を拒否する", () => {
    const value = local(); const { id, revision, createdAt, ...content } = value;
    const server = { id, revision, schemaVersion: 1 as const, createdAt, updatedAt: createdAt, content };
    expect(memberReaderCapsule(server, "demo")).toEqual(value);
    expect(memberReaderCapsule({ ...server, revision: 2 }, "demo").updatedAt).toBe(createdAt);
    expect(() => memberReaderCapsule(server, "pilot-event-v1")).toThrow();
  });
  it("private取得はcacheを使わず期待利用者を送り、401を区別する", async () => {
    const mock = vi.fn().mockResolvedValue(Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 })); vi.stubGlobal("fetch", mock);
    await expect(memberRequest("/api/member/capsules", memberItemSchema, { user: "expected" })).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(mock.mock.calls[0][1]).toMatchObject({ cache: "no-store", credentials: "same-origin", headers: { "X-Member-User": "expected" } });
  });
});
