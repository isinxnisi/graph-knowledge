import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { canonicalLabJson, labArtifactSchema, labHashSchema, labPayloadSchema, MAX_LAB_ARTIFACT_BYTES, type LabArtifact } from "../domain/ai-lab";
import { claimDetailSchema, entityDetailSchema } from "../domain/api";

const digest = (value: unknown) => createHash("sha256").update(canonicalLabJson(value)).digest("hex");
export function sealLabArtifact(payload: unknown): LabArtifact {
  const checked = labPayloadSchema.parse(payload);
  return { sha256: digest(checked), payload: checked };
}
export function parseLabArtifact(bytes: string | Buffer): LabArtifact {
  if (Buffer.byteLength(bytes) > MAX_LAB_ARTIFACT_BYTES) throw Error("Lab artifact is too large");
  const artifact = labArtifactSchema.parse(JSON.parse(bytes.toString()));
  if (digest(artifact.payload) !== artifact.sha256) throw Error("Lab artifact checksum mismatch");
  return artifact;
}
export async function readLabFile(file: string, max = MAX_LAB_ARTIFACT_BYTES): Promise<Buffer> {
  const fd = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await fd.stat();
    if (!stat.isFile() || stat.size > max) throw Error("Invalid lab file");
    // Bound allocation even if a writer changes the file after stat.
    const bytes = Buffer.alloc(max + 1), { bytesRead } = await fd.read(bytes, 0, max + 1, 0);
    if (bytesRead > max) throw Error("Invalid lab file size");
    return bytes.subarray(0, bytesRead);
  } finally { await fd.close(); }
}
const pointerSchema = z.strictObject({ schemaVersion: z.literal(1), sha256: labHashSchema });
export async function readLabPointer(directory: string) {
  try { return pointerSchema.parse(JSON.parse((await readLabFile(path.join(directory, "current.json"), 256)).toString())).sha256; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export async function readActiveLabArtifact(directory: string): Promise<LabArtifact | null> {
  const root = await realpath(directory), sha256 = await readLabPointer(root);
  if (!sha256) return null;
  const releases = path.join(root, "releases");
  if (await realpath(releases) !== releases) throw Error("Lab release directory must not be a symlink");
  const artifact = parseLabArtifact(await readLabFile(path.join(releases, sha256 + ".json")));
  if (artifact.sha256 !== sha256) throw Error("Lab pointer checksum mismatch");
  return artifact;
}

export type LabKgReader = (relativePath: string) => Promise<unknown>;
export async function verifyLabPublicReferences(artifact: LabArtifact, get: LabKgReader): Promise<string> {
  // Current beta can expose a named unaccepted film trial; revision is opaque.
  // Compare before/after exactly and still verify every Entity/Claim/support.
  const revision = async () => z.object({ dataset: z.literal("public-kg"), revision: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/) }).parse(await get("/api/dataset")).revision;
  const before = await revision();
  for (const entity of artifact.payload.entities) {
    const actual = entityDetailSchema.parse(z.object({ entity: z.unknown() }).parse(await get("/api/entities/" + entity.id)).entity);
    if (actual.id !== entity.id || actual.name !== entity.name) throw Error("Lab entity reference differs from public KG");
  }
  const claims = new Map<string,z.infer<typeof claimDetailSchema>>();
  for (const step of artifact.payload.runs.flatMap(r => r.paths.flatMap(p => p.steps))) {
    let actual = claims.get(step.claimId);
    if (!actual) { actual = claimDetailSchema.parse(z.object({ claim: z.unknown() }).parse(await get("/api/claims/" + step.claimId)).claim); claims.set(step.claimId,actual); }
    if (actual.withdrawal || actual.id !== step.claimId || actual.subjectId !== step.subjectId || actual.objectId !== step.objectId || actual.predicate !== step.predicate || actual.polarity !== step.polarity || canonicalLabJson(actual.period) !== canonicalLabJson(step.period) || canonicalLabJson(actual.contribution) !== canonicalLabJson(step.contribution)) throw Error("Lab Claim reference differs from public KG");
    const cited = actual.citations.filter(c => step.citationIds.includes(c.id));
    if (cited.length !== step.citationIds.length || cited.some(c => c.stance !== "support" || c.source.isDemo) || canonicalLabJson([...new Set(cited.map(c => c.source.id))].sort()) !== canonicalLabJson([...step.sourceIds].sort())) throw Error("Lab evidence reference differs from public KG");
  }
  if (await revision() !== before) throw Error("Public KG changed during lab validation");
  return before;
}
export function publicLabKgReader(origin: string): LabKgReader {
  if (origin !== "https://plunode.net" && !/^http:\/\/127\.0\.0\.1:\d{4,5}$/.test(origin)) throw Error("Use the official public KG or an explicit local trial origin");
  const deadline = AbortSignal.timeout(60_000);
  return async relativePath => {
    const response = await fetch(origin + relativePath, { redirect: "error", signal: AbortSignal.any([deadline, AbortSignal.timeout(15_000)]), headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw Error("Public KG reference unavailable");
    const reader = response.body?.getReader(); if (!reader) throw Error("Empty public KG response");
    const chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 512_000) throw Error("Public KG response too large"); chunks.push(value); } }
    finally { await reader.cancel(); }
    return JSON.parse(Buffer.concat(chunks).toString());
  };
}

