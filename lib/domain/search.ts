export function normalizeSearch(value: string): string {
  return value.trim().normalize("NFKC").toLowerCase();
}

// 検索可能な対象。探索のkind条件ではない。
export const SEARCH_KINDS = ["person", "work", "organization", "event"] as const;
export type SearchKind = typeof SEARCH_KINDS[number];
