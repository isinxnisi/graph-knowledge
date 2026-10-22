import { z } from "zod";
import { contributionSchema } from "./contribution";
import { claimSchema } from "./fixture";

export const APPRENTICE_AI_ID = "fe93a431-85cf-4fae-8b84-127e8bf866a7";
export const MAX_LAB_ARTIFACT_BYTES = 256_000;
export const labHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/);
const stamp = z.iso.datetime({ offset: true });
export const labTaskSchema = z.enum(["pluto-supervisor", "pluto-no-outgoing", "pluto-limited", "pluto-other-work"]);
const ids = z.array(z.uuidv4()).min(1).max(16);
export const labStepSchema = z.strictObject({
  claimId: z.uuidv4(), fromId: z.uuidv4(), toId: z.uuidv4(), subjectId: z.uuidv4(), objectId: z.uuidv4(),
  direction: z.enum(["incoming", "outgoing"]), predicate: claimSchema.shape.predicate,
  polarity: z.literal("affirmed"), period: claimSchema.shape.period,
  contribution: contributionSchema.nullable(), citationIds: ids, sourceIds: ids,
});
export const labPathSchema = z.strictObject({ id: z.string().regex(/^path-[a-f0-9]{24}$/), targetId: z.uuidv4(), steps: z.array(labStepSchema).min(1).max(2) });
const runSchema = z.strictObject({
  runId: z.uuidv4(), taskId: labTaskSchema, parentRunId: z.uuidv4().nullable(),
  executionKind: z.enum(["rule", "not-connected"]), status: z.enum(["completed", "held"]),
  startedAt: stamp, finishedAt: stamp, policyVersion: identifier,
  modelRevision: z.string().regex(/^[a-f0-9]{40}$/).nullable(),
  codeCommit: z.string().regex(/^[a-f0-9]{40}$/), resultSha256: labHashSchema,
  evaluationDataVersion: identifier, scoringVersion: identifier,
  semanticReview: z.literal("pending-human"), trained: z.literal(false),
  trainingDataVersion: z.null(), adapterRevision: z.null(),
  choice: z.string().regex(/^(?:path-[a-f0-9]{24}|STOP|HOLD)$/).nullable(),
  completeWithinSnapshot: z.boolean(), paths: z.array(labPathSchema).max(6),
  disposition: z.enum(["candidate", "rejected"]).nullable(),
});

// Initial public contract is deliberately limited to the recorded birth state.
// Real inference / training require a separately reviewed contract, not a counter edit.
export const labPayloadSchema = z.strictObject({
  schemaVersion: z.literal(1), version: identifier, aiId: z.literal(APPRENTICE_AI_ID), operator: z.literal("plunode"),
  liveStatus: z.literal("not-monitored"), officialAi: z.strictObject({ binding: z.literal("plunode-official-ai"), aiIdentityId: z.null() }),
  kgRevision: z.uuidv4(), kgSha256: labHashSchema, recordedAt: stamp,
  source: z.strictObject({ commit: z.string().regex(/^[a-f0-9]{40}$/), artifactSha256: labHashSchema }),
  entities: z.array(z.strictObject({ id: z.uuidv4(), name: z.string().trim().min(1).max(160) })).min(1).max(32),
  runs: z.array(runSchema).min(1).max(128),
}).superRefine((data, ctx) => {
  const fail = () => ctx.addIssue({ code: "custom", message: "Inconsistent saved lab record" });
  const entities = new Set(data.entities.map(e => e.id)), runs = new Set(data.runs.map(r => r.runId));
  if (entities.size !== data.entities.length || runs.size !== data.runs.length) fail();
  if (data.recordedAt !== [...data.runs].sort((a,b) => Date.parse(b.finishedAt)-Date.parse(a.finishedAt))[0].finishedAt) fail();
  for (const run of data.runs) {
    if (Date.parse(run.finishedAt) < Date.parse(run.startedAt) || run.parentRunId && !runs.has(run.parentRunId)) fail();
    if (run.executionKind === "not-connected" ? run.status !== "held" || run.choice !== null : run.status !== "completed" || run.choice === null || run.modelRevision !== null) fail();
    if (run.choice === "STOP" && !run.completeWithinSnapshot) fail();
    if (run.choice?.startsWith("path-") && !run.paths.some(p => p.id === run.choice)) fail();
    if (new Set(run.paths.map(p => p.id)).size !== run.paths.length) fail();
    for (const path of run.paths) {
      if (path.steps.at(-1)?.toId !== path.targetId || !entities.has(path.targetId)) fail();
      path.steps.forEach((step, i) => {
        if (![step.fromId, step.toId, step.subjectId, step.objectId].every(id => entities.has(id))) fail();
        if (step.direction === "incoming" ? step.fromId !== step.objectId || step.toId !== step.subjectId : step.fromId !== step.subjectId || step.toId !== step.objectId) fail();
        if (i && path.steps[i-1].toId !== step.fromId) fail();
        if (new Set(step.citationIds).size !== step.citationIds.length || new Set(step.sourceIds).size !== step.sourceIds.length) fail();
      });
    }
    const seen = new Set<string>([run.runId]); let parent = run.parentRunId;
    while (parent) { if (seen.has(parent)) { fail(); break; } seen.add(parent); parent = data.runs.find(r => r.runId === parent)?.parentRunId ?? null; }
  }
});
export const labArtifactSchema = z.strictObject({ sha256: labHashSchema, payload: labPayloadSchema });
export type LabArtifact = z.infer<typeof labArtifactSchema>;
export type LabRun = LabArtifact["payload"]["runs"][number];
export function labCounts(data: LabArtifact["payload"]) {
  return { inference: 0, training: 0, baseline: data.runs.filter(r => r.executionKind === "rule").length, held: data.runs.filter(r => r.status === "held").length };
}
export function canonicalLabJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonicalLabJson).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => JSON.stringify(k)+":"+canonicalLabJson(v)).join(",") + "}";
  return JSON.stringify(value);
}
