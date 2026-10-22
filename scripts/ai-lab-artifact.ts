import path from "node:path";
import { activateLabArtifact, parseLabArtifact, publicLabKgReader, readLabFile, verifyLabPublicReferences } from "../lib/server/ai-lab-artifact";
import { labHashSchema } from "../lib/domain/ai-lab";

// No env loading, database credential, SSH, model or Web control in this CLI.
const [command, file, origin, directory, expected, ...extra] = process.argv.slice(2);
try {
  if (extra.length || !["validate", "activate"].includes(command) || !file || !origin || command === "validate" && (directory || expected) || command === "activate" && (!directory || !expected)) throw Error("Usage: validate FILE KG_ORIGIN | activate FILE KG_ORIGIN ABS_DIRECTORY EXPECTED_SHA_OR_none");
  const artifact = parseLabArtifact(await readLabFile(path.resolve(file))), get = publicLabKgReader(origin);
  if (command === "validate") console.log(JSON.stringify({ sha256: artifact.sha256, validatedKgRevision: await verifyLabPublicReferences(artifact, get) }));
  else console.log(JSON.stringify(await activateLabArtifact(directory, artifact, expected === "none" ? null : labHashSchema.parse(expected), get)));
} catch { console.error("AI lab artifact operation did not complete. Inspect the current SHA before retrying; unvalidated artifacts are never activated."); process.exitCode = 1; }
