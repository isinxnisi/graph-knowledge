import { z } from "zod";
import { originalTermEvidenceSchema } from "./evidence";

// 原資料上の立場。雇用形態・日本の職位への変換は行わない。
export const ORGANIZATION_POSITION_IDS = ["VISITOR", "ASSOCIATE_PROFESSOR"] as const;
export const organizationPositionSchema = z.enum(ORGANIZATION_POSITION_IDS);
export const organizationParticipationSchema = z.strictObject({ positionId: organizationPositionSchema });
export const positionEvidenceSchema = originalTermEvidenceSchema;
export type OrganizationPositionId = typeof ORGANIZATION_POSITION_IDS[number];
export type OrganizationParticipation = z.infer<typeof organizationParticipationSchema>;
export type PositionEvidence = z.infer<typeof positionEvidenceSchema>;
export function organizationParticipationOf(claim: { predicate: string; organizationParticipation?: OrganizationParticipation | null }): OrganizationParticipation | null {
  return claim.predicate === "AFFILIATED_WITH" ? claim.organizationParticipation ?? null : null;
}
export function organizationParticipationProperties(value: OrganizationParticipation | null) {
  return { organizationPositionId: value?.positionId ?? null };
}
export function storedOrganizationParticipation(properties: Record<string, unknown>, predicate: string): OrganizationParticipation | null {
  if (properties.organizationPositionId == null) return null;
  if (predicate !== "AFFILIATED_WITH") throw new Error("Organization participation on another predicate");
  return organizationParticipationSchema.parse({ positionId: properties.organizationPositionId });
}
