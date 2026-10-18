import "server-only";
import type { Transaction } from "neo4j-driver";
import { PREDICATES } from "../domain/predicates";
import { relationConditionKey, type RelationCondition } from "../domain/relation-conditions";
import { matchWitnessSchema, validateRelationRoute, type MatchWitness, type RouteRef } from "../domain/relation-patterns";
import type { ClaimSummary, EntitySummary } from "../domain/api";
import { entitySummary, claimSummary } from "./mappers";
import { readPublicRevision } from "./public-revision";

export type RelationReadTx = Pick<Transaction, "run">;
// Only trusted aliases below are interpolated; all user values are parameters.
const claimFilter = (c: "c" | "a" | "b") => `${c}.visibility = 'published'
 AND ($predicates IS NULL OR ${c}.predicate IN $predicates)
 AND ($polarity = 'all-records' OR ${c}.polarity = 'affirmed')
 AND ($roles IS NULL OR ${c}.predicate <> 'CONTRIBUTED_TO' OR ${c}.contributionRoleId IN $roles)
 AND ($positions IS NULL OR ${c}.predicate <> 'AFFILIATED_WITH' OR ${c}.organizationPositionId IN $positions)
 AND ($eventRoles IS NULL OR ${c}.predicate <> 'PARTICIPATED_IN' OR ${c}.eventRoleId IN $eventRoles)`;
export function relationQueryParameters(condition: RelationCondition) {
  return { predicates: condition.type === "pattern" ? ["CONTRIBUTED_TO"] : condition.predicates, polarity: condition.polarity,
    roles: condition.contributionRoles, positions: condition.type === "adjacent" ? condition.organizationPositions : null,
    eventRoles: condition.type === "adjacent" ? condition.eventRoles : null,
    endpoints: Object.entries(PREDICATES).map(([predicate, p]) => ({ predicate, subjectKind: p.subjectKind, objectKind: p.objectKind })) };
}
const patternClaimFilter = (c: "a" | "b") => `${c}.visibility = 'published' AND ${c}.predicate = 'CONTRIBUTED_TO' AND ${c}.polarity = 'affirmed'
 AND ($roles IS NULL OR ${c}.contributionRoleId IN $roles)`;
const FIRST = `MATCH (e)<-[:OBJECT]-(a:Claim)-[:SUBJECT]->(p:Entity)
 WHERE ${patternClaimFilter("a")} AND e.kind = 'work' AND p.kind = 'person' AND p.id <> e.id`;
const SECOND = `MATCH (p)<-[:SUBJECT]-(b:Claim)-[:OBJECT]->(w:Entity)
 WHERE ${patternClaimFilter("b")} AND w.kind = 'work' AND w.id <> e.id AND w.id <> p.id`;
const ADJACENT = `MATCH (e)<-[:SUBJECT|OBJECT]-(c:Claim)
 MATCH (c)-[:SUBJECT]->(s:Entity), (c)-[:OBJECT]->(o:Entity)
 WHERE ${claimFilter("c")} AND s.id <> o.id
 AND any(d IN $endpoints WHERE c.predicate = d.predicate AND s.kind = d.subjectKind AND o.kind = d.objectKind)`;
// Keep each hop in its own correlated existence query. Besides avoiding route
// multiplication, this bounds the planner's join search on high-degree data.
export const OTHER_WORKS_EXISTS = `EXISTS { ${FIRST} AND EXISTS { ${SECOND} } }`;
export const ADJACENT_EXISTS = `EXISTS { ${ADJACENT} }`;
export function relationExists(condition: RelationCondition) { return condition.type === "pattern" ? OTHER_WORKS_EXISTS : ADJACENT_EXISTS; }

// Collapse parallel Claims before the next hop, so a*b citation variants never
// become route candidates. Membership has no neighbor/prefix/result cutoff.
const PATTERN_PROOF = `${FIRST} AND EXISTS { ${SECOND} }
 WITH e, p, min(a.id) AS firstId ORDER BY p.id LIMIT 1
 CALL { WITH e, p ${SECOND}
   RETURN w, min(b.id) AS secondId ORDER BY w.id, secondId LIMIT 1 }
 RETURN [e.id, p.id, w.id] AS nodeIds, [firstId, secondId] AS claimIds`;
const ADJACENT_PROOF = `${ADJACENT}
 WITH e, c, CASE WHEN s.id = e.id THEN o.id ELSE s.id END AS otherId
 RETURN [e.id, otherId] AS nodeIds, [c.id] AS claimIds ORDER BY otherId, c.id LIMIT 1`;
export function firstWitnessQuery(condition: RelationCondition) {
  return `UNWIND $rootIds AS rootId MATCH (e:Entity {id: rootId})
 CALL { WITH e ${condition.type === "pattern" ? PATTERN_PROOF : ADJACENT_PROOF} }
 RETURN rootId, nodeIds, claimIds`;
}
export async function findFirstRelationRoutes(tx: RelationReadTx, condition: RelationCondition, rootIds: string[]) {
  if (!rootIds.length) return new Map<string, RouteRef>();
  const result = await tx.run(firstWitnessQuery(condition), { ...relationQueryParameters(condition), rootIds });
  return new Map<string, RouteRef>(result.records.map(r => [r.get("rootId"), { nodeIds: r.get("nodeIds"), claimIds: r.get("claimIds") }]));
}
export const MATERIALIZE_RELATION_CLAIMS = `UNWIND $claimIds AS id
 MATCH (c:Claim {id: id}) WHERE c.visibility = 'published'
 MATCH (c)-[:SUBJECT]->(subject:Entity), (c)-[:OBJECT]->(object:Entity)
 OPTIONAL MATCH (c)-[:HAS_CITATION]->(:Citation)-[:CITES]->(source:Source)
 RETURN properties(c) AS claim, properties(subject) AS subject, properties(object) AS object, count(DISTINCT source) AS sourceCount ORDER BY claim.id`;
export async function materializeRelationRoutes(tx: RelationReadTx, condition: RelationCondition, routes: RouteRef[], expectedRevision?: string) {
  const nodes = new Map<string, EntitySummary>(), claims = new Map<string, ClaimSummary>();
  const ids = [...new Set(routes.flatMap(r => r.claimIds))].sort();
  if (ids.length) {
    const result = await tx.run(MATERIALIZE_RELATION_CLAIMS, { claimIds: ids });
    // A concurrent publication is a revision conflict, not a corrupt witness.
    if (expectedRevision) await readPublicRevision(tx, expectedRevision);
    for (const row of result.records) {
      const s = entitySummary(row.get("subject")), o = entitySummary(row.get("object"));
      const c = claimSummary(row.get("claim"), s, o, row.get("sourceCount").toNumber());
      nodes.set(s.id, s); nodes.set(o.id, o); claims.set(c.id, c);
    }
  }
  for (const route of routes) validateRelationRoute(condition, route.nodeIds[0], route, nodes, claims);
  return { nodes, claims };
}
// STEP 3 can call this inside its own read transaction, without replaying any
// neighbor pages. A witness is a reference to verify, never trusted graph data.
export async function verifyRelationWitness(tx: RelationReadTx, condition: RelationCondition, input: unknown) {
  const witness: MatchWitness = matchWitnessSchema.parse(input);
  if (witness.conditionKey !== relationConditionKey(condition)) throw new Error("Witness condition mismatch");
  await readPublicRevision(tx, witness.revision);
  const result = await materializeRelationRoutes(tx, condition, [witness.route], witness.revision);
  await readPublicRevision(tx, witness.revision);
  return { witness, ...result };
}
