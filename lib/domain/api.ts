import { eventMetadataSchema, eventParticipationSchema, eventParticipationEvidenceSchema } from "./event-participation";
import { contributionSchema, roleEvidenceSchema } from "./contribution";
import { organizationParticipationSchema, organizationPositionSchema, positionEvidenceSchema } from "./organization-participation";
import { z } from "zod";
import { DATASET_MODES } from "./dataset";
import { entitySchema, claimSchema, citationSchema, sourceSchema } from "./fixture";

export const entitySummarySchema = entitySchema.pick({ id: true, kind: true, name: true, description: true });
export const entityDetailSchema = entitySummarySchema.extend({ aliases: entitySchema.shape.aliases, event: eventMetadataSchema.nullable() });
export const claimSummarySchema = claimSchema.omit({ visibility: true, createdAt: true, updatedAt: true })
  .extend({ contribution: contributionSchema.nullable(), organizationParticipation: organizationParticipationSchema.nullable(), eventParticipation: eventParticipationSchema.nullable(), sourceCount: z.number().int().nonnegative() });
export const citationDetailSchema = citationSchema.omit({ claimId: true, sourceId: true })
  .extend({ source: sourceSchema, roleEvidence: roleEvidenceSchema.nullable(), positionEvidence: positionEvidenceSchema.nullable(), eventParticipationEvidence: eventParticipationEvidenceSchema.nullable() });
export const claimDetailSchema = claimSummarySchema.extend({
  createdAt: claimSchema.shape.createdAt, updatedAt: claimSchema.shape.updatedAt,
  citations: z.array(citationDetailSchema),
  withdrawal: z.strictObject({ reason: z.string().min(1), release: z.string().min(1), replacementClaimId: z.uuidv4().nullable() }).optional(),
});

export type EntitySummary = z.infer<typeof entitySummarySchema>;
export type EntityDetail = z.infer<typeof entityDetailSchema>;
export type ClaimSummary = z.infer<typeof claimSummarySchema>;
export type ClaimDetail = z.infer<typeof claimDetailSchema>;
export type CitationDetail = z.infer<typeof citationDetailSchema>;
export type SourceDetail = z.infer<typeof sourceSchema>;
export type EntitySearchResponse = { items: EntityDetail[]; hasMore: boolean };
export type DiscoverySearchResponse = EntitySearchResponse & { nextCursor: string | null; starts: EntitySummary[] };
export type EntityResponse = { entity: EntityDetail };
export type NeighborsResponse = {
  revision?: string;
  centerId: string; nodes: EntitySummary[]; claims: ClaimSummary[];
  page: { nextCursor: string | null; hasMore: boolean };
};
export type ClaimResponse = { claim: ClaimDetail; relatedClaimIds: string[]; revision?: string };

// 登録主張の集計。関係先・根拠・探索cursorは含めない。
export const overviewCountsSchema = z.strictObject({ affirmed: z.number().int().nonnegative(), denied: z.number().int().nonnegative() });
export const entityOverviewSchema = z.strictObject({
  entity: entitySummarySchema,
  scope: z.strictObject({ dataset: z.enum(DATASET_MODES), visibility: z.literal("published"), filtered: z.literal(false), unit: z.literal("claim") }),
  relations: z.array(z.strictObject({
    predicate: claimSchema.shape.predicate,
    perspective: z.enum(["subject", "object"]),
    counts: overviewCountsSchema,
    contributionRoles: z.array(z.strictObject({ roleId: contributionSchema.shape.roleId, counts: overviewCountsSchema })),
    organizationPositions: z.array(z.strictObject({ positionId: organizationPositionSchema.nullable(), counts: overviewCountsSchema })),
    eventRoles: z.array(z.strictObject({ roleId: eventParticipationSchema.shape.roleId.nullable(), counts: overviewCountsSchema })),
  })),
});
export type EntityOverviewResponse = z.infer<typeof entityOverviewSchema>;
