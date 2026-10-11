import { spawnSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import neo4j from "neo4j-driver";

// 既存public／pilot DBを一切変更しない一時DB。port競合時は起動に失敗して終了する。
const name = `graph-public-test-${process.pid}`;
const password = randomBytes(18).toString("hex");
const docker = (args: string[]) => spawnSync("docker", args, { stdio: "inherit" });
let started = false;
try {
  const run = docker(["run", "--rm", "--detach", "--name", name, "--publish", "127.0.0.1:7695:7687", "--env", `NEO4J_AUTH=neo4j/${password}`,
    "--env", "NEO4J_server_memory_heap_initial__size=128m", "--env", "NEO4J_server_memory_heap_max__size=256m", "--env", "NEO4J_server_memory_pagecache_size=128m", "neo4j:5.26.31-community"]);
  if (run.status !== 0) throw new Error("Cannot start isolated public KG test database");
  started = true;
  const driver = neo4j.driver("bolt://127.0.0.1:7695", neo4j.auth.basic("neo4j", password), { connectionTimeout: 1000, maxTransactionRetryTime: 0 });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 180; attempt++) {
      try { await driver.verifyConnectivity(); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
    }
    if (!ready) throw new Error("Isolated Neo4j did not become ready");
  } finally { await driver.close(); }
  const child = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/public.integration.test.ts", "--no-file-parallelism"], {
    stdio: "inherit", env: { ...process.env, GRAPH_DATASET: "public-kg", NEO4J_URI: "bolt://127.0.0.1:7695", NEO4J_USER: "neo4j", NEO4J_PASSWORD: password, NEO4J_DATABASE: "neo4j" },
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
  process.exitCode = await new Promise<number>(resolve => child.on("exit", code => resolve(code ?? 1)));
} finally { if (started) docker(["stop", "--timeout", "5", name]); }
