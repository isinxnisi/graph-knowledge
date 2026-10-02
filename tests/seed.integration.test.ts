import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { fixtureCounts } from "../lib/domain/fixture";
import { openDatabase } from "../lib/server/neo4j";
import { graphCounts, graphSnapshot, loadFixture, seedFixture } from "../lib/server/seed";

it("preserves all data on a second seed and rolls back an incompatible fixture", async () => {
  const fixture = await loadFixture();
  const { driver, database } = openDatabase();
  try {
    await driver.verifyConnectivity();
    await seedFixture(driver, database, fixture);
    const before = await graphSnapshot(driver, database);
    expect(await seedFixture(driver, database, fixture)).toEqual({ nodesCreated: 0, relationshipsCreated: 0 });
    expect(await graphSnapshot(driver, database)).toEqual(before);
    expect(await graphCounts(driver, database)).toEqual(fixtureCounts(fixture));

    const changed = structuredClone(fixture);
    changed.entities.unshift({ ...fixture.entities[0], id: randomUUID(), name: "ロールバック対象" });
    changed.claims[0].period.from = { value: "2000", precision: "year" };
    await expect(seedFixture(driver, database, changed)).rejects.toThrow("differs from fixture");
    expect(await graphSnapshot(driver, database)).toEqual(before);

    const session = driver.session({ database });
    try {
      const constraints = await session.run("SHOW CONSTRAINTS YIELD name RETURN name ORDER BY name");
      expect(constraints.records.map((r) => r.get("name"))).toEqual([
        "citation_id", "claim_id", "entity_id", "external_identifier_id", "external_identifier_key", "source_id",
      ]);
      await expect(session.run("CREATE (:Entity {id: $id})", { id: fixture.entities[0].id })).rejects.toThrow();
    } finally { await session.close(); }
  } finally { await driver.close(); }
}, 120000);
