import { CACHE_LIMITS, type GraphState, type Selection } from "./graph-state";
import type { GraphView } from "./graph-view";
import { overviewLabels } from "../i18n/entity-overview";
export type ExplorationSnapshot = { graph: GraphState; selection: Selection; view: GraphView | null };
// 各探索の既存キャッシュ上限を保ち、履歴は一件だけ。通信オブジェクトは保存しない。
export function captureExploration(graph: GraphState, selection: Selection, view: GraphView | null): ExplorationSnapshot | null {
  if (!graph.centerId || Object.keys(graph.cacheNodes).length > CACHE_LIMITS.entities || Object.keys(graph.cacheClaims).length > CACHE_LIMITS.claims) return null;
  const expansions = Object.fromEntries(Object.entries(graph.expansions).map(([id, meta]) => [id, {
    ...meta, loading: false, request: meta.request + 1,
    error: meta.loading ? overviewLabels().interrupted : meta.error,
  }]));
  const positions = view ? Object.fromEntries(Object.entries(view.positions).filter(([id]) => graph.cacheNodes[id])) : {};
  return { graph: { ...graph, expansions, ...(graph.execution?.type === "pattern" ? { execution: { ...graph.execution, loading: false, request: graph.execution.request + 1 } } : {}) }, selection, view: view ? { ...view, positions } : null };
}
