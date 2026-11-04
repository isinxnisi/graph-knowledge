import type { ManagedTransaction } from "neo4j-driver";
import { z } from "zod";
import { adaptLegacyKnowledge, legacyDigest } from "../domain/knowledge-legacy";
import { claimDetailSchema } from "../domain/api";
import type { Fixture } from "../domain/fixture";
import { entityDetail, entitySummary, claimSummary, citationDetail } from "./mappers";
import { openDatabase, readQueryTimeout } from "./neo4j";
import { readPublicRevision } from "./public-revision";
import { ENTITY_DETAIL, CLAIM_DETAIL } from "./queries";
import { ApiError } from "./http";

type ReadTx = Pick<ManagedTransaction, "run">;
export type SubmissionLegacyDependencies = { read: <T>(action: (tx: ReadTx) => Promise<T>) => Promise<T> };
const inputSchema = z.strictObject({ revision: z.string().min(1).max(160).optional(), entityIds: z.array(z.uuidv4()).max(80), claimIds: z.array(z.uuidv4()).max(40) });
const jsonValues = <T>(value:T):T => JSON.parse(JSON.stringify(value));
const missing = () => new ApiError(404, "NOT_FOUND", "公開中の対象・関係が見つかりません。選び直してください。");

async function read<T>(action: (tx: ReadTx) => Promise<T>): Promise<T> {
  const db = openDatabase(), session = db.driver.session({ database: db.database, defaultAccessMode: "READ" });
  try { return await session.executeRead(action, { timeout: readQueryTimeout() }); }
  finally { await session.close(); await db.driver.close(); }
}

/** Bounded, read-only duplicate candidates on the same directed KG endpoints.
 * Never confuse a partial first page with a complete duplicate check. */
export async function readLegacyDuplicateReferences(subjectId:string|null,objectId:string|null,dependencies:SubmissionLegacyDependencies={read}){
 if(!z.uuidv4().safeParse(subjectId).success||!z.uuidv4().safeParse(objectId).success)return null;
 const ids=await dependencies.read(async tx=>{
  const result=await tx.run("MATCH (c:Claim)-[:SUBJECT]->(:Entity {id:$subjectId}), (c)-[:OBJECT]->(:Entity {id:$objectId}) WHERE c.visibility='published' RETURN c.id AS id ORDER BY id LIMIT 21",{subjectId,objectId});
  return result.records.map(r=>String(r.get('id')));
 });
 if(ids.length>20)throw new ApiError(422,'INVALID_ARGUMENT','同じ対象間の知識が多いため、既存の知識を選んで根拠を追加してください。');
 return ids.length?readSubmissionLegacyReferences({entityIds:[],claimIds:ids},dependencies):null;
}

/** Canonical public KG capture shared by the web and review worker. Never writes KG. */
export async function readSubmissionLegacyReferences(input: z.input<typeof inputSchema>, dependencies: SubmissionLegacyDependencies = { read }) {
  const value = inputSchema.parse(input);
  return dependencies.read(async tx => {
    const revision = await readPublicRevision(tx, value.revision ?? null);
    const rawEntities = new Map<string, Record<string, unknown>>();
    const rawClaims: { id: string; payload: Record<string, unknown> }[] = [];
    const entities = new Map<string, Fixture["entities"][number]>();
    const claims: Fixture["claims"] = [], sources = new Map<string, Fixture["sources"][number]>(), citations: Fixture["citations"] = [];
    const addEntity = (raw: Record<string, unknown>) => {
      const detail = entityDetail(raw);
      rawEntities.set(detail.id, jsonValues(raw));
      entities.set(detail.id, { ...detail, externalIds: [], createdAt: String(raw.createdAt), updatedAt: String(raw.updatedAt) });
      return detail;
    };
    for (const id of [...new Set(value.entityIds)].sort()) {
      const result = await tx.run(ENTITY_DETAIL, { id });
      if (result.records.length !== 1) throw missing();
      addEntity(result.records[0].get("entity"));
    }
    for (const id of [...new Set(value.claimIds)].sort()) {
      // The standard detail API also exposes explicitly withdrawn historical claims.
      // A new submission can capture only the currently published canonical values.
      const result = await tx.run(CLAIM_DETAIL, { id });
      if (result.records.length !== 1) throw missing();
      const row = result.records[0], raw = row.get("claim") as Record<string, unknown>;
      if (raw.visibility !== "published") throw missing();
      const subject = addEntity(row.get("subject")), object = addEntity(row.get("object"));
      const rawCitations = row.get("citations") as { citation: Record<string, unknown>; source: Record<string, unknown> }[];
      const detailedCitations = rawCitations.map(c => citationDetail(c.citation, c.source));
      const detail = claimDetailSchema.parse({ ...claimSummary(raw, entitySummary(row.get("subject")), entitySummary(row.get("object")), row.get("sourceCount").toNumber()), createdAt: raw.createdAt, updatedAt: raw.updatedAt, citations: detailedCitations });
      const { sourceCount, citations: canonicalCitations, ...claim } = detail;
      void sourceCount; void canonicalCitations;
      claims.push({ ...claim, visibility: "published" });
      for (const citation of detailedCitations) {
        const { source, ...rest } = citation;
        sources.set(source.id, source); citations.push({ ...rest, sourceId: source.id, claimId: id });
      }
      rawClaims.push({ id, payload: jsonValues({ schemaVersion: 1, revision, claim: raw, entities: [rawEntities.get(subject.id), rawEntities.get(object.id)], citations: rawCitations }) });
    }
    const fixture: Fixture = { schemaVersion: 4, entities: [...entities.values()].sort((a,b) => a.id.localeCompare(b.id)), claims, sources: [...sources.values()].sort((a,b) => a.id.localeCompare(b.id)), citations };
    const digest = legacyDigest({ revision, entities: [...rawEntities.values()], records: rawClaims });
    const adapted = claims.length ? adaptLegacyKnowledge(fixture, { dataset: "public-kg", release: revision, publishedRevision: revision, sourceDataSha256: digest, sourceManifestSha256: digest }) : { entities: fixture.entities.map(e=>({id:e.id,content:{name:e.name,aliases:e.aliases,kind:e.kind,description:e.description??"",language:"und"}})), sources:[], records:[], legacyLinks:[] };
    await readPublicRevision(tx, revision);
    const stamp = "公開済みKGの参照版";
    return { revision,
      entities: adapted.entities.map(e => ({ ...e, revision: 1 as const })),
      sources: adapted.sources.map(s => ({ ...s, revision: 1 as const })),
      records: adapted.records.map(r => ({ ...r, revision: 1 as const, createdAt: claims.find(c => c.id === r.id)!.createdAt, reason: stamp })),
      legacy: {
        entities: [...rawEntities].sort(([a],[b]) => a.localeCompare(b)).map(([id, entity]) => { const payload = { schemaVersion: 1, revision, entity }; return { id, revision, payload, sha256: legacyDigest(payload) }; }),
        records: rawClaims.map(({ id, payload: canonical }) => { const original=adapted.legacyLinks.find(link => link.recordId === id)!.payload; const perRecord=legacyDigest(canonical); const payload = { ...original, provenance:{...original.provenance,sourceDataSha256:perRecord,sourceManifestSha256:perRecord}, canonical }; return { id, revision, payload, sha256: legacyDigest(payload) }; }),
      },
    };
  });
}
