import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";

// Disposable dedicated PostgreSQL. Never targets a configured product DB, and
// cleanup only removes the uniquely named container created by this invocation.
const operationsTests=process.argv.includes("--operations");
const communityTests = process.argv.includes("--community")||operationsTests;
const safetyTests=process.argv.includes("--safety");
const browserTests = process.argv.includes("--e2e");
const container = `gk-member-test-${randomUUID()}`;
const password = randomBytes(24).toString("hex");
const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test", GRAPH_DATASET: "demo", MEMBER_STORAGE_ENABLED: "1", MEMBER_FIXTURE_ENABLED: "1",
  MEMBER_AUTH_PROVIDER: "fixture", MEMBER_ORIGIN: "http://127.0.0.1:3221", MEMBER_COOKIE_PREFIX: "gk-member-fixture",
  MEMBER_AUTH_SECRET: randomBytes(32).toString("hex"),
  MEMBER_DATABASE_URL: `postgresql://gk_member:${password}@127.0.0.1:55432/graph_member_test`,
  POSTGRES_USER: "gk_member", POSTGRES_PASSWORD: password, POSTGRES_DB: "graph_member_test" };
if (communityTests) env.COMMUNITY_ENABLED = "1";
if(operationsTests)env.SITE_OPERATIONS_ENABLED="1";
const docker = (args: string[]) => spawnSync("docker", args, { env, encoding: "utf8", timeout: 30_000 });
let child: ReturnType<typeof spawn> | undefined;
let created = false;
function cleanup() { child?.kill("SIGTERM"); if (created) { docker(["rm", "-f", container]); created = false; } }
process.once("SIGINT", () => { cleanup(); process.exit(130); });
process.once("SIGTERM", () => { cleanup(); process.exit(143); });
try {
  const run = docker(["run", "--detach", "--name", container, "--label", "graph-knowledge.member-test=true", "--publish", "127.0.0.1:55432:5432", "--tmpfs", "/var/lib/postgresql/data", "--env", "POSTGRES_USER", "--env", "POSTGRES_PASSWORD", "--env", "POSTGRES_DB",
    "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24"]);
  // Docker can create a container even if publishing its port fails.
  created = docker(["inspect", "--format", "{{.Id}}", container]).status === 0;
  if (run.status !== 0) throw new Error("Dedicated member PostgreSQL could not start (check port 55432)");
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    if (docker(["exec", container, "pg_isready", "-U", "gk_member", "-d", "graph_member_test"]).status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Dedicated member PostgreSQL did not become ready");
  child = spawn("node", browserTests
    ? ["--import", "tsx", "scripts/test-member-browser.ts", ...process.argv.slice(2).filter(arg => arg !== "--e2e" && arg !== "--community" && arg !== "--safety" && arg !== "--operations")]
    : ["node_modules/vitest/vitest.mjs", "run", ...(communityTests ? [operationsTests ? "tests/site-operations.integration.test.ts" : safetyTests ? "tests/community-safety.integration.test.ts" : "tests/community.integration.test.ts"] : ["tests/member.integration.test.ts", "tests/member-cold.integration.test.ts"]), "--maxWorkers=1", "--no-file-parallelism"], { env, stdio: "inherit" });
  const timer = setTimeout(() => child?.kill("SIGTERM"), browserTests ? 960_000 : 180_000);
  const code = await new Promise<number>((resolve, reject) => { child!.once("error", reject); child!.once("exit", code => resolve(code ?? 1)); });
  clearTimeout(timer);
  child = undefined;
  process.exitCode = code;
} catch (error) {
  console.error(error instanceof Error ? error.message : "Member test setup failed");
  process.exitCode = 1;
} finally { cleanup(); }
