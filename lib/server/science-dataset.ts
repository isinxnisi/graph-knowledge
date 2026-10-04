import { readFile } from "node:fs/promises";
import { z } from "zod";
import { claimSchema, citationSchema, entitySchema, sourceSchema, validateFixture } from "../domain/fixture";
import { jsonFile, sha256 } from "./pilot-dataset";

export const SCIENCE_DIRECTORY = "datasets/pilot-science/v1";
const text = z.string().trim().min(1);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const acceptance = z.strictObject({ decision: z.enum(["accepted", "pending"]), reviewer: text.nullable(), date: z.iso.date().nullable(), reason: text });
export const scienceLedgerSchema = z.strictObject({
  schemaVersion: z.literal(1),
  dataset: z.strictObject({ id: z.literal("pilot-science-v1"), version: z.literal(1), transformVersion: z.literal(1), createdAt: z.iso.datetime(), frozen: z.literal(true), scope: text }),
  entities: z.array(z.strictObject({
    ref: text, entity: entitySchema,
    names: z.array(z.strictObject({ value: text, language: text, origin: text, useForSearch: z.boolean() })).min(1),
    identity: z.strictObject({ qid: z.string().regex(/^Q[1-9]\d*$/), file: text, revision: z.number().int().positive(), sha256: hash, url: z.url(), retrievedAt: z.iso.datetime(), license: z.literal("CC0-1.0"), reason: text, sourceRefs: z.array(text).min(1) }),
  })).length(8),
  documents: z.array(z.strictObject({
    ref: text, source: sourceSchema.nullable(), url: z.url(), resolvedUrl: z.url(), language: text,
    retrievedAt: z.iso.datetime(), sha256: hash, method: text, locator: text, summary: text,
    publicationDateNote: text,
  })).min(1),
  candidates: z.array(z.strictObject({
    ref: text, claim: claimSchema, acceptance,
    evidence: z.array(z.strictObject({ sourceRef: text, citationId: z.uuidv4(), locator: text, language: text,
      originalRole: text.nullable(), originalPeriod: text.nullable(), summary: text, limitation: text })).min(1),
  })).length(9),
  deferred: z.array(z.strictObject({ topic: text, reason: text, sourceRefs: z.array(text) })),
});
export type ScienceLedger = z.infer<typeof scienceLedgerSchema>;

