import {knowledgeIdSchema} from "./knowledge-ids";
export type PublicLocale = "ja" | "en";
export function decodePublicEntityId(value:string):string|null {
 try { const decoded=decodeURIComponent(value);return knowledgeIdSchema.safeParse(decoded).success?decoded:null; } catch { return null; }
}
// Existing Japanese URLs stay valid. Only implemented public pages have counterparts.
export function publicLocalePath(path: string, locale: PublicLocale): string | null {
  const base = path.replace(/^\/en(?=\/|$)/, "") || "/";
  const entity=base.match(/^\/explore\/([^/?#]+)$/);
  if(entity){if(!decodePublicEntityId(entity[1]))return null;
   return locale==="en"?"/en"+base:base;
  }
  if (!/^\/(?:support|privacy|ai-lab|people\/[a-z][a-z0-9-]{2,29}|explore\/[0-9a-f-]{36}|t\/[^/?#]+)?$/.test(base)) return null;
  return locale === "en" ? "/en" + (base === "/" ? "" : base) : base;
}
export function localizedPublicHref(path: string, locale: PublicLocale) { return publicLocalePath(path, locale) ?? path; }
