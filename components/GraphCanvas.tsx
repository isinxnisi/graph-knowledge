"use client";
import Icon from "./Icon";
import { useUiLocale } from "../lib/client/ui-locale";
import { explorerLabels } from "../lib/i18n/explorer";

import { contributionLabels } from "../lib/i18n/contribution";
import { entryLabels } from "../lib/i18n/exploration-entry";
import { graphViewportLabels } from "../lib/i18n/graph-viewport";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ReactNode, Ref } from "react";
import { restorationPan, restorationPositions, viewportCenter } from "../lib/client/graph-view";
import { CAPSULE_TEXT_FONT, capsuleTextFormat, capsuleTextLayout, type CanvasTextFormat } from "../lib/client/capsule-text-layout";
import { capsuleNodeShapeLayout } from "../lib/client/capsule-node-layout";
import type { CapsuleNodeShape } from "../lib/domain/capsule-document";
import type { GraphView, ViewRestoration } from "../lib/client/graph-view";
export type GraphCanvasHandle = { capture: () => GraphView | null; focusEntity: (id: string) => void; ensureVisible?: (id: string) => void; focus?: () => void };
import type { GraphState, Selection } from "../lib/client/graph-state";
import { graphRootReady } from "../lib/client/graph-state";
import { entityLabel, edgeRoutes, displayRelations, relationId, type CanvasRelation } from "../lib/client/graph-presentation";
import { initialPositions, additionalPositions, contentPositions } from "../lib/client/graph-layout";
import { attachGraphTouchInput, createNodeClickHandler, createRelationClickHandler, GRAPH_INTERACTION_DEFAULTS, isGraphTouchEvent } from "../lib/client/graph-interaction";
import { attachGraphBadges } from "../lib/client/graph-badges";
import { createGraphMotion } from "../lib/client/graph-motion";
import styles from "./Explorer.module.css";
import AnimatedDetails from "./AnimatedDetails";
import NeighborLoading from "./NeighborLoading";

export type CanvasContent = { nodes: { id: string; label: string; kind: string; badge?: string; shape?: CapsuleNodeShape; textStyle?: string; textFormat?: CanvasTextFormat }[]; relations: Record<string, CanvasRelation> };
export type GraphContextMenuRequest = {
  kind: "node" | "edge" | "background"; id?: string; selectedKeys: string[];
  clientX: number; clientY: number; position: { x: number; y: number }; source: "pointer" | "keyboard";
};
const noSelection: string[] = [];
type Props = { onInspectEntity?: (id: string) => void; content?: CanvasContent; selectedKeys?: string[]; onSelectionChange?: (ids: string[]) => void; onMove?: (before: GraphView, after: GraphView) => void; onContextMenu?: (request: GraphContextMenuRequest) => void; compactGuide?: boolean; fillHeight?: boolean; footerAction?: ReactNode; onViewChange?: () => void; contentOnly?: boolean; ref?: Ref<GraphCanvasHandle>; notification?: ReactNode; feedback?: ReactNode; navigation?: ReactNode; restoration?: ViewRestoration | null; interactionBlocked?: boolean; graph: GraphState; selection: Selection; onEntity: (id: string) => void; onRelation: (id: string) => void; onRelationDoubleClick?: (id: string) => void; onToggleEntity: (id: string) => void; onEntityDoubleClick?: (id: string) => void };

