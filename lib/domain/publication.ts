export const PUBLIC_ORIGIN = "https://plunode.net";
export const AD_ORIGIN = "https://ads.plunode.net";
export const GA_MEASUREMENT_ID = "G-PSKLWY33K4";
export const AD_TAGS = { desktop: "ef4ef4eaf302d0f6b49e5114ad6d5213", mobile: "93ba1c5c8d797794cf1c721bce01ff42" } as const;
export type PublicServicesPolicy = { analytics: boolean; ads: boolean; adDefault?: boolean };
export function publicSiteEnabled(host: string | null, env: Record<string, string | undefined> = process.env) {
  return env.GRAPH_DATASET === "public-kg" && env.PLUNODE_PUBLIC_ENABLED === "1" && (host === "plunode.net" || host === "plunode.net:443");
}
export function publicServicesPolicy(host: string | null, env: Record<string, string | undefined> = process.env): PublicServicesPolicy {
  const adHost = host !== null && /^(?:plunode\.net(?::443)?|graph-beta\.isinxnisi\.com|127\.0\.0\.1:\d+|localhost:\d+)$/.test(host);
  return { analytics: publicSiteEnabled(host, env), ads: env.GRAPH_DATASET === "public-kg" && env.PLUNODE_ADS_ENABLED === "1" && adHost };
}
export function adFrameEnabled(host: string | null, env: Record<string, string | undefined> = process.env) {
  return env.GRAPH_DATASET === "public-kg" && env.PLUNODE_ADS_ENABLED === "1" && host !== null && /^(?:ads\.plunode\.net(?::443)?|ads\.localhost:\d+)$/.test(host);
}
export function publicPagePath(path: string) {
  return /^(?:\/en)?\/explore\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(path) ? path : path === "/en" ? "/en" : "/";
}
export const PUBLIC_EVENTS = ["search", "explore_start", "graph_expand", "relation_detail", "source_open"] as const;
export type PublicEvent = typeof PUBLIC_EVENTS[number];
