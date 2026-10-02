import type { ClaimSummary, EntitySummary, NeighborsResponse } from "../domain/api";

export const GRAPH_LIMITS = { entities: 100, claims: 200 } as const;
export const GRAPH_LIMIT_MESSAGE = "表示上限に達したため、別の人物を中心に探索してください。";
export type Selection = { kind: "entity" | "claim" | "relation"; id: string } | null;
export type Expansion = {
  expanded: boolean; nextCursor: string | null; hasMore: boolean;
  loading: boolean; error: string | null; blocked: boolean;
};
export type GraphState = {
  generation: number; centerId: string | null;
  nodes: Record<string, EntitySummary>; claims: Record<string, ClaimSummary>;
  expansions: Record<string, Expansion>; lastExpandedId: string | null;
};
export const emptyExpansion = (): Expansion => ({ expanded: false, nextCursor: null, hasMore: false, loading: false, error: null, blocked: false });
export const emptyGraph = (generation = 0): GraphState => ({ generation, centerId: null, nodes: {}, claims: {}, expansions: {}, lastExpandedId: null });

export function mergePage(graph: GraphState, page: NeighborsResponse): GraphState {
  const previous = graph.expansions[page.centerId] ?? emptyExpansion();
  const nodes = { ...graph.nodes };
  const claims = { ...graph.claims };
  page.nodes.forEach((node) => { nodes[node.id] = node; });
  page.claims.forEach((claim) => { claims[claim.id] = claim; });
  if (Object.keys(nodes).length > GRAPH_LIMITS.entities || Object.keys(claims).length > GRAPH_LIMITS.claims) {
    return { ...graph, expansions: { ...graph.expansions,
      [page.centerId]: { ...previous, loading: false, error: GRAPH_LIMIT_MESSAGE, blocked: true } } };
  }
  return { ...graph, nodes, claims, lastExpandedId: page.centerId,
    expansions: { ...graph.expansions, [page.centerId]: {
      expanded: true, nextCursor: page.page.nextCursor, hasMore: page.page.hasMore,
      loading: false, error: null, blocked: false,
    } } };
}
