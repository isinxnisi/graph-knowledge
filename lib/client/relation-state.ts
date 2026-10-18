import { normalizeRelationCondition, type RelationCondition } from "../domain/relation-conditions";
import type { GraphState } from "./graph-state";
import type { ViewConditions } from "./saved-views";

// Legacy conditions retain their all-records semantics, including explicit sets.
export function legacyRelation(conditions: ViewConditions): RelationCondition & { type: "adjacent" } {
  return normalizeRelationCondition({ version: 1, type: "adjacent", traversal: "either", polarity: "all-records", ...conditions }) as RelationCondition & { type: "adjacent" };
}
export function graphRelation(graph: GraphState): RelationCondition {
  return graph.relation ?? legacyRelation({ predicates: graph.predicates, contributionRoles: graph.contributionRoles ?? null,
    organizationPositions: graph.organizationPositions ?? null, eventRoles: graph.eventRoles ?? null });
}
export function freeRelation(relation: RelationCondition): RelationCondition & { type: "adjacent" } {
  if (relation.type === "adjacent") return relation;
  return { version: 1, type: "adjacent", predicates: ["CONTRIBUTED_TO"], traversal: "either", polarity: "affirmed",
    contributionRoles: relation.contributionRoles, organizationPositions: null, eventRoles: null };
}
