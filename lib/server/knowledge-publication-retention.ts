import neo4j, { type Driver } from "neo4j-driver";
import type { PoolClient } from "pg";
import { preservePublicationRecordContext } from "./knowledge-publication-storage";

export const publicationGraphLock = (generation: string) => "knowledge-publication-graph:" + generation;

async function expireOne(c: PoolClient, retentionHours: number) {
  await c.query("BEGIN");
  try {
    const row = (await c.query<{
      id: string; graph: string; state: string; compact: boolean; expired_at: Date | null;
    }>(`SELECT g.id,coalesce(g.graph_generation,g.id) AS graph,g.state,g.content_digest IS NOT NULL AS compact,g.expired_at
      FROM knowledge75.publication_generations g
      JOIN knowledge75.publication_control control ON control.singleton
      LEFT JOIN knowledge75.publication_generations active ON active.id=control.active_generation
      WHERE g.id IS DISTINCT FROM control.active_generation AND g.purged_at IS NULL AND (
        g.expired_at IS NOT NULL OR g.retired_at<clock_timestamp()-$1*interval '1 hour' OR
        g.state IN ('failed','staged') AND g.created_at<active.created_at AND
          g.created_at<clock_timestamp()-$1*interval '1 hour'
      ) ORDER BY (g.expired_at IS NOT NULL) DESC,g.published_at NULLS LAST,g.created_at,g.id LIMIT 1`, [retentionHours])).rows[0];
    if (row && !row.expired_at) {
      if (row.state === "ready" && !row.compact) await preservePublicationRecordContext(c, row.id);
      const gate = (await c.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS held", [publicationGraphLock(row.id)])).rows[0].held;
      if (!gate) {
        await c.query("ROLLBACK");
        return null;
      }
      await c.query("UPDATE knowledge75.publication_generations SET expired_at=clock_timestamp() WHERE id=$1", [row.id]);
    }
    await c.query("COMMIT");
    return row;
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  }
}

/** Called with the publisher's session lock. A completed PG tombstone fences
 * new graph readers and makes a crash between the two stores safe to retry. */
export async function prunePublication(c: PoolClient, driver: Driver, retentionHours: number) {
  const row = await expireOne(c, retentionHours);
  if (!row) return null;
  const shared = (await c.query(`SELECT 1 FROM knowledge75.publication_generations
    WHERE coalesce(graph_generation,id)=$1 AND expired_at IS NULL LIMIT 1`, [row.graph])).rowCount;
  if (!shared) {
    const session = driver.session({ database: "neo4j" });
    try {
      const finished = await session.executeWrite(async tx => {
        const result = await tx.run(`MATCH (e:K75U2Entity {generation:$graph})
          WITH e LIMIT $batch DETACH DELETE e RETURN count(*) AS n`, { graph: row.graph, batch: neo4j.int(5000) });
        if (result.records[0].get("n").toNumber() === 5000) return false;
        await tx.run("MATCH (g:K75U2Generation {id:$graph}) DELETE g", { graph: row.graph });
        return true;
      });
      if (!finished) return { generation: row.id, complete: false };
    } finally { await session.close(); }
  }
  // Release disk pages to regular PostgreSQL vacuum. Keep the small generation
  // header: old cursors can report expiry and seen-change references stay valid.
  let remaining = false;
  for (const table of ["publication_records", "publication_entities", "publication_record_members", "publication_entity_members"]) {
    const result = await c.query(`DELETE FROM knowledge75.${table} WHERE ctid IN
      (SELECT ctid FROM knowledge75.${table} WHERE generation=$1 LIMIT 10000)`, [row.id]);
    remaining ||= result.rowCount === 10000;
  }
  for (const [values, members] of [
    ["publication_record_values", "publication_record_members"],
    ["publication_entity_values", "publication_entity_members"],
  ]) {
    const result = await c.query(`DELETE FROM knowledge75.${values} WHERE projection IN
      (SELECT v.projection FROM knowledge75.${values} v WHERE NOT EXISTS
       (SELECT 1 FROM knowledge75.${members} m WHERE m.projection=v.projection) LIMIT 10000)`);
    remaining ||= result.rowCount === 10000;
  }
  if (!remaining) await c.query("UPDATE knowledge75.publication_generations SET purged_at=clock_timestamp() WHERE id=$1", [row.id]);
  return { generation: row.id, complete: !remaining };
}
