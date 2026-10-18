import { matchesClaim, predicateKey, type EventRoleFilter, type ContributionRoleFilter, type OrganizationPositionFilter, type PredicateFilter } from "../domain/exploration";
import type { ClaimSummary, EntitySummary, NeighborsResponse } from "../domain/api";
import { ClientApiError } from "./api";
import { dataReleaseLabels } from "../i18n/data-release";
import { normalizeRelationCondition, relationAcceptsClaim, relationConditionKey, type RelationCondition } from "../domain/relation-conditions";
import { patternGraphResponseSchema, routeKey, type PatternGraphResponse } from "../domain/pattern-graph";
import { validateRelationRoute, type RouteRef } from "../domain/relation-patterns";

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
  // Missing on legacy in-memory snapshots. No persistence migration in STEP 3a.
  relation?: RelationCondition;
  execution?: { type: "adjacent" } | PatternExecution;
  revision?: string;
  predicates: PredicateFilter; contributionRoles: ContributionRoleFilter; organizationPositions: OrganizationPositionFilter; eventRoles: EventRoleFilter; conditionKey: string;
  generation: number; roots: string[]; centerId: string | null;
  nodes: Record<string, EntitySummary>; claims: Record<string, ClaimSummary>;
  cacheNodes: Record<string, EntitySummary>; cacheClaims: Record<string, ClaimSummary>;
  expansions: Record<string, Expansion>; lastExpandedId: string | null; notice: string | null; clock: number; evictedIds: string[];
};
export const emptyExpansion = (): Expansion => ({ open: false, expanded: false, active: false, pages: [], nextCursor: null, hasMore: false, loading: false, error: null, blocked: false, request: 0, used: 0 });
export const emptyGraph = (generation = 0): GraphState => ({ execution: { type: "adjacent" }, predicates: null, contributionRoles: null, organizationPositions: null, eventRoles: null, conditionKey: predicateKey(null), generation, roots: [], centerId: null, nodes: {}, claims: {}, cacheNodes: {}, cacheClaims: {}, expansions: {}, lastExpandedId: null, notice: null, clock: 0, evictedIds: [] });
export const graphRootReady = (graph: GraphState): boolean => graph.execution?.type === "pattern" ? !!graph.revision : !!(graph.centerId && graph.expansions[graph.centerId]?.expanded);

// 表示は起点から有効な展開に属するClaimだけで導出する。切断循環は起点にならない。
export function projectGraph(graph: GraphState): GraphState {
  if (graph.execution?.type === "pattern") return projectPatternGraph(graph);
  if (graph.relation?.type === "pattern") throw Error("Pattern execution state required");
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
        if (!claim || !(graph.relation ? relationAcceptsClaim(graph.relation, claim) : matchesClaim(claim, graph.predicates, graph.contributionRoles ?? null, graph.organizationPositions ?? null, graph.eventRoles ?? null)) || !graph.cacheNodes[claim.subjectId] || !graph.cacheNodes[claim.objectId]) continue;
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
  if (graph.execution?.type === "pattern") throw new Error("Pattern requires complete routes");
  if (graph.relation && (!page.relation || relationConditionKey(page.relation) !== relationConditionKey(graph.relation) || page.claims.some(c => !relationAcceptsClaim(graph.relation!, c)))) throw new Error("Unexpected relation condition");
  if (graph.revision && graph.revision !== page.revision) throw new ClientApiError(dataReleaseLabels().changed, 409);
  if (page.claims.some((claim) => !matchesClaim(claim, graph.predicates, graph.contributionRoles ?? null, graph.organizationPositions ?? null, graph.eventRoles ?? null))) throw new Error("Unexpected predicate");
  const previous = graph.expansions[page.centerId] ?? emptyExpansion();
  const cacheNodes = { ...graph.cacheNodes }; const cacheClaims = { ...graph.cacheClaims };
  page.nodes.forEach((node) => { cacheNodes[node.id] = node; });
  page.claims.forEach((claim) => { cacheClaims[claim.id] = claim; });
  const roots = graph.roots.length ? graph.roots : [page.centerId];
  const accepted = { after, claimIds: page.claims.map((claim) => claim.id), nextCursor: page.page.nextCursor };
  const pages = [...previous.pages.filter((entry) => entry.after !== after), accepted];
  let candidate = projectGraph({ ...graph, ...(page.revision ? { revision: page.revision } : {}), roots, centerId: roots[0], cacheNodes, cacheClaims, lastExpandedId: page.centerId, evictedIds: graph.evictedIds.filter((id) => id !== page.centerId), clock: graph.clock + 1, notice: null,
    expansions: { ...graph.expansions, [page.centerId]: { ...previous, open: true, pages,
      nextCursor: page.page.nextCursor, hasMore: page.page.hasMore, loading: false, error: null, blocked: false, used: graph.clock + 1 } } });
  if (!withinLimits(candidate)) return reject(graph, page.centerId);
  candidate = trimCache(candidate);
  if (!cacheFits(candidate)) return reject(graph, page.centerId, "一時キャッシュの上限に達したため、中心を選び直してください。");
  return candidate;
}

