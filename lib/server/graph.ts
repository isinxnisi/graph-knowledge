import "server-only";
import { int } from "neo4j-driver";
import { claimDetailSchema, type EntitySearchResponse, type EntityResponse, type NeighborsResponse, type ClaimResponse } from "../domain/api";
import type { ContributionRoleFilter, PredicateFilter } from "../domain/exploration";
import { encodeNeighborCursor } from "./neighbor-cursor";
import { ApiError } from "./http";
import { readTransaction } from "./read-db";
import { entitySummary, entityDetail, claimSummary, citationDetail, relatedId } from "./mappers";
import { SEARCH_ENTITIES, ENTITY_DETAIL, NEIGHBORS, NEIGHBORS_BY_ROLE, CLAIM_DETAIL, RELATED_CLAIMS } from "./queries";

const notFound = () => new ApiError(404, "NOT_FOUND", "対象のデータが見つかりません。");

export function searchEntities(q: string, limit: number): Promise<EntitySearchResponse> {
  return readTransaction(async (tx) => {
    const result = await tx.run(SEARCH_ENTITIES, { q, take: int(limit + 1) });
    return { items: result.records.slice(0, limit).map((record) => entitySummary(record.get("entity"))), hasMore: result.records.length > limit };
  });
}

export function getEntity(id: string): Promise<EntityResponse> {
  return readTransaction(async (tx) => {
    const result = await tx.run(ENTITY_DETAIL, { id });
    if (!result.records.length) throw notFound();
    return { entity: entityDetail(result.records[0].get("entity")) };
  });
}

export function getNeighbors(id: string, limit: number, after: string | null, predicates: PredicateFilter = null, contributionRoles: ContributionRoleFilter = null): Promise<NeighborsResponse> {
  return readTransaction(async (tx) => {
    const centerResult = await tx.run(ENTITY_DETAIL, { id });
    if (!centerResult.records.length) throw notFound();
    const center = entitySummary(centerResult.records[0].get("entity"));
    const result = await tx.run(contributionRoles === null ? NEIGHBORS : NEIGHBORS_BY_ROLE, { id, after, predicates, contributionRoles, take: int(limit + 1) });
    const nodes = new Map([[center.id, center]]);
    const claims = result.records.slice(0, limit).map((record) => {
      const subject = entitySummary(record.get("subject"));
      const object = entitySummary(record.get("object"));
      nodes.set(subject.id, subject); nodes.set(object.id, object);
      return claimSummary(record.get("claim"), subject, object, record.get("sourceCount").toNumber());
    });
    const hasMore = result.records.length > limit;
    return { centerId: id, nodes: [...nodes.values()], claims,
      page: { hasMore, nextCursor: hasMore ? encodeNeighborCursor(id, predicates, claims.at(-1)!.id, contributionRoles) : null } };
  });
}

export function getClaim(id: string): Promise<ClaimResponse> {
  return readTransaction(async (tx) => {
    const result = await tx.run(CLAIM_DETAIL, { id });
    if (!result.records.length) throw notFound();
    if (result.records.length !== 1) throw new Error("Invalid claim cardinality");
    const record = result.records[0];
    const properties = record.get("claim");
    const summary = claimSummary(properties, entitySummary(record.get("subject")), entitySummary(record.get("object")), record.get("sourceCount").toNumber());
    const citations = (record.get("citations") as { citation: Record<string, unknown>; source: Record<string, unknown> }[])
      .map(({ citation, source }) => citationDetail(citation, source));
    const claim = claimDetailSchema.parse({ ...summary, createdAt: properties.createdAt, updatedAt: properties.updatedAt, citations });
    const related = await tx.run(RELATED_CLAIMS, { id, subjectId: summary.subjectId, objectId: summary.objectId, predicate: summary.predicate });
    return { claim, relatedClaimIds: related.records.map((r) => relatedId(r.get("id"))) };
  });
}
