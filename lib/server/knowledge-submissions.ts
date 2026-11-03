import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";
import { knowledgeSubmissionCommandSchema, knowledgeSubmissionContentSchema, type KnowledgeSubmission } from "../domain/knowledge-submission";
import { KnowledgeError, knowledgeDigest, ensureKnowledgeFoundationSchema } from "./knowledge-foundation";

const migration = "003-submissions.sql";
async function migrationFile() {
  const sql = await readFile(new URL("../../migrations/knowledge-foundation/003-submissions.sql", import.meta.url), "utf8");
  return { sql, checksum: createHash("sha256").update(sql).digest("hex") };
}
export async function migrateKnowledgeSubmissions(pool: Pool) {
  await ensureKnowledgeFoundationSchema(pool);
  const { sql, checksum } = await migrationFile();
  const client = await pool.connect();
  try {
    const name = (await client.query("SELECT current_database() AS name")).rows[0].name;
    if (name !== "plunode_theme75" && !name.startsWith("plunode_knowledge75_")) throw new KnowledgeError("知識専用DBが必要です", 503, "WRONG_DATABASE");
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(7500001)");
    const old = (await client.query("SELECT checksum FROM knowledge75.migrations WHERE name=$1", [migration])).rows[0];
    if (old && old.checksum !== checksum) throw new KnowledgeError("適用済みmigrationが変わっています", 503, "MIGRATION_CHANGED");
    if (!old) {
      await client.query(sql);
      await client.query("INSERT INTO knowledge75.migrations(name,checksum) VALUES($1,$2)", [migration, checksum]);
    }
    await client.query("COMMIT");
    return { name: migration, checksum, applied: !old };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

const stamp = (v: unknown) => v instanceof Date ? v.toISOString() : String(v);
const dto = (row: QueryResultRow): KnowledgeSubmission => ({
  id: row.id, revision: row.current_revision, version: row.state_version, state: row.state,
  content: knowledgeSubmissionContentSchema.parse(row.content), digest: row.digest,
  createdAt: stamp(row.created_at), updatedAt: stamp(row.updated_at),
});

/** Internal repository. No HTTP/worker adapter or public write capability is
 * exposed until review quality, member revocation and AI budgets are connected.
 * Only the server's authenticated member ID may be passed as ownerId.
 */
export function createKnowledgeSubmissionService(pool: Pool) {
  let verified: Promise<void> | undefined;
  async function ready() {
    verified ??= (async () => {
      const { checksum } = await migrationFile();
      const row = (await pool.query("SELECT checksum FROM knowledge75.migrations WHERE name=$1", [migration])).rows[0];
      if (row?.checksum !== checksum) throw new KnowledgeError("投稿用の明示migrationが必要です", 503, "MIGRATION_REQUIRED");
    })().catch(error => { verified = undefined; throw error; });
    await verified;
  }
  async function transaction<T>(run: (c: PoolClient) => Promise<T>) {
    await ready(); const c = await pool.connect();
    try { await c.query("BEGIN"); const result = await run(c); await c.query("COMMIT"); return result; }
    catch (error) { await c.query("ROLLBACK"); throw error; } finally { c.release(); }
  }
  async function read(c: PoolClient, ownerId: string, id: string) {
    const row = (await c.query(`SELECT s.*,r.content,r.digest FROM knowledge75.submissions s
      JOIN knowledge75.submission_revisions r ON r.submission_id=s.id AND r.revision=s.current_revision
      WHERE s.owner_id=$1 AND s.id=$2`, [ownerId, id])).rows[0];
    if (!row) throw new KnowledgeError("投稿がありません", 404, "NOT_FOUND");
    return dto(row);
  }
  const owner = (value: string) => z.uuidv4().parse(value).toLowerCase();
  return {
    async get(ownerId: string, id: string) {
      ownerId = owner(ownerId); id = z.uuidv4().parse(id);
      return transaction(c => read(c, ownerId, id));
    },
    async execute(ownerId: string, raw: unknown): Promise<KnowledgeSubmission> {
      ownerId = owner(ownerId);
      if (Buffer.byteLength(JSON.stringify(raw)) > 128_000) throw new KnowledgeError("投稿が128KBを超えています", 413, "TOO_LARGE");
      const input = knowledgeSubmissionCommandSchema.parse(raw), digest = knowledgeDigest(raw);
      return transaction(async c => {
        // Serializes idempotency and each member's create/update requests.
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["submission-owner:" + ownerId]);
        const previous = (await c.query("SELECT digest,response FROM knowledge75.submission_requests WHERE owner_id=$1 AND request_id=$2", [ownerId, input.requestId])).rows[0];
        if (previous) {
          if (previous.digest !== digest) throw new KnowledgeError("同じ操作IDの内容が異なります", 409, "REQUEST_CONFLICT");
          return previous.response;
        }
        const seed = (await c.query("SELECT * FROM knowledge75.submissions WHERE id=$1 FOR UPDATE", [input.id])).rows[0];
        if (seed && seed.owner_id !== ownerId) throw new KnowledgeError("投稿がありません", 404, "NOT_FOUND");
        if (!seed && (input.action !== "save" || input.expectedVersion !== 0)) throw new KnowledgeError("投稿がありません", 404, "NOT_FOUND");
        if (seed && seed.state_version !== input.expectedVersion) throw new KnowledgeError("投稿が更新されています", 409, "VERSION_CONFLICT");
        if (seed?.state === "cancelled") throw new KnowledgeError("取消済みの投稿です", 409, "CANCELLED");
        if (input.action === "save") {
          const revision = seed ? seed.current_revision + 1 : 1;
          if (!seed) {
            const count = Number((await c.query("SELECT count(*) AS n FROM knowledge75.submissions WHERE owner_id=$1 AND state<>'cancelled'", [ownerId])).rows[0].n);
            if (count >= 100) throw new KnowledgeError("保存できる投稿の上限です", 429, "LIMIT_REACHED");
            await c.query("INSERT INTO knowledge75.submissions(id,owner_id,current_revision,state_version,state) VALUES($1,$2,1,1,'draft')", [input.id, ownerId]);
          } else await c.query("UPDATE knowledge75.submissions SET current_revision=$2,state_version=state_version+1,state='draft',updated_at=clock_timestamp() WHERE id=$1", [input.id, revision]);
          await c.query("INSERT INTO knowledge75.submission_revisions(submission_id,revision,raw_input,content,digest) VALUES($1,$2,$3,$4,$5)", [input.id, revision, (raw as { content: unknown }).content, input.content, knowledgeDigest(input.content)]);
        } else {
          if (input.action === "submit") {
            if (seed.state !== "draft") throw new KnowledgeError("この版は受付済みです", 409, "ALREADY_SUBMITTED");
            await c.query(`INSERT INTO knowledge75.submission_receipts(submission_id,revision,digest)
              SELECT submission_id,revision,digest FROM knowledge75.submission_revisions WHERE submission_id=$1 AND revision=$2`, [input.id, seed.current_revision]);
          }
          await c.query("UPDATE knowledge75.submissions SET state=$2,state_version=state_version+1,updated_at=clock_timestamp() WHERE id=$1", [input.id, input.action === "submit" ? "queued" : "cancelled"]);
        }
        const result = await read(c, ownerId, input.id);
        await c.query("INSERT INTO knowledge75.submission_requests(owner_id,request_id,submission_id,digest,response) VALUES($1,$2,$3,$4,$5)", [ownerId, input.requestId, input.id, digest, result]);
        return result;
      });
    },
  };
}
