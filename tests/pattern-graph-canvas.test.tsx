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
import GraphCanvas, { type CanvasContent, type GraphCanvasHandle } from "../components/GraphCanvas";
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

it.each([false, true])("pointer downを挟むダブルクリックでもEntity・関係を直接開く（Capsule=%s）", async contentOnly => {
  const graph = mergePatternPage(emptyPatternGraph(root, relation), page([route(100, 2)]), null);
  const onEntityDoubleClick = vi.fn(), onRelationDoubleClick = vi.fn();
  render(<GraphCanvas graph={graph} contentOnly={contentOnly} selection={null} onEntity={vi.fn()} onRelation={vi.fn()} onToggleEntity={vi.fn()} onEntityDoubleClick={onEntityDoubleClick} onRelationDoubleClick={onRelationDoubleClick} />);
  const cy = created.cores[0];
  async function doubleTap(element: import("cytoscape").NodeSingular | import("cytoscape").EdgeSingular) {
    for (const timeStamp of [100, 200]) await act(async () => {
      // A real node press emits grab even without any pointer movement.
      if (element.isNode()) element.emit("grab");
      const emit = element.emit as unknown as (event: object) => void;
      emit.call(element, { type: "tap", originalEvent: { timeStamp } });
      if (element.isNode()) element.emit("free");
    });
  }
  await doubleTap(cy.nodes()[0]); expect(onEntityDoubleClick).toHaveBeenCalledWith(cy.nodes()[0].id());
  await doubleTap(cy.edges()[0]); expect(onRelationDoubleClick).toHaveBeenCalledWith(cy.edges()[0].id());
});

it.each([false, true])("native touchのダブルタップはEntity・関係で揃い、中断・ピンチ・移動を編集と混同しない（Capsule=%s）", async contentOnly => {
  const graph = mergePatternPage(emptyPatternGraph(root, relation), page([route(100, 2)]), null);
  const onEntityDoubleClick = vi.fn(), onRelationDoubleClick = vi.fn(), onToggleEntity = vi.fn();
  render(<GraphCanvas graph={graph} contentOnly={contentOnly} selection={null} onEntity={vi.fn()} onRelation={vi.fn()} onToggleEntity={onToggleEntity} onEntityDoubleClick={onEntityDoubleClick} onRelationDoubleClick={onRelationDoubleClick} />);
  const cy = created.cores[0], surface = screen.getByTestId("graph-canvas"), node = cy.nodes()[0], edge = cy.edges()[0];
  const finger = (identifier = 1, clientX = 100) => ({ identifier, clientX, clientY: 100 }) as Touch;
  const touch = (type: string, timeStamp: number, touches: Touch[], changedTouches = touches) => {
    const event = new TouchEvent(type, { bubbles: true, touches, changedTouches });
    Object.defineProperty(event, "timeStamp", { value: timeStamp }); surface.dispatchEvent(event); return event;
  };
  const emit = (element: typeof node | typeof edge, type: string, originalEvent: Event) => (element.emit as unknown as (event: object) => void).call(element, { type, originalEvent });
  const tap = async (element: typeof node | typeof edge, time: number, interruption?: "cancel" | "pinch" | "drag") => act(async () => {
    const start = touch("touchstart", time, [finger()]);
    if (element.isNode()) emit(element, "grab", start);
    emit(element, "touchstart", start);
    if (interruption === "cancel") touch("touchcancel", time + 10, [], [finger()]);
    if (interruption === "pinch") touch("touchstart", time + 10, [finger(), finger(2, 150)]);
    if (interruption === "drag") { touch("touchmove", time + 10, [finger(1, 125)]); emit(element, "drag", start); }
    const end = touch("touchend", time + 30, [], [finger()]);
    if (element.isNode()) emit(element, "free", end);
    emit(element, "touchend", end);
    // A cancelled/pinched sequence must stay harmless even if a stale renderer
    // tap arrives. Real Cytoscape normally omits it after a successful drag.
    emit(element, "tap", end);
  });
  await tap(node, 100); await tap(node, 450); expect(onEntityDoubleClick).toHaveBeenCalledExactlyOnceWith(node.id());
  await tap(edge, 1000); await tap(edge, 1350); expect(onRelationDoubleClick).toHaveBeenCalledExactlyOnceWith(edge.id());
  for (const interruption of ["cancel", "pinch", "drag"] as const) {
    onEntityDoubleClick.mockClear(); onRelationDoubleClick.mockClear();
    await tap(node, 2000); await tap(node, 2100, interruption); await tap(node, 2200);
    expect(onEntityDoubleClick).not.toHaveBeenCalled();
    await tap(edge, 2600); await tap(edge, 2700, interruption); await tap(edge, 2800);
    expect(onRelationDoubleClick).not.toHaveBeenCalled();
  }
  expect(onToggleEntity).not.toHaveBeenCalled();
});

