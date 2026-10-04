import { writeFile } from "node:fs/promises";
import { fixtureCounts } from "../lib/domain/fixture";
import { jsonFile } from "../lib/server/pilot-dataset";
import { loadSciencePilot, prepareScience, SCIENCE_DIRECTORY } from "../lib/server/science-dataset";
if (process.argv.includes("--check")) {
  console.log(JSON.stringify({ valid: true, counts: fixtureCounts(await loadSciencePilot()) }, null, 2));
} else {
  const prepared = await prepareScience();
  await writeFile(`${SCIENCE_DIRECTORY}/data.json`, prepared.data);
  await writeFile(`${SCIENCE_DIRECTORY}/manifest.json`, jsonFile(prepared.manifest));
  console.log(JSON.stringify({ generated: true, counts: fixtureCounts(prepared.fixture) }, null, 2));
}