export function projectScience(input: unknown) {
  const ledger = scienceLedgerSchema.parse(input);
  const documents = new Map(ledger.documents.map((d) => [d.ref, d]));
  if (documents.size !== ledger.documents.length) throw new Error("Duplicate document ref");
  const entityRefs = new Set(ledger.entities.map((e) => e.ref));
  if (entityRefs.size !== 8) throw new Error("Duplicate Entity ref");
  for (const { entity, names, identity } of ledger.entities) {
    if (identity.file !== `raw/${identity.qid}.json` || identity.url !== `https://www.wikidata.org/wiki/Special:EntityData/${identity.qid}.json` ||
      JSON.stringify(entity.externalIds) !== JSON.stringify([{ namespace: "wikidata", value: identity.qid }])) throw new Error("Science identity/external ID mismatch");
    if (!names.some((name) => name.value === entity.name && name.language === "ja")) throw new Error("Preferred name lacks language record");
    const aliases = [...new Set(names.filter((name) => name.useForSearch && name.value !== entity.name).map((name) => name.value))];
    if (JSON.stringify(aliases) !== JSON.stringify(entity.aliases)) throw new Error("Aliases lack provenance/language");
    for (const ref of identity.sourceRefs) if (!documents.has(ref)) throw new Error("Unknown identity Source");
    for (const name of names) if (!name.origin.startsWith("manual:") && name.origin !== `wikidata:${identity.qid}@${identity.revision}` && !(name.origin.startsWith("source:") && documents.has(name.origin.slice("source:".length)))) throw new Error("Unknown name origin");
  }
  const candidates = new Map(ledger.candidates.map((c) => [c.ref, c]));
  if (candidates.size !== 9 || !Array.from({ length: 9 }, (_, i) => `C0${i + 1}`).every((ref) => candidates.has(ref))) throw new Error("Frozen candidate refs differ");
  const accepted = ledger.candidates.filter((c) => c.acceptance.decision === "accepted");
  if (accepted.length !== 8 || candidates.get("C09")!.acceptance.decision !== "pending") throw new Error("v1 accepts C01-C08 only; C09 remains pending");
  for (const candidate of ledger.candidates) {
    if (candidate.ref === "C09" ? candidate.claim.predicate !== "INFLUENCED_BY" : candidate.claim.predicate !== "AFFILIATED_WITH") throw new Error("Science predicate differs from accepted scope");
    if (candidate.claim.polarity !== "affirmed" || candidate.claim.visibility !== "published") throw new Error("Science candidate polarity/visibility mismatch");
    if (candidate.acceptance.decision === "accepted" && (!candidate.acceptance.reviewer || !candidate.acceptance.date)) throw new Error("Human acceptance reviewer/date required");
    for (const evidence of candidate.evidence) if (!documents.has(evidence.sourceRef)) throw new Error("Unknown evidence Source");
  }
  for (const deferred of ledger.deferred) for (const ref of deferred.sourceRefs) if (!documents.has(ref)) throw new Error("Unknown deferred Source");
  const citations = accepted.flatMap((candidate) => candidate.evidence.map((evidence) => {
    const document = documents.get(evidence.sourceRef)!;
    if (!document.source || document.source.isDemo || document.source.url !== document.url) throw new Error("Accepted Claim requires real supporting Source");
    return citationSchema.parse({
      id: evidence.citationId, claimId: candidate.claim.id, sourceId: document.source.id, locator: evidence.locator,
      accessedAt: document.retrievedAt.slice(0, 10), stance: "support",
      note: `${evidence.summary} 原表記（${evidence.language}）：${evidence.originalRole ?? "未特定"}。期間原表記：${evidence.originalPeriod ?? "特定できない"}。${evidence.limitation} 受入：${candidate.acceptance.reason}`,
    });
  }));
  const sourceIds = new Set(citations.map((c) => c.sourceId));
  const fixture = validateFixture({ schemaVersion: 1, entities: ledger.entities.map((e) => e.entity), claims: accepted.map((c) => c.claim),
    citations, sources: ledger.documents.flatMap((d) => d.source && sourceIds.has(d.source.id) ? [d.source] : []) });
  // Pending candidates still need valid references/kinds/UUIDs, but are never projected for seed.
  validateFixture({ ...fixture, claims: ledger.candidates.map((c) => c.claim), citations: [] });
  return { ledger, fixture };
}

export async function prepareScience(directory = SCIENCE_DIRECTORY) {
  const bytes = await readFile(`${directory}/ledger.json`);
  const { ledger, fixture } = projectScience(JSON.parse(bytes.toString()));
  const files: Record<string, string> = { "ledger.json": sha256(bytes) };
  for (const { entity, identity, names } of ledger.entities) {
    const rawBytes = await readFile(`${directory}/${identity.file}`);
    if (sha256(rawBytes) !== identity.sha256) throw new Error("Science identity snapshot hash mismatch");
    const item = JSON.parse(rawBytes.toString()).entities?.[identity.qid];
    if (!item || item.id !== identity.qid || item.lastrevid !== identity.revision) throw new Error("Science identity revision mismatch");
    const human = item.claims?.P31?.some((s: { mainsnak: { datavalue?: { value?: { id?: string } } } }) => s.mainsnak.datavalue?.value?.id === "Q5");
    if ((entity.kind === "person") !== Boolean(human)) throw new Error("Science Entity kind mismatch");
    for (const name of names.filter((n) => n.origin.startsWith("wikidata:"))) {
      const found = item.labels?.[name.language]?.value === name.value || item.aliases?.[name.language]?.some((a: { value: string }) => a.value === name.value);
      if (!found) throw new Error("Science name absent from identity snapshot");
    }
    files[identity.file] = sha256(rawBytes);
  }
  const data = jsonFile(fixture); files["data.json"] = sha256(data);
  return { fixture, data, manifest: { ...ledger.dataset, files, accepted: ledger.candidates.filter((c) => c.acceptance.decision === "accepted").map((c) => c.ref), pending: ["C09"] } };
}
export async function loadSciencePilot() {
  const prepared = await prepareScience();
  if (await readFile(`${SCIENCE_DIRECTORY}/data.json`, "utf8") !== prepared.data || await readFile(`${SCIENCE_DIRECTORY}/manifest.json`, "utf8") !== jsonFile(prepared.manifest)) throw new Error("Science data/manifest differs from reviewed ledger");
  return prepared.fixture;
}
