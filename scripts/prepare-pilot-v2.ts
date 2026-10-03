import { writeFile } from "node:fs/promises";
import { fixtureCounts } from "../lib/domain/fixture";
import { jsonFile } from "../lib/server/pilot-dataset";
import { loadPilotV2, preparePilotV2, PILOT_V2_DIRECTORY } from "../lib/server/pilot-v2-dataset";
if (process.argv.includes("--check")) {
  console.log(JSON.stringify({ valid: true, counts: fixtureCounts(await loadPilotV2()) }, null, 2));
} else {
  const prepared = await preparePilotV2();
  await writeFile(`${PILOT_V2_DIRECTORY}/data.json`, prepared.data);
  await writeFile(`${PILOT_V2_DIRECTORY}/manifest.json`, jsonFile(prepared.manifest));
  console.log(JSON.stringify({ generated: true, counts: fixtureCounts(prepared.fixture) }, null, 2));
}
