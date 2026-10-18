// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { emptyPatternGraph, mergePatternPage, setPatternRouteOpen, setPatternRoutesOpen, closePatternNode, nextPatternRoute, patternNodeOpen, projectGraph } from "../lib/client/graph-state";
import { useGraphExplorer } from "../lib/client/use-graph-explorer";
import { captureWorkspace, rebuildWorkspace, parseWorkspaceBackup } from "../lib/client/saved-workspace";
import { encodeExploration, decodeExploration } from "../lib/client/exploration-url";
import { routeKey } from "../lib/domain/pattern-graph";
import { root, id, relation, route, page } from "./pattern-graph-fixture";
const a = route(100, 2), b = route(100, 3), c = route(101, 2), body = page([a, b, c]);
const state = () => mergePatternPage(emptyPatternGraph(root, relation), body, null);
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockImplementation(async () => response({ dataset: "public-kg", revision: "r1" })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); fetchMock.mockReset(); });
it("初回は指定証拠の完全経路1本だけを開き、候補は保持して表示と取得を分離する", () => {
  const graph = state();
  expect(Object.keys(graph.nodes)).toHaveLength(3); expect(Object.keys(graph.claims)).toHaveLength(2);
  expect(Object.keys(graph.cacheNodes)).toHaveLength(5); expect(graph.execution).toMatchObject({ routes: { [routeKey(a)]: { open: true }, [routeKey(b)]: { open: false }, [routeKey(c)]: { open: false } } });
  expect(nextPatternRoute(graph, root.id)).toBe(routeKey(b));
});
it("候補の追加取得や重複受理で、閉じている完全経路を勝手に開かない", () => {
  const initial = mergePatternPage(emptyPatternGraph(root, relation), page(Array.from({ length: 12 }, (_, n) => route(100, n + 2)), a, "next"), null);
  const graph = mergePatternPage(initial, page([a, route(200, 40)], a), "next");
  expect(graph.nodes).toEqual(initial.nodes); expect(graph.claims).toEqual(initial.claims);
  expect(graph.cacheNodes[id(40)]).toBeDefined();
});
it.each([root.id, id(100), id(2)])("root・中継・終点を閉じても同じ完全経路をGraphから再開できる: %s", node => {
  let graph = state();
  for (let n = 0; n < 3; n++) {
    graph = closePatternNode(graph, node);
    expect(graph.nodes[node]).toBeDefined(); expect(Object.keys(graph.claims)).toHaveLength(0);
    const key = nextPatternRoute(graph, node); expect(key).toBe(routeKey(a));
    graph = setPatternRouteOpen(graph, key!, true);
    expect(Object.keys(graph.claims)).toHaveLength(2); expect(patternNodeOpen(graph, node)).toBe(true);
  }
});
it("共有Entity・Claimを別の開いた経路が支える場合は残し、片段の線を作らない", () => {
  let graph = setPatternRouteOpen(setPatternRouteOpen(state(), routeKey(b), true), routeKey(c), true);
  graph = closePatternNode(graph, id(100));
  expect(graph.nodes[id(100)]).toBeDefined(); // isolated reopen handle
  expect(graph.nodes[id(2)]).toBeDefined(); expect(graph.nodes[id(101)]).toBeDefined();
  expect(graph.nodes[id(3)]).toBeUndefined();
  expect(Object.keys(graph.claims).sort()).toEqual([...c.claimIds].sort());
  expect(Object.values(graph.claims).some(claim => claim.subjectId === id(100))).toBe(false);
  graph = setPatternRouteOpen(graph, nextPatternRoute(graph, id(100))!, true);
  expect(Object.keys(graph.claims)).toHaveLength(4);
});
it("最後に閉じた経路を再開し、一覧から開けば対応する再開ハンドルも解消する", () => {
  let graph = setPatternRouteOpen(setPatternRouteOpen(state(), routeKey(b), true), routeKey(a), false);
  graph = closePatternNode(graph, id(100));
  expect(nextPatternRoute(graph, id(100))).toBe(routeKey(b));
  graph = setPatternRouteOpen(graph, routeKey(b), true);
  expect(graph.execution?.type === "pattern" && graph.execution.collapsedNodes?.[id(100)]).toBeUndefined();
});
it("rootを閉じると全経路と孤立ハンドルを畳み、rootを失わない", () => {
  const graph = closePatternNode(closePatternNode(setPatternRouteOpen(state(), routeKey(b), true), id(2)), root.id);
  expect(Object.keys(graph.nodes)).toEqual([root.id]); expect(graph.claims).toEqual({});
  expect(nextPatternRoute(graph, root.id)).toBe(routeKey(b));
});
it("Graph上の再開ともう1本の追加が、経路一覧と同じopen状態を使う", async () => {
  const { result } = renderHook(() => useGraphExplorer());
  act(() => result.current.openWorkspace({ graph: state(), view: null, skippedBranches: 0 }, null));
  for (const node of [root.id, id(100), id(2)]) {
    act(() => result.current.toggleEntity(node)); expect(patternNodeOpen(result.current.graph, node)).toBe(false);
    await act(async () => result.current.toggleEntity(node)); await waitFor(() => expect(patternNodeOpen(result.current.graph, node)).toBe(true));
  }
  await act(async () => result.current.openNextPatternRoute(root.id));
  await waitFor(() => expect(Object.keys(result.current.graph.claims)).toHaveLength(3));
  await act(async () => result.current.togglePatternRoute(routeKey(b)));
  expect(result.current.graph.nodes[id(3)]).toBeUndefined();
});
it("再開前の公開revision検証が失敗した場合は閉じた状態を保つ", async () => {
  const graph = closePatternNode(state(), id(100));
  const { result } = renderHook(() => useGraphExplorer()); act(() => result.current.openWorkspace({ graph, view: null, skippedBranches: 0 }, null));
  fetchMock.mockResolvedValue(response({ dataset: "public-kg", revision: "r2" }));
  await act(async () => result.current.toggleEntity(id(100)));
  expect(result.current.graph.claims).toEqual({}); expect(result.current.dataChanged).toBe(true);
});
it("再開中にrootを閉じた後の遅着応答を採用しない", async () => {
  let release!: (r: Response) => void;
  const graph = closePatternNode(setPatternRouteOpen(state(), routeKey(b), true), id(2));
  const { result } = renderHook(() => useGraphExplorer()); act(() => result.current.openWorkspace({ graph, view: null, skippedBranches: 0 }, null));
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  act(() => result.current.toggleEntity(id(2)));
  act(() => result.current.toggleEntity(root.id));
  await act(async () => release(response({ dataset: "public-kg", revision: "r1" })));
  expect(Object.keys(result.current.graph.nodes)).toEqual([root.id]); expect(result.current.graph.claims).toEqual({});
});
it("再開ハンドルを保存・URLへ保持し、全参照を検証してから復元する", async () => {
  const graph = closePatternNode(state(), id(100)), saved = captureWorkspace("public-kg", "再開", graph, null);
  const decoded = decodeExploration(encodeExploration(saved), root.id, "public-kg");
  expect(decoded.execution).toMatchObject({ collapsedNodes: [{ id: id(100), routeKeys: [routeKey(a)] }] });
  fetchMock.mockImplementation(async url => String(url).includes("paths") ? response({ version: 1, dataset: "public-kg", revision: "r1", relation, root: body.root, nodes: body.nodes, claims: body.claims, operation: "restore", verifiedRoutes: [a, b, c], continuation: { state: "resumable", hasMore: false, nextCursor: null } }) : response({ entity: body.root }));
  const rebuilt = await rebuildWorkspace(decoded, new AbortController().signal);
  expect(rebuilt.graph.nodes).toEqual(graph.nodes); expect(rebuilt.graph.claims).toEqual({});
  expect(nextPatternRoute(rebuilt.graph, id(100))).toBe(routeKey(a));
  const old = { ...saved, execution: { type: "pattern", routes: [{ route: a, open: true }], requiredRouteKey: routeKey(a), candidateBoundary: a } };
  expect(parseWorkspaceBackup(JSON.stringify(old), "public-kg").execution.type).toBe("pattern");
});
it.each(["unknown-node", "unknown-route", "duplicate"])("不正な再開ハンドルを黙って捨てない: %s", mode => {
  const saved = captureWorkspace("public-kg", "再開", closePatternNode(state(), id(100)), null);
  if (saved.execution.type !== "pattern") throw Error();
  const nodes = saved.execution.collapsedNodes!;
  if (mode === "unknown-node") nodes[0].id = id(999);
  if (mode === "unknown-route") nodes[0].routeKeys = [routeKey(route(900, 800))];
  if (mode === "duplicate") nodes.push(nodes[0]);
  expect(() => parseWorkspaceBackup(JSON.stringify(saved), "public-kg")).toThrow();
});
it("再開用Entityも不完全な元Claimでは表示しない", () => {
  const graph = closePatternNode(state(), id(100)); delete graph.cacheClaims[a.claimIds[1]];
  expect(() => projectGraph(graph)).toThrow();
});

