import { expect, it } from "vitest";
import { emptyGraph, emptyPatternGraph, mergePatternPage, setPatternRouteOpen, closePatternNode, restorePatternGraph, projectGraph, mergePage, graphRootReady } from "../lib/client/graph-state";
import { routeKey } from "../lib/domain/pattern-graph";
import { captureWorkspace } from "../lib/client/saved-workspace";
import { root, id, relation, route, page } from "./pattern-graph-fixture";

it("完全経路の和集合だけを投影し、一方を閉じても共有する人物とClaimは残る", () => {
  const a = route(100, 2), b = route(100, 3);
  let graph = mergePatternPage(emptyPatternGraph(root, relation), page([a, b]), null);
  expect(Object.keys(graph.nodes)).toHaveLength(4); expect(Object.keys(graph.claims)).toHaveLength(3); expect(graph.expansions).toEqual({});
  expect(graphRootReady(graph)).toBe(true); expect(graphRootReady(emptyPatternGraph(root, relation))).toBe(false);
  graph = setPatternRouteOpen(graph, routeKey(a), false);
  expect(Object.keys(graph.nodes).sort()).toEqual([id(1), id(100), id(3)].sort()); expect(Object.keys(graph.claims)).toHaveLength(2);
  graph = setPatternRouteOpen(graph, routeKey(a), true); expect(Object.keys(graph.claims)).toHaveLength(3);
  graph = closePatternNode(graph, id(100)); expect(Object.keys(graph.nodes)).toEqual([root.id]); expect(graph.claims).toEqual({});
});
it("指定証拠が候補外でも表示し、候補境界は指定証拠へ飛ばさない・重複しても閉じた経路を開かない", () => {
  const candidates = Array.from({ length: 12 }, (_, n) => route(100, n + 2)), required = route(900, 800);
  let graph = mergePatternPage(emptyPatternGraph(root, relation), page(candidates, required, "next"), null);
  expect(graph.execution).toMatchObject({ requiredRoute: routeKey(required), candidateBoundary: candidates[11], nextCursor: "next" });
  graph = setPatternRouteOpen(graph, routeKey(required), false);
  graph = mergePatternPage(graph, page([required, route(901, 801)], required), "next");
  expect(graph.execution?.type === "pattern" && graph.execution.routes[routeKey(required)].open).toBe(false);
  expect(graph.nodes[id(900)]).toBeUndefined(); expect(graph.nodes[id(901)]).toBeDefined();
});
it("完全なClaimが欠けた応答・キャッシュを片段表示へ変換しない", () => {
  const a = route(100, 2), response = page([a]), base = emptyPatternGraph(root, relation);
  expect(() => mergePatternPage(base, { ...response, claims: response.claims.slice(0, 1) }, null)).toThrow();
  expect(base.nodes).toEqual({ [root.id]: root });
  const graph = mergePatternPage(base, response, null), broken = { ...graph, cacheClaims: { [response.claims[0].id]: response.claims[0] } };
  expect(() => projectGraph(broken)).toThrow();
  expect(() => mergePage(graph, { centerId: root.id, nodes: response.nodes, claims: response.claims, page: { hasMore: false, nextCursor: null } })).toThrow();
});
it("表示上限ではページ全体を拒否し、cursor・取得済み経路・キャッシュを進めない", () => {
  let graph = emptyPatternGraph(root, relation);
  for (let p = 0; p < 4; p++) {
    const routes = Array.from({ length: 12 }, (_, n) => route(100 + p * 12 + n, 500 + p * 12 + n));
    graph = mergePatternPage(graph, page(routes, route(100, 500), `page${p + 1}`), p === 0 ? null : `page${p}`);
  }
  expect(Object.keys(graph.nodes)).toHaveLength(97);
  const rejected = mergePatternPage(graph, page([route(200, 600), route(201, 601)], route(100, 500)), "page4");
  expect(rejected.execution).toMatchObject({ blocked: true, nextCursor: "page4" }); expect(rejected.cacheNodes).toBe(graph.cacheNodes);
  expect(Object.keys(rejected.nodes)).toHaveLength(97);
  const closed = closePatternNode(rejected, id(100));
  expect(Object.keys(closed.nodes)).toHaveLength(95);
});
it("保持100経路の上限・異なる版／条件／境界の応答を拒否する", () => {
  const a = route(100, 2), response = page([a]); let graph = mergePatternPage(emptyPatternGraph(root, relation), response, null);
  expect(() => mergePatternPage(graph, { ...response, revision: "r2" }, null)).toThrow();
  expect(() => mergePatternPage(graph, response, "not-current")).toThrow();
  const ex = graph.execution; if (ex?.type !== "pattern") throw Error();
  graph = { ...graph, execution: { ...ex, routes: Object.fromEntries(Array.from({ length: 100 }, (_, n) => { const r = route(n + 300, n + 700); return [routeKey(r), { route: r, open: false }]; })) } };
  expect(mergePatternPage(graph, response, null).execution).toMatchObject({ blocked: true });
});
it("restoreは参照と開閉意図を保ち、版変更後の継続は先頭から、旧保存への縮退は禁止", () => {
  const a = route(100, 2), response = page([a]); const graph = setPatternRouteOpen(mergePatternPage(emptyPatternGraph(root, relation), response, null), routeKey(a), false);
  const restored = restorePatternGraph(graph, { version: 1, dataset: "public-kg", revision: "r2", relation, root: response.root, nodes: response.nodes, claims: response.claims, operation: "restore", verifiedRoutes: [a], continuation: { state: "restart" } });
  expect(restored.revision).toBe("r2"); expect(restored.nodes).toEqual({ [root.id]: root }); expect(restored.execution).toMatchObject({ hasMore: true, nextCursor: null });
  expect(() => restorePatternGraph(graph, { version: 1, dataset: "public-kg", revision: "r2", relation, root: response.root, nodes: [root], claims: [], operation: "restore", verifiedRoutes: [], continuation: { state: "restart" } })).toThrow();
  expect(() => captureWorkspace("public-kg", "pattern", graph, null)).toThrow();
  expect(emptyGraph().execution).toEqual({ type: "adjacent" });
});
