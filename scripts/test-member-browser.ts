import { spawn } from "node:child_process";
import { memberConfig } from "../lib/server/member/config";
import { memberPool } from "../lib/server/member/auth";
import { migrateMemberDatabase } from "../lib/server/member/migrate";
import { startMemberOidc } from "../tests/support/member-oidc";

const config = memberConfig();
if (!config || config.provider.kind !== "fixture") throw new Error("Use npm run test:member:e2e with its disposable database");
const pool = memberPool(config);
const issuer = await startMemberOidc();
let child: ReturnType<typeof spawn> | undefined;
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  child?.kill("SIGTERM");
  await issuer.close(); await pool.end();
}
process.once("SIGTERM", () => { void stop(); });
process.once("SIGINT", () => { void stop(); });
try {
  await migrateMemberDatabase(pool);
  child = spawn("node", ["node_modules/@playwright/test/cli.js", "test", "--config=playwright.member.config.ts", ...process.argv.slice(2)], { env: process.env, stdio: "inherit" });
  process.exitCode = await new Promise<number>((resolve, reject) => { child!.once("error", reject); child!.once("exit", code => resolve(code ?? 1)); });
  // Normal completion must not signal the already-exited Playwright process.
  child = undefined;
} finally { await stop(); }
