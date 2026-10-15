export const privacyKey = "plunode:privacy:v1";
export type PrivacyPreferences = { analytics: boolean; ads: boolean; adsConsent?: boolean };
export function readPrivacy(value: string | null): PrivacyPreferences | null {
  try {
    const parsed = JSON.parse(value ?? "null");
    if (!parsed || typeof parsed.analytics !== "boolean" || typeof parsed.ads !== "boolean" || (parsed.adsConsent !== undefined && typeof parsed.adsConsent !== "boolean")) return null;
    // Legacy ads:true was only stored after an explicit opt-in in the previous UI.
    return { analytics: parsed.analytics, ads: parsed.ads, ...(parsed.adsConsent !== undefined ? { adsConsent: parsed.adsConsent } : {}) };
  } catch { return null; }
}
export function advertisingAllowed(choice: PrivacyPreferences | null, defaultOn: boolean) {
  if (choice?.ads === false) return false;
  return defaultOn || (choice?.ads === true && choice.adsConsent !== false);
}
