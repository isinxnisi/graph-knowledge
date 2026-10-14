import type { MetadataRoute } from "next";
import { publicationPolicy } from "../lib/server/publication";
import { PUBLIC_ORIGIN } from "../lib/domain/publication";
export const dynamic = "force-dynamic";
export default async function robots(): Promise<MetadataRoute.Robots> {
  if (!(await publicationPolicy()).public) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: ["/member", "/shared", "/api/", "/integrations/"] }, sitemap: PUBLIC_ORIGIN + "/sitemap.xml" };
}
