import { spawnSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import neo4j from "neo4j-driver";

// Own disposable DB, allocated port: never reuse the running beta/trial DBs.
const name = `graph-neighbor-ranking-test-${process.pid}`, password = randomBytes(18).toString("hex");
if (process.argv[2] && process.argv[2] !== "--compatibility") throw Error("Unknown test selection");
let started = false;
try {
  const db = spawnSync("docker", ["run", "--rm", "-d", "--name", name, "--memory", "1536m", "-p", "127.0.0.1::7687",
    "-e", `NEO4J_AUTH=neo4j/${password}`, "-e", "NEO4J_server_memory_heap_initial__size=256m", "-e", "NEO4J_server_memory_heap_max__size=512m", "-e", "NEO4J_server_memory_pagecache_size=256m", "neo4j:5.26.31-community"], { encoding: "utf8" });
  if (db.status !== 0) throw Error("Cannot create isolated ranking DB");
  started = true;
  const port = spawnSync("docker", ["port", name, "7687"], { encoding: "utf8" }).stdout.trim();
  if (!/^127\.0\.0\.1:\d+$/.test(port)) throw Error("Unexpected isolated binding");
  const uri = `bolt://${port}`;
  const driver = neo4j.driver(uri, neo4j.auth.basic("neo4j", password), { connectionTimeout: 1000, maxTransactionRetryTime: 0 });
  try {
    let ready = false;
    for (let n = 0; n < 150; n++) { try { await driver.verifyConnectivity(); ready = true; break; } catch { await new Promise(r => setTimeout(r, 1000)); } }
    if (!ready) throw Error("Isolated DB startup failed");
  } finally { await driver.close(); }
  const child = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/neighbor-ranking.integration.test.ts", "--no-file-parallelism", ...(process.argv[2] ? ["-t", "保存互換"] : [])], {
    stdio: "inherit", env: { ...process.env, GRAPH_DATASET: "public-kg", RANKING_TEST_URI: uri, RANKING_TEST_PASSWORD: password, RANKING_TEST_CONTAINER: name },
  });
  process.exitCode = await new Promise<number>(r => child.on("exit", code => r(code ?? 1)));
  const stats = spawnSync("docker", ["stats", "--no-stream", "--format", "{{.MemUsage}} / {{.CPUPerc}}", name], { encoding: "utf8" });
  console.log(`Isolated DB resources: ${stats.stdout.trim()}`);
} finally { if (started) spawnSync("docker", ["stop", "--timeout", "5", name], { stdio: "ignore" }); }
