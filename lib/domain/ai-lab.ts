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
  executionKind: z.enum(["rule", "not-connected", "kev-api", "interrupted"]), status: z.enum(["completed", "held", "failed", "unknown"]),
  startedAt: stamp, finishedAt: stamp, policyVersion: identifier,
  modelRevision: z.string().regex(/^[a-f0-9]{40}$/).nullable(),
  codeCommit: z.string().regex(/^[a-f0-9]{40}$/), resultSha256: labHashSchema,
  evaluationDataVersion: identifier, scoringVersion: identifier,
  semanticReview: z.literal("pending-human"), trained: z.literal(false),
  trainingDataVersion: z.null(), adapterRevision: z.null(),
  choice: z.string().regex(/^(?:path-[a-f0-9]{24}|STOP|HOLD)$/).nullable(),
  completeWithinSnapshot: z.boolean(), paths: z.array(labPathSchema).max(6),
  disposition: z.enum(["candidate", "rejected"]).nullable(),
  observation: z.strictObject({
    requestSent: z.boolean(), responseValidated: z.boolean(),
    gateVersion:z.literal("kev-short-window-v1").optional(),
    errorCode: z.enum(["gpu_busy", "gpu_too_warm", "vram_insufficient", "ram_insufficient", "disk_insufficient", "resources_unknown", "request_too_large", "transport_error", "validation_or_lock_error", "interrupted_no_retry", "provider_error"]).nullable(),
    telemetrySha256: labHashSchema, sampleCount: z.number().int().min(1).max(2000),
    wallSeconds: z.number().finite().nonnegative().max(600).nullable(),
    atSend: z.strictObject({ temperatureC:z.number().finite().min(0).max(150), utilizationPercent:z.number().finite().min(0).max(100), freeVramMiB:z.number().finite().nonnegative() }).nullable(),
    peak: z.strictObject({ temperatureC:z.number().finite().min(0).max(150), utilizationPercent:z.number().finite().min(0).max(100), powerWatts:z.number().finite().nonnegative(), usedVramMiB:z.number().finite().nonnegative() }),
  }).optional(),
});

const educationTaskSchema=z.strictObject({
  taskId:identifier,split:z.enum(['train','holdout']),kind:z.enum(['direction','evidence','polarity','role','scope','period','purpose']),
  objective:z.string().min(1).max(400),originId:z.uuidv4(),componentSha256:labHashSchema,
  entities:z.array(z.strictObject({id:z.uuidv4(),name:z.string().min(1).max(160)})).min(1).max(8),
  paths:z.array(labPathSchema.extend({steps:z.array(labStepSchema.extend({polarity:claimSchema.shape.polarity})).min(1).max(2)})).max(6),
  expectedChoice:z.enum(['C0','STOP','HOLD']).nullable(),evaluationBasis:z.enum(['machine-structural','pending-human']),
  semanticReview:z.literal('pending-human'),sourceSnapshotSha256:labHashSchema,
});
const modelEvaluation=z.strictObject({taskId:identifier,choice:z.enum(['C0','STOP','HOLD','A','B']),
  probabilities:z.record(identifier,z.number().finite().min(0).max(1)),tokens:z.number().int().min(1).max(512)});
