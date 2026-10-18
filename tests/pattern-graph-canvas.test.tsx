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
import { emptyPatternGraph, mergePatternPage, setPatternRouteOpen } from "../lib/client/graph-state";
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
