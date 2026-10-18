import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../lib/server/read-db", () => ({ readRelationTransaction: vi.fn() }));
import { readRelationTransaction } from "../lib/server/read-db";
import { handlePatternGraph } from "../lib/server/pattern-graph";
import { neighborsInput } from "../lib/server/http";
import { encodeNeighborCursor, encodeRelationNeighborCursor, decodeRelationNeighborCursor } from "../lib/server/neighbor-cursor";
import { normalizeRelationCondition } from "../lib/domain/relation-conditions";
import { id, relation, root } from "./pattern-graph-fixture";
const body = () => ({ version: 1, dataset: "public-kg", rootId: root.id, relation, revision: null, operation: { type: "page", after: null, requiredWitness: null } });
const request = (input: unknown) => new Request("http://localhost/api/discovery/paths", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
beforeEach(() => { vi.stubEnv("GRAPH_DATASET", "public-kg"); vi.mocked(readRelationTransaction).mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
it("未知条件・未知キー・重複キー・100経路超をDB照会前に拒否する", async () => {
  for (const input of [{ ...body(), relation: { ...relation, polarity: "all-records" } }, { ...body(), extra: true }, { ...body(), operation: { type: "restore", routes: Array(101).fill({ nodeIds: [1, 2, 3].map(id), claimIds: [4, 5].map(id) }), observedRevision: null, candidateBoundary: null } }]) expect((await handlePatternGraph(request(input))).status).toBe(400);
  const duplicate = JSON.stringify(body()).replace('"revision":null', '"revision":null,"revision":"other"');
  expect((await handlePatternGraph(new Request("http://localhost/", { method: "POST", headers: { "Content-Type": "application/json" }, body: duplicate }))).status).toBe(400);
  expect(readRelationTransaction).not.toHaveBeenCalled();
});
it("実行中のtimeoutは503で完全経路の正常0件を返さない", async () => {
  vi.mocked(readRelationTransaction).mockRejectedValueOnce(Object.assign(new Error("timeout"), { code: "Neo.ClientError.Transaction.TransactionTimedOut" }));
  const result = await handlePatternGraph(request(body())); expect(result.status).toBe(503); expect(await result.json()).toMatchObject({ error: { reason: "UNCONFIRMED" } });
});
it("サーバー全体15秒・Abortで中止し、遅い処理が正常結果になるのを防ぐ", async () => {
  vi.useFakeTimers(); let observed: AbortSignal | undefined;
  vi.mocked(readRelationTransaction).mockImplementation((_action, signal) => { observed = signal; return new Promise(() => {}); });
  const pending = handlePatternGraph(request(body())); await vi.advanceTimersByTimeAsync(15001); expect((await pending).status).toBe(503); expect(observed?.aborted).toBe(true);
  const controller = new AbortController(), second = handlePatternGraph(new Request(request(body()), { signal: controller.signal })); controller.abort(); expect((await second).status).toBe(503);
});
it("新neighbors条件は全predicate集合を保持し、不適合Roleを黙って消さない", () => {
  const q = "predicates=ASSISTANT_OF,INFLUENCED_BY,CONTRIBUTED_TO,AFFILIATED_WITH,PARTICIPATED_IN";
  expect(neighborsInput(new Request(`http://localhost/?${q}`)).predicates).toBeNull();
  expect(neighborsInput(new Request(`http://localhost/?${q}&polarity=affirmed`)).relation?.predicates).toHaveLength(5);
  expect(() => neighborsInput(new Request("http://localhost/?predicates=AFFILIATED_WITH&contributionRoles=DRAWING&polarity=affirmed"))).toThrow();
  expect(() => neighborsInput(new Request("http://localhost/?polarity=denied"))).toThrow();
});
it("v6は共通条件・版を束縛し、旧v5は同じall-records条件でだけ再利用できる", () => {
  const adjacent = normalizeRelationCondition({ version: 1, type: "adjacent", predicates: null, traversal: "either", polarity: "affirmed", contributionRoles: null, organizationPositions: null, eventRoles: null });
  if (adjacent.type !== "adjacent") throw Error();
  const cursor = encodeRelationNeighborCursor(root.id, adjacent, id(100), "public-kg", "r1");
  expect(decodeRelationNeighborCursor(cursor, root.id, adjacent, "public-kg", "r1")).toBe(id(100));
  expect(() => decodeRelationNeighborCursor(cursor, root.id, adjacent, "public-kg", "r2")).toThrow();
  const old = encodeNeighborCursor(root.id, null, id(100), null, "public-kg", null, null, "r1");
  expect(() => decodeRelationNeighborCursor(old, root.id, adjacent, "public-kg", "r1")).toThrow();
  expect(decodeRelationNeighborCursor(old, root.id, { ...adjacent, polarity: "all-records" }, "public-kg", "r1")).toBe(id(100));
});
