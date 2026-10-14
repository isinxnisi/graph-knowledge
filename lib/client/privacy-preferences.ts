export const privacyKey = "plunode:privacy:v1";
export type PrivacyPreferences = { analytics: boolean; ads: boolean };
export function readPrivacy(value: string | null): PrivacyPreferences | null {
  try { const parsed = JSON.parse(value ?? "null"); return parsed && typeof parsed.analytics === "boolean" && typeof parsed.ads === "boolean" ? { analytics: parsed.analytics, ads: parsed.ads } : null; } catch { return null; }
}
