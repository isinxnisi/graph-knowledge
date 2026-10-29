// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

it("右クリックは既存の複数選択を維持し、背景の図座標とキーボードから同じメニューへ届く", async () => {
  const graph = mergePatternPage(emptyPatternGraph(root, relation), page([route(100, 2)]), null);
  const ids = Object.keys(graph.nodes).slice(0, 2), onSelectionChange = vi.fn(), onContextMenu = vi.fn();
  render(<GraphCanvas graph={graph} contentOnly selectedKeys={ids} onSelectionChange={onSelectionChange} onContextMenu={onContextMenu} selection={{ kind: "entity", id: ids[0] }} onEntity={vi.fn()} onRelation={vi.fn()} onToggleEntity={vi.fn()} />);
  const cy = created.cores[0];
  await act(async () => {
    cy.zoom(0.5); cy.pan({ x: 10, y: 20 });
    const emit = cy.getElementById(ids[0]).emit as unknown as (event: object) => void;
    emit.call(cy.getElementById(ids[0]), { type: "cxttap", originalEvent: { clientX: 80, clientY: 100 } });
  });
  expect(onSelectionChange).not.toHaveBeenCalled();
  expect(onContextMenu).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "node", id: ids[0], selectedKeys: ids, position: { x: 140, y: 160 }, source: "pointer" }));
  fireEvent.keyDown(screen.getByTestId("graph-canvas"), { key: "F10", shiftKey: true });
  expect(onContextMenu).toHaveBeenLastCalledWith(expect.objectContaining({ selectedKeys: ids, source: "keyboard" }));
  await act(async () => { (cy.emit as unknown as (event: object) => void)({ type: "cxttap", originalEvent: { clientX: 50, clientY: 60 } }); });
  expect(onContextMenu).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "background", selectedKeys: ids, position: { x: 80, y: 80 } }));
});

it("選択した対象とテキストのまとめ移動を一度の操作として通知する", async () => {
  const graph = emptyGraph(), onMove = vi.fn();
  const nodes = [{ id: "entity", kind: "local", label: "対象", badge: "分類" }, { id: "text", kind: "text", label: "図の説明です。長い文章も折り返して表示します。", textFormat: { width: 120, fontSize: 20, align: "left" as const } }];
  render(<GraphCanvas graph={graph} contentOnly content={{ nodes, relations: {} }} selectedKeys={["entity", "text"]} selection={null} onMove={onMove} onEntity={vi.fn()} onRelation={vi.fn()} onToggleEntity={vi.fn()} />);
  const cy = created.cores[0], entity = cy.getElementById("entity"), text = cy.getElementById("text");
  const before = { ...entity.position() }, beforeText = { ...text.position() };
  await act(async () => { entity.emit("grab"); entity.position({ x: before.x + 80, y: before.y - 20 }); entity.emit("drag"); entity.emit("dragfree"); });
  expect(text.position()).toEqual({ x: beforeText.x + 80, y: beforeText.y - 20 });
  expect(onMove).toHaveBeenCalledTimes(1);
  expect(onMove.mock.calls[0][0].positions.entity).toEqual(before); expect(onMove.mock.calls[0][1].positions.text).toEqual(text.position());
  expect(text.width()).toBe(120); expect(text.height()).toBeGreaterThan(80); expect(text.data("label")).toContain("\n");
  expect(entity.data("label")).toBe("対象"); expect(entity.data("badge")).toBe("分類");
});

