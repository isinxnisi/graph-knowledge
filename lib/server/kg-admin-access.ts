import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export const ADMIN_HOST = "plunode-admin.isinxnisi.com";
export const ADMIN_HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow, noarchive", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; form-action 'self'" };
const keysets = new Map<string, JWTVerifyGetKey>();
export function adminConfiguration(env = process.env) {
  const team = env.KG_ADMIN_ACCESS_TEAM, audience = env.KG_ADMIN_ACCESS_AUD;
  if (env.KG_ADMIN_ENABLED !== "1" || env.GRAPH_DATASET !== "public-kg" || env.GRAPH_FILM_BETA === "1"
    || !team || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(team) || !audience || !/^[a-f0-9]{64}$/.test(audience)) return null;
  return { issuer: `https://${team}.cloudflareaccess.com`, audience };
}
export async function verifyAdminJwt(token: string, config: NonNullable<ReturnType<typeof adminConfiguration>>, keys: JWTVerifyGetKey) {
  const { payload } = await jwtVerify(token, keys, { issuer: config.issuer, audience: config.audience, algorithms: ["RS256"], requiredClaims: ["exp", "iat", "sub", "email"], clockTolerance: 5 });
  return typeof payload.email === "string" && payload.email.length > 0 && typeof payload.sub === "string" && payload.sub.length > 0 && payload.type === "app";
}
export async function adminAuthorized(headers: Pick<Headers, "get">): Promise<boolean> {
  const config = adminConfiguration();
  if (!config || ![ADMIN_HOST, `${ADMIN_HOST}:443`].includes((headers.get("host") ?? "").toLowerCase())) return false;
  const token = headers.get("cf-access-jwt-assertion");
  if (!token || token.length > 16_384) return false;
  try {
    let keys = keysets.get(config.issuer);
    if (!keys) { keys = createRemoteJWKSet(new URL(`${config.issuer}/cdn-cgi/access/certs`), { timeoutDuration: 3000, cooldownDuration: 30_000, cacheMaxAge: 300_000 }); keysets.set(config.issuer, keys); }
    return await verifyAdminJwt(token, config, keys);
  } catch { return false; }
}
