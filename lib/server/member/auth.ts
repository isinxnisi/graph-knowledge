import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { Pool } from "pg";
import { MemberUnavailable, type MemberConfig } from "./config";

export function memberPool(config: MemberConfig) {
  const pool = new Pool({ connectionString: config.databaseUrl, max: 5, connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10_000, statement_timeout: 5000, query_timeout: 6000 });
  // Never log connection strings, provider tokens, or query parameters.
  pool.on("error", () => console.error("Member database connection unavailable"));
  return pool;
}
export function createMemberAuth(config: MemberConfig, pool: Pool) {
  const provider = config.provider;
  return betterAuth({
    appName: "Graph Knowledge", baseURL: config.origin, basePath: "/api/auth",
    secret: config.secret, database: pool, trustedOrigins: [config.origin],
    logger: { disabled: true }, onAPIError: { errorURL: `${config.origin}/member` },
    socialProviders: provider.kind === "google" ? { google: { clientId: provider.clientId, clientSecret: provider.clientSecret } } : {},
    plugins: provider.kind === "fixture" ? [genericOAuth({ config: [{
      providerId: "fixture", clientId: "graph-member-fixture", discoveryUrl: `${provider.issuer}/.well-known/openid-configuration`,
      requireIdTokenVerification: true, scopes: ["openid", "profile", "email"], pkce: true,
      tokenEndpointAuth: { method: "none" },
    }] })] : [],
    advanced: { disableOriginCheck: false, disableCSRFCheck: false, database: { generateId: "uuid" }, cookiePrefix: config.cookiePrefix,
      useSecureCookies: config.origin.startsWith("https:"), defaultCookieAttributes: { httpOnly: true, sameSite: "lax" } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    account: { accountLinking: { enabled: false }, encryptOAuthTokens: true, storeAccountCookie: false, storeStateStrategy: "database" },
    user: { additionalFields: {
      active: { type: "boolean", defaultValue: true, input: false },
      locale: { type: "string", defaultValue: "ja", input: false },
    } },
    databaseHooks: {
      // Provider API access is outside this slice; discard tokens after identity
      // verification instead of retaining a second service credential store.
      account: {
        create: { before: async () => ({ data: { accessToken: null, refreshToken: null, idToken: null } }) },
        update: { before: async () => ({ data: { accessToken: null, refreshToken: null, idToken: null } }) },
      },
      session: { create: { before: async session => {
        const result = await pool.query('SELECT active FROM "user" WHERE id = $1', [session.userId]);
        return result.rows[0]?.active === true ? { data: session } : false;
      } } },
    },
  });
}
export type MemberAuth = ReturnType<typeof createMemberAuth>;

export async function memberAuthReady(auth: MemberAuth) {
  try {
    const context = await auth.$context;
    await context.checkSchema?.();
  } catch { throw new MemberUnavailable(); }
}
