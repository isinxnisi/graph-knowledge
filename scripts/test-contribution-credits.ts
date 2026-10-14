import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import neo4j from "neo4j-driver";

// Isolated real-data verification, never the running public or frozen databases.
const name = `graph-credit-test-${process.pid}`;
const web = `${name}-web`, network = `${name}-net`;
const password = randomBytes(18).toString("hex");
const env = { ...process.env, GRAPH_DATASET: "public-kg", NEO4J_URI: "bolt://127.0.0.1:7695", NEO4J_USER: "neo4j", NEO4J_PASSWORD: password, NEO4J_DATABASE: "neo4j" };
const docker = (args: string[]) => { const x = spawnSync("docker", args, { stdio: "inherit" }); if (x.status) throw Error(`Isolated Docker operation failed: ${args[0]}`); };
let net = false, db = false, server = false;
try {
  docker(["network", "create", network]); net = true;
  docker(["run", "--rm", "-d", "--name", name, "--network", network, "--network-alias", "graph-neo4j", "-p", "127.0.0.1:7695:7687", "-e", `NEO4J_AUTH=neo4j/${password}`, "-e", "NEO4J_server_memory_heap_initial__size=256m", "-e", "NEO4J_server_memory_heap_max__size=512m", "-e", "NEO4J_server_memory_pagecache_size=256m", "neo4j:5.26.31-community"]); db = true;
  const driver = neo4j.driver(env.NEO4J_URI, neo4j.auth.basic("neo4j", password), { connectionTimeout: 1000, maxTransactionRetryTime: 0 });
  try {
    let ready = false;
    for (let i = 0; i < 120; i++) { try { await driver.verifyConnectivity(); ready = true; break; } catch { await new Promise(r => setTimeout(r, 1000)); } }
    if (!ready) throw Error("Isolated DB not ready");
  } finally { await driver.close(); }
  const integration = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/contribution-credits.integration.test.ts"], { stdio: "inherit", env });
  if (integration.status !== 0) throw Error("Credit integration failed");
  docker(["run", "--rm", "-d", "--name", web, "--network", network, "-p", "127.0.0.1:3216:3000", "-e", "GRAPH_DEPLOYMENT=production", "-e", "GRAPH_DATASET=public-kg", "-e", "NEO4J_URI=bolt://graph-neo4j:7687", "-e", "NEO4J_USER=neo4j", "-e", "NEO4J_DATABASE=neo4j", "-e", `NEO4J_PASSWORD=${password}`, "-e", "MEMBER_STORAGE_ENABLED=0", "graph-knowledge-web:beta-credits-20261014"]); server = true;
  let ready = false;
  for (let i = 0; i < 60; i++) { try { if ((await fetch("http://127.0.0.1:3216/api/dataset")).ok) { ready = true; break; } } catch { /* bounded readiness */ } await new Promise(r => setTimeout(r, 500)); }
  if (!ready) { spawnSync("docker", ["logs", "--tail", "30", web], { stdio: "inherit" }); throw Error("Isolated Web not ready"); }
  const browser = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config=playwright.credits.config.ts"], { stdio: "inherit", env: { ...env, GRAPH_TEST_BASE_URL: "http://127.0.0.1:3216" } });
  if (browser.status !== 0) throw Error("Credit browser verification failed");
} finally {
  if (server) spawnSync("docker", ["stop", "--timeout", "5", web], { stdio: "inherit" });
  if (db) spawnSync("docker", ["stop", "--timeout", "5", name], { stdio: "inherit" });
  if (net) spawnSync("docker", ["network", "rm", network], { stdio: "inherit" });
}