export default function GraphCanvas({ onInspectEntity, content, selectedKeys, onSelectionChange, onMove, onContextMenu, compactGuide = false, fillHeight = false, footerAction, onViewChange, contentOnly = false, ref, feedback, notification, navigation, restoration, interactionBlocked, graph, selection, onEntity, onRelation, onRelationDoubleClick, onToggleEntity, onEntityDoubleClick }: Props) {
  const { locale } = useUiLocale();
  const ui = explorerLabels(locale);
  const viewportLabels = graphViewportLabels(locale);
  const [zoom, setZoom] = useState(1);
  // null follows the surrounding detail selection; [] explicitly clears it.
  const [multiple, setMultiple] = useState<string[] | null>(null), [selectionMode, setSelectionMode] = useState(false);
  const [movementCounts, setMovementCounts] = useState({ past: 0, future: 0 });
  const movementHistory = useRef<{ past: GraphView[]; future: GraphView[] }>({ past: [], future: [] });
  const currentKeys = selectedKeys ?? multiple ?? noSelection;
  const canvasOptions = useRef({ contentOnly, content, currentKeys, selectionMode, onSelectionChange, onMove, onContextMenu, interactionBlocked });
  useEffect(() => { canvasOptions.current = { contentOnly, content, currentKeys, selectionMode, onSelectionChange, onMove, onContextMenu, interactionBlocked }; });
  const viewChange = useRef(onViewChange);
  useEffect(() => { viewChange.current = onViewChange; }, [onViewChange]);
  const container = useRef<HTMLDivElement>(null);
  const badgeLayer = useRef<HTMLDivElement>(null);
  const core = useRef<Core | null>(null);
  const motion = useRef<ReturnType<typeof createGraphMotion> | null>(null);
  const handlers = useRef({ onInspectEntity, onEntity, onRelation, onRelationDoubleClick, onToggleEntity, onEntityDoubleClick, selection });
  const gestures = useRef<ReturnType<typeof createNodeClickHandler> | null>(null);
  const relationGestures = useRef<ReturnType<typeof createRelationClickHandler> | null>(null);
  const contentGestures = useRef<ReturnType<typeof createRelationClickHandler> | null>(null);
  const touchInput = useRef<ReturnType<typeof attachGraphTouchInput> | null>(null);
  function cancelGestures() {
    gestures.current?.cancel(); relationGestures.current?.cancel(); contentGestures.current?.cancel(); touchInput.current?.cancel();
  }
  const generation = useRef(-1);
  const previousCenter = useRef<string | null>(null);
  const previousCondition = useRef("all");
  const savedPositions = useRef<Record<string, { x: number; y: number }>>({});
  const initialLayoutDone = useRef(false);
  const viewportSize = useRef<{ width: number; height: number } | null>(null);
  const textMeasurement = useRef<CanvasRenderingContext2D | null>(null);
  function resizeCanvas() {
    const cy = core.current;
    if (!cy) return;
    const before = viewportSize.current, pan = { ...cy.pan() }, zoom = cy.zoom();
    cy.resize();
    const after = { width: cy.width(), height: cy.height() };
    if (after.width <= 0 || after.height <= 0) return;
    if (initialLayoutDone.current && before && (before.width !== after.width || before.height !== after.height)) {
      cy.pan(restorationPan({ pan, zoom, center: viewportCenter(pan, zoom, before) }, after));
    }
    viewportSize.current = after;
  }
  function captureView(): GraphView | null {
    const cy = core.current;
    if (!cy) return null;
    const viewport = { width: cy.width(), height: cy.height() }, pan = { ...cy.pan() }, zoom = cy.zoom();
    return { positions: Object.fromEntries(cy.nodes().map(n => [n.id(), { ...n.position() }])), pan, zoom, initialLayoutDone: initialLayoutDone.current,
      ...(viewport.width > 0 && viewport.height > 0 && { viewport, center: viewportCenter(pan, zoom, viewport) }) };
  }
  function restoreMovement(direction: "past" | "future") {
    const cy = core.current, view = movementHistory.current[direction].pop(), current = captureView();
    if (!cy || !view || !current) return;
    movementHistory.current[direction === "past" ? "future" : "past"].push(current);
    cy.batch(() => Object.entries(view.positions).forEach(([id, point]) => cy.getElementById(id).position(point)));
    viewChange.current?.(); setMovementCounts({ past: movementHistory.current.past.length, future: movementHistory.current.future.length });
  }
  const hasNodes = content ? content.nodes.length > 0 : Object.keys(graph.nodes).length > 0;
  const selectedId = selection?.kind === "claim"
    ? graph.claims[selection.id] && relationId(graph.claims[selection.id])
    : selection?.id;
  const canFocusSelection = !!selectedId && (selection?.kind === "entity"
    ? (content ? content.nodes.some(n => n.id === selectedId) : !!graph.nodes[selectedId])
    : !!(content?.relations ?? displayRelations(graph.claims, locale))[selectedId]);
  function changeZoom(factor: number) {
    const cy = core.current;
    if (!cy || !hasNodes || interactionBlocked) return;
    cancelGestures();
    resizeCanvas();
    cy.zoom({ level: Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * factor)),
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }
  function showSelection() {
    const cy = core.current;
    if (!cy || !selectedId || interactionBlocked) return;
    const selected = cy.getElementById(selectedId);
    if (!selected.length) return;
    cancelGestures();
    resizeCanvas();
    if (selection?.kind === "entity") {
      cy.zoom(Math.max(1, cy.zoom()));
      cy.center(selected);
    } else {
      const elements = selected.union(selected.connectedNodes());
      cy.fit(elements, 40);
      cy.zoom(Math.min(1.15, cy.zoom()));
      cy.center(elements);
    }
  }
  useImperativeHandle(ref, () => ({ capture: () => {
    const cy = core.current;
    if (!cy) return null;
    const positions = { ...savedPositions.current };
    cy.nodes().forEach((node) => { positions[node.id()] = { ...node.position() }; });
    return { ...captureView()!, positions };
  }, focusEntity: (id) => {
    const cy = core.current;
    if (!cy) return;
    const node = cy.getElementById(id);
    if (!node.length || !node.isNode()) return;
    cancelGestures();
    resizeCanvas();
    cy.zoom(Math.max(1, cy.zoom()));
    cy.center(node);
  }, ensureVisible: (id) => {
    const cy = core.current, node = cy?.getElementById(id);
    if (!cy || !node?.length) return;
    resizeCanvas();
    const bounds = node.renderedBoundingBox(), padding = 28;
    const shift = (start: number, end: number, size: number) => end - start > size - padding * 2
      ? size / 2 - (start + end) / 2 : start < padding ? padding - start : end > size - padding ? size - padding - end : 0;
    const delta = { x: shift(bounds.x1, bounds.x2, cy.width()), y: shift(bounds.y1, bounds.y2, cy.height()) };
    if (delta.x || delta.y) cy.panBy(delta);
  }, focus: () => container.current?.focus({ preventScroll: true }) }), []);
  useEffect(() => {
    if (selectedKeys !== undefined) return;
    // A selection made in an adjacent list replaces the previous canvas group.
    queueMicrotask(() => {
      if (!selectedId || !canvasOptions.current.currentKeys.includes(selectedId)) setMultiple(null);
    });
  }, [selectedId, selectedKeys]);
  useEffect(() => { if (interactionBlocked) cancelGestures(); }, [interactionBlocked]);
  useEffect(() => { handlers.current = { onInspectEntity, onEntity, onRelation, onRelationDoubleClick, onToggleEntity, onEntityDoubleClick, selection }; }, [onInspectEntity, onEntity, onRelation, onRelationDoubleClick, onToggleEntity, onEntityDoubleClick, selection]);
  useEffect(() => { cancelGestures(); }, [graph.generation]);
  useEffect(() => { gestures.current?.selectionChanged(selection?.kind === "entity" ? selection.id : null); }, [selection?.kind, selection?.id]);
  const selectedOpen = selection?.kind === "entity" ? graph.expansions[selection.id]?.open : undefined;
  useEffect(() => { gestures.current?.cancelPending(); }, [selectedOpen]);

  useEffect(() => {
    if (!container.current) return;
    const themeStyles = (): cytoscape.StylesheetStyle[] => {
      const theme = getComputedStyle(container.current!);
      const color = (name: string) => theme.getPropertyValue(`--color-${name}`).trim();
      return [
        { selector: "node", style: { label: "data(label)", "background-color": color("person"), color: color("text"), "border-width": 1.3, "border-color": color("node-border"), width: 116, height: "data(nodeHeight)", "font-size": 15, "font-weight": 600, "font-family": "system-ui, sans-serif", "text-valign": "center", "text-halign": "center", "text-wrap": "wrap", "text-max-width": "108px", "text-overflow-wrap": "anywhere" } },
        { selector: 'node[kind="work"]', style: { shape: "round-rectangle", "background-color": color("work") } },
        { selector: 'node[kind="organization"]', style: { shape: "hexagon", "background-color": color("organization") } },
        { selector: 'node[kind="local"]', style: { shape: "round-rectangle", "background-color": color("panel"), "border-style": "solid" } },
        { selector: 'node[kind="text"]', style: { shape: "round-rectangle", "background-opacity": 0, "border-width": 0, width: "data(textWidth)", height: "data(textHeight)", "text-max-width": "data(textWidth)", "font-size": "data(textFontSize)", "font-weight": (node: cytoscape.NodeSingular) => node.data("textFontWeight") as 400 | 700, "text-justification": (node: cytoscape.NodeSingular) => node.data("textAlign") as "left" | "center" | "right", "text-margin-x": (node: cytoscape.NodeSingular) => Number(node.data("textMarginX")), "line-height": 1.35, "text-overflow-wrap": "whitespace" } },
        { selector: 'node[textStyle="muted"]', style: { "text-opacity": 0.65 } },
        { selector: "node.hovered", style: { "border-color": color("accent"), "underlay-color": color("accent"), "underlay-opacity": 0.08, "underlay-padding": 5 } },
        { selector: "node.center", style: { "border-width": 3, "border-color": color("accent") } },
        { selector: 'node[kind="event"]', style: { shape: "diamond", "background-color": color("work") } },
        { selector: 'node[hasPresentationShape = 1]', style: { shape: (node: cytoscape.NodeSingular) => node.data("presentationShape") as cytoscape.Css.NodeShape, width: "data(shapeWidth)", height: "data(shapeHeight)" } },
        { selector: "edge", style: { label: "data(canvasLabel)", color: color("text"), "curve-style": "unbundled-bezier", "control-point-distances": "data(distance)", "control-point-weights": "data(weight)", "target-arrow-shape": "triangle", "source-arrow-shape": "none", "arrow-scale": 1.2, "line-color": color("edge"), "target-arrow-color": color("edge"), width: 1.7, "font-size": 14, "text-margin-y": (edge: cytoscape.EdgeSingular) => Number(edge.data("labelOffset")), "text-background-color": color("panel"), "text-background-opacity": 1, "text-background-padding": "5px", "text-background-shape": "roundrectangle", "text-wrap": "wrap", "text-max-width": "165px", "text-overflow-wrap": "anywhere", "text-events": "yes" } },
        { selector: 'edge[polarity="denied"]', style: { "line-style": "dashed", "line-color": color("denied"), "target-arrow-color": color("denied") } },
        { selector: 'edge[polarity="mixed"]', style: { "line-style": "dotted" } },
        { selector: "node[expanded = 1]", style: { "border-style": "double", "border-width": 4 } },
        { selector: "node.added", style: { "underlay-color": color("new-node"), "underlay-opacity": 0.25, "underlay-padding": 10 } },
        { selector: "node.chosen", style: { "border-width": 5, "border-color": color("accent-strong"), "underlay-color": color("accent-strong"), "underlay-opacity": 0.12, "underlay-padding": 8 } },
        { selector: 'node[kind="text"].chosen', style: { "border-width": 1.5, "border-style": "dashed", "background-color": color("accent-soft"), "background-opacity": 0.25, "underlay-opacity": 0 } },
        { selector: 'node[kind="text"].hovered', style: { "border-width": 1, "border-style": "dashed", "underlay-opacity": 0 } },
        { selector: "edge.chosen", style: { "line-color": color("accent-strong"), "target-arrow-color": color("accent-strong"), width: 4, "text-background-color": color("accent-soft"), "z-index": 10 } },
      ];
    };
    const cy = cytoscape({
      container: container.current, elements: [], layout: { name: "preset" },
      minZoom: 0.15, maxZoom: 2, style: themeStyles(), autounselectify: true, boxSelectionEnabled: false,
      touchTapThreshold: GRAPH_INTERACTION_DEFAULTS.touchTapTravel,
    });
    const themeObserver = new MutationObserver(() => cy.style(themeStyles()));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    core.current = cy;
    viewportSize.current = { width: cy.width(), height: cy.height() };
    motion.current = createGraphMotion(cy, window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null);
    const updateZoom = () => setZoom(cy.zoom());
    cy.on("zoom", updateZoom);
    cy.on("dragfree zoom pan layoutstop", () => viewChange.current?.());
    const clicks = createNodeClickHandler({
      isSelected: (id) => handlers.current.selection?.kind === "entity" && handlers.current.selection.id === id,
      select: (id) => handlers.current.onEntity(id), toggle: (id) => handlers.current.onToggleEntity(id),
      doubleClick: (id) => handlers.current.onEntityDoubleClick?.(id),
    });
    const relationClicks = createRelationClickHandler(id => handlers.current.onRelation(id), id => handlers.current.onRelationDoubleClick?.(id));
    const contentClicks = createRelationClickHandler(() => {}, id => {
      if (cy.getElementById(id).isNode()) handlers.current.onEntityDoubleClick?.(id);
      else handlers.current.onRelationDoubleClick?.(id);
    });
    relationGestures.current = relationClicks;
    gestures.current = clicks;
    contentGestures.current = contentClicks;
    const cancelClicks = () => { clicks.cancel(); relationClicks.cancel(); contentClicks.cancel(); };
    const input = attachGraphTouchInput(container.current, cancelClicks);
    touchInput.current = input;
    const removeBadges = attachGraphBadges(cy, badgeLayer.current!, styles.relationPatch,
      (id, originalEvent) => choose(id, { originalEvent }, false),
      styles.entityPatch, (id, event) => openContext(id, "edge", event.clientX, event.clientY, "pointer"));
    cy.on("mouseover", "node", event => { event.target.addClass("hovered"); if (event.target.data("kind") !== "text") container.current!.title = [event.target.data("fullLabel"), event.target.data("badge")].filter(Boolean).join(" · "); });
    cy.on("mouseout", "node", event => { event.target.removeClass("hovered"); container.current!.removeAttribute("title"); });
    function choose(id: string, event: Pick<cytoscape.EventObject, "originalEvent">, isNode: boolean) {
      if (canvasOptions.current.interactionBlocked) return;
      const touch = isGraphTouchEvent(event.originalEvent);
      if (touch && !input.accept(event.originalEvent!)) return;
      // DOM relation chips deliver a browser click rather than Cytoscape tap.
      // PointerEvent keeps its touch origin; browser cancellation already ran.
      const pointer = touch || (event.originalEvent && "pointerType" in event.originalEvent && event.originalEvent.pointerType === "touch") ? "touch" : "mouse";
      const original = event.originalEvent as MouseEvent | undefined;
      const multi = original?.ctrlKey || original?.metaKey || canvasOptions.current.selectionMode;
      const previous = canvasOptions.current.currentKeys;
      const next = multi ? previous.includes(id) ? previous.filter(k => k !== id) : [...previous, id] : [id];
      canvasOptions.current.currentKeys = next; setMultiple(next); canvasOptions.current.onSelectionChange?.(next);
      if (multi || canvasOptions.current.contentOnly) {
        clicks.cancel(); relationClicks.cancel();
        if (multi) contentClicks.cancel(); else contentClicks.click(id, event.originalEvent?.timeStamp, pointer);
        const primary = next.includes(id) ? id : next.at(-1);
        if (primary) {
          if (cy.getElementById(primary).isNode()) { if (multi && !canvasOptions.current.contentOnly) handlers.current.onInspectEntity?.(primary); else handlers.current.onEntity(primary); }
          else handlers.current.onRelation(primary);
        }
      } else if (isNode) { relationClicks.cancel(); clicks.click(id, event.originalEvent?.timeStamp, pointer); }
      else { clicks.cancel(); relationClicks.click(id, event.originalEvent?.timeStamp, pointer); }
    }
    cy.on("tap", "node", event => choose(event.target.id(), event, true));
    cy.on("tap", "edge", event => choose(event.target.id(), event, false));
    function openContext(id: string | undefined, kind: GraphContextMenuRequest["kind"], clientX: number, clientY: number, source: GraphContextMenuRequest["source"]) {
      if (canvasOptions.current.interactionBlocked || !canvasOptions.current.onContextMenu) return;
      input.cancel();
      const before = canvasOptions.current.currentKeys;
      const next = id && !before.includes(id) ? [id] : [...before];
      if (id && !before.includes(id)) {
        canvasOptions.current.currentKeys = next; setMultiple(next); canvasOptions.current.onSelectionChange?.(next);
        if (kind === "node") handlers.current.onEntity(id); else handlers.current.onRelation(id);
      }
      const box = container.current!.getBoundingClientRect(), pan = cy.pan(), zoom = cy.zoom();
      canvasOptions.current.onContextMenu({ kind, id, selectedKeys: next, clientX, clientY,
        position: { x: (clientX - box.left - pan.x) / zoom, y: (clientY - box.top - pan.y) / zoom }, source });
    }
    cy.on("cxttap", event => {
      const background = event.target === cy, original = event.originalEvent as MouseEvent | undefined;
      const box = container.current!.getBoundingClientRect();
      const rendered = event.renderedPosition ?? { x: cy.width() / 2, y: cy.height() / 2 };
      openContext(background ? undefined : event.target.id(), background ? "background" : event.target.isNode() ? "node" : "edge",
        original?.clientX ?? box.left + rendered.x, original?.clientY ?? box.top + rendered.y, "pointer");
    });
    const keyboardContext = (event: KeyboardEvent) => {
      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
      if (!canvasOptions.current.onContextMenu || canvasOptions.current.interactionBlocked || event.isComposing) return;
      event.preventDefault(); event.stopPropagation();
      const id = canvasOptions.current.currentKeys.at(-1), selected = id ? cy.getElementById(id) : null;
      const bounds = selected?.length ? selected.renderedBoundingBox() : null, box = container.current!.getBoundingClientRect();
      openContext(id, selected?.length ? selected.isNode() ? "node" : "edge" : "background",
        box.left + (bounds ? Math.min(cy.width() - 16, Math.max(16, (bounds.x1 + bounds.x2) / 2)) : cy.width() / 2),
        box.top + (bounds ? Math.min(cy.height() - 16, Math.max(16, (bounds.y1 + bounds.y2) / 2)) : cy.height() / 2), "keyboard");
    };
    const surface = container.current;
    surface.addEventListener("keydown", keyboardContext);
    let dragStart: GraphView | null = null, dragging: string | null = null;
    // Cytoscape emits grab on every node press, including the second press of
    // a double-click. Only actual drag/pan/zoom below cancels the click sequence.
    cy.on("grab", "node", event => { clicks.cancelPending(); dragStart = captureView(); dragging = event.target.id(); });
    cy.on("drag", "node", event => {
      if (!dragStart || dragging !== event.target.id() || !canvasOptions.current.currentKeys.includes(dragging!)) return;
      const from = dragStart.positions[dragging!], to = event.target.position();
      cy.batch(() => canvasOptions.current.currentKeys.filter(id => id !== dragging && dragStart!.positions[id]).forEach(id => {
        const p = dragStart!.positions[id]; cy.getElementById(id).position({ x: p.x + to.x - from.x, y: p.y + to.y - from.y });
      }));
    });
    cy.on("dragfree", "node", () => {
      const after = captureView();
      if (dragStart && after && JSON.stringify(dragStart.positions) !== JSON.stringify(after.positions)) {
        if (canvasOptions.current.onMove) canvasOptions.current.onMove(dragStart, after);
        else { movementHistory.current = { past: [...movementHistory.current.past.slice(-39), dragStart], future: [] }; setMovementCounts({ past: movementHistory.current.past.length, future: movementHistory.current.future.length }); }
      }
      dragStart = null; dragging = null;
    });
    cy.on("tap", (event) => { if (event.target === cy) {
      if (isGraphTouchEvent(event.originalEvent) && !input.accept(event.originalEvent)) return;
      input.cancel(); canvasOptions.current.currentKeys = []; setMultiple([]); canvasOptions.current.onSelectionChange?.([]);
    } });
    cy.on("drag pan zoom cxttapstart", () => input.cancel());
    const resize = new ResizeObserver(resizeCanvas);
    resize.observe(container.current);
    return () => { motion.current?.dispose(); motion.current = null; removeBadges(); input.dispose(); cancelClicks(); surface.removeEventListener("keydown", keyboardContext); relationGestures.current = null; gestures.current = null; contentGestures.current = null; touchInput.current = null; themeObserver.disconnect(); resize.disconnect(); cy.destroy(); core.current = null; viewportSize.current = null; generation.current = -1; initialLayoutDone.current = false; };
  }, []);

  useEffect(() => {
    const cy = core.current;
    if (!cy) return;
    // 取得中メッセージの切替でCanvasの位置も変わるため、クリック座標のキャッシュを更新する。
    resizeCanvas();
    const rootReady = graphRootReady(graph);
    const reset = generation.current !== graph.generation;
    const restored = reset && restoration?.generation === graph.generation ? restoration.view : null;
    if (reset) {
      if (!contentOnly) {
        movementHistory.current = { past: [], future: [] };
        canvasOptions.current.currentKeys = [];
        queueMicrotask(() => { setMultiple(null); setMovementCounts({ past: 0, future: 0 }); });
      }
      motion.current?.settle();
      const sameCenter = graph.centerId !== null && previousCenter.current === graph.centerId && previousCondition.current !== graph.conditionKey;
      if (sameCenter) cy.nodes().forEach((node) => { savedPositions.current[node.id()] = { ...node.position() }; });
      else { savedPositions.current = {}; cy.elements().remove(); initialLayoutDone.current = false; }
      if (restored) { cy.elements().remove(); savedPositions.current = { ...restored.positions }; initialLayoutDone.current = restored.initialLayoutDone; }
      generation.current = graph.generation; previousCenter.current = graph.centerId; previousCondition.current = graph.conditionKey;
    }
    const sourceNodes: CanvasContent["nodes"] = content?.nodes ?? Object.values(graph.nodes).map(n => ({ id: n.id, kind: n.kind, label: entityLabel(n, graph.nodes, locale) }));
    if (!textMeasurement.current && typeof CanvasRenderingContext2D !== "undefined") textMeasurement.current = document.createElement("canvas").getContext("2d");
    const renderedNodes = sourceNodes.map(node => {
      const context = textMeasurement.current;
      if (node.kind === "text") {
        const format = capsuleTextFormat(node.textStyle, node.textFormat);
        if (context) context.font = `${format.fontWeight === "bold" ? 700 : 400} ${format.fontSize}px ${CAPSULE_TEXT_FONT}`;
        const geometry = capsuleTextLayout(node.label, node.textStyle, node.textFormat, context ? text => context.measureText(text).width : undefined);
        return { ...node, hasPresentationShape: 0, fullLabel: node.label, label: geometry.label, nodeHeight: geometry.height, textWidth: geometry.width, textHeight: geometry.height,
          textFontSize: geometry.fontSize, textFontWeight: geometry.fontWeight === "bold" ? 700 : 400, textAlign: geometry.align, textMarginX: geometry.textMarginX };
      }
      if (context) context.font = `600 15px ${CAPSULE_TEXT_FONT}`;
      const geometry = capsuleTextLayout(node.label, "note", { width: 128, fontSize: 15 }, context ? text => context.measureText(text).width : undefined);
      const lines = geometry.lines.slice(0, 4);
      if (geometry.lines.length > 4) lines[3] = lines[3].slice(0, -1) + "…";
      return { ...node, ...capsuleNodeShapeLayout(node.shape, geometry.labelWidth, lines.length), fullLabel: node.label, label: content ? lines.join("\n") : node.label, nodeHeight: content ? Math.max(64, lines.length * 20 + 20) : 64 };
    });
    const nodeIds = new Set(renderedNodes.map(n => n.id));
    const newNodes = renderedNodes.filter(node => !cy.getElementById(node.id).length);
    const relations = content?.relations ?? displayRelations(graph.claims, locale);
    // 同じ世代でも表示対象は減る。端点を消す前に辺を削除する。
    cy.nodes().forEach((node) => { if (!nodeIds.has(node.id())) savedPositions.current[node.id()] = { ...node.position() }; });
    Object.keys(savedPositions.current).forEach((id) => { if (!graph.cacheNodes[id] && (!initialLayoutDone.current || rootReady)) delete savedPositions.current[id]; });
    cy.batch(() => { cy.edges().filter((edge) => !relations[edge.id()]).remove(); cy.nodes().filter((node) => !nodeIds.has(node.id())).remove(); });
    const routes = edgeRoutes(relations);
    const elements: ElementDefinition[] = newNodes.map((node) => ({ group: "nodes", data: node, position: { x: 0, y: 0 } }));
    Object.values(relations).forEach((claim) => {
      if (!cy.getElementById(claim.id).length) elements.push({ group: "edges", data: { id: claim.id, source: claim.subjectId, target: claim.objectId, polarity: claim.polarity, claimIds: claim.claimIds, badge: claim.badge, canvasLabel: claim.canvasLabel, ...routes[claim.id] } });
    });
    cy.batch(() => {
      cy.add(elements);
      Object.values(graph.nodes).forEach((node) => cy.getElementById(node.id).data({ expanded: graph.expansions[node.id]?.expanded ? 1 : 0 }));
      Object.entries(relations).forEach(([id, relation]) => cy.getElementById(id).data({ polarity: relation.polarity, claimIds: relation.claimIds, badge: relation.badge, canvasLabel: relation.canvasLabel, ...routes[id] }));
      if (newNodes.length) { cy.nodes().removeClass("added"); if (!reset && initialLayoutDone.current) newNodes.forEach((node) => cy.getElementById(node.id).addClass("added")); }
      renderedNodes.forEach(node => cy.getElementById(node.id).data(node));
      cy.nodes().removeClass("center");
      if (graph.centerId) cy.getElementById(graph.centerId).addClass("center");
    });
    if (restored) {
      Object.entries(content ? additionalPositions(restored.positions, renderedNodes.filter(n => !restored.positions[n.id]).map(n => n.id), relations, null) : restorationPositions(graph, restored)).forEach(([id, point]) => cy.getElementById(id).position(point));
      if (Object.keys(restored.positions).some((id) => nodeIds.has(id))) { cy.zoom(restored.zoom); cy.pan(restorationPan(restored, { width: cy.width(), height: cy.height() })); if (restored.recenter) cy.center(); }
      else cy.fit(undefined, 40);
      if (rootReady || contentOnly && renderedNodes.length > 0) initialLayoutDone.current = true;
    } else if (contentOnly && !initialLayoutDone.current && newNodes.length) {
      const ids = cy.nodes().map(node => node.id());
      const positions = contentPositions(ids, relations, cy.width() < cy.height());
      Object.entries(positions).forEach(([id, point]) => cy.getElementById(id).position(point));
      cy.fit(undefined, 40); cy.zoom(Math.min(1.15, cy.zoom())); cy.center();
      initialLayoutDone.current = true;
    } else if (!initialLayoutDone.current && graph.centerId && rootReady) {
      const compact = window.matchMedia("(max-width: 800px)").matches;
      const positions = initialPositions(graph.centerId, cy.nodes().filter((node) => node.id() !== graph.centerId).map((node) => node.id()), cy.height(), compact && cy.width() < cy.height());
      Object.entries(positions).forEach(([id, point]) => cy.getElementById(id).position(point));
      cy.fit(undefined, 40);
      // 狭い画面の初回だけは全Nodeを収める。追加展開・領域切替では倍率を変えない。
      const hasMore = graph.execution?.type === "pattern" ? graph.execution.hasMore : graph.expansions[graph.centerId]?.hasMore;
      cy.zoom(compact ? Math.min(1.15, cy.zoom()) : Math.min(1.15, Math.max(hasMore ? 0.65 : 0.8, cy.zoom())));
      cy.center(); initialLayoutDone.current = true;
    } else if ((reset || initialLayoutDone.current) && newNodes.length) {
      const newIds = newNodes.map((node) => node.id);
      const existing = Object.fromEntries(cy.nodes().filter((node) => !newIds.includes(node.id())).map((node) => [node.id(), { ...(node as cytoscape.NodeSingular).position() }]));
      const remaining: string[] = [];
      for (const id of newIds) {
        const saved = savedPositions.current[id];
        // 復元するNodeは既存の配置を優先し、未表示だったNodeだけを新しく配置する。
        if (saved) existing[id] = saved; else remaining.push(id);
      }
      const positions = additionalPositions(existing, remaining, relations, graph.lastExpandedId);
      newIds.forEach((id) => cy.getElementById(id).position(positions[id]));
      // A condition change can retain the center and add new nodes. Position
      // those nodes before fitting; their initial (0,0) is not a layout.
      if (reset) { cy.fit(cy.nodes(), 60); if (cy.zoom() > 1.2) cy.zoom(1.2); cy.center(); }
    }
    // 距離依存の曲率は配置後に計算し、手動ドラッグ後も更新する。
    const updateRoutes = () => {
      const positions = Object.fromEntries(cy.nodes().map((node) => [node.id(), node.position()]));
      const routes = edgeRoutes(relations, positions);
      cy.batch(() => Object.entries(routes).forEach(([id, route]) => cy.getElementById(id).data(route)));
    };
    updateRoutes();
    // 追加／再開したNodeのみ、配置完了後に短く表示する。保存からの復帰は即時。
    if (!contentOnly && !reset && !restored && newNodes.length) {
      const ids = new Set(newNodes.map(node => node.id));
      motion.current?.reveal(cy.nodes().filter(node => ids.has(node.id())));
    }
    cy.on("dragfree", "node", updateRoutes);
    return () => { cy.off("dragfree", "node", updateRoutes); };
  }, [graph, restoration, contentOnly, content, locale]);

  useEffect(() => {
    const cy = core.current;
    if (!cy) return;
    // 移動パネルが閉じた直後も、Canvasの画面内位置とクリック座標を揃える。
    resizeCanvas();
    cy.elements().removeClass("chosen");
    currentKeys.forEach(id => cy.getElementById(id).addClass("chosen"));
    if (selection && selectedKeys === undefined && multiple === null) {
      const id = selection.kind === "claim" && graph.claims[selection.id] ? relationId(graph.claims[selection.id]) : selection.id;
      cy.getElementById(id).addClass("chosen");
    }
  }, [selection, graph, currentKeys, selectedKeys, multiple]);

  return <>
    <div className={`${styles.canvas} ${fillHeight ? styles.workspaceCanvas : ""} ${navigation ? styles.withNavigation : ""}`}>
      {navigation && <div className={styles.canvasNavigation} onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>{navigation}</div>}
      <div className={`${styles.viewportTools} ${styles.canvasViewportTools}`} role="group" aria-label={viewportLabels.title} onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
        <button aria-pressed={selectionMode} aria-label={locale === "en" ? "Multiple selection" : "複数選択"} title={locale === "en" ? "Multiple selection · Ctrl / ⌘ click" : "複数選択 · Ctrl / ⌘クリック"} onClick={() => setSelectionMode(v => !v)}><Icon name="copy" /></button>
        {!onMove && <><button aria-label={locale === "en" ? "Undo move" : "移動を元に戻す"} disabled={!movementCounts.past} onClick={() => restoreMovement("past")}>↶</button><button aria-label={locale === "en" ? "Redo move" : "移動をやり直す"} disabled={!movementCounts.future} onClick={() => restoreMovement("future")}>↷</button></>}
        <button aria-label={viewportLabels.selection} disabled={!canFocusSelection || interactionBlocked} title={`${viewportLabels.selection} — ${viewportLabels.selectionHelp}`} onClick={showSelection}><Icon name="focus" /></button>
        <button aria-label={viewportLabels.zoomIn} title={viewportLabels.zoomIn} disabled={!hasNodes || interactionBlocked || zoom >= 2} onClick={() => changeZoom(1.25)}><Icon name="plus" /></button>
        <output aria-label={viewportLabels.zoom} aria-live="off">{Math.round(zoom * 100)}%</output>
        <button aria-label={viewportLabels.zoomOut} title={viewportLabels.zoomOut} disabled={!hasNodes || interactionBlocked || zoom <= 0.15} onClick={() => changeZoom(1 / 1.25)}><Icon name="minus" /></button>
        <button aria-label={viewportLabels.fit} title={viewportLabels.fit} disabled={!hasNodes || interactionBlocked} onClick={() => {
          cancelGestures(); resizeCanvas(); core.current?.fit(undefined, 24);
        }}><Icon name="fit" /></button>
      </div>
      <div className={styles.cySurface} ref={container} onPointerDownCapture={resizeCanvas} data-testid="graph-canvas" tabIndex={0} onContextMenu={event => { if (onContextMenu) event.preventDefault(); }} data-focus-destination role="img" aria-label={ui.graphAria} />
      <div className={styles.relationPatches} ref={badgeLayer} aria-hidden="true" />
      <div className={styles.graphOverlay} data-testid="graph-overlay">{feedback}
        {Object.entries(graph.expansions).filter(([, meta]) => meta.active && meta.loading).map(([id, meta]) =>
          <NeighborLoading key={`${id}:${meta.request}`} name={graph.nodes[id]?.name ?? ""} more={meta.expanded} />)}
      </div>
      {notification && <div className={styles.canvasNotification}>{notification}</div>}
    </div>
    {compactGuide ? <div className={styles.graphFooter}>
      <AnimatedDetails className={styles.graphGuide} summary={<><Icon name="chevron" />{locale === "en" ? "Graph guide" : "図の見方"}</>}>
        <p>{entryLabels(locale).selectedHelp}</p><p>{ui.shapes}</p><p>{ui.edges} ／ {contributionLabels(locale).mixedLegend} ／ {ui.nodeStates}</p>
        <p>{entryLabels(locale).graphResize}</p>
        {Object.values(graph.claims).some(claim => claim.contribution?.roleId) && <p>{contributionLabels(locale).partial}</p>}
      </AnimatedDetails>{footerAction}
    </div> : <div className={styles.graphTools}>
      <span>{entryLabels(locale).graphResize}</span>
      <span>{ui.shapes}</span>
      <span>{ui.edges} ／ {contributionLabels(locale).mixedLegend}{!contentOnly && ` ／ ${ui.nodeStates}`}</span>
    </div>}
  </>;
}
