import type { z } from "zod";
import type { PartialDate } from "./dates";
import type { Predicate } from "./predicates";
import { contributionOf, roleIdSchema, type Contribution } from "./contribution";
import { organizationParticipationOf, organizationPositionSchema, type OrganizationParticipation } from "./organization-participation";

// 登録済み二型だけ。公開schemaに自由key/valueや共通Role enumを設けない。
export const QUALIFICATION_TYPES = {
  contribution: { predicate: "CONTRIBUTED_TO", valueSchema: roleIdSchema },
  organizationParticipation: { predicate: "AFFILIATED_WITH", valueSchema: organizationPositionSchema },
} as const;
export function invalidQualificationFields(claim: { predicate: string; contribution?: Contribution | null; organizationParticipation?: OrganizationParticipation | null }): string[] {
  return (Object.keys(QUALIFICATION_TYPES) as (keyof typeof QUALIFICATION_TYPES)[]).filter(key => claim[key] != null && claim.predicate !== QUALIFICATION_TYPES[key].predicate);
}
export function normalizeScopedValues<T extends string>(values: readonly T[] | null, predicates: readonly Predicate[] | null, predicate: Predicate, schema: z.ZodType<T>): T[] | null {
  if (values === null) return null;
  const parsed = [...new Set(values.map(value => schema.parse(value)))].sort();
  return predicates !== null && !predicates.includes(predicate) ? null : parsed;
}
export function matchesScopedValue<T extends string>(predicate: Predicate, applicable: Predicate, value: T | null, filter: readonly T[] | null): boolean {
  return predicate !== applicable || filter === null || (value !== null && filter.includes(value));
}
type QualifiedClaim = { subjectId: string; objectId: string; predicate: Predicate; contribution?: Contribution | null; organizationParticipation?: OrganizationParticipation | null; period: { from: PartialDate | null; to: PartialDate | null } };
// 比較対象キー。Claim UUIDや真偽の評価とは別。肯否はこの命題全体に掛かる。
export function claimComparisonKey(claim: QualifiedClaim): string {
  const contribution = contributionOf(claim);
  const qualification = claim.predicate === "CONTRIBUTED_TO"
    ? { type: "contribution", roleId: contribution?.roleId ?? null, scope: contribution?.scope ? { kind: contribution.scope.kind, isbn13: contribution.scope.isbn13, language: contribution.scope.language } : null }
    : claim.predicate === "AFFILIATED_WITH" ? { type: "organizationParticipation", positionId: organizationParticipationOf(claim)?.positionId ?? null } : null;
  const period = claim.period;
  const date = (value: typeof period.from) => value ? [value.value, value.precision] : null;
  return JSON.stringify([claim.subjectId, claim.predicate, claim.objectId, qualification, date(period.from), date(period.to)]);
}
