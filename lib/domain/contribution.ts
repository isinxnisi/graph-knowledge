import { z } from "zod";
// Historical minimum: later adoptions are validated against the immutable catalog/reviews.
export const ADOPTED_CONTRIBUTION_ROLE_IDS = ["SCRIPT_WRITING", "SUPERVISION", "PRODUCING", "STORY_CO_CREATION", "AUTHORSHIP", "CREATION", "DRAWING", "ORIGINAL_STORY"] as const;
// Recognized for beta evaluation; registration is not semantic approval.
export const PENDING_CONTRIBUTION_ROLE_IDS = ["DIRECTING", "ACTING"] as const;
export const CONTRIBUTION_ROLE_IDS = [...ADOPTED_CONTRIBUTION_ROLE_IDS, ...PENDING_CONTRIBUTION_ROLE_IDS] as const;
export type ContributionRoleId = typeof CONTRIBUTION_ROLE_IDS[number];
export const roleIdSchema = z.enum(CONTRIBUTION_ROLE_IDS);
import { languageSchema, originalTermEvidenceSchema } from "./evidence";
export { languageSchema } from "./evidence";
export const isbn13Schema = z.string().regex(/^(978|979)\d{10}$/).refine((value) => [...value].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1), 0) % 10 === 0, "Invalid ISBN checksum");
export const publicationScopeSchema = z.strictObject({ kind: z.literal("publication"), isbn13: isbn13Schema,
  volumeLabel: z.string().trim().min(1).nullable(), editionLabel: z.string().trim().min(1).nullable(), language: languageSchema });
export const contributionSchema = z.strictObject({ roleId: roleIdSchema.nullable(), scope: publicationScopeSchema.nullable() });
export const roleEvidenceSchema = originalTermEvidenceSchema;
export type Contribution = z.infer<typeof contributionSchema>;
export type RoleEvidence = z.infer<typeof roleEvidenceSchema>;
export function contributionOf(claim: { predicate: string; contribution?: Contribution | null }): Contribution | null {
  return claim.predicate === "CONTRIBUTED_TO" ? claim.contribution ?? { roleId: null, scope: null } : null;
}
export function comparisonCategory(a: { predicate: string; contribution?: Contribution | null }, b: { predicate: string; contribution?: Contribution | null }): "same" | "role" | "scope" | "unstructured" {
  const left = contributionOf(a), right = contributionOf(b);
  if (!left?.scope || !right?.scope) return "unstructured";
  if (left.roleId !== right.roleId) return "role";
  return left.scope.isbn13 === right.scope.isbn13 ? "same" : "scope";
}
export function contributionProperties(value: Contribution | null) {
  return { contributionRoleId: value?.roleId ?? null, contributionScopeKind: value?.scope?.kind ?? null,
    contributionScopeIsbn13: value?.scope?.isbn13 ?? null, contributionScopeVolumeLabel: value?.scope?.volumeLabel ?? null,
    contributionScopeEditionLabel: value?.scope?.editionLabel ?? null, contributionScopeLanguage: value?.scope?.language ?? null };
}
export function storedContribution(properties: Record<string, unknown>, predicate: string): Contribution | null {
  const hasScope = Object.keys(properties).some((key) => key.startsWith("contributionScope") && properties[key] != null);
  const value = contributionSchema.parse({ roleId: properties.contributionRoleId ?? null,
    scope: !hasScope ? null : { kind: properties.contributionScopeKind, isbn13: properties.contributionScopeIsbn13,
      volumeLabel: properties.contributionScopeVolumeLabel ?? null, editionLabel: properties.contributionScopeEditionLabel ?? null, language: properties.contributionScopeLanguage } });
  if (predicate !== "CONTRIBUTED_TO") {
    if (value.roleId !== null || value.scope !== null) throw new Error("Contribution on another predicate");
    return null;
  }
  return value;
}
