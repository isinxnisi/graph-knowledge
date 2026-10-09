"use client";

import { contributionLabels } from "../lib/i18n/contribution";
import { entryLabels } from "../lib/i18n/exploration-entry";
import { graphViewportLabels } from "../lib/i18n/graph-viewport";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ReactNode, Ref } from "react";
import { restorationPositions } from "../lib/client/graph-view";
import type { GraphView, ViewRestoration } from "../lib/client/graph-view";
export type GraphCanvasHandle = { capture: () => GraphView | null; focusEntity: (id: string) => void };
import type { GraphState, Selection } from "../lib/client/graph-state";
import { entityLabel, edgeRoutes, displayRelations, relationId } from "../lib/client/graph-presentation";
import { initialPositions, additionalPositions, contentPositions } from "../lib/client/graph-layout";
import { createNodeClickHandler } from "../lib/client/graph-interaction";
import { attachGraphBadges } from "../lib/client/graph-badges";
import styles from "./Explorer.module.css";

type Props = { contentOnly?: boolean; ref?: Ref<GraphCanvasHandle>; feedback?: ReactNode; restoration?: ViewRestoration | null; interactionBlocked?: boolean; graph: GraphState; selection: Selection; onEntity: (id: string) => void; onRelation: (id: string) => void; onToggleEntity: (id: string) => void; onEntityDoubleClick?: (id: string) => void };

