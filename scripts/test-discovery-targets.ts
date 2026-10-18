import { spawnSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import neo4j from "neo4j-driver";

// The writeable test fixture lives only in this disposable container, never 7694.
const name = `graph-discovery-targets-test-${process.pid}`, password = randomBytes(18).toString("hex");
let started = false;
try {
  const db = spawnSync("docker", ["run", "--rm", "-d", "--name", name, "-p", "127.0.0.1:7695:7687", "-e", `NEO4J_AUTH=neo4j/${password}`,
    "-e", "NEO4J_server_memory_heap_initial__size=256m", "-e", "NEO4J_server_memory_heap_max__size=512m", "-e", "NEO4J_server_memory_pagecache_size=128m", "neo4j:5.26.31-community"], { stdio: "inherit" });
  if (db.status !== 0) throw Error("Cannot create isolated target-search DB");
  started = true;
  const driver = neo4j.driver("bolt://127.0.0.1:7695", neo4j.auth.basic("neo4j", password), { connectionTimeout: 1000, maxTransactionRetryTime: 0 });
  try {
    let ready = false;
    for (let n = 0; n < 180; n++) { try { await driver.verifyConnectivity(); ready = true; break; } catch { await new Promise(r => setTimeout(r, 1000)); } }
    if (!ready) throw Error("Isolated database did not become ready");
  } finally { await driver.close(); }
  const child = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/discovery-targets.integration.test.ts", "--no-file-parallelism"], {
    // Match the existing 3200 deployment contract (the library default remains 5s).
    stdio: "inherit", env: { ...process.env, NEO4J_READ_TIMEOUT_MS: "10000", TARGETS_ISOLATED_TEST: "1", GRAPH_DATASET: "public-kg", NEO4J_URI: "bolt://127.0.0.1:7695", NEO4J_USER: "neo4j", NEO4J_PASSWORD: password, NEO4J_DATABASE: "neo4j" },
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
  process.exitCode = await new Promise<number>(r => child.on("exit", code => r(code ?? 1)));
} finally { if (started) spawnSync("docker", ["stop", "--timeout", "5", name], { stdio: "inherit" }); }
