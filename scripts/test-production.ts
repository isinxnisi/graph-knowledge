import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// build済みimageを実際の本番Composeで検証。専用project/volumeだけを作成・破棄する。
const tag = process.argv[2];
if (process.argv.length !== 3 || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(tag ?? "")) throw new Error("Specify the built image tag");
const directory = await mkdtemp(join(tmpdir(), "graph-production-test-"));
const envFile = join(directory, "app.env");
const args = ["compose", "-p", `graph-production-test-${process.pid}`, "--env-file", envFile, "-f", "compose.production.yaml"];
function docker(command: string[], success = true) {
  const result = spawnSync("docker", [...args, ...command], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (success && result.status !== 0) {
    // password入りのconfigやコマンド引数は出力しない。
    throw new Error(`Production test docker command failed: ${command[0]}\n${result.stderr}`);
  }
  return result;
}
function ops(command: string) {
  return JSON.parse(docker(["run", "--rm", "ops", command]).stdout);
}
async function request(path: string) {
  return fetch(`http://127.0.0.1:3201${path}`, { signal: AbortSignal.timeout(15000) });
}
async function waitForHttp() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { return await request("/api/dataset"); } catch { await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  throw new Error("Production image did not listen on 3201");
}
try {
  // container内node（uid1000）がbackup先を通過できるよう、外側だけ0755。
  const { chmod, mkdir } = await import("node:fs/promises");
  await chmod(directory, 0o755);
  const backups = join(directory, "backups"); await mkdir(backups, { mode: 0o700 });
  await writeFile(envFile, `NEO4J_PASSWORD=${randomBytes(24).toString("hex")}\nGRAPH_IMAGE_TAG=${tag}\nGRAPH_WEB_PORT=3201\nGRAPH_BACKUP_DIRECTORY=${backups}\n`, { mode: 0o600 });
  docker(["config", "--quiet"]);
  console.log("隔離DBを起動し、空DBのreadinessを確認します。");
  docker(["up", "-d", "--wait", "--wait-timeout", "360", "graph-neo4j"]);
  assert.equal(ops("validate").valid, true);
  const firstPlan = ops("plan"); assert.equal(firstPlan.added.length, 105);
  // 無書込みplanの後はまだreadyではない。
  docker(["up", "-d", "web"]);
  assert.equal((await waitForHttp()).status, 503);
  assert.notEqual(docker(["exec", "-T", "web", "node", "scripts/production-readiness.mjs"], false).status, 0);
  const first = ops("apply"), second = ops("apply");
  assert.equal(first.unchanged, false); assert.equal(second.unchanged, true);
  assert.equal(first.relationshipsAdded, 128); assert.deepEqual(second.added, []);
  assert.deepEqual(second.counts.nodes, { Entity: 18, Claim: 27, Citation: 29, Source: 15, ExternalIdentifier: 16 });
  console.log("投入・再適用: 105知識Node / 128 Relationship、2回目unchanged。");
  docker(["up", "-d", "--wait", "--wait-timeout", "180", "web"]);
  const initial = await (await request("/api/dataset")).json();
  assert.equal(initial.dataset, "public-kg"); assert.ok(initial.revision);
  const backup = JSON.parse(docker(["run", "--rm", "ops", "backup", "/backups/ready.json"]).stdout);
  assert.equal(backup.backedUp, true); assert.equal(backup.revision, initial.revision);
  assert.equal((await stat(join(backups, "ready.json"))).mode & 0o777, 0o600);
  assert.ok(JSON.parse(await readFile(join(backups, "ready.json"), "utf8")).checksum);
  docker(["restart", "graph-neo4j"]);
  docker(["up", "-d", "--wait", "--wait-timeout", "360", "graph-neo4j", "web"]);
  assert.equal((await (await request("/api/dataset")).json()).revision, initial.revision);
  console.log("backup・再起動保持: 成功。ブラウザを確認します。");
  const browser = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config=playwright.public.config.ts"], {
    stdio: "inherit", env: { ...process.env, GRAPH_TEST_BASE_URL: "http://127.0.0.1:3201" },
  });
  assert.equal(browser.status, 0, "Production image Playwright regression");
  docker(["stop", "graph-neo4j"]);
  assert.equal((await request("/api/dataset")).status, 503);
  assert.notEqual(docker(["exec", "-T", "web", "node", "scripts/production-readiness.mjs"], false).status, 0);
  docker(["up", "-d", "--wait", "--wait-timeout", "360", "graph-neo4j", "web"]);
  assert.equal((await request("/api/dataset")).status, 200);
  assert.equal((await (await request("/api/dataset")).json()).revision, initial.revision);
  console.log("本番image検証: 空DB503／plan無書込み／105知識Node・128Relationship／再適用unchanged／backup0600／再起動保持／Playwright／DB停止503・復旧: 成功");
} catch (error) {
  const { mkdir } = await import("node:fs/promises");
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/production-containers.log", docker(["logs", "--no-color", "--tail", "100"], false).stdout, { mode: 0o600 });
  throw error;
} finally {
  docker(["down", "-v", "--remove-orphans"], false);
  await rm(directory, { recursive: true, force: true });
}
