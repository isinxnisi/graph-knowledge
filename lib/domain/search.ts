export function normalizeSearch(value: string): string {
  return value.trim().normalize("NFKC").toLowerCase();
}