export default function GraphCanvas({ contentOnly = false, ref, feedback, restoration, interactionBlocked, graph, selection, onEntity, onRelation, onToggleEntity, onEntityDoubleClick }: Props) {
  const viewportLabels = graphViewportLabels();
  const [zoom, setZoom] = useState(1);
  const container = useRef<HTMLDivElement>(null);
  const badgeLayer = useRef<HTMLDivElement>(null);
  const core = useRef<Core | null>(null);
  const handlers = useRef({ onEntity, onRelation, onToggleEntity, onEntityDoubleClick, selection });
  const gestures = useRef<ReturnType<typeof createNodeClickHandler> | null>(null);
  const generation = useRef(-1);
  const previousCenter = useRef<string | null>(null);
  const previousCondition = useRef("all");
  const savedPositions = useRef<Record<string, { x: number; y: number }>>({});
  const initialLayoutDone = useRef(false);
  const hasNodes = Object.keys(graph.nodes).length > 0;
  const selectedId = selection?.kind === "claim"
    ? graph.claims[selection.id] && relationId(graph.claims[selection.id])
    : selection?.id;
  const canFocusSelection = !!selectedId && (selection?.kind === "entity"
    ? !!graph.nodes[selectedId]
    : !!displayRelations(graph.claims)[selectedId]);
  function changeZoom(factor: number) {
    const cy = core.current;
    if (!cy || !hasNodes || interactionBlocked) return;
    gestures.current?.cancel();
    cy.resize();
    cy.zoom({ level: Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * factor)),
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }
  function showSelection() {
    const cy = core.current;
    if (!cy || !selectedId || interactionBlocked) return;
    const selected = cy.getElementById(selectedId);
    if (!selected.length) return;
    gestures.current?.cancel();
    cy.resize();
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
    return { positions, pan: { ...cy.pan() }, zoom: cy.zoom(), initialLayoutDone: initialLayoutDone.current };
  }, focusEntity: (id) => {
    const cy = core.current;
    if (!cy) return;
    const node = cy.getElementById(id);
    if (!node.length || !node.isNode()) return;
    gestures.current?.cancel();
    cy.resize();
    cy.zoom(Math.max(1, cy.zoom()));
    cy.center(node);
  } }), []);
  useEffect(() => { if (interactionBlocked) gestures.current?.cancel(); }, [interactionBlocked]);
  useEffect(() => { handlers.current = { onEntity, onRelation, onToggleEntity, onEntityDoubleClick, selection }; }, [onEntity, onRelation, onToggleEntity, onEntityDoubleClick, selection]);
  useEffect(() => { gestures.current?.cancel(); }, [graph.generation]);
  useEffect(() => { gestures.current?.selectionChanged(selection?.kind === "entity" ? selection.id : null); }, [selection?.kind, selection?.id]);
  const selectedOpen = selection?.kind === "entity" ? graph.expansions[selection.id]?.open : undefined;
  useEffect(() => { gestures.current?.cancelPending(); }, [selectedOpen]);

  useEffect(() => {
    if (!container.current) return;
    const themeStyles = (): cytoscape.StylesheetStyle[] => {
      const theme = getComputedStyle(container.current!);
      const color = (name: string) => theme.getPropertyValue(`--color-${name}`).trim();
      return [
        { selector: "node", style: { label: "data(label)", "background-color": color("person"), color: color("text"), "border-width": 1, "border-color": color("node-border"), width: 116, height: 64, "font-size": 16, "text-valign": "center", "text-halign": "center", "text-wrap": "wrap", "text-max-width": "108px", "text-overflow-wrap": "anywhere" } },
        { selector: 'node[kind="work"]', style: { shape: "round-rectangle", "background-color": color("work") } },
        { selector: 'node[kind="organization"]', style: { shape: "hexagon", "background-color": color("organization") } },
        { selector: "node.center", style: { "border-width": 3, "border-color": color("accent") } },
        { selector: 'node[kind="event"]', style: { shape: "diamond", "background-color": color("work") } },
        { selector: "edge", style: { label: "data(canvasLabel)", color: color("text"), "curve-style": "unbundled-bezier", "control-point-distances": "data(distance)", "control-point-weights": "data(weight)", "target-arrow-shape": "triangle", "source-arrow-shape": "none", "arrow-scale": 1.2, "line-color": color("edge"), "target-arrow-color": color("edge"), width: 2, "font-size": 15, "text-margin-y": (edge: cytoscape.EdgeSingular) => Number(edge.data("labelOffset")), "text-background-color": color("panel"), "text-background-opacity": 1, "text-background-padding": "5px", "text-wrap": "wrap", "text-max-width": "165px", "text-overflow-wrap": "anywhere", "text-events": "yes" } },
        { selector: 'edge[polarity="denied"]', style: { "line-style": "dashed", "line-color": color("denied"), "target-arrow-color": color("denied") } },
        { selector: 'edge[polarity="mixed"]', style: { "line-style": "dotted" } },
        { selector: "node[expanded = 1]", style: { "border-style": "double", "border-width": 4 } },
        { selector: "node.added", style: { "underlay-color": color("new-node"), "underlay-opacity": 0.25, "underlay-padding": 10 } },
        { selector: "node.chosen", style: { "border-width": 5, "border-color": color("accent-strong"), "underlay-color": color("accent-strong"), "underlay-opacity": 0.12, "underlay-padding": 8 } },
        { selector: "edge.chosen", style: { "line-color": color("accent-strong"), "target-arrow-color": color("accent-strong"), width: 4, "text-background-color": color("accent-soft"), "z-index": 10 } },
      ];
    };
    const cy = cytoscape({
      container: container.current, elements: [], layout: { name: "preset" },
      minZoom: 0.15, maxZoom: 2, style: themeStyles(),
    });
    const themeObserver = new MutationObserver(() => cy.style(themeStyles()));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    core.current = cy;
    const updateZoom = () => setZoom(cy.zoom());
    cy.on("zoom", updateZoom);
    const clicks = createNodeClickHandler({
      isSelected: (id) => handlers.current.selection?.kind === "entity" && handlers.current.selection.id === id,
      select: (id) => handlers.current.onEntity(id), toggle: (id) => handlers.current.onToggleEntity(id),
      doubleClick: (id) => handlers.current.onEntityDoubleClick?.(id),
    });
    gestures.current = clicks;
    const removeBadges = attachGraphBadges(cy, badgeLayer.current!, styles.relationPatch, id => { clicks.cancel(); handlers.current.onRelation(id); });
    cy.on("tap", "node", (event) => clicks.click(event.target.id(), event.originalEvent?.timeStamp));
    cy.on("tap", "edge", (event) => { clicks.cancel(); handlers.current.onRelation(event.target.id()); });
    cy.on("tap", (event) => { if (event.target === cy) clicks.cancel(); });
    cy.on("drag", "node", () => clicks.cancel());
    const resize = new ResizeObserver(() => cy.resize());
    resize.observe(container.current);
    return () => { removeBadges(); clicks.cancel(); gestures.current = null; themeObserver.disconnect(); resize.disconnect(); cy.destroy(); core.current = null; generation.current = -1; initialLayoutDone.current = false; };
  }, []);

  useEffect(() => {
    const cy = core.current;
    if (!cy) return;
    // 取得中メッセージの切替でCanvasの位置も変わるため、クリック座標のキャッシュを更新する。
    cy.resize();
    const reset = generation.current !== graph.generation;
    const restored = reset && restoration?.generation === graph.generation ? restoration.view : null;
    if (reset) {
      const sameCenter = graph.centerId !== null && previousCenter.current === graph.centerId && previousCondition.current !== graph.conditionKey;
      if (sameCenter) cy.nodes().forEach((node) => { savedPositions.current[node.id()] = { ...node.position() }; });
      else { savedPositions.current = {}; cy.elements().remove(); initialLayoutDone.current = false; }
      if (restored) { cy.elements().remove(); savedPositions.current = { ...restored.positions }; initialLayoutDone.current = restored.initialLayoutDone; }
      generation.current = graph.generation; previousCenter.current = graph.centerId; previousCondition.current = graph.conditionKey;
    }
    const newNodes = Object.values(graph.nodes).filter((node) => !cy.getElementById(node.id).length);
    const relations = displayRelations(graph.claims);
    // 同じ世代でも表示対象は減る。端点を消す前に辺を削除する。
    cy.nodes().forEach((node) => { if (!graph.nodes[node.id()]) savedPositions.current[node.id()] = { ...node.position() }; });
    Object.keys(savedPositions.current).forEach((id) => { if (!graph.cacheNodes[id] && (!initialLayoutDone.current || (graph.centerId && graph.expansions[graph.centerId]?.expanded))) delete savedPositions.current[id]; });
    cy.batch(() => { cy.edges().filter((edge) => !relations[edge.id()]).remove(); cy.nodes().filter((node) => !graph.nodes[node.id()]).remove(); });
    const routes = edgeRoutes(relations);
    const elements: ElementDefinition[] = newNodes.map((node) => ({ group: "nodes", data: { id: node.id, label: entityLabel(node, graph.nodes), kind: node.kind }, position: { x: 0, y: 0 } }));
    Object.values(relations).forEach((claim) => {
      if (!cy.getElementById(claim.id).length) elements.push({ group: "edges", data: { id: claim.id, source: claim.subjectId, target: claim.objectId, polarity: claim.polarity, claimIds: claim.claimIds, badge: claim.badge, canvasLabel: claim.canvasLabel, ...routes[claim.id] } });
    });
    cy.batch(() => {
      cy.add(elements);
      Object.values(graph.nodes).forEach((node) => cy.getElementById(node.id).data({ expanded: graph.expansions[node.id]?.expanded ? 1 : 0 }));
      Object.entries(relations).forEach(([id, relation]) => cy.getElementById(id).data({ polarity: relation.polarity, claimIds: relation.claimIds, badge: relation.badge, canvasLabel: relation.canvasLabel, ...routes[id] }));
      if (newNodes.length) { cy.nodes().removeClass("added"); if (!reset && initialLayoutDone.current) newNodes.forEach((node) => cy.getElementById(node.id).addClass("added")); }
      Object.values(graph.nodes).forEach((node) => { const element = cy.getElementById(node.id); element.data("label", entityLabel(node, graph.nodes)); });
      cy.nodes().removeClass("center");
      if (graph.centerId) cy.getElementById(graph.centerId).addClass("center");
    });
    if (restored) {
      Object.entries(restorationPositions(graph, restored)).forEach(([id, point]) => cy.getElementById(id).position(point));
      if (Object.keys(restored.positions).some((id) => graph.nodes[id])) { cy.zoom(restored.zoom); cy.pan(restored.pan); }
      else cy.fit(undefined, 40);
      if (graph.centerId && graph.expansions[graph.centerId]?.expanded) initialLayoutDone.current = true;
    } else if (contentOnly && !initialLayoutDone.current && newNodes.length) {
      const ids = cy.nodes().map(node => node.id());
      const positions = contentPositions(ids, relations, cy.width() < cy.height());
      Object.entries(positions).forEach(([id, point]) => cy.getElementById(id).position(point));
      cy.fit(undefined, 40); cy.zoom(Math.min(1.15, cy.zoom())); cy.center();
      initialLayoutDone.current = true;
    } else if (!initialLayoutDone.current && graph.centerId && graph.expansions[graph.centerId]?.expanded) {
      const positions = initialPositions(graph.centerId, cy.nodes().filter((node) => node.id() !== graph.centerId).map((node) => node.id()), cy.height());
      Object.entries(positions).forEach(([id, point]) => cy.getElementById(id).position(point));
      cy.fit(undefined, 40);
      cy.zoom(Math.min(1.15, Math.max(graph.expansions[graph.centerId]?.hasMore ? 0.65 : 0.8, cy.zoom())));
      cy.center(); initialLayoutDone.current = true;
    } else if (reset && newNodes.length) {
      cy.fit(cy.nodes(), 60); if (cy.zoom() > 1.2) cy.zoom(1.2); cy.center();
    } else if (initialLayoutDone.current && newNodes.length) {
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
    }
    // 距離依存の曲率は配置後に計算し、手動ドラッグ後も更新する。
    const updateRoutes = () => {
      const positions = Object.fromEntries(cy.nodes().map((node) => [node.id(), node.position()]));
      const routes = edgeRoutes(relations, positions);
      cy.batch(() => Object.entries(routes).forEach(([id, route]) => cy.getElementById(id).data(route)));
    };
    updateRoutes();
    cy.on("dragfree", "node", updateRoutes);
    return () => { cy.off("dragfree", "node", updateRoutes); };
  }, [graph, restoration, contentOnly]);

  useEffect(() => {
    const cy = core.current;
    if (!cy) return;
    // 移動パネルが閉じた直後も、Canvasの画面内位置とクリック座標を揃える。
    cy.resize();
    cy.elements().removeClass("chosen");
    if (selection) {
      const id = selection.kind === "claim" && graph.claims[selection.id] ? relationId(graph.claims[selection.id]) : selection.id;
      cy.getElementById(id).addClass("chosen");
    }
  }, [selection, graph]);

  return <>
    <div className={styles.viewportTools} role="group" aria-label={viewportLabels.title}>
      <button aria-label={viewportLabels.zoomOut} disabled={!hasNodes || interactionBlocked || zoom <= 0.15} onClick={() => changeZoom(1 / 1.25)}>−</button>
      <output aria-label={viewportLabels.zoom} aria-live="off">{Math.round(zoom * 100)}%</output>
      <button aria-label={viewportLabels.zoomIn} disabled={!hasNodes || interactionBlocked || zoom >= 2} onClick={() => changeZoom(1.25)}>＋</button>
      <button disabled={!hasNodes || interactionBlocked} onClick={() => {
        gestures.current?.cancel();
        core.current?.resize();
        core.current?.fit(undefined, 24);
      }}>{viewportLabels.fit}</button>
      <button disabled={!canFocusSelection || interactionBlocked} title={viewportLabels.selectionHelp} onClick={showSelection}>{viewportLabels.selection}</button>
    </div>
    <div className={styles.canvas}>
      <div className={styles.cySurface} ref={container} onPointerDownCapture={() => core.current?.resize()} data-testid="graph-canvas" tabIndex={-1} role="img" aria-label="人物・作品・組織・出来事の関係グラフ。操作できるテキスト一覧は下にあります。" />
      <div className={styles.relationPatches} ref={badgeLayer} aria-hidden="true" />
      <div className={styles.graphOverlay} data-testid="graph-overlay">{feedback}</div>
    </div>
    <div className={styles.graphTools}>
      <span>{entryLabels().graphResize}</span>
      <span>丸：人物 ／ 四角：作品 ／ 六角形：組織 ／ ひし形：出来事</span>
      <span>矢印：方向 ／ 破線：否定 ／ {contributionLabels().mixedLegend}{!contentOnly && " ／ 二重枠：展開済 ／ 淡い外枠：新規表示"}</span>
    </div>
  </>;
}
