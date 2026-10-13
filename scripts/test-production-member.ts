import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 本番imageと専用PGで認証開始までを検証。実Google credential・本人認証は使わない。
const tag = process.argv[2];
if (process.argv.length !== 3 || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(tag ?? "")) throw new Error("Specify the built image tag");
const directory = await mkdtemp(join(tmpdir(), "graph-member-production-test-"));
const envFile = join(directory, "app.env"), origin = "https://graph.isinxnisi.net";
const password = randomBytes(32).toString("hex");
const args = ["compose", "-p", `graph-member-production-test-${process.pid}`, "--env-file", envFile, "-f", "compose.production.yaml", "--profile", "member"];
function docker(command: string[], success = true) {
  const result = spawnSync("docker", [...args, ...command], { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  if (success && result.status !== 0) throw new Error(`Member production test docker command failed: ${command[0]}`);
  return result;
}
function sql(statement: string) {
  return docker(["exec", "-T", "graph-member-postgres", "psql", "-U", "postgres", "-d", "graph_member", "-Atc", statement]).stdout.trim();
}
async function request(path: string, body?: unknown, requestOrigin = origin) {
  return fetch(`http://127.0.0.1:3202${path}`, { signal: AbortSignal.timeout(15000),
    headers: { Connection: "close", Origin: requestOrigin, "Content-Type": "application/json" },
    ...(body !== undefined ? { method: "POST", body: JSON.stringify(body) } : {}), redirect: "manual" });
}
async function waitForStatus(path: string, expected: number, body?: unknown) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await request(path, body).catch(() => null);
    if (response?.status === expected) return response;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Member HTTP did not return expected status ${expected}`);
}
try {
  await writeFile(envFile, Object.entries({
    NEO4J_PASSWORD: randomBytes(32).toString("hex"), GRAPH_IMAGE_TAG: tag, GRAPH_WEB_PORT: "3202", GRAPH_BACKUP_DIRECTORY: directory,
    MEMBER_STORAGE_ENABLED: "1", MEMBER_ORIGIN: origin,
    MEMBER_DATABASE_URL: `postgresql://gk_member:${password}@graph-member-postgres:5432/graph_member`,
    MEMBER_POSTGRES_PASSWORD: password, MEMBER_POSTGRES_ADMIN_PASSWORD: randomBytes(32).toString("hex"),
    MEMBER_AUTH_SECRET: randomBytes(32).toString("hex"), MEMBER_GOOGLE_CLIENT_ID: "test-only.apps.googleusercontent.com",
    MEMBER_GOOGLE_CLIENT_SECRET: "test-only-no-real-google-credential",
  }).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { mode: 0o600 });
  docker(["config", "--quiet"]);
  docker(["up", "-d", "--wait", "--wait-timeout", "120", "graph-member-postgres"]);
  assert.equal(sql("SELECT rolsuper OR rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname='gk_member'"), "f");
  docker(["run", "--rm", "--no-deps", "member-ops"]);
  docker(["run", "--rm", "--no-deps", "member-ops"]);
  assert.equal(sql("SELECT count(*) FROM member_migration"), "5");
  assert.equal(sql('SELECT count(*) FROM "user"'), "0");
  // この試験は会員PG・認証開始専用。KGのreadinessはtest-production.tsで別途検証する。
  docker(["up", "-d", "--no-deps", "web"]);
  const capability = await waitForStatus("/api/member/status", 200);
  assert.deepEqual(await capability.json(), { provider: "google" });
  assert.equal((await request("/api/member/profile")).status, 401);
  const input = { provider: "google", callbackURL: `${origin}/member`, disableRedirect: true };
  const start = await request("/api/auth/sign-in/social", input);
  assert.equal(start.status, 200);
  const authorization = new URL((await start.json()).url);
  assert.equal(authorization.origin, "https://accounts.google.com");
  assert.equal(authorization.searchParams.get("redirect_uri"), `${origin}/api/auth/callback/google`);
  assert.equal(authorization.searchParams.get("client_id"), "test-only.apps.googleusercontent.com");
  assert.deepEqual(authorization.searchParams.get("scope")?.split(" ").sort(), ["email", "openid", "profile"]);
  assert.ok(authorization.searchParams.get("state"));
  const cookies = start.headers.getSetCookie();
  assert.ok(cookies.some(value => value.includes("gk-member-production") && value.includes("Secure") && value.includes("HttpOnly") && value.includes("SameSite=Lax")));
  assert.equal(start.headers.get("cache-control"), "private, no-store");
  assert.equal((await request("/api/auth/sign-in/social", input, "https://other.invalid")).status, 403);
  assert.equal((await request("/api/auth/sign-in/social", { ...input, scopes: ["https://www.googleapis.com/auth/drive"] })).status, 400);
  assert.equal((await request("/api/auth/sign-in/social", { ...input, callbackURL: "https://other.invalid/member" })).status, 403);
  assert.equal(sql('SELECT count(*) FROM "user"'), "0");
  console.log("本番会員準備: 非superuser／migration二回で5件／Google認証開始URL・最小scope・state cookie／Origin・追加scope・外部redirect拒否: 成功");
  docker(["stop", "graph-member-postgres"]);
  // 匿名profileはDB照会なしで401になる。DBへstateを保存する認証開始で停止を確認する。
  await waitForStatus("/api/auth/sign-in/social", 503, input);
  docker(["up", "-d", "--wait", "--wait-timeout", "120", "graph-member-postgres"]);
  await waitForStatus("/api/auth/sign-in/social", 200, input);
  await waitForStatus("/api/member/profile", 401);
  assert.equal(sql("SELECT count(*) FROM member_migration"), "5");
  console.log("会員PG停止503・Web再起動なしの復旧・migration保持: 成功。実Google callback／本人ログインは未検証。");
} finally {
  docker(["down", "-v", "--remove-orphans"], false);
  await rm(directory, { recursive: true, force: true });
}
