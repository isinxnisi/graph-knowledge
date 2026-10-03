"use client";

import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { useEffect, useRef } from "react";
import type { GraphState, Selection } from "../lib/client/graph-state";
import { entityLabel, edgeRoutes, displayRelations, relationId } from "../lib/client/graph-presentation";
import { initialPositions, additionalPositions } from "../lib/client/graph-layout";
import styles from "./Explorer.module.css";

type Props = { graph: GraphState; selection: Selection; onEntity: (id: string) => void; onRelation: (id: string) => void };

export default function GraphCanvas({ graph, selection, onEntity, onRelation }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const core = useRef<Core | null>(null);
  const handlers = useRef({ onEntity, onRelation });
  const generation = useRef(-1);
  const initialLayoutDone = useRef(false);
  useEffect(() => { handlers.current = { onEntity, onRelation }; }, [onEntity, onRelation]);

  useEffect(() => {
    if (!container.current) return;
    const theme = getComputedStyle(container.current);
    const color = (name: string) => theme.getPropertyValue(`--color-${name}`).trim();
    const cy = cytoscape({
      container: container.current, elements: [], layout: { name: "preset" },
      minZoom: 0.15, maxZoom: 2,
      style: [
        { selector: "node", style: { label: "data(label)", "background-color": color("person"), color: color("text"), "border-width": 1, "border-color": color("node-border"), width: 116, height: 64, "font-size": 16, "text-valign": "center", "text-halign": "center", "text-wrap": "wrap", "text-max-width": "108px" } },
        { selector: 'node[kind="work"]', style: { shape: "round-rectangle", "background-color": color("work") } },
        { selector: 'node[kind="organization"]', style: { shape: "hexagon", "background-color": color("organization") } },
        { selector: 'node[kind="event"]', style: { shape: "diamond" } },
        { selector: "node.center", style: { "border-width": 3, "border-color": color("accent") } },
        { selector: "edge", style: { label: "data(label)", color: color("text"), "curve-style": "unbundled-bezier", "control-point-distances": "data(distance)", "control-point-weights": "data(weight)", "target-arrow-shape": "triangle", "source-arrow-shape": "none", "arrow-scale": 1.2, "line-color": color("edge"), "target-arrow-color": color("edge"), width: 2, "font-size": 15, "text-margin-y": (edge: cytoscape.EdgeSingular) => Number(edge.data("labelOffset")), "text-background-color": color("panel"), "text-background-opacity": 1, "text-background-padding": "5px", "text-wrap": "wrap", "text-max-width": "165px", "text-overflow-wrap": "anywhere", "text-events": "yes" } },
        { selector: 'edge[polarity="denied"]', style: { "line-style": "dashed", "line-color": color("denied"), "target-arrow-color": color("denied") } },
        { selector: 'edge[polarity="mixed"]', style: { "line-style": "dotted" } },
        { selector: "node[expanded = 1]", style: { "border-style": "double", "border-width": 4 } },
        { selector: "node.added", style: { "underlay-color": color("new-node"), "underlay-opacity": 0.25, "underlay-padding": 10 } },
        { selector: "node.chosen", style: { "border-width": 5, "border-color": color("accent-strong"), "underlay-color": color("accent-strong"), "underlay-opacity": 0.12, "underlay-padding": 8 } },
        { selector: "edge.chosen", style: { "line-color": color("accent-strong"), "target-arrow-color": color("accent-strong"), width: 4, "text-background-color": color("accent-soft"), "z-index": 10 } },
      ],
    });
    core.current = cy;
    cy.on("tap", "node", (event) => handlers.current.onEntity(event.target.id()));
    cy.on("tap", "edge", (event) => handlers.current.onRelation(event.target.id()));
    const resize = new ResizeObserver(() => cy.resize());
    resize.observe(container.current);
    return () => { resize.disconnect(); cy.destroy(); core.current = null; generation.current = -1; initialLayoutDone.current = false; };
  }, []);

  useEffect(() => {
    const cy = core.current;
    if (!cy) return;
    // 取得中メッセージの切替でCanvasの位置も変わるため、クリック座標のキャッシュを更新する。
    cy.resize();
    const reset = generation.current !== graph.generation;
    if (reset) { cy.elements().remove(); generation.current = graph.generation; initialLayoutDone.current = false; }
    const newNodes = Object.values(graph.nodes).filter((node) => !cy.getElementById(node.id).length);
    const relations = displayRelations(graph.claims);
    const routes = edgeRoutes(relations);
    const elements: ElementDefinition[] = newNodes.map((node) => ({ group: "nodes", data: { id: node.id, label: entityLabel(node, graph.nodes), kind: node.kind }, position: { x: 0, y: 0 } }));
    Object.values(relations).forEach((claim) => {
      if (!cy.getElementById(claim.id).length) elements.push({ group: "edges", data: { id: claim.id, source: claim.subjectId, target: claim.objectId, polarity: claim.polarity, claimIds: claim.claimIds, ...routes[claim.id] } });
    });
    cy.batch(() => {
      cy.add(elements);
      Object.values(graph.nodes).forEach((node) => cy.getElementById(node.id).data({ expanded: graph.expansions[node.id]?.expanded ? 1 : 0 }));
      Object.entries(relations).forEach(([id, relation]) => cy.getElementById(id).data({ polarity: relation.polarity, claimIds: relation.claimIds, ...routes[id] }));
      if (newNodes.length) { cy.nodes().removeClass("added"); if (!reset && initialLayoutDone.current) newNodes.forEach((node) => cy.getElementById(node.id).addClass("added")); }
      Object.values(graph.nodes).forEach((node) => { const element = cy.getElementById(node.id); element.data("label", entityLabel(node, graph.nodes)); });
      cy.nodes().removeClass("center");
      if (graph.centerId) cy.getElementById(graph.centerId).addClass("center");
    });
    if (!initialLayoutDone.current && graph.centerId && graph.expansions[graph.centerId]?.expanded) {
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
      const positions = additionalPositions(existing, newIds, relations, graph.lastExpandedId);
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
  }, [graph]);

  useEffect(() => {
    const cy = core.current;
    if (!cy) return;
    cy.elements().removeClass("chosen");
    if (selection) {
      const id = selection.kind === "claim" && graph.claims[selection.id] ? relationId(graph.claims[selection.id]) : selection.id;
      cy.getElementById(id).addClass("chosen");
    }
  }, [selection, graph]);

  return <>
    <div className={styles.canvas} ref={container} data-testid="graph-canvas" role="img" aria-label="人物・作品・組織の関係グラフ。操作できるテキスト一覧は下にあります。" />
    <div className={styles.graphTools}>
      <button onClick={() => core.current?.fit(undefined, 24)} disabled={!graph.centerId}>全体を表示</button>
      <span>丸：人物 ／ 四角：作品 ／ 六角形：組織</span>
      <span>矢印：方向 ／ 破線：否定 ／ 点線：異説あり ／ 二重枠：展開済 ／ 淡い外枠：新規表示</span>
    </div>
  </>;
}