export function closeExpansion(graph: GraphState, id: string): GraphState {
  if (graph.execution?.type === "pattern") return closePatternNode(graph, id);
  const meta = graph.expansions[id]; if (!meta?.open) return graph;
  const expansions = Object.fromEntries(Object.entries(graph.expansions).map(([key, entry]) => [key, {
    ...entry, blocked: false, error: entry.blocked ? null : entry.error,
    ...(key === id ? { open: false, loading: false, request: entry.request + 1 } : {}),
  }]));
  return projectGraph({ ...graph, expansions, notice: "展開を閉じました。別の展開が支える関係は残ります。" });
}
export function reopenExpansion(graph: GraphState, id: string): GraphState {
  if (graph.execution?.type === "pattern") throw new Error("Open a complete pattern route");
  const meta = graph.expansions[id]; if (!meta || !graph.nodes[id]) return graph;
  const candidate = projectGraph({ ...graph, clock: graph.clock + 1, lastExpandedId: id, notice: "取得済みの枝を復元しました。",
    expansions: { ...graph.expansions, [id]: { ...meta, open: true, error: null, blocked: false, used: graph.clock + 1 } } });
  return withinLimits(candidate) ? candidate : reject(graph, id);
}

export type PatternExecution = {
  type: "pattern"; routes: Record<string, { route: RouteRef; open: boolean }>; requiredRoute: string | null;
  // Isolated, verified Entity handles, never partial path edges. Values are the
  // accepted routes to reopen together; absent on pre-fix snapshots.
  collapsedNodes?: Record<string, string[]>;
  candidateBoundary: RouteRef | null; nextCursor: string | null; hasMore: boolean;
  loading: boolean; request: number; error: string | null; blocked: boolean;
};
export function emptyPatternGraph(root: EntitySummary, relation: RelationCondition, generation = 0): GraphState {
  const normalized = normalizeRelationCondition(relation);
  if (normalized.type !== "pattern" || root.kind !== "work") throw Error("Pattern requires a work");
  return projectGraph({ ...emptyGraph(generation), relation: normalized, predicates: ["CONTRIBUTED_TO"], contributionRoles: normalized.contributionRoles, conditionKey: relationConditionKey(normalized), roots: [root.id], centerId: root.id,
    cacheNodes: { [root.id]: root }, execution: { type: "pattern", routes: {}, requiredRoute: null, candidateBoundary: null, nextCursor: null, hasMore: false, loading: false, request: 0, error: null, blocked: false } });
}
function pattern(graph: GraphState) {
  if (graph.execution?.type !== "pattern" || graph.relation?.type !== "pattern") throw Error("Not a pattern execution");
  return graph.execution;
}
function projectPatternGraph(graph: GraphState): GraphState {
  const execution = pattern(graph), ids = new Set(graph.roots), claimIds = new Set<string>();
  const nodes = new Map(Object.entries(graph.cacheNodes)), claims = new Map(Object.entries(graph.cacheClaims));
  if (!graph.centerId || nodes.get(graph.centerId)?.kind !== "work") throw Error("Missing pattern root");
  for (const { route, open } of Object.values(execution.routes)) {
    if (!open) continue;
    // Validate first, then include ALL steps. Missing data never yields a half route.
    validateRelationRoute(graph.relation!, graph.centerId!, route, nodes, claims);
    route.nodeIds.forEach(id => ids.add(id)); route.claimIds.forEach(id => claimIds.add(id));
  }
  for (const [id, keys] of Object.entries(execution.collapsedNodes ?? {})) {
    if (!keys.length || new Set(keys).size !== keys.length) throw Error("Invalid collapsed Entity handle");
    for (const key of keys) {
      const entry = execution.routes[key];
      if (!entry?.route.nodeIds.includes(id)) throw Error("Invalid collapsed Entity handle");
      validateRelationRoute(graph.relation!, graph.centerId, entry.route, nodes, claims);
    }
    ids.add(id);
  }
  return { ...graph, nodes: Object.fromEntries([...ids].map(id => [id, graph.cacheNodes[id]])), claims: Object.fromEntries([...claimIds].map(id => [id, graph.cacheClaims[id]])), expansions: {} };
}
function rejectPattern(graph: GraphState, message = GRAPH_LIMIT_MESSAGE) {
  return { ...graph, execution: { ...pattern(graph), loading: false, error: message, blocked: true } };
}
export function mergePatternPage(graph: GraphState, raw: PatternGraphResponse, after: string | null): GraphState {
  const response = patternGraphResponseSchema.parse(raw), execution = pattern(graph);
  if (response.operation !== "page" || response.root.id !== graph.centerId || relationConditionKey(response.relation) !== graph.conditionKey) throw Error("Unexpected pattern response");
  if (graph.revision && graph.revision !== response.revision) throw new ClientApiError(dataReleaseLabels().changed, 409);
  if (after !== execution.nextCursor) throw Error("Unexpected candidate boundary");
  const routes = { ...execution.routes };
  const initial = !graph.revision && Object.keys(routes).length === 0;
  const firstKey = response.requiredRoute ? routeKey(response.requiredRoute) : response.routes[0] ? routeKey(response.routes[0]) : null;
  // A supplied proof takes precedence over a candidate with the same endpoints.
  const refs = [...(response.requiredRoute ? [response.requiredRoute] : []), ...response.routes];
  for (const route of refs) if (!routes[routeKey(route)]) routes[routeKey(route)] = { route, open: initial && routeKey(route) === firstKey };
  if (Object.keys(routes).length > 100) return rejectPattern(graph, "経路の保持上限に達しました。別の探索として開始してください。");
  const candidate = projectGraph({ ...graph, revision: response.revision,
    cacheNodes: { ...graph.cacheNodes, ...Object.fromEntries(response.nodes.map(n => [n.id, n])) },
    cacheClaims: { ...graph.cacheClaims, ...Object.fromEntries(response.claims.map(c => [c.id, c])) },
    execution: { ...execution, routes, requiredRoute: response.requiredRoute ? routeKey(response.requiredRoute) : execution.requiredRoute,
      candidateBoundary: response.routes.at(-1) ?? execution.candidateBoundary, nextCursor: response.page.nextCursor, hasMore: response.page.hasMore, loading: false, error: null, blocked: false } });
  if (!withinLimits(candidate) || !cacheFits(candidate)) return rejectPattern(graph);
  return candidate;
}
export function setPatternRoutesOpen(graph: GraphState, keys: string[], open: boolean): GraphState {
  const execution = pattern(graph);
  if (!keys.length || keys.some(key => !execution.routes[key])) throw Error("Unknown pattern route");
  if (keys.every(key => execution.routes[key].open === open)) return graph;
  const routes = { ...execution.routes }, collapsedNodes = { ...execution.collapsedNodes };
  for (const key of keys) {
    const entry = routes[key]; routes[key] = { ...entry, open };
    if (open) for (const id of entry.route.nodeIds) delete collapsedNodes[id];
  }
  if (!open && !Object.values(routes).some(r => r.open) && graph.centerId) collapsedNodes[graph.centerId] = keys;
  const candidate = projectGraph({ ...graph, execution: { ...execution, routes, collapsedNodes, loading: false, request: execution.request + 1, error: null, blocked: false } });
  return withinLimits(candidate) ? candidate : rejectPattern(graph);
}
export function setPatternRouteOpen(graph: GraphState, key: string, open: boolean): GraphState {
  return setPatternRoutesOpen(graph, [key], open);
}
export function closePatternNode(graph: GraphState, id: string): GraphState {
  const execution = pattern(graph);
  const open = Object.entries(execution.routes).filter(([, e]) => e.open && e.route.nodeIds.includes(id));
  if (!open.length) return graph;
  const collapsedNodes = id === graph.centerId ? {} : { ...execution.collapsedNodes };
  collapsedNodes[id] = open.map(([key]) => key);
  return projectGraph({ ...graph, execution: { ...execution, collapsedNodes, routes: Object.fromEntries(Object.entries(execution.routes).map(([key, entry]) => [key, entry.route.nodeIds.includes(id) ? { ...entry, open: false } : entry])), loading: false, request: execution.request + 1, error: null, blocked: false } });
}
export function patternNodeOpen(graph: GraphState, id: string) {
  return graph.execution?.type === "pattern" && Object.values(graph.execution.routes).some(e => e.open && e.route.nodeIds.includes(id));
}
export function nextPatternRoute(graph: GraphState, id: string): string | null {
  if (graph.execution?.type !== "pattern") return null;
  const ex = graph.execution, preferred = ex.collapsedNodes?.[id]?.find(key => ex.routes[key] && !ex.routes[key].open);
  if (preferred) return preferred;
  return Object.entries(ex.routes).find(([, e]) => !e.open && e.route.nodeIds.includes(id))?.[0] ?? null;
}
export function restorePatternGraph(graph: GraphState, raw: PatternGraphResponse): GraphState {
  const response = patternGraphResponseSchema.parse(raw), old = pattern(graph);
  if (response.operation !== "restore" || response.root.id !== graph.centerId || relationConditionKey(response.relation) !== graph.conditionKey
    || response.verifiedRoutes.length !== Object.keys(old.routes).length || response.verifiedRoutes.some(r => JSON.stringify(old.routes[routeKey(r)]?.route) !== JSON.stringify(r))) throw Error("Incomplete route restoration");
  const candidate = projectGraph({ ...graph, revision: response.revision, cacheNodes: Object.fromEntries(response.nodes.map(n => [n.id, n])), cacheClaims: Object.fromEntries(response.claims.map(c => [c.id, c])),
    execution: { ...old, loading: false, request: old.request + 1, error: null, blocked: false,
      nextCursor: response.continuation.state === "resumable" ? response.continuation.nextCursor : null,
      hasMore: response.continuation.state === "resumable" ? response.continuation.hasMore : true,
      candidateBoundary: response.continuation.state === "resumable" ? old.candidateBoundary : null } });
  if (!withinLimits(candidate) || !cacheFits(candidate)) return rejectPattern(graph);
  return candidate;
}
