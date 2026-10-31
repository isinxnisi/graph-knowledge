import type { MetadataRoute } from "next";
import { publicationPolicy } from "../lib/server/publication";
import { PUBLIC_ORIGIN } from "../lib/domain/publication";
export const dynamic = "force-dynamic";
export default async function robots(): Promise<MetadataRoute.Robots> {
  if (!(await publicationPolicy()).public) return { rules: { userAgent: "*", disallow: "/" } };
  // Shared pages and their OGP images must be fetchable by social crawlers.
  // Their own noindex metadata/headers keep them out of search results.
  return { rules: { userAgent: "*", allow: "/", disallow: ["/member", "/api/", "/integrations/"] }, sitemap: PUBLIC_ORIGIN + "/sitemap.xml" };
}
