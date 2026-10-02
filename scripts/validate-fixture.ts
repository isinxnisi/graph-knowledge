import { fixtureCounts } from "../lib/domain/fixture";
import { loadFixture } from "../lib/server/seed";

try {
  const fixture = await loadFixture();
  console.log(JSON.stringify({ valid: true, schemaVersion: fixture.schemaVersion, ...fixtureCounts(fixture) }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Fixture validation failed");
  process.exitCode = 1;
}
