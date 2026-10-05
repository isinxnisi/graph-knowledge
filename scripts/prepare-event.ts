import { writeFile } from "node:fs/promises";
import { fixtureCounts } from "../lib/domain/fixture";
import { jsonFile } from "../lib/server/pilot-dataset";
import { readEventLedger, loadEventPilot, prepareEventPilot, EVENT_DIRECTORY } from "../lib/server/event-dataset";
if (process.argv.includes("--review")) {
  const { ledger } = await readEventLedger();
  console.log(JSON.stringify({ validResearch: true, humanAcceptance: ledger.humanAcceptance.decision, projections: ledger.candidates.length, excluded: ledger.excluded.ref, seedAllowed: ledger.humanAcceptance.decision === "accepted" }, null, 2));
} else if (process.argv.includes("--check")) {
  console.log(JSON.stringify({ valid: true, counts: fixtureCounts(await loadEventPilot()) }, null, 2));
} else {
  const prepared = await prepareEventPilot();
  await writeFile(`${EVENT_DIRECTORY}/data.json`, prepared.data);
  await writeFile(`${EVENT_DIRECTORY}/manifest.json`, jsonFile(prepared.manifest));
  console.log(JSON.stringify({ generated: true, counts: fixtureCounts(prepared.fixture) }, null, 2));
}
