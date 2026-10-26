import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { sealLabArtifact, verifyLabPublicReferences, publicLabKgReader } from "../lib/server/ai-lab-artifact";

// Operator-side only: private Python seals and current public KG are both checked.
// The Web process never invokes this projector or reads the private home.
const [home, output, origin, ...ids] = process.argv.slice(2);
if (!home || !path.isAbsolute(home) || !output || !origin || !ids.length) throw Error("Usage: ABS_PRIVATE_HOME NEW_PUBLIC_FILE KG_ORIGIN RUN_ID...");
const result = spawnSync("python3", ["experiments/ai-lab/project_public.py", "--home", home, "--initial", "data/ai-lab/initial.json", ...ids.flatMap(id=>["--run-id",id])], { encoding:"utf8", maxBuffer:256_000, timeout:15_000 });
if (result.status !== 0) throw Error("Private record verification failed; no artifact written");
const artifact = sealLabArtifact(JSON.parse(result.stdout));
const kgRevision = await verifyLabPublicReferences(artifact,publicLabKgReader(origin));
await writeFile(output,JSON.stringify(artifact)+"\n",{flag:"wx",mode:0o640});
console.log(JSON.stringify({sha256:artifact.sha256,kgRevision,runs:artifact.payload.runs.length}));
