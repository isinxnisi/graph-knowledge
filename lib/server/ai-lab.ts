import "server-only";
import path from "node:path";
import { datasetMode } from "../domain/dataset";
import { parseLabArtifact, readActiveLabArtifact, readLabFile } from "./ai-lab-artifact";
import type { LabArtifact } from "../domain/ai-lab";

export function aiLabEnabled() { return process.env.AI_LAB_ENABLED === "1" && datasetMode(process.env.GRAPH_DATASET) === "public-kg"; }
let lastGood: { directory: string; artifact: LabArtifact } | null = null;
export async function loadAiLabArtifact(): Promise<LabArtifact> {
  const directory = process.env.AI_LAB_ARTIFACT_DIRECTORY || "";
  try {
    const artifact = directory ? await readActiveLabArtifact(directory) : null;
    if (artifact) { lastGood = { directory, artifact }; return artifact; }
  } catch { /* A broken update cannot discard the previous validated public version. */ }
  if (lastGood?.directory === directory) return lastGood.artifact;
  return parseLabArtifact(await readLabFile(path.join(process.cwd(), "data/ai-lab/initial.json")));
}
