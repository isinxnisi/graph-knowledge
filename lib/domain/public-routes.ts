export type PublicLocale = "ja" | "en";
// Existing Japanese URLs stay valid. Only implemented public pages have counterparts.
export function publicLocalePath(path: string, locale: PublicLocale): string | null {
  const base = path.replace(/^\/en(?=\/|$)/, "") || "/";
  if (!/^\/(?:support|privacy|ai-lab|explore\/[0-9a-f-]{36})?$/.test(base)) return null;
  return locale === "en" ? "/en" + (base === "/" ? "" : base) : base;
}
export function localizedPublicHref(path: string, locale: PublicLocale) { return publicLocalePath(path, locale) ?? path; }