// Operator-only filesystem operation. Web imports only the reader; no HTTP writer exists.
export async function activateLabArtifact(directory: string, artifact: LabArtifact, expected: string | null, get: LabKgReader) {
  const checked = parseLabArtifact(canonicalLabJson(artifact));
  if (!path.isAbsolute(directory)) throw Error("Use an absolute private artifact directory");
  await mkdir(directory, { recursive: true, mode: 0o750 });
  if (await realpath(directory) !== directory) throw Error("Lab directory must not be a symlink");
  const lockPath = path.join(directory, ".activation.lock"), lock = await open(lockPath, "wx", 0o600);
  const temporary = path.join(directory, ".current-" + randomUUID() + ".json");
  try {
    if (await readLabPointer(directory) !== expected) throw Error("Current lab version changed");
    const previous = await readActiveLabArtifact(directory) ?? parseLabArtifact(await readLabFile(path.join(process.cwd(),"data/ai-lab/initial.json")));
    const kgRevision = await verifyLabPublicReferences(checked, get);
    const releases = path.join(directory, "releases"); await mkdir(releases, { recursive: true, mode: 0o750 });
    if (await realpath(releases) !== releases) throw Error("Lab releases must not be a symlink");
    const destination = path.join(releases, checked.sha256 + ".json"), content = canonicalLabJson(checked) + "\n";
    let retainedVersion = false;
    try { retainedVersion = (await readLabFile(destination)).toString() === content; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    // A new version appends immutable observations. An already retained version
    // may be selected for rollback without deleting the newer release on disk.
    if (!retainedVersion && (previous.payload.runs.some(old => !checked.payload.runs.some(run => run.runId === old.runId && canonicalLabJson(run) === canonicalLabJson(old))) || ["source","entities","kgRevision","kgSha256"].some(key => canonicalLabJson(checked.payload[key as keyof typeof checked.payload]) !== canonicalLabJson(previous.payload[key as keyof typeof previous.payload])))) throw Error("Saved lab history is immutable");
    try { const fd = await open(destination, "wx", 0o640); try { await fd.writeFile(content); await fd.sync(); } finally { await fd.close(); } }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST" || (await readLabFile(destination)).toString() !== content) throw error; }
    const folder = await open(releases, "r"); try { await folder.sync(); } finally { await folder.close(); }
    const pointer = await open(temporary, "wx", 0o640);
    try { await pointer.writeFile(JSON.stringify({ schemaVersion: 1, sha256: checked.sha256 }) + "\n"); await pointer.sync(); } finally { await pointer.close(); }
    await rename(temporary, path.join(directory, "current.json"));
    const root = await open(directory, "r"); try { await root.sync(); } finally { await root.close(); }
    return { sha256: checked.sha256, previous: expected, validatedKgRevision: kgRevision };
  } finally { await unlink(temporary).catch(() => {}); await lock.close(); await unlink(lockPath); }
}
