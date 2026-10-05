import { existsSync } from "node:fs";
import { assertDatasetTarget, datasetMode } from "../lib/domain/dataset";
import { loadPilotV2 } from "../lib/server/pilot-v2-dataset";
import { loadPilot } from "../lib/server/pilot-dataset";
import { loadScienceV2 } from "../lib/server/science-v2-dataset";
import { loadSciencePilot } from "../lib/server/science-dataset";
import { fixtureCounts } from "../lib/domain/fixture";
import { openDatabase } from "../lib/server/neo4j";
import { graphCounts, loadFixture, seedFixture } from "../lib/server/seed";

// Do not even open a DB connection until the whole fixture is valid.
if (existsSync(".env")) process.loadEnvFile(".env");
const args = process.argv.slice(2);
if (args.length > 1 || (args[0] && !args[0].startsWith("--dataset="))) throw new Error("Use --dataset=<GRAPH_DATASET>");
const selected = datasetMode(args[0]?.slice("--dataset=".length));
if (selected !== datasetMode(process.env.GRAPH_DATASET)) throw new Error("Selected dataset does not match GRAPH_DATASET; refusing seed");
assertDatasetTarget(selected, process.env.NEO4J_URI ?? "");
const fixture = selected === "demo" ? await loadFixture() : selected === "pilot-science-v2" ? await loadScienceV2() : selected === "pilot-science-v1" ? await loadSciencePilot() : selected === "pilot-urasawa-v2" ? await loadPilotV2() : await loadPilot();
const { driver, database } = openDatabase();
try {
  await driver.verifyConnectivity();
  const result = await seedFixture(driver, database, fixture);
  console.log(JSON.stringify({ valid: true, expectedFixture: fixtureCounts(fixture), ...result, database: await graphCounts(driver, database) }, null, 2));
} catch (error) {
  console.error("Seed failed; data transaction was rolled back.");
  if (error instanceof Error && /fixture|connections|ownership|identifier/i.test(error.message)) console.error(error.message);
  else console.error("Check Neo4j connectivity and server logs.");
  process.exitCode = 1;
} finally { await driver.close(); }
