import "server-only";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { PUBLIC_ORIGIN, publicSiteEnabled, publicServicesPolicy } from "../domain/publication";
import { readTransaction } from "./read-db";
import { localizedPublicHref, type PublicLocale } from "../domain/public-routes";
import { defaultAdvertising } from "./advertising-country";

export async function publicationPolicy() {
  const requestHeaders = await headers(), host = requestHeaders.get("host"), services = publicServicesPolicy(host);
  return { public: publicSiteEnabled(host), ...services, adDefault: services.ads && defaultAdvertising(requestHeaders) };
}
export async function explorationMetadata(path: string, stateful: boolean, title = "Plunode — 知識のつながりを探索する", description = "人物・作品・組織・出来事の関係を、資料とともに辿る知識の地図。小さな発見から、次の好奇心へ。", exists = true, options: { locale?: PublicLocale; paired?: boolean; image?: string } = {}): Promise<Metadata> {
  const policy = await publicationPolicy();
  const url = PUBLIC_ORIGIN + path;
  const locale = options.locale ?? "ja", image = PUBLIC_ORIGIN + (options.image ?? (locale === "en" ? "/en/opengraph-image" : "/opengraph-image"));
  return { title, description, alternates: { canonical: url, ...(options.paired && exists && !stateful ? { languages: { ja: PUBLIC_ORIGIN + localizedPublicHref(path, "ja"), en: PUBLIC_ORIGIN + localizedPublicHref(path, "en"), "x-default": PUBLIC_ORIGIN + localizedPublicHref(path, "ja") } } : {}) }, robots: { index: policy.public && !stateful && exists, follow: policy.public, noarchive: !policy.public },
    openGraph: { type: "website", siteName: "Plunode", title, description, url, locale: locale === "en" ? "en_US" : "ja_JP", images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [image] } };
}
export async function sitemapEntities(): Promise<string[]> {
  return readTransaction(async tx => {
    const result = await tx.run("MATCH (e:Entity)<-[:SUBJECT|OBJECT]-(c:Claim) WHERE c.visibility = 'published' RETURN DISTINCT e.id AS id ORDER BY id LIMIT 50001");
    if (result.records.length > 50000) throw new Error("Sitemap requires pagination");
    return result.records.map(record => String(record.get("id"))).filter(id => /^[0-9a-f-]{36}$/.test(id));
  });
}
