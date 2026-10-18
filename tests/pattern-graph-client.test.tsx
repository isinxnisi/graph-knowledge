// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useGraphExplorer } from "../lib/client/use-graph-explorer";
import { fetchPatternGraph } from "../lib/client/pattern-graph";
import { relationConditionKey, normalizeRelationCondition } from "../lib/domain/relation-conditions";
import { root, relation, route, page } from "./pattern-graph-fixture";
const fetchMock = vi.fn<typeof fetch>(), response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const request = () => ({ version: 1, dataset: "public-kg", rootId: root.id, relation, revision: null, operation: { type: "page", after: null, requiredWitness: null } } as const);
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); fetchMock.mockReset(); });
it("同じ条件・root・版・指定証拠を照合し、肯否や完全経路の欠落を受理しない", async () => {
  const a = route(100, 2), body = page([a]); fetchMock.mockResolvedValue(response(body));
  await expect(fetchPatternGraph(request(), new AbortController().signal)).resolves.toMatchObject({ operation: "page" });
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", cache: "no-store" });
  fetchMock.mockResolvedValue(response({ ...body, claims: body.claims.map(c => ({ ...c, polarity: "denied" })) }));
  await expect(fetchPatternGraph(request(), new AbortController().signal)).rejects.toThrow();
  fetchMock.mockResolvedValue(response(body));
  const b = route(101, 3);
  await expect(fetchPatternGraph({ ...request(), revision: "r1", operation: { type: "page", after: null, requiredWitness: { version: 1, dataset: "public-kg", revision: "r1", conditionKey: relationConditionKey(relation), route: b } } }, new AbortController().signal)).rejects.toThrow();
});
it("初回適用が成功するまで旧Graphを保ち、取消・遅着応答で切り替えない", async () => {
  const a = route(100, 2); let release!: (r: Response) => void;
  fetchMock.mockImplementation(() => new Promise(r => { release = r; }));
  const { result } = renderHook(() => useGraphExplorer()); let pending!: Promise<boolean>;
  act(() => { pending = result.current.applyRelation(root, relation); });
  expect(result.current.graph.centerId).toBeNull(); expect(result.current.relationLoading).toBe(true);
  act(() => result.current.cancelRelation());
  await act(async () => { release(response(page([a]))); await pending; });
  expect(result.current.graph.centerId).toBeNull(); expect(result.current.relationLoading).toBe(false);
  fetchMock.mockResolvedValue(response(page([a])));
  await act(async () => { expect(await result.current.applyRelation(root, relation)).toBe(true); });
  const old = result.current.graph;
  fetchMock.mockResolvedValue(response({ error: { message: "unconfirmed" } }, 503));
  await act(async () => { expect(await result.current.applyRelation(root, relation)).toBe(false); });
  expect(result.current.graph.nodes).toBe(old.nodes); expect(result.current.graph.conditionKey).toBe(old.conditionKey);
});
it("後の適用・unmount後に古い要求が完了しても新しいGraphへ混ぜない", async () => {
  let release!: (r: Response) => void; fetchMock.mockImplementationOnce(() => new Promise(r => { release = r; }));
  const { result, unmount } = renderHook(() => useGraphExplorer()); let first!: Promise<boolean>;
  act(() => { first = result.current.applyRelation(root, relation); });
  fetchMock.mockResolvedValue(response(page([route(100, 2)])));
  await act(async () => { await result.current.applyRelation(root, relation); });
  const accepted = result.current.graph;
  await act(async () => { release(response({ ...page([route(101, 3)]), revision: "r2" })); await first; });
  expect(result.current.graph).toBe(accepted);
  let last!: Promise<boolean>;
  fetchMock.mockImplementationOnce(() => new Promise(r => { release = r; })); act(() => { last = result.current.applyRelation(root, relation); }); unmount();
  release(response(page([route(102, 4)]))); await expect(last).resolves.toBe(false);
});
it("自由探索へは明示したadjacentで切り替え、肯否も同じ条件として引き継ぐ", async () => {
  const body = page([route(100, 2)]); fetchMock.mockResolvedValueOnce(response(body)); const { result } = renderHook(() => useGraphExplorer());
  await act(async () => { await result.current.applyRelation(root, relation); });
  const adjacent = normalizeRelationCondition({ version: 1, type: "adjacent", predicates: ["CONTRIBUTED_TO"], traversal: "either", polarity: "affirmed", contributionRoles: null, organizationPositions: null, eventRoles: null });
  fetchMock.mockResolvedValueOnce(response({ revision: "r1", centerId: root.id, relation: adjacent, nodes: body.nodes.filter(n => n.id === root.id || n.kind === "person"), claims: body.claims.filter(c => c.objectId === root.id), page: { hasMore: false, nextCursor: null } }));
  await act(async () => { expect(await result.current.applyRelation(root, adjacent)).toBe(true); });
  expect(result.current.graph.execution?.type).toBe("adjacent"); expect(result.current.graph.relation).toMatchObject({ polarity: "affirmed" });
  expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain("polarity=affirmed");
  expect(result.current.previous?.graph.execution?.type).toBe("pattern");
});
it("全体15秒の期限で待機を打ち切り、正常0経路にはしない", async () => {
  vi.useFakeTimers(); fetchMock.mockImplementation((_url, init) => new Promise((_r, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason))));
  const pending = fetchPatternGraph(request(), new AbortController().signal), failure = expect(pending).rejects.toMatchObject({ status: 0 });
  await vi.advanceTimersByTimeAsync(15001); await failure;
});
