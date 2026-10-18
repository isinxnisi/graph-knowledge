// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
const created = vi.hoisted(() => ({ cores: [] as import("cytoscape").Core[] }));
vi.mock("cytoscape", async original => {
  const runtime = await original<{ default: (options: import("cytoscape").CytoscapeOptions) => import("cytoscape").Core }>();
  return { default: (options: import("cytoscape").CytoscapeOptions) => {
    const cy = runtime.default({ ...options, container: undefined, headless: true, styleEnabled: true }); created.cores.push(cy); return cy;
  } };
});
import GraphCanvas from "../components/GraphCanvas";
import { emptyPatternGraph, mergePatternPage, setPatternRouteOpen, emptyGraph, mergePage } from "../lib/client/graph-state";
import { freeRelation } from "../lib/client/relation-state";
import { relationConditionKey } from "../lib/domain/relation-conditions";
import { routeKey } from "../lib/domain/pattern-graph";
import { page, relation, root, route } from "./pattern-graph-fixture";
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const computed = globalThis.getComputedStyle;
  vi.spyOn(globalThis, "getComputedStyle").mockImplementation(el => {
    const style = computed(el);
    return new Proxy(style, { get: (target, key) => key === "getPropertyValue" ? (name: string) => name.startsWith("--color-") ? "#334455" : target.getPropertyValue(name) : Reflect.get(target, key) });
  });
});
afterEach(() => { cleanup(); created.cores = []; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("既存Canvasへ完全経路の和集合を渡すと配置し、閉じると共有分だけ残す", () => {
  const a = route(100, 2), b = route(100, 3), graph = mergePatternPage(emptyPatternGraph(root, relation), page([a, b]), null);
  const props = { selection: null, onEntity: vi.fn(), onRelation: vi.fn(), onToggleEntity: vi.fn() };
  const { rerender } = render(<GraphCanvas {...props} graph={graph} />);
  const cy = created.cores[0]; expect(cy.nodes()).toHaveLength(4); expect(cy.edges()).toHaveLength(3);
  expect(new Set(cy.nodes().map(n => JSON.stringify(n.position()))).size).toBe(4);
  rerender(<GraphCanvas {...props} graph={setPatternRouteOpen(graph, routeKey(a), false)} />);
  expect(cy.nodes()).toHaveLength(3); expect(cy.edges()).toHaveLength(2);
});

it("同じ作品で一段からpatternへ適用した時も、新しいNodeを原点へ重ねず配置する", () => {
  const body = page([route(100, 2), route(100, 3)]), adjacent = freeRelation(relation);
  const initial = mergePage({ ...emptyGraph(), relation: adjacent, conditionKey: relationConditionKey(adjacent), roots: [root.id], centerId: root.id, cacheNodes: { [root.id]: root } }, {
    revision: "r1", relation: adjacent, centerId: root.id, nodes: body.nodes.filter(n => n.id === root.id || n.kind === "person"), claims: body.claims.filter(c => c.objectId === root.id), page: { hasMore: false, nextCursor: null },
  });
  const props = { selection: { kind: "entity" as const, id: root.id }, onEntity: vi.fn(), onRelation: vi.fn(), onToggleEntity: vi.fn() };
  const { rerender } = render(<GraphCanvas {...props} graph={initial} />);
  const cy = created.cores[0], rootPoint = { ...cy.getElementById(root.id).position() };
  const graph = mergePatternPage(emptyPatternGraph(root, relation, 1), body, null);
  rerender(<GraphCanvas {...props} graph={graph} />);
  expect(cy.nodes()).toHaveLength(4);
  expect(new Set(cy.nodes().map(n => JSON.stringify(n.position()))).size).toBe(4);
  expect(cy.getElementById(root.id).position()).toEqual(rootPoint);
});
