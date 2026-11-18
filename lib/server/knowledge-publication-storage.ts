import type { PoolClient } from "pg";
import type { KnowledgeEntityVersion } from "../domain/knowledge-foundation";
import { flattenKnowledgePublishedRecord, type KnowledgePublishedRecord } from "../domain/knowledge-publication";
import { knowledgeDigest } from "./knowledge-foundation";

export type PublicationDependency = { kind: "record" | "entity" | "source" | "theme"; id: string; revision: number };

export function publicationRecordProjection(dto: KnowledgePublishedRecord, dependencies: PublicationDependency[]) {
  return { dto, dependencies, projection: knowledgeDigest({ version: 1, dto, dependencies }) };
}

export function publicationEntityProjection(body: KnowledgeEntityVersion) {
  return { projection: knowledgeDigest(body), id: body.id, revision: body.revision, body };
}

export async function storePublicationRows(
  c: PoolClient,
  generation: string,
  records: ReturnType<typeof publicationRecordProjection>[],
  entities: ReturnType<typeof publicationEntityProjection>[],
) {
  // Bound each parameter payload. Only new projection values carry search text
  // and JSON bodies across the wire, even though every generation has a full index of IDs.
  const batch = 200;
  for (let offset = 0; offset < records.length; offset += batch) {
    const rows = records.slice(offset, offset + batch);
    const saved = new Set((await c.query<{ projection: string }>(
      "SELECT projection FROM knowledge75.publication_record_values WHERE projection=ANY($1::text[])",
      [rows.map(r => r.projection)],
    )).rows.map(r => r.projection));
    const values = rows.filter(r => !saved.has(r.projection)).map(({ dto, dependencies, projection }) => {
      const f = flattenKnowledgePublishedRecord(dto);
      return {
        projection, id: dto.record.id, revision: dto.record.revision, body: dto, dependencies,
        search_text: f.searchText.normalize("NFKC").toLocaleLowerCase(), subject_id: dto.record.content.subjectId, object_id: dto.record.content.objectId,
        relation_label: f.relationLabel, polarity: f.polarity, concept_id: f.conceptId, predicate: f.predicate,
        role_id: f.roleId, isbn13: f.isbn13, organization_position_id: f.organizationPositionId,
        event_role_id: f.eventRoleId, event_id: f.eventId, event_from: f.eventFromLower, event_to: f.eventToUpper,
      };
    });
    if (values.length) await c.query(
      "INSERT INTO knowledge75.publication_record_values SELECT * FROM jsonb_populate_recordset(NULL::knowledge75.publication_record_values,$1::jsonb)",
      [JSON.stringify(values)],
    );
    await c.query(
      "INSERT INTO knowledge75.publication_record_members SELECT $1,id,projection FROM jsonb_to_recordset($2::jsonb) AS m(id text,projection text)",
      [generation, JSON.stringify(rows.map(r => ({ id: r.dto.record.id, projection: r.projection })))],
    );
  }
  for (let offset = 0; offset < entities.length; offset += batch) {
    const rows = entities.slice(offset, offset + batch);
    const saved = new Set((await c.query<{ projection: string }>(
      "SELECT projection FROM knowledge75.publication_entity_values WHERE projection=ANY($1::text[])",
      [rows.map(e => e.projection)],
    )).rows.map(e => e.projection));
    const values = rows.filter(e => !saved.has(e.projection));
    if (values.length) await c.query(
      "INSERT INTO knowledge75.publication_entity_values SELECT * FROM jsonb_populate_recordset(NULL::knowledge75.publication_entity_values,$1::jsonb)",
      [JSON.stringify(values)],
    );
    await c.query(
      "INSERT INTO knowledge75.publication_entity_members SELECT $1,id,projection FROM jsonb_to_recordset($2::jsonb) AS m(id text,projection text)",
      [generation, JSON.stringify(rows.map(({ id, projection }) => ({ id, projection })))],
    );
  }
}

export async function preservePublicationRecordContext(c: PoolClient, generation: string) {
  await c.query(`INSERT INTO knowledge75.publication_record_context (id,revision,generation,published_at,body)
    SELECT r.id,r.revision,r.generation,g.published_at,r.body
    FROM knowledge75.publication_read_records r JOIN knowledge75.publication_generations g ON g.id=r.generation
    LEFT JOIN knowledge75.publication_record_context old ON old.id=r.id AND old.revision=r.revision
    WHERE r.generation=$1 AND g.published_at IS NOT NULL
      AND (old.id IS NULL OR (g.published_at,g.id)<(old.published_at,old.generation))
    ON CONFLICT(id,revision) DO UPDATE SET generation=excluded.generation,published_at=excluded.published_at,body=excluded.body
    WHERE (excluded.published_at,excluded.generation)<(publication_record_context.published_at,publication_record_context.generation)`, [generation]);
}
