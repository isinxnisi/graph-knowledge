import { matchesClaim, predicateKey, type EventRoleFilter, type ContributionRoleFilter, type OrganizationPositionFilter, type PredicateFilter } from "../domain/exploration";
import type { ClaimSummary, EntitySummary, NeighborsResponse } from "../domain/api";
import { ClientApiError } from "./api";
import { dataReleaseLabels } from "../i18n/data-release";
import { normalizeRelationCondition, relationAcceptsClaim, relationConditionKey, type RelationCondition } from "../domain/relation-conditions";
import { patternGraphResponseSchema, routeKey, type PatternGraphResponse } from "../domain/pattern-graph";
import { validateRelationRoute, patternAcceptsRoot, routeOwnedBy, type RouteRef } from "../domain/relation-patterns";

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
  const allowed = graph.execution?.type === "pattern" ? verifiedPatternClaims(graph) : null;
  if (graph.relation?.type === "pattern" && !allowed) throw Error("Pattern execution state required");
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
        if (!claim) { if (allowed) throw Error("Missing pattern Claim"); continue; }
        if (allowed && (!allowed.has(claimId) || ![claim.subjectId, claim.objectId].includes(id))) throw Error("Unverified pattern branch");
        // Complete routes already validate each Claim at its own step; a shared filter would erase ordered-role paths.
        if (!(allowed || (graph.relation ? relationAcceptsClaim(graph.relation, claim) : matchesClaim(claim, graph.predicates, graph.contributionRoles ?? null, graph.organizationPositions ?? null, graph.eventRoles ?? null))) || !graph.cacheNodes[claim.subjectId] || !graph.cacheNodes[claim.objectId]) continue;
        claims[claim.id] = claim; ids.add(claim.subjectId); ids.add(claim.objectId);
      }
    }
  }
  const nodes = Object.fromEntries([...ids].filter((id) => graph.cacheNodes[id]).map((id) => [id, graph.cacheNodes[id]]));
  const expansions = Object.fromEntries(Object.entries(graph.expansions).map(([id, meta]) => [id, {
    ...meta, active: active.has(id), expanded: active.has(id) && meta.pages.length > 0,
    ...(allowed ? { hasMore: !!patternSourceForNode(graph, id, true) } : {}),
  }]));
  return { ...graph, nodes, claims, expansions, ...(graph.execution?.type === "pattern" ? { execution: { ...graph.execution, routes: Object.fromEntries(Object.entries(graph.execution.routes).map(([key, entry]) => [key, { ...entry, open: entry.route.claimIds.every(id => !!claims[id]) }])) } } : {}) };
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

