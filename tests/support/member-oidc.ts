import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { createServer } from "node:http";

// Test-only issuer. No production route imports this module. It binds a fixed
// loopback port and refuses production even when explicitly invoked.
export async function startMemberOidc() {
  if (process.env.NODE_ENV === "production" || process.env.MEMBER_FIXTURE_ENABLED !== "1") throw new Error("OIDC fixture is test-only");
  const issuer = "http://127.0.0.1:3222";
  const redirectURI = "http://127.0.0.1:3221/api/auth/callback/fixture";
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = { ...publicKey.export({ format: "jwk" }), kid: "fixture", alg: "RS256", use: "sig" };
  const codes = new Map<string, { sub: string; nonce: string; challenge: string; expires: number; mode: string }>();
  const identities: Record<string, { email: string; name: string }> = {
    alice: { email: "alice@example.invalid", name: "検証ユーザーA" },
    bob: { email: "bob@example.invalid", name: "検証ユーザーB" },
    impostor: { email: "alice@example.invalid", name: "同じメールの別identity" },
  };
  for(const name of ['community-a','community-b','community-d','notification-owner','notification-recipient','notification-other','suspend','delete'])identities[name]={email:name+'@example.invalid',name};
  for(const key of ['profile-a','profile-b','profile-third','lifecycle-profile','invite-owner','invite-target','invite-third'])identities[key]={email:key+'@example.invalid',name:'Private provider name '+key};
  identities['profile-empty']={email:'profile-empty@example.invalid',name:''};
  identities['profile-email']={email:'profile-email@example.invalid',name:'profile-email@example.invalid'};
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", issuer);
    const json = (body: unknown, status = 200) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(body)); };
    try {
      if (url.pathname === "/.well-known/openid-configuration") return json({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, response_types_supported: ["code"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"], token_endpoint_auth_methods_supported: ["none"], code_challenge_methods_supported: ["S256"] });
      if (url.pathname === "/jwks") return json({ keys: [key] });
      if (url.pathname === "/authorize") {
        const sub = url.searchParams.get("fixture_identity") ?? "";
        if (url.searchParams.get("client_id") !== "graph-member-fixture" || url.searchParams.get("redirect_uri") !== redirectURI || url.searchParams.get("response_type") !== "code"
          || url.searchParams.get("code_challenge_method") !== "S256" || !url.searchParams.get("nonce") || !url.searchParams.get("state") || !url.searchParams.get("code_challenge")) return json({ error: "invalid_request" }, 400);
        if (!sub) {
          const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
          const links = ["alice", "bob"].map(id => { const target = new URL(url); target.searchParams.set("fixture_identity", id); return `<p><a href="${escape(target.href)}">${identities[id].name}</a></p>`; });
          response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
          return response.end(`<!doctype html><html lang="ja"><title>検証用OIDC</title><h1>検証専用の本人確認</h1>${links.join("")}</html>`);
        }
        if (!identities[sub]) return json({ error: "invalid_request" }, 400);
        const code = randomUUID();
        codes.set(code, { sub, nonce: url.searchParams.get("nonce")!, challenge: url.searchParams.get("code_challenge")!, expires: Date.now() + 60_000, mode: url.searchParams.get("fixture_mode") ?? "valid" });
        const redirect = new URL(redirectURI);
        redirect.searchParams.set("code", code);
        redirect.searchParams.set("state", url.searchParams.get("state")!);
        response.writeHead(302, { Location: redirect.href }); return response.end();
      }
      if (url.pathname === "/token" && request.method === "POST") {
        let body = "";
        for await (const chunk of request) { body += chunk; if (body.length > 8192) return json({ error: "invalid_request" }, 400); }
        const params = new URLSearchParams(body);
        const code = params.get("code") ?? "";
        const grant = codes.get(code);
        codes.delete(code);
        if (!grant || grant.expires < Date.now() || params.get("redirect_uri") !== redirectURI || params.get("client_id") !== "graph-member-fixture" || params.get("grant_type") !== "authorization_code"
          || createHash("sha256").update(params.get("code_verifier") ?? "").digest("base64url") !== grant.challenge) return json({ error: "invalid_grant" }, 400);
        const now = Math.floor(Date.now() / 1000);
        const identity = identities[grant.sub];
        const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "fixture", typ: "JWT" })).toString("base64url");
        const payload = Buffer.from(JSON.stringify({ iss: grant.mode === "issuer" ? "http://wrong.invalid" : issuer,
          aud: "graph-member-fixture", sub: grant.sub, nonce: grant.mode === "nonce" ? "wrong-nonce" : grant.nonce,
          email: identity.email, email_verified: true, name: identity.name, iat: now, exp: now + 60 })).toString("base64url");
        const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey).toString("base64url");
        return json({ access_token: randomUUID(), token_type: "Bearer", expires_in: 60, id_token: `${header}.${payload}.${signature}` });
      }
      json({ error: "not_found" }, 404);
    } catch { json({ error: "fixture_failed" }, 500); }
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(3222, "127.0.0.1", resolve); });
  return { setName:(id:string,name:string)=>{if(!identities[id])throw Error('Unknown test identity');identities[id].name=name;}, close: () => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); }) };
}
