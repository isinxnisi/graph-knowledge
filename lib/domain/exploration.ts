import { PREDICATE_KEYS, type Predicate } from "./predicates";

// nullは無条件、空配列は空集合。全件集合は無条件へ正規化する。
export type PredicateFilter = Predicate[] | null;
export function normalizePredicates(values: readonly Predicate[] | null): PredicateFilter {
  if (values === null) return null;
  const unique = [...new Set(values)].sort();
  if (unique.some((value) => !PREDICATE_KEYS.includes(value))) throw new Error("Unknown predicate");
  return unique.length === PREDICATE_KEYS.length ? null : unique;
}
export const predicateKey = (values: PredicateFilter) => values === null ? "all" : values.length ? values.join(",") : "none";
export const matchesPredicate = (predicate: Predicate, values: PredicateFilter) => values === null || values.includes(predicate);

import { contributionOf, type ContributionRoleId, type Contribution } from "./contribution";
import { normalizeScopedValues, matchesScopedValue, QUALIFICATION_TYPES } from "./qualifications";
import { organizationParticipationOf, type OrganizationPositionId, type OrganizationParticipation } from "./organization-participation";
export type OrganizationPositionFilter = OrganizationPositionId[] | null;
export function normalizeOrganizationPositions(values: OrganizationPositionFilter, predicates: PredicateFilter): OrganizationPositionFilter {
  return normalizeScopedValues(values, predicates, QUALIFICATION_TYPES.organizationParticipation.predicate, QUALIFICATION_TYPES.organizationParticipation.valueSchema);
}
export type ContributionRoleFilter = ContributionRoleId[] | null;
export function normalizeContributionRoles(values: ContributionRoleFilter, predicates: PredicateFilter): ContributionRoleFilter {
  return normalizeScopedValues(values, predicates, QUALIFICATION_TYPES.contribution.predicate, QUALIFICATION_TYPES.contribution.valueSchema);
}
export function explorationKey(predicates: PredicateFilter, roles: ContributionRoleFilter = null, positions: OrganizationPositionFilter = null): string {
  if (positions !== null) return `v3:${predicateKey(predicates)}:roles=${roles === null ? "all" : roles.join(",")}:positions=${positions.join(",")}`;
  return roles === null ? predicateKey(predicates) : `v2:${predicateKey(predicates)}:roles=${roles.join(",")}`;
}
export function matchesClaim(claim: { predicate: Predicate; contribution?: Contribution | null; organizationParticipation?: OrganizationParticipation | null }, predicates: PredicateFilter, roles: ContributionRoleFilter = null, positions: OrganizationPositionFilter = null): boolean {
  return matchesPredicate(claim.predicate, predicates)
    && matchesScopedValue(claim.predicate, "CONTRIBUTED_TO", contributionOf(claim)?.roleId ?? null, roles)
    && matchesScopedValue(claim.predicate, "AFFILIATED_WITH", organizationParticipationOf(claim)?.positionId ?? null, positions);
}
