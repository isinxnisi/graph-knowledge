import type { MetadataRoute } from "next";
import { publicationPolicy, sitemapEntities } from "../lib/server/publication";
import { PUBLIC_ORIGIN } from "../lib/domain/publication";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!(await publicationPolicy()).public) return [];
  return [{ url: PUBLIC_ORIGIN + "/" }, { url: PUBLIC_ORIGIN + "/privacy" }, ...(await sitemapEntities()).map(id => ({ url: `${PUBLIC_ORIGIN}/explore/${id}` }))];
}