export const educationCycleSchema=z.strictObject({
  cycleId:z.uuidv4(),kind:z.enum(['structural-education','synthetic-infrastructure']),
  status:z.enum(['completed','held','failed','unknown']),reason:identifier.nullable(),startedAt:stamp,finishedAt:stamp,
  codeCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceSha256:labHashSchema,resultSha256:labHashSchema,
  modelRevision:z.string().regex(/^[a-f0-9]{40}$/),baseRevision:z.string().regex(/^[a-f0-9]{40}$/),
  tasks:z.array(educationTaskSchema).max(4),inferenceCalls:z.number().int().min(0).max(8),
  training:z.strictObject({optimizerUpdates:z.union([z.literal(0),z.literal(1)]),frozenUnchanged:z.boolean().nullable(),
    beforeSha256:labHashSchema.nullable(),afterSha256:labHashSchema.nullable(),
    checkpointSaved:z.boolean(),checkpointReloaded:z.boolean(),checkpointSha256:labHashSchema.nullable(),
    adopted:z.literal(false)}),
  comparison:z.strictObject({basis:z.literal('machine-structural-only'),before:z.array(modelEvaluation).max(4),after:z.array(modelEvaluation).max(4),
    holdoutTaskIds:z.array(identifier).max(2),capabilityImprovement:z.literal('unconfirmed'),semanticAccepted:z.null(),reloadVerified:z.boolean()}).nullable(),
  stages:z.array(z.strictObject({phase:z.enum(['train','reload']),name:z.enum(['loaded','frozen','evaluated-before','forward','backward','optimizer','evaluated-after','saved','reloaded']),
    elapsedSeconds:z.number().finite().nonnegative().max(240),cpuSeconds:z.number().finite().nonnegative().max(600),
    peakRssMiB:z.number().finite().nonnegative().max(6144)})).max(12),
  limits:z.strictObject({ramMiB:z.literal(6144),cpus:z.literal(2),wallSeconds:z.literal(180),outputMiB:z.literal(256)}),
  nextTasks:z.array(z.strictObject({taskId:identifier,kind:educationTaskSchema.shape.kind,evaluationBasis:educationTaskSchema.shape.evaluationBasis})).max(4),
  semanticReview:z.literal('pending-human'),generalizationEvidence:z.literal(false),
}).superRefine((cycle,ctx)=>{
  const fail=()=>ctx.addIssue({code:'custom',message:'Inconsistent education observation'});
  if(Date.parse(cycle.finishedAt)<Date.parse(cycle.startedAt))fail();
  const train=new Set(cycle.tasks.filter(t=>t.split==='train').flatMap(t=>t.entities.map(e=>e.id))),holdout=cycle.tasks.filter(t=>t.split==='holdout');
  if(holdout.some(t=>t.entities.some(e=>train.has(e.id))))fail();
  const trainComponents=new Set(cycle.tasks.filter(t=>t.split==='train').map(t=>t.componentSha256));
  if(holdout.some(t=>trainComponents.has(t.componentSha256))||new Set(cycle.tasks.map(t=>t.taskId)).size!==cycle.tasks.length)fail();
  const trainClaims=new Set(cycle.tasks.filter(t=>t.split==='train').flatMap(t=>t.paths.flatMap(p=>p.steps.map(s=>s.claimId))));
  if(holdout.some(t=>t.paths.some(p=>p.steps.some(s=>trainClaims.has(s.claimId)))))fail();
  if(cycle.training.optimizerUpdates===1&&(!cycle.training.frozenUnchanged||!cycle.training.beforeSha256||!cycle.training.afterSha256||cycle.training.beforeSha256===cycle.training.afterSha256||!cycle.stages.some(s=>s.name==='optimizer')))fail();
  if(cycle.training.checkpointReloaded&&(!cycle.training.checkpointSaved||!cycle.training.checkpointSha256||!cycle.stages.some(s=>s.name==='reloaded')))fail();
  if(cycle.training.checkpointSaved&&!cycle.stages.some(s=>s.name==='saved'))fail();
  if(cycle.kind==='synthetic-infrastructure'&&(cycle.tasks.length||cycle.inferenceCalls||cycle.comparison))fail();
  if(cycle.kind==='structural-education'&&cycle.status==='completed'&&(!cycle.training.checkpointReloaded||!cycle.comparison||!holdout.length))fail();
  for(const t of cycle.tasks){
    if(t.evaluationBasis==='pending-human'&&t.expectedChoice!==null)fail();
    const entities=new Set(t.entities.map(e=>e.id));
    if(!entities.has(t.originId))fail();
    for(const p of t.paths)for(const s of p.steps){
      if(![s.fromId,s.toId,s.subjectId,s.objectId].every(id=>entities.has(id)))fail();
      if(s.direction==='incoming'?s.fromId!==s.objectId||s.toId!==s.subjectId:s.fromId!==s.subjectId||s.toId!==s.objectId)fail();
    }
  }
  if(cycle.comparison){
    if(cycle.status==='completed'&&cycle.inferenceCalls!==cycle.comparison.before.length+cycle.comparison.after.length+(cycle.training.checkpointReloaded?cycle.comparison.holdoutTaskIds.length:0))fail();
    for(const e of [...cycle.comparison.before,...cycle.comparison.after]){
      const values=Object.values(e.probabilities);
      if(!cycle.tasks.some(t=>t.taskId===e.taskId)||!(e.choice in e.probabilities)||Math.abs(values.reduce((a,b)=>a+b,0)-1)>.02)fail();
    }
    if(cycle.comparison.holdoutTaskIds.some(id=>!holdout.some(t=>t.taskId===id)))fail();
    if(cycle.comparison.after.some(e=>!cycle.comparison!.holdoutTaskIds.includes(e.taskId)))fail();
  }
});

