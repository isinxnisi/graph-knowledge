export class MemberUnavailable extends Error {
  constructor() { super("Member service unavailable"); }
}
export type MemberConfig = {
  origin: string; databaseUrl: string; secret: string; cookiePrefix: string;
  provider: { kind: "google"; clientId: string; clientSecret: string } | { kind: "fixture"; issuer: string };
};

// No default credentials or implicit activation. Bad member configuration must
// not prevent the public graph from starting.
export function memberConfig(env: Record<string, string | undefined> = process.env): MemberConfig | null {
  if (env.MEMBER_STORAGE_ENABLED !== "1") return null;
  const { MEMBER_ORIGIN: origin, MEMBER_DATABASE_URL: databaseUrl, MEMBER_AUTH_SECRET: secret, MEMBER_COOKIE_PREFIX: cookiePrefix } = env;
  if (!origin || !databaseUrl || !secret || secret.length < 32 || !cookiePrefix || !/^gk-[a-z0-9-]{1,50}$/.test(cookiePrefix)) throw new MemberUnavailable();
  try {
    const url = new URL(origin);
    const db = new URL(databaseUrl);
    if (url.origin !== origin || url.username || url.password || !["postgres:", "postgresql:"].includes(db.protocol)) throw new Error();
    if (env.MEMBER_AUTH_PROVIDER === "fixture") {
      // A test identity selector must never be available in a production app.
      if (env.NODE_ENV === "production" || env.MEMBER_FIXTURE_ENABLED !== "1" || origin !== "http://127.0.0.1:3221"
        || db.hostname !== "127.0.0.1" || db.port !== "55432" || db.pathname !== "/graph_member_test" || cookiePrefix !== "gk-member-fixture") throw new Error();
      return { origin, databaseUrl, secret, cookiePrefix, provider: { kind: "fixture", issuer: "http://127.0.0.1:3222" } };
    }
    if (env.MEMBER_AUTH_PROVIDER !== "google" || url.protocol !== "https:" || !env.MEMBER_GOOGLE_CLIENT_ID || !env.MEMBER_GOOGLE_CLIENT_SECRET) throw new Error();
    return { origin, databaseUrl, secret, cookiePrefix, provider: { kind: "google", clientId: env.MEMBER_GOOGLE_CLIENT_ID, clientSecret: env.MEMBER_GOOGLE_CLIENT_SECRET } };
  } catch { throw new MemberUnavailable(); }
}