it("自由テキストの直接編集はダブルクリックで開き、実ドラッグではクリック列をリセットする", async () => {
  const open = vi.fn(), graph = emptyGraph();
  render(<GraphCanvas graph={graph} contentOnly content={{ nodes: [{ id: "text", kind: "text", label: "図の説明" }], relations: {} }} selection={null} onEntity={vi.fn()} onRelation={vi.fn()} onToggleEntity={vi.fn()} onEntityDoubleClick={open} />);
  const node = created.cores[0].getElementById("text");
  const tap = async (timeStamp: number) => act(async () => {
    node.emit("grab");
    (node.emit as unknown as (event: object) => void).call(node, { type: "tap", originalEvent: { timeStamp } });
    node.emit("free");
  });
  await tap(100);
  await act(async () => { node.emit("grab"); node.position({ x: 80, y: 90 }); node.emit("drag"); node.emit("dragfree"); });
  await tap(200); expect(open).not.toHaveBeenCalled();
  await tap(250); expect(open).toHaveBeenCalledExactlyOnceWith("text");
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

it("関係チップのtouch由来clickにも線本体と同じダブルタップ間隔を使う", async () => {
  const graph = mergePatternPage(emptyPatternGraph(root, relation), page([route(100, 2)]), null), open = vi.fn();
  render(<GraphCanvas graph={graph} contentOnly selection={null} onEntity={vi.fn()} onRelation={vi.fn()} onToggleEntity={vi.fn()} onRelationDoubleClick={open} />);
  await act(async () => { created.cores[0].emit("render"); });
  const badge = document.querySelector<HTMLButtonElement>("[data-relation-id]")!;
  for (const timeStamp of [100, 450]) {
    const event = new MouseEvent("click", { bubbles: true });
    Object.defineProperties(event, { pointerType: { value: "touch" }, timeStamp: { value: timeStamp } });
    fireEvent(badge, event);
  }
  expect(open).toHaveBeenCalledExactlyOnceWith(badge.dataset.relationId);
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

it("独自関係の向き反転・相互追加・Undoの世代復元で端点だけを更新し、配置と視点を保つ", async () => {
  const ref = createRef<GraphCanvasHandle>(), graph = emptyGraph();
  const nodes = [{ id: "a", kind: "local", label: "A" }, { id: "b", kind: "local", label: "B" }];
  const relation = { id: "local", subjectId: "a", objectId: "b", claimIds: [], polarity: "affirmed" as const, label: "関連", canvasLabel: "関連", badge: "独自" };
  const props = { ref, contentOnly: true, selection: null, onEntity: vi.fn(), onRelation: vi.fn(), onToggleEntity: vi.fn() };
  const initial = { positions: { a: { x: 100, y: 120 }, b: { x: 380, y: 250 } }, pan: { x: 15, y: 20 }, zoom: .7, initialLayoutDone: true };
  const view = render(<GraphCanvas {...props} graph={graph} content={{ nodes, relations: { local: relation } }} restoration={{ generation: graph.generation, view: initial }} />);
  const cy = created.cores[0], before = ref.current!.capture()!;
  expect(cy.getElementById("local").source().id()).toBe("a");
  const reversed = { ...relation, subjectId: "b", objectId: "a" };
  const reverseCopy = { ...relation, id: "other-direction" };
  await act(async () => view.rerender(<GraphCanvas {...props} graph={{ ...graph, generation: graph.generation + 1 }} content={{ nodes, relations: { local: reversed, "other-direction": reverseCopy } }} restoration={{ generation: graph.generation + 1, view: before }} />));
  expect(cy.getElementById("local").source().id()).toBe("b");
  expect(cy.getElementById("local").target().id()).toBe("a");
  expect(cy.getElementById("other-direction").source().id()).toBe("a");
  expect(cy.getElementById("other-direction").target().id()).toBe("b");
  expect(ref.current!.capture()).toEqual(before);
  await act(async () => view.rerender(<GraphCanvas {...props} graph={{ ...graph, generation: graph.generation + 2 }} content={{ nodes, relations: { local: relation } }} restoration={{ generation: graph.generation + 2, view: before }} />));
  expect(cy.edges()).toHaveLength(1);
  expect(cy.getElementById("local").source().id()).toBe("a");
  expect(cy.getElementById("local").target().id()).toBe("b");
  expect(ref.current!.capture()).toEqual(before);
});

it("形の変更と標準への復帰を描画し、独自Entityは実線で示して分類バッジと位置を保つ", async () => {
  const ref = createRef<GraphCanvasHandle>(), graph = emptyGraph();
  const nodes: CanvasContent["nodes"] = [
    { id: "local", kind: "local", label: "独自の主役", badge: "考察", shape: "circle" },
    { id: "kg", kind: "organization", label: "長い名称が四行になる場合にも枠の内側に読める形を保つ", shape: "diamond" },
  ];
  const props = { ref, graph, contentOnly: true, selection: null, onEntity: vi.fn(), onRelation: vi.fn(), onToggleEntity: vi.fn() };
  const view = render(<GraphCanvas {...props} content={{ nodes, relations: {} }} />);
  const cy = created.cores[0], local = cy.getElementById("local"), kg = cy.getElementById("kg");
  expect(local.style("shape")).toBe("ellipse"); expect(local.style("border-style")).toBe("solid"); expect(local.width()).toBe(local.height());
  expect(kg.style("shape")).toBe("diamond"); expect(kg.data("kind")).toBe("organization");
  await act(async () => { cy.zoom(.7); cy.pan({ x: 10, y: 20 }); local.position({ x: 180, y: 160 }); cy.emit("render"); });
  const before = ref.current!.capture()!, badge = document.querySelector<HTMLSpanElement>('[data-node-id="local"]')!;
  expect(badge.textContent).toBe("考察");
  expect(parseFloat(badge.style.top)).toBeCloseTo(local.renderedPosition().y + local.outerHeight() * cy.zoom() / 2 + 4 * cy.zoom());
  await act(async () => view.rerender(<GraphCanvas {...props} content={{ nodes: nodes.map(n => ({ ...n, shape: undefined })), relations: {} }} />));
  expect(local.style("shape")).toBe("round-rectangle"); expect(local.style("border-style")).toBe("solid");
  expect(kg.style("shape")).toBe("hexagon"); expect(ref.current!.capture()).toEqual(before);
});

it("通常Graphでは意味ごとの従来の形と寸法を変更しない", () => {
  const nodes = { person: { id: "person", kind: "person" as const, name: "人物", description: null }, work: { id: "work", kind: "work" as const, name: "作品", description: null }, organization: { id: "organization", kind: "organization" as const, name: "組織", description: null } };
  render(<GraphCanvas graph={{ ...emptyGraph(), nodes }} selection={null} onEntity={vi.fn()} onRelation={vi.fn()} onToggleEntity={vi.fn()} />);
  const cy = created.cores[0];
  expect(cy.getElementById("person").style("shape")).toBe("ellipse"); expect(cy.getElementById("work").style("shape")).toBe("round-rectangle"); expect(cy.getElementById("organization").style("shape")).toBe("hexagon");
  cy.nodes().forEach(node => { expect(node.width()).toBe(116); expect(node.height()).toBe(64); expect(node.data("hasPresentationShape")).toBe(0); });
});
