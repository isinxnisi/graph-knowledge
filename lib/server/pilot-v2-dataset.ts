import { readFile } from "node:fs/promises";
import { z } from "zod";
import { publicationScopeSchema, roleEvidenceSchema, roleIdSchema } from "../domain/contribution";
import { validateFixture, type Fixture } from "../domain/fixture";
import { jsonFile, loadPilot, PILOT_DIRECTORY, pilotLedgerSchema, sha256 } from "./pilot-dataset";

export const PILOT_V2_DIRECTORY = "datasets/pilot-urasawa/v2";
const text = z.string().trim().min(1);
export const pilotV2LedgerSchema = z.strictObject({
  schemaVersion: z.literal(2),
  dataset: z.strictObject({ id: z.literal("pilot-urasawa-v2"), version: z.literal(2), transformVersion: z.literal(1), createdAt: z.iso.datetime() }),
  base: z.strictObject({ dataset: z.literal("pilot-urasawa-v1"), dataSha256: text, ledgerSha256: text }),
  candidates: z.array(z.strictObject({
    originClaimId: z.uuidv4(), claimId: z.uuidv4(), citationId: z.uuidv4(), roleId: roleIdSchema,
    scope: publicationScopeSchema, roleEvidence: roleEvidenceSchema,
    sourceRecheck: z.strictObject({ checkedAt: z.iso.datetime(), method: text, summary: text }),
    acceptance: z.strictObject({ decision: z.enum(["pending", "accepted", "deferred"]), reviewer: text.nullable(), reviewedAt: z.iso.datetime().nullable(), reason: text }),
  })),
  deferred: z.array(z.strictObject({ subject: text, roleCandidate: text, reason: text })),
}).superRefine((ledger, ctx) => {
  ledger.candidates.forEach((candidate, index) => {
    if (candidate.acceptance.decision === "accepted" && (!candidate.acceptance.reviewer || !candidate.acceptance.reviewedAt)) ctx.addIssue({ code: "custom", path: ["candidates", index, "acceptance"], message: "Accepted role/scope requires human reviewer and date" });
  });
});

export async function preparePilotV2() {
  const old = await loadPilot(); // frozen v1 bytes, manifest and raw QID evidence are all checked
  const oldBytes = await readFile(`${PILOT_DIRECTORY}/data.json`);
  const oldLedgerBytes = await readFile(`${PILOT_DIRECTORY}/ledger.json`);
  const ledgerBytes = await readFile(`${PILOT_V2_DIRECTORY}/ledger.json`);
  const ledger = pilotV2LedgerSchema.parse(JSON.parse(ledgerBytes.toString()));
  if (sha256(oldBytes) !== ledger.base.dataSha256 || sha256(oldLedgerBytes) !== ledger.base.ledgerSha256) throw new Error("Frozen v1 origin changed");
  const oldLedger = pilotLedgerSchema.parse(JSON.parse(oldLedgerBytes.toString()));
  const claims: Fixture["claims"] = old.claims.map((claim) => ({ ...claim, contribution: claim.predicate === "CONTRIBUTED_TO" ? { roleId: null, scope: null } : null }));
  const citations = old.citations.map((citation) => ({ ...citation, roleEvidence: null as z.infer<typeof roleEvidenceSchema> | null }));
  for (const candidate of ledger.candidates) {
    const origin = oldLedger.claims.find((entry) => entry.claim.id === candidate.originClaimId);
    if (!origin || origin.claim.predicate !== "CONTRIBUTED_TO") throw new Error("Unknown/non-contribution origin");
    const source = oldLedger.sources.find((entry) => entry.source.id === origin.citation.sourceId)!;
    if (candidate.roleEvidence.originalText !== origin.evidence.originalRole || candidate.roleEvidence.language !== origin.evidence.language || candidate.scope.isbn13 !== source.provenance.isbn?.replaceAll("-", "")) throw new Error("Candidate evidence/publication differs from origin");
    if (candidate.acceptance.decision !== "accepted") continue;
    if (!candidate.acceptance.reviewer || !candidate.acceptance.reviewedAt) throw new Error("Role/scope acceptance requires human reviewer and date");
    claims.push({ ...origin.claim, id: candidate.claimId, createdAt: candidate.acceptance.reviewedAt, updatedAt: candidate.acceptance.reviewedAt,
      contribution: { roleId: candidate.roleId, scope: candidate.scope } });
    citations.push({ ...origin.citation, id: candidate.citationId, claimId: candidate.claimId,
      accessedAt: candidate.sourceRecheck.checkedAt.slice(0, 10), roleEvidence: candidate.roleEvidence,
      note: `v1の広いClaim ${origin.claim.id} と同じ資料に由来する限定Claim。${candidate.acceptance.reason}` });
  }
  const fixture = validateFixture({ ...old, schemaVersion: 2, claims, citations });
  const data = jsonFile(fixture);
  return { fixture, data, manifest: { ...ledger.dataset, files: { "ledger.json": sha256(ledgerBytes), "data.json": sha256(data) }, base: ledger.base,
    accepted: ledger.candidates.filter((c) => c.acceptance.decision === "accepted").map((c) => c.claimId) } };
}
export async function loadPilotV2() {
  const prepared = await preparePilotV2();
  if (await readFile(`${PILOT_V2_DIRECTORY}/data.json`, "utf8") !== prepared.data || await readFile(`${PILOT_V2_DIRECTORY}/manifest.json`, "utf8") !== jsonFile(prepared.manifest)) throw new Error("v2 data/manifest differs from reviewed ledger");
  return prepared.fixture;
}
