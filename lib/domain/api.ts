import { contributionSchema, roleEvidenceSchema } from "./contribution";
import { z } from "zod";
import { entitySchema, claimSchema, citationSchema, sourceSchema } from "./fixture";

export const entitySummarySchema = entitySchema.pick({ id: true, kind: true, name: true, description: true });
export const entityDetailSchema = entitySummarySchema.extend({ aliases: entitySchema.shape.aliases });
export const claimSummarySchema = claimSchema.omit({ visibility: true, createdAt: true, updatedAt: true })
  .extend({ contribution: contributionSchema.nullable(), sourceCount: z.number().int().nonnegative() });
export const citationDetailSchema = citationSchema.omit({ claimId: true, sourceId: true })
  .extend({ source: sourceSchema, roleEvidence: roleEvidenceSchema.nullable() });
export const claimDetailSchema = claimSummarySchema.extend({
  createdAt: claimSchema.shape.createdAt, updatedAt: claimSchema.shape.updatedAt,
  citations: z.array(citationDetailSchema),
});

export type EntitySummary = z.infer<typeof entitySummarySchema>;
export type EntityDetail = z.infer<typeof entityDetailSchema>;
export type ClaimSummary = z.infer<typeof claimSummarySchema>;
export type ClaimDetail = z.infer<typeof claimDetailSchema>;
export type CitationDetail = z.infer<typeof citationDetailSchema>;
export type SourceDetail = z.infer<typeof sourceSchema>;
export type EntitySearchResponse = { items: EntitySummary[]; hasMore: boolean };
export type EntityResponse = { entity: EntityDetail };
export type NeighborsResponse = {
  centerId: string; nodes: EntitySummary[]; claims: ClaimSummary[];
  page: { nextCursor: string | null; hasMore: boolean };
};
export type ClaimResponse = { claim: ClaimDetail; relatedClaimIds: string[] };

// 登録主張の集計。関係先・根拠・探索cursorは含めない。
export const overviewCountsSchema = z.strictObject({ affirmed: z.number().int().nonnegative(), denied: z.number().int().nonnegative() });
export const entityOverviewSchema = z.strictObject({
  entity: entitySummarySchema,
  scope: z.strictObject({ dataset: z.enum(["demo", "pilot-urasawa-v1", "pilot-urasawa-v2"]), visibility: z.literal("published"), filtered: z.literal(false), unit: z.literal("claim") }),
  relations: z.array(z.strictObject({
    predicate: claimSchema.shape.predicate,
    perspective: z.enum(["subject", "object"]),
    counts: overviewCountsSchema,
    contributionRoles: z.array(z.strictObject({ roleId: contributionSchema.shape.roleId, counts: overviewCountsSchema })),
  })),
});
export type EntityOverviewResponse = z.infer<typeof entityOverviewSchema>;