it("複数経路を閉じたEntityの再開は一括で行い、上限で一部だけ開かない", () => {
  const other = Array.from({ length: 49 }, (_, n) => route(200 + n, 500 + n)), refs = [a, b, ...other];
  let graph = emptyPatternGraph(root, relation);
  for (let offset = 0; offset < refs.length; offset += 12) graph = mergePatternPage(graph, page(refs.slice(offset, offset + 12), a, offset + 12 < refs.length ? `p${offset + 12}` : null), offset === 0 ? null : `p${offset}`);
  graph = closePatternNode(setPatternRouteOpen(graph, routeKey(b), true), id(100));
  for (const r of other) graph = setPatternRouteOpen(graph, routeKey(r), true);
  expect(Object.keys(graph.nodes)).toHaveLength(100);
  const rejected = setPatternRoutesOpen(graph, [routeKey(a), routeKey(b)], true);
  expect(rejected.execution).toMatchObject({ blocked: true, routes: { [routeKey(a)]: { open: false }, [routeKey(b)]: { open: false } } });
  expect(rejected.nodes).toEqual(graph.nodes); expect(rejected.claims).toEqual(graph.claims);
});
it("閉じた複数経路をEntityから再開すると直前の開閉集合へ戻る", async () => {
  const graph = closePatternNode(setPatternRouteOpen(state(), routeKey(b), true), id(100));
  const { result } = renderHook(() => useGraphExplorer()); act(() => result.current.openWorkspace({ graph, view: null, skippedBranches: 0 }, null));
  await act(async () => result.current.toggleEntity(id(100)));
  await waitFor(() => expect(Object.keys(result.current.graph.claims)).toHaveLength(3));
});
