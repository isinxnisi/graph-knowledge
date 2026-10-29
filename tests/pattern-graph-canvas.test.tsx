// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
const created = vi.hoisted(() => ({ cores: [] as import("cytoscape").Core[] }));
vi.mock("cytoscape", async original => {
  const runtime = await original<{ default: (options: import("cytoscape").CytoscapeOptions) => import("cytoscape").Core }>();
  return { default: (options: import("cytoscape").CytoscapeOptions) => {
    const cy = runtime.default({ ...options, container: undefined, headless: true, styleEnabled: true }); created.cores.push(cy); return cy;
  } };
});
import GraphCanvas, { type GraphCanvasHandle } from "../components/GraphCanvas";
import { emptyPatternGraph, mergePatternPage, openPatternNode, closeExpansion, emptyGraph, mergePage } from "../lib/client/graph-state";
import { freeRelation } from "../lib/client/relation-state";
import { relationConditionKey } from "../lib/domain/relation-conditions";
import { page, relation, root, route } from "./pattern-graph-fixture";
function modifierTap(node: import("cytoscape").CollectionReturnValue, originalEvent: { ctrlKey?: boolean; metaKey?: boolean }) {
  // Cytoscape accepts event objects; its external type declaration lists only names.
  const emit = node.emit as unknown as (event: { type: string; originalEvent: typeof originalEvent }) => void;
  emit.call(node, { type: "tap", originalEvent });
}
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
  const a = route(100, 2), b = route(100, 3), graph = openPatternNode(mergePatternPage(emptyPatternGraph(root, relation), page([a, b]), null), a.nodeIds[1]);
  const props = { selection: null, onEntity: vi.fn(), onRelation: vi.fn(), onToggleEntity: vi.fn() };
  const { rerender } = render(<GraphCanvas {...props} graph={graph} />);
  const cy = created.cores[0]; expect(cy.nodes()).toHaveLength(4); expect(cy.edges()).toHaveLength(3);
  expect(new Set(cy.nodes().map(n => JSON.stringify(n.position()))).size).toBe(4);
  rerender(<GraphCanvas {...props} graph={closeExpansion(graph, a.nodeIds[1])} />);
  expect(cy.nodes()).toHaveLength(2); expect(cy.edges()).toHaveLength(1);
});

it("同じ作品で一段からpatternへ適用した時も、新しいNodeを原点へ重ねず配置する", () => {
  const body = page([route(100, 2), route(100, 3)]), adjacent = freeRelation(relation);
  const initial = mergePage({ ...emptyGraph(), relation: adjacent, conditionKey: relationConditionKey(adjacent), roots: [root.id], centerId: root.id, cacheNodes: { [root.id]: root } }, {
    revision: "r1", relation: adjacent, centerId: root.id, nodes: body.nodes.filter(n => n.id === root.id || n.kind === "person"), claims: body.claims.filter(c => c.objectId === root.id), page: { hasMore: false, nextCursor: null },
  });
  const props = { selection: { kind: "entity" as const, id: root.id }, onEntity: vi.fn(), onRelation: vi.fn(), onToggleEntity: vi.fn() };
  const { rerender } = render(<GraphCanvas {...props} graph={initial} />);
  const cy = created.cores[0], rootPoint = { ...cy.getElementById(root.id).position() };
  const graph = openPatternNode(mergePatternPage(emptyPatternGraph(root, relation, 1), body, null), body.routes[1].nodeIds[1]);
  rerender(<GraphCanvas {...props} graph={graph} />);
  expect(cy.nodes()).toHaveLength(4);
  expect(new Set(cy.nodes().map(n => JSON.stringify(n.position()))).size).toBe(4);
  expect(cy.getElementById(root.id).position()).toEqual(rootPoint);
});

it("Ctrl/Metaで最後の選択を解除でき、隣接一覧で選んだ対象へ選択を切り替える", async () => {
  const graph = mergePatternPage(emptyPatternGraph(root, relation), page([route(100, 2)]), null);
  const props = { onEntity: vi.fn(), onInspectEntity: vi.fn(), onRelation: vi.fn(), onToggleEntity: vi.fn() };
  const view = render(<GraphCanvas {...props} graph={graph} selection={{ kind: "entity", id: root.id }} />);
  await act(async () => {});
  const cy = created.cores[0], other = cy.nodes().filter(n => n.id() !== root.id)[0].id();
  await act(async () => { modifierTap(cy.getElementById(root.id), { ctrlKey: true }); });
  expect(cy.$(".chosen").map(e => e.id())).toEqual([root.id]);
  await act(async () => { modifierTap(cy.getElementById(root.id), { metaKey: true }); });
  expect(cy.$(".chosen")).toHaveLength(0); expect(props.onEntity).not.toHaveBeenCalled(); expect(props.onInspectEntity).toHaveBeenCalledTimes(1);
  await act(async () => { view.rerender(<GraphCanvas {...props} graph={graph} selection={{ kind: "entity", id: other }} />); });
  expect(cy.$(".chosen").map(e => e.id())).toEqual([other]);
  await act(async () => { cy.emit("tap"); });
  expect(cy.$(".chosen")).toHaveLength(0);
});

it("探索世代が変わったら移動Undoと内部複数選択を持ち越さない", async () => {
  const graph = mergePatternPage(emptyPatternGraph(root, relation), page([route(100, 2)]), null);
  const props = { selection: null, onEntity: vi.fn(), onRelation: vi.fn(), onToggleEntity: vi.fn() };
  const view = render(<GraphCanvas {...props} graph={graph} />);
  await act(async () => {});
  const cy = created.cores[0], node = cy.getElementById(root.id);
  await act(async () => {
    modifierTap(node, { ctrlKey: true });
    node.emit("grab"); node.position({ x: 500, y: 500 }); node.emit("dragfree");
  });
  expect((screen.getByRole("button", { name: "移動を元に戻す" }) as HTMLButtonElement).disabled).toBe(false);
  await act(async () => { view.rerender(<GraphCanvas {...props} graph={{ ...graph, generation: graph.generation + 1 }} />); });
  expect((screen.getByRole("button", { name: "移動を元に戻す" }) as HTMLButtonElement).disabled).toBe(true); expect(cy.$(".chosen")).toHaveLength(0);
});

it("追加対象を必要な分だけpanして画面に収め、倍率と配置を維持する", async () => {
  const ref = createRef<GraphCanvasHandle>(), graph = mergePatternPage(emptyPatternGraph(root, relation), page([route(100, 2)]), null);
  render(<GraphCanvas ref={ref} graph={graph} selection={null} onEntity={vi.fn()} onRelation={vi.fn()} onToggleEntity={vi.fn()} />);
  await act(async () => {});
  const cy = created.cores[0], node = cy.getElementById(root.id);
  vi.spyOn(cy, "width").mockReturnValue(600); vi.spyOn(cy, "height").mockReturnValue(400);
  await act(async () => { cy.zoom(0.75); cy.pan({ x: 0, y: 0 }); node.position({ x: 1500, y: 1500 }); ref.current!.ensureVisible!(root.id); });
  expect(cy.zoom()).toBe(0.75); expect(node.position()).toEqual({ x: 1500, y: 1500 });
  const bounds = node.renderedBoundingBox(); expect(bounds.x1).toBeGreaterThanOrEqual(28); expect(bounds.y1).toBeGreaterThanOrEqual(28); expect(bounds.x2).toBeLessThanOrEqual(572); expect(bounds.y2).toBeLessThanOrEqual(372);
  const pan = { ...cy.pan() }; await act(async () => ref.current!.ensureVisible!(root.id)); expect(cy.pan()).toEqual(pan);
});
