import { openDatabase } from "../lib/server/neo4j";
import { applyConstraints } from "../lib/server/seed";

const { driver, database } = openDatabase();
try {
  await driver.verifyConnectivity();
  await applyConstraints(driver, database);
  console.log("Applied 6 uniqueness constraints (IF NOT EXISTS)");
} catch {
  console.error("Constraint setup failed. Check Neo4j connectivity and server logs.");
  process.exitCode = 1;
} finally { await driver.close(); }
