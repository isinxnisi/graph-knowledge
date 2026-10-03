import { writeFile } from "node:fs/promises";
import { fixtureCounts } from "../lib/domain/fixture";
import { jsonFile, loadPilot, PILOT_DIRECTORY, preparePilot } from "../lib/server/pilot-dataset";

if (process.argv.includes("--check")) {
  const fixture = await loadPilot();
  console.log(JSON.stringify({ valid: true, counts: fixtureCounts(fixture) }, null, 2));
} else {
  const prepared = await preparePilot();
  await writeFile(`${PILOT_DIRECTORY}/data.json`, prepared.data);
  await writeFile(`${PILOT_DIRECTORY}/manifest.json`, jsonFile(prepared.manifest));
  console.log(JSON.stringify({ generated: true, counts: fixtureCounts(prepared.fixture) }, null, 2));
}
