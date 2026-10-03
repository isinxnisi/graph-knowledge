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
