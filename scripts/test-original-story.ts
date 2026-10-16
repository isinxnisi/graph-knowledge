import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import neo4j from "neo4j-driver";

// Disposable test DB only. Never use the public Bolt 7694 or a member database.
const name = `graph-original-story-test-${process.pid}`;
const password = randomBytes(18).toString("hex");
const env = { ...process.env, GRAPH_DATASET: "public-kg", NEO4J_URI: "bolt://127.0.0.1:7695", NEO4J_USER: "neo4j", NEO4J_PASSWORD: password, NEO4J_DATABASE: "neo4j" };
let started = false;
try {
  const db = spawnSync("docker", ["run", "--rm", "-d", "--name", name, "-p", "127.0.0.1:7695:7687", "-e", `NEO4J_AUTH=neo4j/${password}`, "-e", "NEO4J_server_memory_heap_initial__size=256m", "-e", "NEO4J_server_memory_heap_max__size=512m", "-e", "NEO4J_server_memory_pagecache_size=256m", "neo4j:5.26.31-community"], { stdio: "inherit" });
  if (db.status !== 0) throw Error("Isolated DB creation failed");
  started = true;
  const driver = neo4j.driver(env.NEO4J_URI, neo4j.auth.basic("neo4j", password), { connectionTimeout: 1000, maxTransactionRetryTime: 0 });
  try {
    let ready = false;
    for (let i = 0; i < 120; i++) { try { await driver.verifyConnectivity(); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 1000)); } }
    if (!ready) throw Error("Isolated DB readiness failed");
  } finally { await driver.close(); }
  const test = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/original-story.integration.test.ts", "--no-file-parallelism"], { stdio: "inherit", env });
  if (test.status !== 0) throw Error("Original story integration failed");
} finally {
  if (started) spawnSync("docker", ["stop", "--timeout", "5", name], { stdio: "inherit" });
}
