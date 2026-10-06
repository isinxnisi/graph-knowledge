import { normalizePredicates, type PredicateFilter } from "../domain/exploration";
import { PREDICATE_KEYS, type Predicate } from "../domain/predicates";

// 探索入口の対応表。Claim語彙・保存条件とは独立させる。
export const RELATION_FACET_CATALOG = {
  version: 1,
  items: [
    { id: "relation.work-production", predicates: ["CONTRIBUTED_TO"] },
    { id: "relation.organization-involvement", predicates: ["AFFILIATED_WITH"] },
    { id: "relation.event-participation", predicates: ["PARTICIPATED_IN"] },
  ],
} as const satisfies { version: number; items: readonly { id: string; predicates: readonly Predicate[] }[] };
export type RelationFacetId = typeof RELATION_FACET_CATALOG.items[number]["id"];

export function resolveRelationFacets(ids: readonly string[] | null): PredicateFilter {
  if (ids === null) return null;
  return normalizePredicates(ids.flatMap(id => {
    const facet = RELATION_FACET_CATALOG.items.find(item => item.id === id);
    if (!facet) throw new Error(`Unknown relation facet: ${id}`);
    return [...facet.predicates];
  }));
}

// 完全一致する場合のみ表示入口へ逆引きする。近いfacetへ丸めない。
export function facetsForPredicates(values: PredicateFilter): RelationFacetId[] | null {
  const predicates = normalizePredicates(values);
  if (predicates === null) return null;
  const items = RELATION_FACET_CATALOG.items.filter(item => item.predicates.every(predicate => predicates.includes(predicate)));
  const ids = items.map(item => item.id);
  const resolved = resolveRelationFacets(ids)!;
  return resolved.length === predicates.length && resolved.every(predicate => predicates.includes(predicate)) ? ids : null;
}

export type RelationSelection =
  | { mode: "all" }
  | { mode: "facets"; ids: RelationFacetId[] }
  | { mode: "custom"; predicates: Predicate[] };
export function selectionFromPredicates(values: PredicateFilter): RelationSelection {
  const predicates = normalizePredicates(values);
  if (predicates === null) return { mode: "all" };
  const ids = facetsForPredicates(predicates);
  return ids === null ? { mode: "custom", predicates } : { mode: "facets", ids };
}
export function resolveRelationSelection(selection: RelationSelection): PredicateFilter {
  return selection.mode === "all" ? null : selection.mode === "facets" ? resolveRelationFacets(selection.ids) : normalizePredicates(selection.predicates);
}
export function changeSelectionMode(selection: RelationSelection, mode: RelationSelection["mode"]): RelationSelection {
  const predicates = resolveRelationSelection(selection);
  if (mode === "all") return { mode };
  if (mode === "custom") return { mode, predicates: predicates ?? [...PREDICATE_KEYS] };
  return { mode, ids: facetsForPredicates(predicates) ?? [] };
}