it("CapsuleのダブルクリックはEntity・テキスト・関係の直接編集へ渡す", async () => {
  const graph = mergePatternPage(emptyPatternGraph(root, relation), page([route(100, 2)]), null);
  const onEntityDoubleClick = vi.fn(), onRelationDoubleClick = vi.fn();
  render(<GraphCanvas graph={graph} contentOnly selection={null} onEntity={vi.fn()} onRelation={vi.fn()} onToggleEntity={vi.fn()} onEntityDoubleClick={onEntityDoubleClick} onRelationDoubleClick={onRelationDoubleClick} />);
  const cy = created.cores[0];
  async function doubleTap(element: import("cytoscape").NodeSingular | import("cytoscape").EdgeSingular) {
    await act(async () => { const emit = element.emit as unknown as (event: object) => void; emit.call(element, { type: "tap", originalEvent: { timeStamp: 100 } }); emit.call(element, { type: "tap", originalEvent: { timeStamp: 200 } }); });
  }
  await doubleTap(cy.nodes()[0]); expect(onEntityDoubleClick).toHaveBeenCalledWith(cy.nodes()[0].id());
  await doubleTap(cy.edges()[0]); expect(onRelationDoubleClick).toHaveBeenCalledWith(cy.edges()[0].id());
});

it.each([false, true])("関係チップも線本体と同じCtrl/Meta・複数選択操作を保つ（Capsule=%s）", async contentOnly => {
  const graph = mergePatternPage(emptyPatternGraph(root, relation), page([route(100, 2)]), null), onSelectionChange = vi.fn();
  render(<GraphCanvas graph={graph} contentOnly={contentOnly} selection={null} onSelectionChange={onSelectionChange} onEntity={vi.fn()} onRelation={vi.fn()} onToggleEntity={vi.fn()} />);
  const cy = created.cores[0], ids = cy.nodes().slice(0, 2).map(node => node.id());
  await act(async () => {});
  await act(async () => { ids.forEach(id => modifierTap(cy.getElementById(id), { ctrlKey: true })); cy.emit("render"); });
  const badge = document.querySelector<HTMLButtonElement>("[data-relation-id]");expect(badge).toBeTruthy();
  const edgeId = badge!.dataset.relationId!;
  fireEvent.click(badge!, { ctrlKey: true });expect(onSelectionChange).toHaveBeenLastCalledWith([...ids, edgeId]);
  fireEvent.click(badge!, { metaKey: true });expect(onSelectionChange).toHaveBeenLastCalledWith(ids);
  fireEvent.click(screen.getByRole("button", { name: "複数選択" }));
  fireEvent.click(badge!);expect(onSelectionChange).toHaveBeenLastCalledWith([...ids, edgeId]);
});

it("空文書から復元した最初の対象を配置済みとし、後の追加で既存配置や倍率を動かさない", async () => {
  const ref = createRef<GraphCanvasHandle>(), graph = emptyGraph();
  const props = { ref, contentOnly: true, selection: null, onEntity: vi.fn(), onRelation: vi.fn(), onToggleEntity: vi.fn() };
  const restoration = { generation: graph.generation, view: { positions: {}, pan: { x: 0, y: 0 }, zoom: 1, initialLayoutDone: false } };
  const view = render(<GraphCanvas {...props} graph={graph} content={{ nodes: [], relations: {} }} restoration={restoration} />);
  const node = { id: "first", label: "最初の対象", kind: "local" };
  await act(async () => view.rerender(<GraphCanvas {...props} graph={{ ...graph, generation: graph.generation + 1 }} content={{ nodes: [node], relations: {} }} restoration={{ ...restoration, generation: graph.generation + 1 }} />));
  const cy = created.cores[0];
  expect(ref.current!.capture()!.initialLayoutDone).toBe(true);
  await act(async () => { cy.getElementById("first").position({ x: 80, y: 110 }); cy.zoom(0.8); });
  await act(async () => view.rerender(<GraphCanvas {...props} graph={{ ...graph, generation: graph.generation + 1 }} content={{ nodes: [node, { id: "second", label: "追加", kind: "local" }], relations: {} }} restoration={{ ...restoration, generation: graph.generation + 1 }} />));
  expect(cy.getElementById("first").position()).toEqual({ x: 80, y: 110 }); expect(cy.zoom()).toBe(0.8);
  expect(cy.getElementById("second").position()).not.toEqual(cy.getElementById("first").position());
});
