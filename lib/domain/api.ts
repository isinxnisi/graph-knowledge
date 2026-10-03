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
