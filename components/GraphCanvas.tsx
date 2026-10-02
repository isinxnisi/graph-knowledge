"use client";

import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { useEffect, useRef } from "react";
import type { GraphState, Selection } from "../lib/client/graph-state";
import { relationLabel } from "../lib/client/format";
import styles from "./Explorer.module.css";

type Props = { graph: GraphState; selection: Selection; onEntity: (id: string) => void; onClaim: (id: string) => void };

function positionNewNodes(cy: Core, ids: string[], anchorId: string | null) {
  const anchor = anchorId ? cy.getElementById(anchorId) : cy.nodes().first();
  const origin = anchor.length ? anchor.position() : { x: 0, y: 0 };
  const occupied = cy.nodes().filter((node) => !ids.includes(node.id())).map((node) => (node as cytoscape.NodeSingular).position());
  let slot = 0;
  ids.forEach((id) => {
    let position = origin;
    for (let attempt = 0; attempt < 256; attempt++, slot++) {
      const angle = (slot % 8) * Math.PI / 4;
      const radius = 170 + Math.floor(slot / 8) * 100;
      position = { x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius };
      if (occupied.every((other) => Math.hypot(other.x - position.x, other.y - position.y) >= 110)) break;
    }
    cy.getElementById(id).position(position); occupied.push(position); slot++;
  });
}

export default function GraphCanvas({ graph, selection, onEntity, onClaim }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const core = useRef<Core | null>(null);
  const handlers = useRef({ onEntity, onClaim });
  const generation = useRef(-1);
  const initialLayoutDone = useRef(false);
  useEffect(() => { handlers.current = { onEntity, onClaim }; }, [onEntity, onClaim]);

  useEffect(() => {
    if (!container.current) return;
    const cy = cytoscape({
      container: container.current, elements: [], layout: { name: "preset" },
      minZoom: 0.15, maxZoom: 2,
      style: [
        { selector: "node", style: { label: "data(label)", "background-color": "#e7f0f3", color: "#172f39", "border-width": 1, "border-color": "#7d9aa6", width: 92, height: 48, "font-size": 12, "text-valign": "center", "text-halign": "center", "text-wrap": "wrap", "text-max-width": "90px" } },
        { selector: 'node[kind="work"]', style: { shape: "round-rectangle", "background-color": "#f6efdc" } },
        { selector: 'node[kind="organization"]', style: { shape: "hexagon", "background-color": "#eae5f3" } },
        { selector: 'node[kind="event"]', style: { shape: "diamond" } },
        { selector: "node.center", style: { "border-width": 3, "border-color": "#376c83" } },
        { selector: "edge", style: { label: "data(label)", "curve-style": "bezier", "control-point-step-size": 65, "target-arrow-shape": "triangle", "line-color": "#8299a3", "target-arrow-color": "#8299a3", width: 2, "font-size": 10, "text-background-color": "#ffffff", "text-background-opacity": 0.9, "text-background-padding": "3px", "text-wrap": "wrap" } },
        { selector: 'edge[polarity="denied"]', style: { "line-style": "dashed", "line-color": "#965d44", "target-arrow-color": "#965d44" } },
        { selector: "node.chosen", style: { "border-width": 4, "border-color": "#194e6e" } },
        { selector: "edge.chosen", style: { "line-color": "#194e6e", "target-arrow-color": "#194e6e", width: 4 } },
      ],
    });
    core.current = cy;
    cy.on("tap", "node", (event) => handlers.current.onEntity(event.target.id()));
    cy.on("tap", "edge", (event) => handlers.current.onClaim(event.target.id()));
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
    const elements: ElementDefinition[] = newNodes.map((node) => ({ group: "nodes", data: { id: node.id, label: node.name, kind: node.kind }, position: { x: 0, y: 0 } }));
    Object.values(graph.claims).forEach((claim) => {
      if (!cy.getElementById(claim.id).length) elements.push({ group: "edges", data: { id: claim.id, source: claim.subjectId, target: claim.objectId, label: relationLabel(claim), polarity: claim.polarity } });
    });
    cy.batch(() => {
      cy.add(elements);
      cy.nodes().removeClass("center");
      if (graph.centerId) cy.getElementById(graph.centerId).addClass("center");
    });
    if (!initialLayoutDone.current && graph.centerId && graph.expansions[graph.centerId]?.expanded) {
      cy.layout({ name: "breadthfirst", roots: [graph.centerId], directed: false, animate: false, fit: true, padding: 60, spacingFactor: 1.5 }).run();
      if (cy.zoom() > 1.2) cy.zoom(1.2);
      cy.center(); initialLayoutDone.current = true;
    } else if (reset && newNodes.length) {
      cy.fit(cy.nodes(), 60); if (cy.zoom() > 1.2) cy.zoom(1.2); cy.center();
    } else if (initialLayoutDone.current && newNodes.length) {
      positionNewNodes(cy, newNodes.map((node) => node.id), graph.lastExpandedId);
    }
  }, [graph]);

  useEffect(() => {
    const cy = core.current;
    if (!cy) return;
    cy.elements().removeClass("chosen");
    if (selection) cy.getElementById(selection.id).addClass("chosen");
  }, [selection, graph]);

  return <>
    <div className={styles.canvas} ref={container} data-testid="graph-canvas" role="img" aria-label="人物・作品・組織の関係グラフ。操作できるテキスト一覧は下にあります。" />
    <div className={styles.graphTools}>
      <button onClick={() => core.current?.fit(undefined, 50)} disabled={!graph.centerId}>全体を表示</button>
      <span>丸：人物 ／ 四角：作品 ／ 六角形：組織</span>
      <span>矢印：関係の方向 ／ 破線・「否定」：否定する主張</span>
    </div>
  </>;
}
