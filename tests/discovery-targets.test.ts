import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { int } from "neo4j-driver";
vi.mock("server-only", () => ({}));
vi.mock("../lib/server/read-db", () => ({ readRelationTransaction: vi.fn() }));
vi.mock("../lib/server/public-revision", () => ({ readPublicRevision: vi.fn() }));
import { readRelationTransaction } from "../lib/server/read-db";
import { readPublicRevision } from "../lib/server/public-revision";
import { parseTargetSearch, searchDiscoveryTargets, handleTargetSearch } from "../lib/server/discovery-targets";
import { MATERIALIZE_RELATION_CLAIMS, verifyRelationWitness } from "../lib/server/relation-pattern-execution";
import { relationConditionKey } from "../lib/domain/relation-conditions";
import { ApiError } from "../lib/server/http";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const pattern = { version: 1, type: "pattern", pattern: { id: "other-works", revision: 1 }, polarity: "affirmed", contributionRoles: null } as const;
const input = () => ({ version: 1, dataset: "public-kg", criteria: { q: "", kind: null, relation: pattern }, revision: null, after: null });
const entity = (n: number) => ({ id: id(n), name: `Work ${String(n).padStart(2, "0")}`, kind: "work", aliases: [] });
const person = { id: id(500), name: "Contributor", kind: "person" };
const record = (o: Record<string, unknown>) => ({ get: (key: string) => o[key] });
const run = vi.fn();
function rows(n: number) {
  run.mockResolvedValueOnce({ records: Array.from({ length: n }, (_, i) => record({ entity: entity(i), rank: int(1) })) });
  if (n) {
    run.mockResolvedValueOnce({ records: Array.from({ length: Math.min(n, 20) }, (_, i) => record({ rootId: id(i), nodeIds: [id(i), id(500), id(100)], claimIds: [id(1000 + i), id(2000)] })) });
    run.mockResolvedValueOnce({ records: [...Array.from({ length: Math.min(n, 20) }, (_, i) => record({ claim: { id: id(1000 + i), predicate: "CONTRIBUTED_TO", polarity: "affirmed" }, subject: person, object: entity(i), sourceCount: int(1) })), record({ claim: { id: id(2000), predicate: "CONTRIBUTED_TO", polarity: "affirmed" }, subject: person, object: entity(100), sourceCount: int(2) })] });
  }
}
beforeEach(() => { vi.stubEnv("GRAPH_DATASET", "public-kg"); run.mockReset(); vi.mocked(readPublicRevision).mockReset().mockResolvedValue("r1"); vi.mocked(readRelationTransaction).mockReset().mockImplementation((action) => action({ run } as never)); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
const request = (body: unknown) => new Request("http://localhost/api/discovery/entities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
it("20+1の一致対象に完全証拠を付け、全条件とrevisionをcursorへ束縛する", async () => {
  rows(21); const first = await searchDiscoveryTargets(input(), new AbortController().signal);
  expect(first.items).toHaveLength(20); expect(first.items.every(i => i.match.status === "matched" && i.match.witness.revision === "r1")).toBe(true);
  expect(run.mock.calls[0][0].indexOf("EXISTS")).toBeLessThan(run.mock.calls[0][0].indexOf("LIMIT 21"));
  expect(run.mock.calls[2]).toEqual([MATERIALIZE_RELATION_CLAIMS, expect.objectContaining({ claimIds: expect.arrayContaining([id(1000), id(2000)]) })]);
  rows(0); await searchDiscoveryTargets({ ...input(), revision: "r1", after: first.page.nextCursor }, new AbortController().signal);
  expect(run.mock.calls[3][1]).toMatchObject({ afterId: id(19), kind: "work" });
  await expect(searchDiscoveryTargets({ ...input(), after: first.page.nextCursor }, new AbortController().signal)).rejects.toMatchObject({ reason: "INVALID_CURSOR" });
  await expect(searchDiscoveryTargets({ ...input(), criteria: { ...input().criteria, q: "other" }, revision: "r1", after: first.page.nextCursor }, new AbortController().signal)).rejects.toMatchObject({ reason: "INVALID_CURSOR" });
  vi.mocked(readPublicRevision).mockResolvedValue("r2");
  await expect(searchDiscoveryTargets({ ...input(), revision: "r2", after: first.page.nextCursor }, new AbortController().signal)).rejects.toMatchObject({ status: 409 });
});
it("公開版変更は証拠の欠落より優先して409、不完全な証拠は正常ページにしない", async () => {
  rows(1); vi.mocked(readPublicRevision).mockResolvedValueOnce("r1").mockRejectedValueOnce(Object.assign(new Error("changed"), { status: 409 }));
  await expect(searchDiscoveryTargets(input(), new AbortController().signal)).rejects.toMatchObject({ status: 409 });
  run.mockReset(); vi.mocked(readPublicRevision).mockResolvedValue("r1");
  run.mockResolvedValueOnce({ records: [record({ entity: entity(0), rank: int(1) })] }).mockResolvedValueOnce({ records: [] });
  const response = await handleTargetSearch(request(input())); expect(response.status).toBe(500); expect(await response.json()).toMatchObject({ error: { reason: "INTERNAL" } });
});
it("証拠取得のDB timeoutは503でページ・cursorを返さない", async () => {
  run.mockResolvedValueOnce({ records: [record({ entity: entity(0), rank: int(1) })] }).mockRejectedValueOnce(Object.assign(new Error("DB query"), { code: "Neo.ClientError.Transaction.TransactionTimedOut" }));
  const response = await handleTargetSearch(request(input())); expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: { code: "SERVICE_UNAVAILABLE", message: expect.any(String), reason: "UNCONFIRMED" } });
});
it("公開版が未準備の場合も未確認の503で、正常0件や内部不整合にしない", async () => {
  vi.mocked(readPublicRevision).mockRejectedValueOnce(new ApiError(503, "SERVICE_UNAVAILABLE", "preparing"));
  const response = await handleTargetSearch(request(input()));
  expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ error: { reason: "UNCONFIRMED" } });
  expect(run).not.toHaveBeenCalled();
});
it("全体deadlineと利用者Abortで取得を中止し、遅着結果を返さない", async () => {
  vi.useFakeTimers(); let observed: AbortSignal | undefined;
  vi.mocked(readRelationTransaction).mockImplementation((_action, signal) => { observed = signal; return new Promise(() => {}); });
  const pending = handleTargetSearch(request(input())); await vi.advanceTimersByTimeAsync(15_001);
  expect((await pending).status).toBe(503); expect(observed?.aborted).toBe(true);
  const abort = new AbortController(); const r = new Request(request(input()), { signal: abort.signal }); const second = handleTargetSearch(r); abort.abort(); expect((await second).status).toBe(503);
});
it("入力のサイズ／未知条件／query混在を拒否し、未対応を単純条件へ落とさない", async () => {
  for (const body of [{ ...input(), extra: 1 }, { ...input(), criteria: { ...input().criteria, relation: { ...pattern, pattern: { id: "institution-bridge", revision: 1 } } } }, { ...input(), criteria: { ...input().criteria, q: "x".repeat(65536) } }]) expect((await handleTargetSearch(request(body))).status).toBe(400);
  expect((await handleTargetSearch(new Request("http://localhost/?q=x", request(input())))).status).toBe(400);
  expect(() => parseTargetSearch({ ...input(), criteria: { ...input().criteria, kind: "person" } })).toThrow();
  expect(readRelationTransaction).not.toHaveBeenCalled();
});
it("JSONの重複key（Unicode escapeを含む）を拒否する", async () => {
  const body = JSON.stringify(input()).replace('"q":""', '"q":"", "\\u0071":"ignored"');
  const response = await handleTargetSearch(new Request("http://localhost/", { method: "POST", headers: { "Content-Type": "application/json" }, body }));
  expect(response.status).toBe(400); expect(readRelationTransaction).not.toHaveBeenCalled();
});
it("STEP3用の再検証はClaim IDを直接読み、版・条件と元Claimを検査する", async () => {
  rows(1); const result = await searchDiscoveryTargets(input(), new AbortController().signal);
  const match = result.items[0].match; if (match.status !== "matched") throw Error("missing");
  const material = run.mock.results[2].value; run.mockResolvedValueOnce(await material);
  const verified = await verifyRelationWitness({ run } as never, parseTargetSearch(input()).criteria.relation!, match.witness);
  expect(verified.claims.size).toBe(2); expect(run.mock.calls.at(-1)?.[0]).toBe(MATERIALIZE_RELATION_CLAIMS);
  expect(match.witness.conditionKey).toBe(relationConditionKey(parseTargetSearch(input()).criteria.relation!));
  await expect(verifyRelationWitness({ run } as never, parseTargetSearch(input()).criteria.relation!, { ...match.witness, conditionKey: "wrong" })).rejects.toThrow();
});
