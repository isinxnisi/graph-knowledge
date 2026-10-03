import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { claimSchema, citationSchema, entitySchema, sourceSchema, validateFixture } from "../domain/fixture";

export const PILOT_DIRECTORY = "datasets/pilot-urasawa/v1";
const text = z.string().min(1);
const timestamp = z.iso.datetime();
const snapshotSchema = z.strictObject({
  qid: z.string().regex(/^Q[1-9]\d*$/), url: z.url(), retrievedAt: timestamp,
  revision: z.number().int().positive(), license: z.literal("CC0-1.0"), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  file: z.string().regex(/^raw\/Q[1-9]\d*\.json$/),
});
export const pilotLedgerSchema = z.strictObject({
  schemaVersion: z.literal(1),
  dataset: z.strictObject({ id: z.literal("pilot-urasawa"), version: z.literal(1), transformVersion: z.literal(1),
    createdAt: timestamp, reviewer: text, scope: text, frozen: z.literal(true) }),
  entities: z.array(z.strictObject({
    entity: entitySchema,
    names: z.array(z.strictObject({ value: text, language: text, kind: z.enum(["label", "alias", "preferred", "source-form"]), origin: text, useForSearch: z.boolean() })).min(1),
    identity: z.strictObject({ qid: snapshotSchema.shape.qid, snapshot: snapshotSchema, decision: z.literal("accepted"), reason: text }),
  })).min(1),
  sources: z.array(z.strictObject({ source: sourceSchema, provenance: z.strictObject({
    language: text, reviewedAt: timestamp, method: text, locator: text,
    isbn: text.nullable(), bookReleaseDate: text.nullable(), interviewDate: text.nullable(),
    publicationDateKnown: z.boolean(), interviewers: z.array(text), summary: text, legacyUrl: z.url().nullable(),
  }) })).min(1),
  claims: z.array(z.strictObject({
    claim: claimSchema, citation: citationSchema.omit({ note: true }),
    evidence: z.strictObject({ language: text, originalRole: text.nullable(), originalExcerpt: text.nullable(), roleSummary: text, scope: text,
      decision: z.literal("accepted"), reviewedAt: timestamp, reason: text,
      origin: z.literal("manual-source-review"), transformVersion: z.literal(1) }),
  })).min(1),
  deferred: z.array(z.strictObject({ subject: text, predicateCandidate: text.nullable(), object: text, sourceId: z.uuidv4().nullable(), originalRole: text.nullable(), reason: text })),
});
export type PilotLedger = z.infer<typeof pilotLedgerSchema>;
export const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const jsonFile = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export function projectPilot(input: unknown) {
  const ledger = pilotLedgerSchema.parse(input);
  for (const { entity, names, identity } of ledger.entities) {
    if (identity.qid !== identity.snapshot.qid || identity.snapshot.file !== `raw/${identity.qid}.json` ||
        identity.snapshot.url !== `https://www.wikidata.org/wiki/Special:EntityData/${identity.qid}.json` ||
        entity.externalIds.length !== 1 || entity.externalIds[0].namespace !== "wikidata" || entity.externalIds[0].value !== identity.qid) {
      throw new Error("Pilot identity and external ID disagree");
    }
    const preferred = names.filter((name) => name.kind === "preferred");
    if (preferred.length !== 1 || preferred[0].value !== entity.name || preferred[0].language !== "ja") throw new Error("Pilot preferred name is inconsistent");
    const aliases = [...new Set(names.filter((name) => name.useForSearch && name.value !== entity.name).map((name) => name.value))];
    if (JSON.stringify(aliases) !== JSON.stringify(entity.aliases)) throw new Error("Pilot aliases lost their language/origin record");
  }
  const sources = new Map(ledger.sources.map(({ source }) => [source.id, source]));
  for (const { names } of ledger.entities) for (const name of names.filter((name) => name.kind === "preferred" || name.kind === "source-form")) {
    if (!name.origin.startsWith("source:") || !sources.has(name.origin.slice("source:".length))) throw new Error("Name has an unknown reviewed Source");
  }
  for (const { source } of ledger.sources) if (source.isDemo || !source.url || new URL(source.url).hostname.endsWith(".invalid")) throw new Error("Pilot must use real sources");
  for (const { claim, citation } of ledger.claims) {
    if (citation.claimId !== claim.id || !sources.has(citation.sourceId) || citation.stance !== "support" || !citation.accessedAt ||
        claim.visibility !== "published" || claim.polarity !== "affirmed") throw new Error("Pilot Claim needs reviewed supporting evidence");
  }
  for (const deferred of ledger.deferred) if (deferred.sourceId && !sources.has(deferred.sourceId)) throw new Error("Deferred evidence has an unknown Source");
  const fixture = validateFixture({
    schemaVersion: 1, entities: ledger.entities.map(({ entity }) => entity), sources: ledger.sources.map(({ source }) => source),
    claims: ledger.claims.map(({ claim }) => claim), citations: ledger.claims.map(({ citation, evidence }) => ({
      ...citation, note: `役割・内容：${evidence.roleSummary}${evidence.originalRole ? `。資料の原表記：${evidence.originalRole}` : ""}。${evidence.scope} ${evidence.reason}`,
    })),
  });
  return { ledger, fixture };
}

export async function preparePilot(directory = PILOT_DIRECTORY) {
  const ledgerBytes = await readFile(`${directory}/ledger.json`);
  const { ledger, fixture } = projectPilot(JSON.parse(ledgerBytes.toString("utf8")));
  const files: Record<string, string> = { "ledger.json": sha256(ledgerBytes) };
  for (const { identity, names, entity } of ledger.entities) {
    const snapshot = identity.snapshot;
    const bytes = await readFile(`${directory}/${snapshot.file}`);
    if (sha256(bytes) !== snapshot.sha256) throw new Error(`Snapshot hash mismatch: ${snapshot.qid}`);
    const raw = JSON.parse(bytes.toString("utf8"));
    const item = raw.entities?.[snapshot.qid];
    if (!item || item.id !== snapshot.qid || item.lastrevid !== snapshot.revision) throw new Error("Snapshot identity/revision mismatch");
    const expectedType = entity.kind === "person" ? "Q5" : "Q21198342";
    if (!item.claims?.P31?.some((statement: { mainsnak: { datavalue?: { value?: { id?: string } } } }) => statement.mainsnak.datavalue?.value?.id === expectedType)) throw new Error("Snapshot Entity kind mismatch");
    for (const name of names.filter((name) => name.kind === "label" || name.kind === "alias")) {
      const origin = `wikidata:${snapshot.qid}@${snapshot.revision}`;
      const found = name.kind === "label" ? item.labels?.[name.language]?.value === name.value : item.aliases?.[name.language]?.some((alias: { value: string }) => alias.value === name.value);
      if (!found || name.origin !== origin) throw new Error("Name is not supported by its snapshot");
    }
    files[snapshot.file] = sha256(bytes);
  }
  const data = jsonFile(fixture);
  files["data.json"] = sha256(data);
  return { fixture, data, manifest: { ...ledger.dataset, files } };
}

export async function loadPilot() {
  const prepared = await preparePilot();
  const stored = await readFile(`${PILOT_DIRECTORY}/data.json`, "utf8");
  const manifest = await readFile(`${PILOT_DIRECTORY}/manifest.json`, "utf8");
  if (stored !== prepared.data || manifest !== jsonFile(prepared.manifest)) throw new Error("Pilot generated data/manifest differs; prepare and review the frozen version");
  return prepared.fixture;
}
