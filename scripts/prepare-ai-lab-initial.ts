import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { canonicalLabJson, type LabRun } from "../lib/domain/ai-lab";
import { sealLabArtifact } from "../lib/server/ai-lab-artifact";

const commit = "af31afd5523655da45d2ceab87e0bca37cecd7dc";
const read = (file: string) => JSON.parse(execFileSync("git", ["show", commit + ":" + file], { encoding: "utf8" }));
const source = read("docs/verification/ai-lab-20261022/public.json"), snapshot = read("experiments/ai-lab/data/snapshot.json");
if (source.sha256 !== "1433bcbb900e7e8dd8344a4d84019bee1e12909b861bcc7da86b288f0f7157d6" || createHash("sha256").update(JSON.stringify(source.payload)).digest("hex") !== source.sha256) throw Error("Fixed lab source differs");
const data = source.payload;
type SourceRun = Omit<LabRun,"modelRevision"|"codeCommit"|"choice"|"paths"|"disposition"> & {
  model: {model_revision:string}|null; codeVersion:{commit:string}; selection:{choice:string}|null;
  candidates:{id:string;entityId:string;path:unknown[]}[]; dispositions:{outcome:string}[];
};
const runs = data.runs.map((r: SourceRun) => ({
  runId: r.runId, taskId: r.taskId, parentRunId: r.parentRunId, executionKind: r.executionKind, status: r.status,
  startedAt: r.startedAt, finishedAt: r.finishedAt, policyVersion: r.policyVersion,
  modelRevision: r.model?.model_revision ?? null, codeCommit: r.codeVersion.commit, resultSha256: r.resultSha256,
  evaluationDataVersion: r.evaluationDataVersion, scoringVersion: r.scoringVersion, semanticReview: r.semanticReview,
  trained: r.trained, trainingDataVersion: r.trainingDataVersion, adapterRevision: r.adapterRevision,
  choice: r.selection?.choice ?? null, completeWithinSnapshot: r.completeWithinSnapshot,
  paths: r.candidates.map(c => ({ id: c.id, targetId: c.entityId, steps: c.path })),
  disposition: r.dispositions.at(-1)?.outcome ?? null,
}));
const artifact = sealLabArtifact({ schemaVersion: 1, version: "birth-20261022-v1", aiId: data.aiId, operator: data.operator, liveStatus: data.liveStatus,
  officialAi: { binding: "plunode-official-ai", aiIdentityId: null }, kgRevision: data.kgRevision, kgSha256: data.kgSha256,
  recordedAt: [...runs].sort((a,b) => Date.parse(b.finishedAt)-Date.parse(a.finishedAt))[0].finishedAt,
  source: { commit, artifactSha256: source.sha256 }, entities: snapshot.entities.map((e: {id: string; name: string}) => ({id:e.id,name:e.name})), runs });
await mkdir("data/ai-lab", { recursive: true });
await writeFile("data/ai-lab/initial.json", canonicalLabJson(artifact) + "\n", { flag: "wx" });
console.log(JSON.stringify({ sha256: artifact.sha256, runs: runs.length }));