export type PatternSource = {
  requiredRoute: string | null; candidateBoundary: RouteRef | null;
  nextCursor: string | null; hasMore: boolean;
};
export type PatternExecution = PatternSource & {
  type: "pattern"; routes: Record<string, { route: RouteRef; open: boolean }>;
  // Root fields above remain the root source. Other work sources share the same
  // condition and public revision; open is derived, never an interaction unit.
  sources?: Record<string, PatternSource>;
  loading: boolean; request: number; error: string | null; blocked: boolean;
};
export const PATTERN_SOURCE_LIMIT = 40;
export function emptyPatternGraph(root: EntitySummary, relation: RelationCondition, generation = 0): GraphState {
  const normalized = normalizeRelationCondition(relation);
  if (!patternAcceptsRoot(normalized,root.kind)) throw Error("Invalid pattern subject position");
  return projectGraph({ ...emptyGraph(generation), relation: normalized, predicates: ["CONTRIBUTED_TO"], contributionRoles: normalized.contributionRoles, conditionKey: relationConditionKey(normalized), roots: [root.id], centerId: root.id,
    cacheNodes: { [root.id]: root }, execution: { type: "pattern", routes: {}, sources: {}, requiredRoute: null, candidateBoundary: null, nextCursor: null, hasMore: false, loading: false, request: 0, error: null, blocked: false } });
}
function pattern(graph: GraphState) {
  if (graph.execution?.type !== "pattern" || graph.relation?.type !== "pattern") throw Error("Not a pattern execution");
  return graph.execution;
}
function verifiedPatternClaims(graph: GraphState) {
  const execution = pattern(graph), allowed = new Set<string>();
  const nodes = new Map(Object.entries(graph.cacheNodes)), claims = new Map(Object.entries(graph.cacheClaims));
  if (!graph.centerId || !patternAcceptsRoot(graph.relation!,nodes.get(graph.centerId)?.kind??"")) throw Error("Missing pattern root");
  for (const { route } of Object.values(execution.routes)) {
    validateRelationRoute(graph.relation!, route.nodeIds[0], route, nodes, claims);
    route.claimIds.forEach(id => allowed.add(id));
  }
  return allowed;
}
export function patternSource(graph: GraphState, id: string): PatternSource | null {
  const ex = pattern(graph);
  return id === graph.centerId && graph.revision ? ex : ex.sources?.[id] ?? null;
}
export function patternSourceForNode(graph: GraphState, id: string, more = false): string | null {
  const ex = pattern(graph);
  if (graph.cacheNodes[id]?.kind === "work"||graph.relation?.type==="pattern"&&graph.relation.pattern.revision===2&&graph.cacheNodes[id]?.kind==="person") return !more || patternSource(graph, id)?.hasMore ? id : null;
  const anchors = [...new Set(Object.values(ex.routes).filter(e => e.route.nodeIds.includes(id)).map(e => e.route.nodeIds[0]))].sort();
  return anchors.find(anchor => patternSource(graph, anchor)?.hasMore) ?? null;
}
export function openPatternNode(graph: GraphState, id: string): GraphState {
  const ex = pattern(graph), meta = graph.expansions[id] ?? emptyExpansion();
  const claimIds = [...verifiedPatternClaims(graph)].filter(cid => {
    const c = graph.cacheClaims[cid]; return [c.subjectId, c.objectId].includes(id);
  });
  const candidate = projectGraph({ ...graph, lastExpandedId: id, clock: graph.clock + 1, notice: null,
    execution: { ...ex, loading: false, error: null, blocked: false },
    expansions: { ...graph.expansions, [id]: { ...meta, open: true, pages: [{ after: null, claimIds, nextCursor: null }],
      hasMore: !!patternSourceForNode(graph, id, true), loading: false, error: null, blocked: false, used: graph.clock + 1 } } });
  return withinLimits(candidate) ? candidate : reject(graph, id);
}
export function mergePatternPage(graph: GraphState, raw: PatternGraphResponse, after: string | null, ownerId?: string): GraphState {
  const response = patternGraphResponseSchema.parse(raw), execution = pattern(graph);
  if (response.operation !== "page" || !graph.cacheNodes[response.root.id] || relationConditionKey(response.relation) !== graph.conditionKey) throw Error("Unexpected pattern response");
  if (graph.revision && graph.revision !== response.revision) throw new ClientApiError(dataReleaseLabels().changed, 409);
  const source = patternSource(graph, response.root.id);
  if (after !== (source?.nextCursor ?? null)) throw Error("Unexpected candidate boundary");
  const routes = { ...execution.routes };
  const refs = [...(response.requiredRoute ? [response.requiredRoute] : []), ...response.routes];
  for (const route of refs) if (!routes[routeKey(route)]) routes[routeKey(route)] = { route, open: false };
  const nextSource = { requiredRoute: response.requiredRoute ? routeKey(response.requiredRoute) : source?.requiredRoute ?? null,
    candidateBoundary: response.routes.at(-1) ?? source?.candidateBoundary ?? null, nextCursor: response.page.nextCursor, hasMore: response.page.hasMore };
  const sources = { ...execution.sources, ...(response.root.id !== graph.centerId ? { [response.root.id]: nextSource } : {}) };
  if (Object.keys(routes).length > 100 || Object.keys(sources).length >= PATTERN_SOURCE_LIMIT) return reject(graph, ownerId ?? response.root.id, "経路の保持上限に達しました。別の探索として開始してください。");
  const candidate = { ...graph, revision: response.revision,
    cacheNodes: { ...graph.cacheNodes, ...Object.fromEntries(response.nodes.map(n => [n.id, n])) },
    cacheClaims: { ...graph.cacheClaims, ...Object.fromEntries(response.claims.map(c => [c.id, c])) },
    execution: { ...execution, ...(response.root.id === graph.centerId ? nextSource : {}), sources, routes, loading: false, error: null, blocked: false } };
  if (!cacheFits(candidate)) return reject(graph, ownerId ?? response.root.id);
  const opened = openPatternNode(candidate, ownerId ?? response.root.id);
  return opened.expansions[ownerId ?? response.root.id]?.blocked ? reject(graph, ownerId ?? response.root.id) : opened;
}
// Revalidation can be accumulated off screen across work sources. Callers must
// commit only after EVERY source succeeds at one public revision.
export function restorePatternGraph(graph: GraphState, raw: PatternGraphResponse): GraphState {
  const response = patternGraphResponseSchema.parse(raw), old = pattern(graph);
  const expected = Object.values(old.routes).filter(r => routeOwnedBy(graph.relation!,r.route,response.root.id));
  if (response.operation !== "restore" || relationConditionKey(response.relation) !== graph.conditionKey
    || response.verifiedRoutes.length !== expected.length || response.verifiedRoutes.some(r => JSON.stringify(old.routes[routeKey(r)]?.route) !== JSON.stringify(r))) throw Error("Incomplete route restoration");
  if (graph.revision && graph.revision !== response.revision) throw new ClientApiError(dataReleaseLabels().changed, 409);
  const source = response.root.id === graph.centerId ? old : old.sources?.[response.root.id];
  if (!source) throw Error("Unknown pattern source");
  const nextSource = { ...source, nextCursor: response.continuation.state === "resumable" ? response.continuation.nextCursor : null,
    hasMore: response.continuation.state === "resumable" ? response.continuation.hasMore : true,
    candidateBoundary: response.continuation.state === "resumable" ? source.candidateBoundary : null };
  return { ...graph, revision: response.revision,
    cacheNodes: { ...graph.cacheNodes, ...Object.fromEntries(response.nodes.map(n => [n.id, n])) }, cacheClaims: { ...graph.cacheClaims, ...Object.fromEntries(response.claims.map(c => [c.id, c])) },
    execution: { ...old, ...(response.root.id === graph.centerId ? nextSource : { sources: { ...old.sources, [response.root.id]: nextSource } }), loading: false, request: old.request + 1, error: null, blocked: false } };
}
