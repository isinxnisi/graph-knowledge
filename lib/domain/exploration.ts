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

import { roleIdSchema, contributionOf, type ContributionRoleId, type Contribution } from "./contribution";
export type ContributionRoleFilter = ContributionRoleId[] | null;
export function normalizeContributionRoles(values: ContributionRoleFilter, predicates: PredicateFilter): ContributionRoleFilter {
  if (values === null) return null;
  const parsed = [...new Set(values.map((value) => roleIdSchema.parse(value)))].sort();
  return predicates !== null && !predicates.includes("CONTRIBUTED_TO") ? null : parsed;
}
export function explorationKey(predicates: PredicateFilter, roles: ContributionRoleFilter = null): string {
  return roles === null ? predicateKey(predicates) : `v2:${predicateKey(predicates)}:roles=${roles.join(",")}`;
}
export function matchesClaim(claim: { predicate: Predicate; contribution?: Contribution | null }, predicates: PredicateFilter, roles: ContributionRoleFilter = null): boolean {
  return matchesPredicate(claim.predicate, predicates) && (claim.predicate !== "CONTRIBUTED_TO" || roles === null || (contributionOf(claim)?.roleId != null && roles.includes(contributionOf(claim)!.roleId!)));
}
