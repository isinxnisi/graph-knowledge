import type { GraphState } from "./graph-state";
import { additionalPositions, initialPositions } from "./graph-layout";
import { displayRelations } from "./graph-presentation";

export type GraphView = {
  recenter?: boolean;
  positions: Record<string, { x: number; y: number }>;
  pan: { x: number; y: number }; zoom: number; initialLayoutDone: boolean;
  center?: { x: number; y: number };
  viewport?: { width: number; height: number };
};
export type ViewRestoration = { generation: number; view: GraphView };

export function viewportCenter(pan: GraphView["pan"], zoom: number, viewport: { width: number; height: number }) {
  return { x: (viewport.width / 2 - pan.x) / zoom, y: (viewport.height / 2 - pan.y) / zoom };
}

export function restorationPan(view: Pick<GraphView, "pan" | "zoom" | "center" | "viewport">, viewport: { width: number; height: number }) {
  const center = view.center ?? (view.viewport ? viewportCenter(view.pan, view.zoom, view.viewport) : null);
  return center ? { x: viewport.width / 2 - center.x * view.zoom, y: viewport.height / 2 - center.y * view.zoom } : view.pan;
}

// 受理と描画の間に切り替えた場合だけ、座標未保存のNodeを補う。
export function restorationPositions(graph: GraphState, view: GraphView) {
  const known = Object.fromEntries(Object.entries(view.positions).filter(([id]) => graph.nodes[id]));
  if (!Object.keys(known).length && graph.centerId) return initialPositions(graph.centerId, Object.keys(graph.nodes).filter((id) => id !== graph.centerId));
  return additionalPositions(known, Object.keys(graph.nodes).filter((id) => !known[id]), displayRelations(graph.claims), graph.lastExpandedId ?? graph.centerId);
}