// v1 retains the immutable birth state. v2 adds observed, sealed inference records.
// v3 adds measured independent updates; semantic scores and adoption stay unapproved.
export const labPayloadSchema = z.strictObject({
  schemaVersion: z.union([z.literal(1),z.literal(2),z.literal(3)]), version: identifier, aiId: z.literal(APPRENTICE_AI_ID), operator: z.literal("plunode"),
  liveStatus: z.literal("not-monitored"), officialAi: z.strictObject({ binding: z.literal("plunode-official-ai"), aiIdentityId: z.null() }),
  kgRevision: z.uuidv4(), kgSha256: labHashSchema, recordedAt: stamp,
  source: z.strictObject({ commit: z.string().regex(/^[a-f0-9]{40}$/), artifactSha256: labHashSchema }),
  entities: z.array(z.strictObject({ id: z.uuidv4(), name: z.string().trim().min(1).max(160) })).min(1).max(32),
  runs: z.array(runSchema).min(1).max(128),
  education:z.strictObject({version:z.literal('autonomous-v1'),cycles:z.array(educationCycleSchema).min(1).max(32)}).optional(),
}).superRefine((data, ctx) => {
  const fail = () => ctx.addIssue({ code: "custom", message: "Inconsistent saved lab record" });
  const entities = new Set(data.entities.map(e => e.id)), runs = new Set(data.runs.map(r => r.runId));
  if (entities.size !== data.entities.length || runs.size !== data.runs.length) fail();
  if((data.schemaVersion!==3&&data.education)||(data.schemaVersion===3&&!data.education))fail();
  if (data.recordedAt !== [...data.runs,...(data.education?.cycles??[])].sort((a,b) => Date.parse(b.finishedAt)-Date.parse(a.finishedAt))[0].finishedAt) fail();
  if(new Set(data.education?.cycles.map(c=>c.cycleId)).size!==(data.education?.cycles.length??0))fail();
  for (const run of data.runs) {
    if (Date.parse(run.finishedAt) < Date.parse(run.startedAt) || run.parentRunId && !runs.has(run.parentRunId)) fail();
    if (data.schemaVersion === 1 && (run.observation || !["rule","not-connected"].includes(run.executionKind) || !["completed","held"].includes(run.status))) fail();
    if (run.executionKind === "rule") {
      if (run.status !== "completed" || run.choice === null || run.modelRevision !== null || run.observation) fail();
    } else if (run.executionKind === "not-connected") {
      if (!["held","failed"].includes(run.status) || run.choice !== null || run.observation?.requestSent) fail();
    } else {
      if (!run.observation || !run.modelRevision || run.status === "held") fail();
      if (run.executionKind === "kev-api" && !run.observation?.requestSent) fail();
      if (run.status === "completed" ? run.choice === null || !run.observation?.responseValidated : run.choice !== null || run.observation?.responseValidated) fail();
      if (run.executionKind === "interrupted" && run.status !== "unknown") fail();
    }
    if (run.observation && (run.observation.responseValidated !== (run.status === "completed") || run.status === "completed" && run.observation.errorCode !== null)) fail();
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
  const cycles=data.education?.cycles.filter(c=>c.kind==='structural-education')??[];
  return { inference: data.runs.filter(r => r.executionKind === "kev-api" && r.status === "completed" && r.observation?.responseValidated).length+cycles.reduce((n,c)=>n+c.inferenceCalls,0), training:cycles.reduce((n,c)=>n+c.training.optimizerUpdates,0), baseline: data.runs.filter(r => r.executionKind === "rule").length, held: data.runs.filter(r => r.status === "held").length };
}
export function canonicalLabJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonicalLabJson).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => JSON.stringify(k)+":"+canonicalLabJson(v)).join(",") + "}";
  return JSON.stringify(value);
}
