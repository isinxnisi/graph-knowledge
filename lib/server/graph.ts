import "server-only";
import { datasetMode } from "../domain/dataset";
import { entityOverviewSchema, type EntityOverviewResponse } from "../domain/api";
import { PREDICATE_KEYS } from "../domain/predicates";
import { roleIdSchema } from "../domain/contribution";
import { organizationPositionSchema } from "../domain/organization-participation";
import { eventRoleSchema } from "../domain/event-participation";
import { int } from "neo4j-driver";
import { claimDetailSchema, type EntitySearchResponse, type EntityResponse, type NeighborsResponse, type ClaimResponse } from "../domain/api";
import type { EventRoleFilter, ContributionRoleFilter, OrganizationPositionFilter, PredicateFilter } from "../domain/exploration";
import { encodeNeighborCursor } from "./neighbor-cursor";
import { ApiError } from "./http";
import { readTransaction } from "./read-db";
import { entitySummary, entityDetail, claimSummary, citationDetail, relatedId } from "./mappers";
import { SEARCH_ENTITIES, ENTITY_DETAIL, NEIGHBORS, NEIGHBORS_BY_ROLE, NEIGHBORS_BY_QUALIFICATION, NEIGHBORS_BY_EVENT, CLAIM_DETAIL, RELATED_CLAIMS, ENTITY_OVERVIEW } from "./queries";

const notFound = () => new ApiError(404, "NOT_FOUND", "対象のデータが見つかりません。");

export function searchEntities(q: string, limit: number, kinds: readonly import("../domain/search").SearchKind[]): Promise<EntitySearchResponse> {
  return readTransaction(async (tx) => {
    const result = await tx.run(SEARCH_ENTITIES, { q, kinds, take: int(limit + 1) });
    return { items: result.records.slice(0, limit).map((record) => entityDetail(record.get("entity"))), hasMore: result.records.length > limit };
  });
}

export function getEntity(id: string): Promise<EntityResponse> {
  return readTransaction(async (tx) => {
    const result = await tx.run(ENTITY_DETAIL, { id });
    if (!result.records.length) throw notFound();
    return { entity: entityDetail(result.records[0].get("entity")) };
  });
}

export function getNeighbors(id: string, limit: number, after: string | null, predicates: PredicateFilter = null, contributionRoles: ContributionRoleFilter = null, organizationPositions: OrganizationPositionFilter = null, eventRoles: EventRoleFilter = null): Promise<NeighborsResponse> {
  return readTransaction(async (tx) => {
    const centerResult = await tx.run(ENTITY_DETAIL, { id });
    if (!centerResult.records.length) throw notFound();
    const center = entitySummary(centerResult.records[0].get("entity"));
    const result = await tx.run(eventRoles !== null ? NEIGHBORS_BY_EVENT : organizationPositions !== null ? NEIGHBORS_BY_QUALIFICATION : contributionRoles === null ? NEIGHBORS : NEIGHBORS_BY_ROLE, { id, after, predicates, contributionRoles, organizationPositions, eventRoles, take: int(limit + 1) });
    const nodes = new Map([[center.id, center]]);
    const claims = result.records.slice(0, limit).map((record) => {
      const subject = entitySummary(record.get("subject"));
      const object = entitySummary(record.get("object"));
      nodes.set(subject.id, subject); nodes.set(object.id, object);
      return claimSummary(record.get("claim"), subject, object, record.get("sourceCount").toNumber());
    });
    const hasMore = result.records.length > limit;
    return { centerId: id, nodes: [...nodes.values()], claims,
      page: { hasMore, nextCursor: hasMore ? encodeNeighborCursor(id, predicates, claims.at(-1)!.id, contributionRoles, undefined, organizationPositions, eventRoles) : null } };
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
    if (citations.some(c => c.eventParticipationEvidence && !summary.eventParticipation || c.positionEvidence && !summary.organizationParticipation || c.roleEvidence && summary.predicate !== "CONTRIBUTED_TO")) throw new Error("Stored evidence qualification mismatch");
    const claim = claimDetailSchema.parse({ ...summary, createdAt: properties.createdAt, updatedAt: properties.updatedAt, citations });
    const related = await tx.run(RELATED_CLAIMS, { id, subjectId: summary.subjectId, objectId: summary.objectId, predicate: summary.predicate });
    return { claim, relatedClaimIds: related.records.map((r) => relatedId(r.get("id"))) };
  });
}

export function getEntityOverview(id: string): Promise<EntityOverviewResponse> {
  return readTransaction(async (tx) => {
    const center = await tx.run(ENTITY_DETAIL, { id });
    if (!center.records.length) throw notFound();
    const result = await tx.run(ENTITY_OVERVIEW, { id });
    const groups = new Map<string, EntityOverviewResponse["relations"][number]>();
    for (const record of result.records) {
      const predicate = record.get("predicate");
      const perspective = record.get("perspective");
      const polarity: "affirmed" | "denied" = record.get("polarity");
      const roleId = roleIdSchema.nullable().parse(record.get("roleId"));
      const positionId = organizationPositionSchema.nullable().parse(record.get("positionId"));
      const eventRoleId = eventRoleSchema.nullable().parse(record.get("eventRoleId"));
      if (!PREDICATE_KEYS.includes(predicate) || !["subject", "object"].includes(perspective) || !["affirmed", "denied"].includes(polarity) ||
        (predicate !== "CONTRIBUTED_TO" && roleId !== null) || (predicate !== "AFFILIATED_WITH" && positionId !== null) ||
        (predicate !== "PARTICIPATED_IN" && eventRoleId !== null)) throw new Error("Invalid overview group");
      const key = `${predicate}:${perspective}`;
      const group: EntityOverviewResponse["relations"][number] = groups.get(key) ?? { predicate, perspective, counts: { affirmed: 0, denied: 0 }, contributionRoles: [], organizationPositions: [], eventRoles: [] };
      const count = record.get("count").toNumber();
      group.counts[polarity] += count;
      if (predicate === "CONTRIBUTED_TO") {
        let role = group.contributionRoles.find((value) => value.roleId === roleId);
        if (!role) { role = { roleId, counts: { affirmed: 0, denied: 0 } }; group.contributionRoles.push(role); }
        role.counts[polarity] += count;
      }
      if (predicate === "AFFILIATED_WITH") {
        let position = group.organizationPositions.find(value => value.positionId === positionId);
        if (!position) { position = { positionId, counts: { affirmed: 0, denied: 0 } }; group.organizationPositions.push(position); }
        position.counts[polarity] += count;
      }
      if (predicate === "PARTICIPATED_IN") {
        let role = group.eventRoles.find(value => value.roleId === eventRoleId);
        if (!role) { role = { roleId: eventRoleId, counts: { affirmed: 0, denied: 0 } }; group.eventRoles.push(role); }
        role.counts[polarity] += count;
      }
      groups.set(key, group);
    }
    return entityOverviewSchema.parse({ entity: entitySummary(center.records[0].get("entity")),
      scope: { dataset: datasetMode(process.env.GRAPH_DATASET), visibility: "published", filtered: false, unit: "claim" }, relations: [...groups.values()] });
  });
}
