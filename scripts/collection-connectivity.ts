/** Read-only offline CLI: only the requested report directory is written. */
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { z } from "zod";
import { fixtureV4Schema } from "../lib/domain/fixture";
import { CONTRIBUTION_ROLE_IDS } from "../lib/domain/contribution";
import { PREDICATE_KEYS } from "../lib/domain/predicates";
import { validatePublicBackup } from "../lib/server/public-backup";
import { validatePublicRelease, stableJson } from "../lib/server/public-dataset";
import { analyzeConnectivity, connectivityMarkdown } from "../lib/analysis/collection-connectivity";

const artifact = z.strictObject({ file: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
const inputSchema = z.strictObject({
  schemaVersion: z.literal(1), mode: z.enum(["published-regression", "candidate"]),
  baseline: z.strictObject({ backup: artifact, release: z.string().min(1), revision: z.string().min(1) }),
  comparison: z.strictObject({ fixture: artifact, manifest: artifact.optional(), release: z.string().min(1).optional() }),
  publicObservation: artifact,
  options: z.strictObject({
    direction: z.enum(["both", "outgoing", "incoming"]).optional(),
    predicates: z.array(z.enum(PREDICATE_KEYS)).optional(), roleIds: z.array(z.enum(CONTRIBUTION_ROLE_IDS)).optional(),
    includeHiddenCandidates: z.boolean().optional(), held: z.array(z.strictObject({ claimId: z.uuidv4(), reason: z.string().trim().min(1) })).optional(),
    groups: z.array(z.strictObject({ id: z.string().min(1), title: z.string().min(1), claimIds: z.array(z.uuidv4()) })).optional(),
    roots: z.array(z.uuidv4()).optional(), maxPathsPerRoot: z.number().int().min(1).max(1000).optional(),
    maxExpansionsPerRoot: z.number().int().min(1).max(100000).optional(),
    maxTotalPathExpansions: z.number().int().min(1).max(2000000).optional(),
  }).optional(),
  expected: z.strictObject({ newClaims: z.number().int().nonnegative(), beforeClaims: z.number().int().nonnegative(),
    afterClaims: z.number().int().nonnegative(), additionComponents: z.number().int().nonnegative() }).optional(),
});
const observationSchema = z.strictObject({ dataset: z.literal("public-kg"), revision: z.string().min(1),
  observedAt: z.iso.datetime(), origin: z.url(), release: z.string().min(1).optional(),
  evidence: z.string().min(1), note: z.string().min(1) });

export function evaluateConnectivityInput(inputFile: string, expectedRevision: string) {
  const reads = new Map<string, string>();
  const read = (file: string, expected?: string) => {
    const raw = fs.readFileSync(file);
    // Artifact hashes are ordinary SHA-256 of bytes, including compression.
    const byteHash = sha256Bytes(raw);
    if (expected && byteHash !== expected) throw Error("Artifact checksum mismatch: " + file);
    if (reads.has(file) && reads.get(file) !== byteHash) throw Error("Input changed while reading");
    reads.set(file, byteHash);
    return JSON.parse((file.endsWith(".gz") ? gunzipSync(raw, { maxOutputLength: 64 * 1024 * 1024 }) : raw).toString("utf8"));
  };
  const absoluteInput = path.resolve(inputFile), spec = inputSchema.parse(read(absoluteInput));
  const base = path.dirname(absoluteInput);
  const load = (ref: z.infer<typeof artifact>) => read(path.resolve(base, ref.file), ref.sha256);
  const observation = observationSchema.parse(load(spec.publicObservation));
  if (observation.revision !== expectedRevision) throw Error("Saved public observation differs from expected current revision");
  const fixture = fixtureV4Schema.parse(load(spec.comparison.fixture));
  const backup = validatePublicBackup(load(spec.baseline.backup));
  if (backup.payload.revision !== spec.baseline.revision || backup.payload.release !== spec.baseline.release) throw Error("Baseline snapshot revision/release mismatch");
  let release = null;
  if (spec.comparison.manifest) {
    release = validatePublicRelease({ fixture, manifest: load(spec.comparison.manifest) });
    if (release.manifest.baseRelease !== backup.payload.release || release.manifest.release !== spec.comparison.release) throw Error("Comparison release/base mismatch");
  }
  if (spec.mode === "published-regression") {
    if (!release || spec.options?.includeHiddenCandidates || spec.options?.held?.length) throw Error("Published regression requires a release and cannot include held/hidden proposals");
    if (observation.release !== release.manifest.release) throw Error("Published observation release mismatch");
    if (observation.revision === backup.payload.revision) throw Error("Published regression requires distinct before/after revisions");
  } else if (observation.revision !== backup.payload.revision) throw Error("Candidate baseline is stale against the supplied current observation");
  const analysis = analyzeConnectivity(backup.payload.fixture, fixture, spec.options);
  if (spec.expected && stableJson({ newClaims: analysis.delta.claims, beforeClaims: backup.payload.fixture.claims.length,
    afterClaims: fixture.claims.length, additionComponents: analysis.additionOnly.componentCount }) !== stableJson(spec.expected)) throw Error("Regression counts mismatch");
  for (const [file, hash] of reads) if (sha256Bytes(fs.readFileSync(file)) !== hash) throw Error("Input changed during analysis");
  const provenance = { inputFile: path.basename(inputFile), inputSha256: reads.get(absoluteInput)!, mode: spec.mode,
    baseline: { release: backup.payload.release, revision: backup.payload.revision, savedAt: backup.payload.savedAt,
      backupChecksum: backup.checksum, graphDigest: backup.payload.graphDigest, artifact: spec.baseline.backup },
    comparison: spec.comparison, publicObservation: observation, publicObservationArtifact: spec.publicObservation,
    freshness: "saved-offline-observation-only; no network or DB access; caller must supply the expected current revision",
  };
  const report = { ...analysis, provenance };
  const markdown = connectivityMarkdown(analysis) + ["", "## 入力の固定と公開状態", "",
    `- モード: ${spec.mode}。基準release: \`${backup.payload.release}\`、追加前revision: \`${backup.payload.revision}\`。`,
    `- 公開観測revision: \`${observation.revision}\`、観測日時: ${observation.observedAt}、origin: ${observation.origin}。`,
    `- 公開観測の証跡: ${observation.evidence}`, `- 観測の限界: ${observation.note}`,
    "- 保存済みartifactだけを検証。現在の外部APIを再取得した結果ではない。期待revisionが保存観測と違えば失敗する。",
    `- 入力定義SHA-256: \`${provenance.inputSha256}\`。各圧縮artifactのhash、元backupのchecksum／graphDigest、比較fixtureの意味hashはJSONに保持。`, ""].join("\n");
  return { report, markdown };
}

function sha256Bytes(bytes: Buffer) { return createHash("sha256").update(bytes).digest("hex"); }

export function writeConnectivityReport(output: string, result: ReturnType<typeof evaluateConnectivityInput>, checkOnly = false) {
  const files = { "report.json": JSON.stringify(result.report, null, 2) + "\n", "README.md": result.markdown };
  if (fs.existsSync(output)) {
    if (!fs.lstatSync(output).isDirectory() || fs.lstatSync(output).isSymbolicLink()
      || stableJson(fs.readdirSync(output).sort()) !== stableJson(Object.keys(files).sort())) throw Error("Report directory is not the expected immutable output");
    for (const [name, content] of Object.entries(files)) {
      const file = path.join(output, name);
      if (fs.lstatSync(file).isSymbolicLink() || fs.readFileSync(file, "utf8") !== content) throw Error("Existing report differs: " + name);
    }
  } else {
    if (checkOnly) throw Error("Report missing");
    fs.mkdirSync(output); // parent must exist; never replace any input or existing report
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(output, name), content, { flag: "wx" });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { input: { type: "string" }, output: { type: "string" }, "expected-revision": { type: "string" }, check: { type: "boolean" } }, strict: true, allowPositionals: false });
    if (!values.input || !values.output || !values["expected-revision"]) throw Error("Usage: node --import tsx scripts/collection-connectivity.ts --input INPUT.json --expected-revision REV --output NEW_DIRECTORY [--check]");
    const result = evaluateConnectivityInput(values.input, values["expected-revision"]);
    writeConnectivityReport(values.output, result, values.check);
    console.log(JSON.stringify({ status: "verified", readOnly: true, output: values.output, revision: values["expected-revision"], addedClaims: result.report.delta.claims, additionComponents: result.report.additionOnly.componentCount }));
  } catch (error) { console.error(JSON.stringify({ status: "failed", reason: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; }
}
