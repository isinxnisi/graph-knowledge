import { writeFile } from "node:fs/promises";
import { fixtureCounts } from "../lib/domain/fixture";
import { jsonFile } from "../lib/server/pilot-dataset";
import { loadScienceV2, prepareScienceV2, SCIENCE_V2_DIRECTORY } from "../lib/server/science-v2-dataset";
if (process.argv.includes("--check")) {
  console.log(JSON.stringify({ valid: true, counts: fixtureCounts(await loadScienceV2()) }, null, 2));
} else {
  const prepared = await prepareScienceV2();
  await writeFile(`${SCIENCE_V2_DIRECTORY}/data.json`, prepared.data);
  await writeFile(`${SCIENCE_V2_DIRECTORY}/manifest.json`, jsonFile(prepared.manifest));
  console.log(JSON.stringify({ generated: true, counts: fixtureCounts(prepared.fixture) }, null, 2));
}
