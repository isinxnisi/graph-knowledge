import { fixtureCounts } from "../lib/domain/fixture";
import { openDatabase } from "../lib/server/neo4j";
import { graphCounts, loadFixture, seedFixture } from "../lib/server/seed";

// Do not even open a DB connection until the whole fixture is valid.
const fixture = await loadFixture();
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
