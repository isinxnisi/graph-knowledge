import type { ClaimSummary, EntitySummary } from "../lib/domain/api";
import type { PatternGraphResponse } from "../lib/domain/pattern-graph";
import type { RouteRef } from "../lib/domain/relation-patterns";
export const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const relation = { version: 1, type: "pattern", pattern: { id: "other-works", revision: 1 }, polarity: "affirmed", contributionRoles: null } as const;
export const node = (n: number, kind: "work" | "person" = "work"): EntitySummary => ({ id: id(n), kind, name: `${kind} ${n}`, description: null });
export const root = node(1);
export const route = (person: number, work: number): RouteRef => ({ nodeIds: [id(1), id(person), id(work)], claimIds: [id(person + 10000), id(work + person * 10000)] });
export function page(routes: RouteRef[], required = routes[0] ?? null, nextCursor: string | null = null, anchor = root): Extract<PatternGraphResponse, { operation: "page" }> {
  const nodes = new Map<string, EntitySummary>([[anchor.id, anchor]]), claims = new Map<string, ClaimSummary>();
  for (const r of [...routes, ...(required ? [required] : [])]) {
    nodes.set(r.nodeIds[1], { ...node(0, "person"), id: r.nodeIds[1] }); nodes.set(r.nodeIds[2], { ...node(0), id: r.nodeIds[2] });
    r.claimIds.forEach((cid, step) => claims.set(cid, { id: cid, subjectId: r.nodeIds[1], objectId: r.nodeIds[step === 0 ? 0 : 2], predicate: "CONTRIBUTED_TO", polarity: "affirmed",
      contribution: { roleId: "AUTHORSHIP", scope: null }, organizationParticipation: null, eventParticipation: null, period: { from: null, to: null }, sourceCount: 1 }));
  }
  return { version: 1, dataset: "public-kg", revision: "r1", relation, root: { ...anchor, event: null, aliases: [] }, nodes: [...nodes.values()], claims: [...claims.values()], operation: "page", match: required ? "matched" : "not-matched", requiredRoute: required, routes, page: { hasMore: nextCursor !== null, nextCursor, claimCoverage: "witness-only" } };
}
