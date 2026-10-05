import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { eventContractFixture } from "../tests/fixtures/event-contract";
import { openDatabase } from "../lib/server/neo4j";
import { graphCounts, seedFixture } from "../lib/server/seed";
Object.assign(process.env, { GRAPH_DATASET: "demo", GRAPH_CONTRACT_TEST: "1", NEO4J_URI: "bolt://127.0.0.1:7693", NEO4J_USER: "neo4j", NEO4J_PASSWORD: "local-event-contract-test", NEO4J_DATABASE: "neo4j" });
if (process.argv[2] === "seed") {
  const { driver, database } = openDatabase();
  try {
    console.log(JSON.stringify({ syntheticOnly: true, first: await seedFixture(driver, database, eventContractFixture()), second: await seedFixture(driver, database, eventContractFixture()), counts: await graphCounts(driver, database) }, null, 2));
  } finally { await driver.close(); }
} else if (process.argv[2] === "dev") {
  const require = createRequire(import.meta.url);
  const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3216"], { stdio: "inherit", env: process.env });
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
  child.on("exit", code => { process.exitCode = code ?? 1; });
} else throw new Error("Use seed or dev. Synthetic fixture only, no real evidence acceptance.");
