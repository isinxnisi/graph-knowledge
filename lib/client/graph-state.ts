import type { ClaimSummary, EntitySummary, NeighborsResponse } from "../domain/api";

export const GRAPH_LIMITS = { entities: 100, claims: 200 } as const;
export const CACHE_LIMITS = { entities: 400, claims: 800 } as const;
export const GRAPH_LIMIT_MESSAGE = "表示上限に達したため、他の展開を閉じて再試行してください。";
export type Selection = { kind: "entity" | "claim" | "relation"; id: string } | null;
export type AcceptedPage = { after: string | null; claimIds: string[]; nextCursor: string | null };
export type Expansion = {
  open: boolean; expanded: boolean; active: boolean; pages: AcceptedPage[];
  nextCursor: string | null; hasMore: boolean;
  loading: boolean; error: string | null; blocked: boolean; request: number; used: number;
};
export type GraphState = {
  generation: number; roots: string[]; centerId: string | null;
  nodes: Record<string, EntitySummary>; claims: Record<string, ClaimSummary>;
  cacheNodes: Record<string, EntitySummary>; cacheClaims: Record<string, ClaimSummary>;
  expansions: Record<string, Expansion>; lastExpandedId: string | null; notice: string | null; clock: number; evictedIds: string[];
};
export const emptyExpansion = (): Expansion => ({ open: false, expanded: false, active: false, pages: [], nextCursor: null, hasMore: false, loading: false, error: null, blocked: false, request: 0, used: 0 });
export const emptyGraph = (generation = 0): GraphState => ({ generation, roots: [], centerId: null, nodes: {}, claims: {}, cacheNodes: {}, cacheClaims: {}, expansions: {}, lastExpandedId: null, notice: null, clock: 0, evictedIds: [] });

// 表示は起点から有効な展開に属するClaimだけで導出する。切断循環は起点にならない。
export function projectGraph(graph: GraphState): GraphState {
  const ids = new Set(graph.roots);
  const claims: GraphState["claims"] = {};
  const active = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, meta] of Object.entries(graph.expansions)) {
      if (!meta.open || !ids.has(id) || active.has(id)) continue;
      active.add(id); changed = true;
      for (const page of meta.pages) for (const claimId of page.claimIds) {
        const claim = graph.cacheClaims[claimId];
        if (!claim || !graph.cacheNodes[claim.subjectId] || !graph.cacheNodes[claim.objectId]) continue;
        claims[claim.id] = claim; ids.add(claim.subjectId); ids.add(claim.objectId);
      }
    }
  }
  const nodes = Object.fromEntries([...ids].filter((id) => graph.cacheNodes[id]).map((id) => [id, graph.cacheNodes[id]]));
  const expansions = Object.fromEntries(Object.entries(graph.expansions).map(([id, meta]) => [id, {
    ...meta, active: active.has(id), expanded: active.has(id) && meta.pages.length > 0,
  }]));
  return { ...graph, nodes, claims, expansions };
}
export function withinLimits(graph: GraphState): boolean {
  return Object.keys(graph.nodes).length <= GRAPH_LIMITS.entities && Object.keys(graph.claims).length <= GRAPH_LIMITS.claims;
}

function compactCache(graph: GraphState): GraphState {
  const usedClaims = new Set(Object.values(graph.expansions).flatMap((meta) => meta.pages.flatMap((page) => page.claimIds)));
  const cacheClaims = Object.fromEntries(Object.entries(graph.cacheClaims).filter(([id]) => usedClaims.has(id)));
  const usedNodes = new Set([...graph.roots, ...Object.keys(graph.expansions), ...Object.values(cacheClaims).flatMap((claim) => [claim.subjectId, claim.objectId])]);
  const cacheNodes = Object.fromEntries(Object.entries(graph.cacheNodes).filter(([id]) => usedNodes.has(id)));
  return { ...graph, cacheNodes, cacheClaims, evictedIds: graph.evictedIds.filter((id) => !!cacheNodes[id]) };
}
function cacheFits(graph: GraphState): boolean {
  return Object.keys(graph.cacheNodes).length <= CACHE_LIMITS.entities && Object.keys(graph.cacheClaims).length <= CACHE_LIMITS.claims;
}
function trimCache(graph: GraphState): GraphState {
  let result = compactCache(graph);
  const dormant = Object.entries(result.expansions).filter(([, meta]) => !meta.active && !meta.loading).sort((a, b) => a[1].used - b[1].used || a[0].localeCompare(b[0]));
  for (const [id] of dormant) {
    if (cacheFits(result)) break;
    const expansions = { ...result.expansions }; delete expansions[id];
    result = compactCache({ ...result, expansions, evictedIds: [...new Set([...result.evictedIds, id])] });
  }
  return result;
}
function reject(graph: GraphState, id: string, message = GRAPH_LIMIT_MESSAGE): GraphState {
  return { ...graph, notice: null, expansions: { ...graph.expansions, [id]: { ...(graph.expansions[id] ?? emptyExpansion()), loading: false, error: message, blocked: true } } };
}

export function mergePage(graph: GraphState, page: NeighborsResponse, after: string | null = null): GraphState {
  const previous = graph.expansions[page.centerId] ?? emptyExpansion();
  const cacheNodes = { ...graph.cacheNodes }; const cacheClaims = { ...graph.cacheClaims };
  page.nodes.forEach((node) => { cacheNodes[node.id] = node; });
  page.claims.forEach((claim) => { cacheClaims[claim.id] = claim; });
  const roots = graph.roots.length ? graph.roots : [page.centerId];
  const accepted = { after, claimIds: page.claims.map((claim) => claim.id), nextCursor: page.page.nextCursor };
  const pages = [...previous.pages.filter((entry) => entry.after !== after), accepted];
  let candidate = projectGraph({ ...graph, roots, centerId: roots[0], cacheNodes, cacheClaims, lastExpandedId: page.centerId, evictedIds: graph.evictedIds.filter((id) => id !== page.centerId), clock: graph.clock + 1, notice: null,
    expansions: { ...graph.expansions, [page.centerId]: { ...previous, open: true, pages,
      nextCursor: page.page.nextCursor, hasMore: page.page.hasMore, loading: false, error: null, blocked: false, used: graph.clock + 1 } } });
  if (!withinLimits(candidate)) return reject(graph, page.centerId);
  candidate = trimCache(candidate);
  if (!cacheFits(candidate)) return reject(graph, page.centerId, "一時キャッシュの上限に達したため、中心を選び直してください。");
  return candidate;
}

export function closeExpansion(graph: GraphState, id: string): GraphState {
  const meta = graph.expansions[id]; if (!meta?.open) return graph;
  const expansions = Object.fromEntries(Object.entries(graph.expansions).map(([key, entry]) => [key, {
    ...entry, blocked: false, error: entry.blocked ? null : entry.error,
    ...(key === id ? { open: false, loading: false, request: entry.request + 1 } : {}),
  }]));
  return projectGraph({ ...graph, expansions, notice: "展開を閉じました。別の展開が支える関係は残ります。" });
}
export function reopenExpansion(graph: GraphState, id: string): GraphState {
  const meta = graph.expansions[id]; if (!meta || !graph.nodes[id]) return graph;
  const candidate = projectGraph({ ...graph, clock: graph.clock + 1, lastExpandedId: id, notice: "取得済みの枝を復元しました。",
    expansions: { ...graph.expansions, [id]: { ...meta, open: true, error: null, blocked: false, used: graph.clock + 1 } } });
  return withinLimits(candidate) ? candidate : reject(graph, id);
}
