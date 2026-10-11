import { datasetMode, type DatasetMode } from "../domain/dataset";
import { explorationLabels } from "../i18n/exploration";
import { z } from "zod";
import { ApiError } from "./http";
import { dataReleaseLabels } from "../i18n/data-release";
import { explorationKey, predicateKey, type EventRoleFilter, type ContributionRoleFilter, type OrganizationPositionFilter, type PredicateFilter } from "../domain/exploration";

const v4Schema = z.strictObject({ v: z.literal(4), center: z.uuidv4(), condition: z.string(), dataset: z.string(), after: z.uuidv4() });
const v5Schema = v4Schema.extend({ v: z.literal(5), revision: z.string().min(1).max(160) });
const v3Schema = z.strictObject({ v: z.literal(3), center: z.uuidv4(), condition: z.string(), dataset: z.string(), after: z.uuidv4() });
const v2Schema = z.strictObject({ v: z.literal(2), center: z.uuidv4(), condition: z.string(), dataset: z.string(), after: z.uuidv4() });
const schema = z.strictObject({ v: z.literal(1), center: z.uuidv4(), condition: z.string(), after: z.uuidv4() });
export function encodeNeighborCursor(center: string, predicates: PredicateFilter, after: string, roles: ContributionRoleFilter = null, dataset: DatasetMode = datasetMode(process.env.GRAPH_DATASET), positions: OrganizationPositionFilter = null, eventRoles: EventRoleFilter = null, revision?: string): string {
  if (dataset === "public-kg") {
    if (!revision) throw new Error("Public cursor requires revision");
    return Buffer.from(JSON.stringify({ v: 5, center, condition: explorationKey(predicates, roles, positions, eventRoles), dataset, revision, after })).toString("base64url");
  }
  if (eventRoles !== null || dataset === "pilot-event-v1") return Buffer.from(JSON.stringify({ v: 4, center, condition: explorationKey(predicates, roles, positions, eventRoles), dataset, after })).toString("base64url");
  if (positions !== null || dataset === "pilot-science-v2") return Buffer.from(JSON.stringify({ v: 3, center, condition: explorationKey(predicates, roles, positions), dataset, after })).toString("base64url");
  if (roles !== null || dataset === "pilot-urasawa-v2" || dataset === "pilot-science-v1") return Buffer.from(JSON.stringify({ v: 2, center, condition: explorationKey(predicates, roles), dataset, after })).toString("base64url");
  return predicates === null ? after : Buffer.from(JSON.stringify({ v: 1, center, condition: predicateKey(predicates), after })).toString("base64url");
}
export function decodeNeighborCursor(cursor: string | null, center: string, predicates: PredicateFilter, roles: ContributionRoleFilter = null, dataset: DatasetMode = datasetMode(process.env.GRAPH_DATASET), positions: OrganizationPositionFilter = null, eventRoles: EventRoleFilter = null, revision?: string): string | null {
  if (cursor === null) return null;
  try {
    if (dataset === "public-kg") {
      if (cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("Invalid cursor");
      const value = v5Schema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
      if (value.center !== center || value.dataset !== dataset || value.condition !== explorationKey(predicates, roles, positions, eventRoles)) throw new Error("Cursor scope mismatch");
      if (value.revision !== revision) throw new ApiError(409, "DATASET_CHANGED", dataReleaseLabels().changed);
      return value.after.toLowerCase();
    }
    if (eventRoles !== null || dataset === "pilot-event-v1") {
      if (cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("Invalid cursor");
      const value = v4Schema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
      if (value.center !== center || value.dataset !== dataset || value.condition !== explorationKey(predicates, roles, positions, eventRoles)) throw new Error("Cursor scope mismatch");
      return value.after.toLowerCase();
    }
    if (positions !== null || dataset === "pilot-science-v2") {
      if (cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("Invalid cursor");
      const value = v3Schema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
      if (value.center !== center || value.dataset !== dataset || value.condition !== explorationKey(predicates, roles, positions)) throw new Error("Cursor scope mismatch");
      return value.after.toLowerCase();
    }
    if (roles !== null || dataset === "pilot-urasawa-v2" || dataset === "pilot-science-v1") {
      if (cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("Invalid cursor");
      const value = v2Schema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
      if (value.center !== center || value.dataset !== dataset || value.condition !== explorationKey(predicates, roles)) throw new Error("Cursor scope mismatch");
      return value.after.toLowerCase();
    }
    if (predicates === null) return z.uuidv4().parse(cursor).toLowerCase();
    if (cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("Invalid cursor");
    const value = schema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (value.center !== center || value.condition !== predicateKey(predicates)) throw new Error("Cursor scope mismatch");
    return value.after.toLowerCase();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "INVALID_ARGUMENT", explorationLabels().invalidCursor);
  }
}
