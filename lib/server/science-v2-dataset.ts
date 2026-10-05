import { readFile } from "node:fs/promises";
import { z } from "zod";
import { periodSchema } from "../domain/dates";
import { organizationPositionSchema, positionEvidenceSchema } from "../domain/organization-participation";
import { validateFixture } from "../domain/fixture";
import { jsonFile, sha256 } from "./pilot-dataset";
import { loadSciencePilot } from "./science-dataset";

export const SCIENCE_V2_DIRECTORY = "datasets/pilot-science/v2";
const text = z.string().min(1), hash = z.string().regex(/^[a-f0-9]{64}$/);
const candidateSchema = z.strictObject({ ref: z.enum(["A01", "A02"]), claimId: z.uuidv4(), citationId: z.uuidv4(), baseClaimId: z.uuidv4(), positionId: organizationPositionSchema, period: periodSchema,
  evidence: positionEvidenceSchema.extend({ originalPeriod: text, locator: text, sourceMeaning: text, scope: text, doNotInfer: z.array(text) }),
  acceptance: z.strictObject({ decision: z.literal("accepted"), reviewer: text, date: z.iso.date(), reference: text, reason: text, structuredImplementation: text }),
});
export const scienceV2LedgerSchema = z.strictObject({ schemaVersion: z.literal(1),
  dataset: z.strictObject({ id: z.literal("pilot-science-v2"), version: z.literal(2), transformVersion: z.literal(1), createdAt: z.iso.datetime(), frozen: z.literal(true), scope: text }),
  base: z.strictObject({ dataset: z.literal("pilot-science-v1"), files: z.record(text, hash) }),
  research: z.strictObject({ file: z.literal("docs/research/phase-13-relation-model/v2/ledger.json"), sha256: hash, sourceRef: z.literal("S01"), retrieval: z.unknown(), note: text }),
  sourceId: z.uuidv4(), candidates: z.array(candidateSchema).length(2), pending: z.tuple([z.literal("C09")]), identity: text,
});
export async function prepareScienceV2(directory = SCIENCE_V2_DIRECTORY) {
  const bytes = await readFile(`${directory}/ledger.json`);
  const ledger = scienceV2LedgerSchema.parse(JSON.parse(bytes.toString()));
  // 台帳のpathは収集済み入力だけ。任意ファイルや新datasetへの逃げ道を許さない。
  const frozenInputs = Object.keys(ledger.base.files);
  if (!frozenInputs.includes("datasets/pilot-science/v1/data.json") || !frozenInputs.includes("fixtures/demo.json") || !frozenInputs.includes("datasets/pilot-urasawa/v2/data.json")) throw new Error("Missing frozen dataset baseline");
  for (const [file, expected] of Object.entries(ledger.base.files)) {
    if (!/^(fixtures\/[^/]+\.json|datasets\/(pilot-urasawa\/(v1|v2)|pilot-science\/v1)\/(raw\/)?[^/]+\.json)$/.test(file)) throw new Error("Invalid frozen input path");
    if (sha256(await readFile(file)) !== expected) throw new Error(`Frozen input changed: ${file}`);
  }
  const researchBytes = await readFile(ledger.research.file);
  if (sha256(researchBytes) !== ledger.research.sha256) throw new Error("Research provenance changed");
  const research = JSON.parse(researchBytes.toString());
  const base = await loadSciencePilot();
  const source = base.sources.find(s => s.id === ledger.sourceId);
  const researchSource = research.sources.find((s: { id: string }) => s.id === ledger.research.sourceRef);
  if (!source || source.url !== researchSource?.retrieval.url || JSON.stringify(ledger.research.retrieval) !== JSON.stringify(researchSource.retrieval)) throw new Error("Source provenance mismatch");
  if (new Set(ledger.candidates.map(c => c.ref)).size !== 2) throw new Error("Candidate refs must be A01/A02");
  const added = ledger.candidates.map(candidate => {
    const original = research.candidates.find((c: { id: string }) => c.id === candidate.ref);
    const expected = candidate.ref === "A01" ? { id: "VISITOR", text: "Visitor", from: "1924", to: "1925" } : { id: "ASSOCIATE_PROFESSOR", text: "Associate professor", from: "1926", to: "1927" };
    const broad = base.claims.find(c => c.id === candidate.baseClaimId);
    if (!broad || broad.id !== "eb7182aa-e7f1-4064-a731-bffe7c59227c" || candidate.positionId !== expected.id || candidate.evidence.originalText !== expected.text || candidate.evidence.language !== "en"
      || JSON.stringify(candidate.period) !== JSON.stringify(original.period) || candidate.period.from?.value !== expected.from || candidate.period.to?.value !== expected.to
      || candidate.evidence.originalPeriod !== original.citations[0].originalPeriodText || candidate.evidence.locator !== original.citations[0].locator || candidate.evidence.scope !== original.scope
      || candidate.evidence.sourceMeaning !== original.proposedNarrowMeaning || JSON.stringify(candidate.evidence.doNotInfer) !== JSON.stringify(original.doNotInfer)) throw new Error("Qualified claim differs from reviewed narrow evidence");
    return { ...broad, id: candidate.claimId, period: candidate.period, contribution: null, organizationParticipation: { positionId: candidate.positionId }, createdAt: ledger.dataset.createdAt, updatedAt: ledger.dataset.createdAt };
  });
  const fixture = validateFixture({ schemaVersion: 3, entities: base.entities, sources: base.sources,
    claims: [...base.claims.map(c => ({ ...c, contribution: null, organizationParticipation: null })), ...added],
    citations: [...base.citations.map(c => ({ ...c, roleEvidence: null, positionEvidence: null })), ...ledger.candidates.map(c => ({
      id: c.citationId, claimId: c.claimId, sourceId: ledger.sourceId, locator: c.evidence.locator, stance: "support", accessedAt: researchSource.retrieval.accessedAtUtc.slice(0, 10), roleEvidence: null,
      positionEvidence: { originalText: c.evidence.originalText, language: c.evidence.language },
      note: `${c.evidence.sourceMeaning} 期間原表記：${c.evidence.originalPeriod}。${c.evidence.scope} ${c.acceptance.reason} 同じSourceからの限定付き主張であり独立した新しい根拠ではない。Sourceの「今回Visitorのみ受入」はv1の収集履歴。v2では2立場を個別に受け入れている。`,
    }))] });
  const data = jsonFile(fixture);
  return { fixture, data, manifest: { ...ledger.dataset, files: { "ledger.json": sha256(bytes), "data.json": sha256(data) }, frozenInputs: ledger.base.files, research: { file: ledger.research.file, sha256: ledger.research.sha256 }, accepted: ["A01", "A02"], retainedBroadClaims: 8, pending: ["C09"] } };
}
export async function loadScienceV2() {
  const prepared = await prepareScienceV2();
  if (await readFile(`${SCIENCE_V2_DIRECTORY}/data.json`, "utf8") !== prepared.data || await readFile(`${SCIENCE_V2_DIRECTORY}/manifest.json`, "utf8") !== jsonFile(prepared.manifest)) throw new Error("Science v2 data/manifest differs from accepted ledger");
  return prepared.fixture;
}
