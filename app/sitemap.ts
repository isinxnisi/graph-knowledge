import type { MetadataRoute } from "next";
import { publicationPolicy, sitemapEntities } from "../lib/server/publication";
import { PUBLIC_ORIGIN } from "../lib/domain/publication";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!(await publicationPolicy()).public) return [];
  const paths = ["/", "/privacy", "/support", ...(await sitemapEntities()).map(id => `/explore/${id}`)];
  return paths.flatMap(path => [{ url: PUBLIC_ORIGIN + path }, { url: PUBLIC_ORIGIN + "/en" + (path === "/" ? "" : path) }]);
}
