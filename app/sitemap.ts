import type { MetadataRoute } from "next";
import { publicationPolicy, sitemapEntities } from "../lib/server/publication";
import {knowledgePublicationPreview} from "../lib/server/knowledge-publication-preview";
import {publicThemeRead,hasThemeLocale,themePath} from "../lib/server/theme-reading-page";
import { PUBLIC_ORIGIN } from "../lib/domain/publication";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!(await publicationPolicy()).public) return [];
  const paths = ["/", "/privacy", "/support", ...(await sitemapEntities()).map(id => `/explore/${id}`)];
  const themes=await (await knowledgePublicationPreview()).themes();
  const themeEntries:MetadataRoute.Sitemap=[];
  for(const t of themes.themes){const ja=await publicThemeRead(t.id,"ja"),en=await publicThemeRead(t.id,"en");for(const locale of ["ja","en"] as const)if(hasThemeLocale(locale==="ja"?ja:en,locale))themeEntries.push({url:PUBLIC_ORIGIN+themePath(t.id,locale),lastModified:ja.theme.createdAt});}
  return [...themeEntries,...paths.flatMap(path => [{ url: PUBLIC_ORIGIN + path }, { url: PUBLIC_ORIGIN + "/en" + (path === "/" ? "" : path) }])];
}
