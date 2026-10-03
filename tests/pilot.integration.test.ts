import { expect, it } from "vitest";
import { datasetMode } from "../lib/domain/dataset";
import { fixtureCounts } from "../lib/domain/fixture";
import { openDatabase } from "../lib/server/neo4j";
import { loadPilot } from "../lib/server/pilot-dataset";
import { graphCounts, graphSnapshot, loadFixture, seedFixture } from "../lib/server/seed";

it("pilot seed is immutable and rejects demo mixing without changing data", async () => {
  process.loadEnvFile(".env.pilot");
  if (datasetMode(process.env.GRAPH_DATASET) !== "pilot-urasawa-v1") throw new Error("Requires dedicated pilot environment");
  const { driver, database } = openDatabase();
  try {
    const fixture = await loadPilot();
    await seedFixture(driver, database, fixture);
    const before = await graphSnapshot(driver, database);
    expect(await seedFixture(driver, database, fixture)).toEqual({ nodesCreated: 0, relationshipsCreated: 0 });
    expect(await graphCounts(driver, database)).toEqual(fixtureCounts(fixture));
    await expect(seedFixture(driver, database, await loadFixture())).rejects.toThrow("outside this fixture/dataset");
    expect(await graphSnapshot(driver, database)).toEqual(before);
  } finally { await driver.close(); }
}, 120000);
