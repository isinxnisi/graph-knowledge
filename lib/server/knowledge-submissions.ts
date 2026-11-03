import { createHash } from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";
import { knowledgeSubmissionCommandSchema, knowledgeSubmissionContentSchema, knowledgeSubmissionCaptureSchema,knowledgePublicCaptureSchema, type KnowledgeSubmission } from "../domain/knowledge-submission";
import type { DatasetMode } from "../domain/dataset";
import { memberCapsuleSchema } from "../domain/member-capsule";
import { captureSubmissionCapsule } from "../domain/knowledge-submission-capsule";
import {reviewStatus,reviewEnabledFor,ensureReviewSchema} from "./knowledge-review-queue";
import { MemberError } from "./member/http";
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
  ...(row.source_capsule?.captured?{context:{entities:row.source_capsule.captured.entities,sources:row.source_capsule.captured.sources}}:{}),
  origin: row.source_capsule?.capsuleId ? {capsuleId:row.source_capsule.capsuleId,capsuleRevision:row.source_capsule.capsuleRevision,title:row.source_capsule.title,keys:row.source_capsule.keys} : null,
});

/** Private repository. Member mode locks/rechecks the authenticated user in
 * the same database transaction. This never writes to public knowledge. */
export function createKnowledgeSubmissionService(pool: Pool, options?: { memberStore: true; dataset: DatasetMode }) {
  const schema=options?.memberStore ? "member_knowledge" : "knowledge75";
  let verified: Promise<void> | undefined;
  let reviewVerified:Promise<void>|undefined;
  async function ready() {
    verified ??= (async () => {
      const name=options?.memberStore ? "020-knowledge-submissions.sql" : migration;
      const checksum=options?.memberStore ? createHash("sha256").update(await readFile(path.join(process.cwd(),"db/member/020-knowledge-submissions.sql"),"utf8")).digest("hex") : (await migrationFile()).checksum;
      const row = (await pool.query(`SELECT checksum FROM ${options?.memberStore ? "member_migration" : "knowledge75.migrations"} WHERE name=$1`, [name])).rows[0];
      if (row?.checksum !== checksum) throw new KnowledgeError("投稿用の明示migrationが必要です", 503, "MIGRATION_REQUIRED");
    })().catch(error => { verified = undefined; throw error; });
    await verified;
  }
  async function transaction<T>(ownerId: string, run: (c: PoolClient) => Promise<T>) {
    await ready(); const c = await pool.connect();
    try { await c.query("BEGIN");
      if(options?.memberStore && (await c.query('SELECT active FROM "user" WHERE id=$1 FOR UPDATE',[ownerId])).rows[0]?.active!==true)throw new MemberError(401,"UNAUTHENTICATED");
      const result = await run(c); await c.query("COMMIT"); return result; }
    catch (error) { await c.query("ROLLBACK"); throw error; } finally { c.release(); }
  }
  async function read(c: PoolClient, ownerId: string, id: string) {
    const row = (await c.query(`SELECT s.*,r.content,r.digest,to_jsonb(r)->'source_capsule' AS source_capsule FROM ${schema}.submissions s
      JOIN ${schema}.submission_revisions r ON r.submission_id=s.id AND r.revision=s.current_revision
      WHERE s.owner_id=$1 AND s.id=$2`, [ownerId, id])).rows[0];
    if (!row) throw new KnowledgeError("投稿がありません", 404, "NOT_FOUND");
    const value=dto(row);
    if(options?.memberStore&&reviewEnabledFor(ownerId)){reviewVerified??=ensureReviewSchema(pool).catch(e=>{reviewVerified=undefined;throw e;});await reviewVerified;value.review=await reviewStatus(c,ownerId,id,value.revision);}
    return value;
  }
  const owner = (value: string) => z.uuidv4().parse(value).toLowerCase();
  return {
    async replay(ownerId:string,requestId:string,digest:string){return transaction(owner(ownerId),async c=>{const row=(await c.query(`SELECT digest,response FROM ${schema}.submission_requests WHERE owner_id=$1 AND request_id=$2`,[ownerId,requestId])).rows[0];if(!row)return null;if(row.digest!==digest)throw new KnowledgeError("同じ操作IDの内容が異なります",409,"REQUEST_CONFLICT");return row.response as KnowledgeSubmission;});},
    async list(ownerId: string) {
      ownerId=owner(ownerId);
      return transaction(ownerId,async c=>(await c.query(`SELECT s.id,s.state,s.state_version AS version,s.current_revision AS revision,s.created_at,s.updated_at,r.content->>'title' AS title,jsonb_array_length(r.content->'items') AS item_count,to_jsonb(r)->'source_capsule'->>'title' AS capsule_title FROM ${schema}.submissions s JOIN ${schema}.submission_revisions r ON r.submission_id=s.id AND r.revision=s.current_revision WHERE s.owner_id=$1 ORDER BY s.updated_at DESC,s.id LIMIT 200`,[ownerId])).rows.map(r=>({id:r.id,state:r.state,version:r.version,revision:r.revision,title:r.title,itemCount:r.item_count,capsuleTitle:r.capsule_title,createdAt:stamp(r.created_at),updatedAt:stamp(r.updated_at)})));
    },
    async get(ownerId: string, id: string) {
      ownerId = owner(ownerId); id = z.uuidv4().parse(id);
      return transaction(ownerId, c => read(c, ownerId, id));
    },
    async execute(ownerId: string, raw: unknown, publicCapture?:{content:KnowledgeSubmission["content"];captured:unknown}): Promise<KnowledgeSubmission> {
      ownerId = owner(ownerId);
      if (Buffer.byteLength(JSON.stringify(raw)) > 128_000) throw new KnowledgeError("投稿が128KBを超えています", 413, "TOO_LARGE");
      let input = knowledgePublicCaptureSchema.safeParse(raw).success?knowledgePublicCaptureSchema.parse(raw):knowledgeSubmissionCaptureSchema.safeParse(raw).success ? knowledgeSubmissionCaptureSchema.parse(raw) : knowledgeSubmissionCommandSchema.parse(raw);
      const digest = knowledgeDigest(raw);
      return transaction(ownerId, async c => {
        // Serializes idempotency and each member's create/update requests.
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["submission-owner:" + ownerId]);
        const previous = (await c.query(`SELECT digest,response FROM ${schema}.submission_requests WHERE owner_id=$1 AND request_id=$2`, [ownerId, input.requestId])).rows[0];
        if (previous) {
          if (previous.digest !== digest) throw new KnowledgeError("同じ操作IDの内容が異なります", 409, "REQUEST_CONFLICT");
          return previous.response;
        }
        let sourceCapsule: unknown = null;
        if(input.action === "capture-public") {
          if(!publicCapture)throw new KnowledgeError("公開原本のサーバー確認が必要です",403,"FORBIDDEN");
          if(Buffer.byteLength(JSON.stringify(publicCapture))>128_000)throw new KnowledgeError("取得版が大きすぎます",413,"TOO_LARGE");
          sourceCapsule={kind:"public-record",recordId:input.recordId,recordRevision:input.recordRevision,captured:publicCapture.captured};
          input={action:"save",id:input.id,requestId:input.requestId,expectedVersion:0,content:publicCapture.content};
        }
        if (input.action === "capture") {
          if (!options?.memberStore) throw new KnowledgeError("会員保存が必要です",503,"UNAVAILABLE");
          const row=(await c.query("SELECT * FROM member_capsule WHERE id=$1 AND owner_user_id=$2 AND dataset=$3 AND (to_jsonb(member_capsule)->>'trashed_at') IS NULL FOR SHARE",[input.capsuleId,ownerId,options.dataset])).rows[0];
          if(!row)throw new KnowledgeError("Capsuleがありません",404,"NOT_FOUND");
          if(Number(row.revision)!==input.capsuleRevision)throw new KnowledgeError("Capsuleが更新されています",409,"CAPSULE_VERSION_CONFLICT");
          const capsule=memberCapsuleSchema.parse({id:row.id,schemaVersion:row.schema_version,revision:Number(row.revision),createdAt:stamp(row.created_at),updatedAt:stamp(row.updated_at),content:row.content});
          let captured;
          try {captured=captureSubmissionCapsule(capsule,input.keys);}catch(e){if(e instanceof z.ZodError&&e.issues.some(i=>i.code==="too_big"))throw new KnowledgeError("選択を少なくしてください",413,"TOO_LARGE");throw new KnowledgeError("選択内容を確認してください",400,"INVALID_SELECTION");}
          sourceCapsule=captured.sourceCapsule;
          if(Buffer.byteLength(JSON.stringify(captured))>128_000)throw new KnowledgeError("選択を少なくしてください",413,"TOO_LARGE");
          input={action:"save",id:input.id,requestId:input.requestId,expectedVersion:0,content:captured.content};
        }
        const seed = (await c.query(`SELECT * FROM ${schema}.submissions WHERE id=$1 FOR UPDATE`, [input.id])).rows[0];
        if (seed && seed.owner_id !== ownerId) throw new KnowledgeError("投稿がありません", 404, "NOT_FOUND");
        if (!seed && (input.action !== "save" || input.expectedVersion !== 0)) throw new KnowledgeError("投稿がありません", 404, "NOT_FOUND");
        if (seed && seed.state_version !== input.expectedVersion) throw new KnowledgeError("投稿が更新されています", 409, "VERSION_CONFLICT");
        if (seed?.state === "cancelled") throw new KnowledgeError("取消済みの投稿です", 409, "CANCELLED");
        if(options?.memberStore && !sourceCapsule && seed)sourceCapsule=(await c.query(`SELECT source_capsule FROM ${schema}.submission_revisions WHERE submission_id=$1 AND revision=$2`,[input.id,seed.current_revision])).rows[0]?.source_capsule??null;
        if(options?.memberStore){
          const n=Number((await c.query(`SELECT count(*) AS n FROM ${schema}.submission_requests WHERE owner_id=$1 AND created_at>clock_timestamp()-interval '10 minutes'`,[ownerId])).rows[0].n);
          if(n>=120&&input.action!=="cancel")throw new KnowledgeError("少し待ってから操作してください",429,"RATE_LIMITED");
          if(input.action==="submit" && Number((await c.query(`SELECT count(*) AS n FROM ${schema}.submission_receipts r JOIN ${schema}.submissions s ON s.id=r.submission_id WHERE s.owner_id=$1 AND r.submitted_at>clock_timestamp()-interval '1 hour'`,[ownerId])).rows[0].n)>=20)throw new KnowledgeError("受付上限です。時間をおいて再試行してください",429,"RATE_LIMITED");
          if(input.action==="save"){
            const bytes=Number((await c.query(`SELECT COALESCE(sum(octet_length(r.raw_input::text)+octet_length(r.content::text)+COALESCE(octet_length(r.source_capsule::text),0)),0)+(SELECT COALESCE(sum(octet_length(response::text)),0) FROM ${schema}.submission_requests WHERE owner_id=$1) AS n FROM ${schema}.submission_revisions r JOIN ${schema}.submissions s ON s.id=r.submission_id WHERE s.owner_id=$1`,[ownerId])).rows[0].n);
            if(bytes+Buffer.byteLength(JSON.stringify(input.content))*4+Buffer.byteLength(JSON.stringify(sourceCapsule))*2+4096>20_000_000 || (seed?.current_revision??0)>=100)throw new KnowledgeError("投稿の保存容量上限です",422,"STORAGE_LIMIT");
          }
        }
        if (input.action === "save") {
          const revision = seed ? seed.current_revision + 1 : 1;
          if (!seed) {
            const count = Number((await c.query(`SELECT count(*) AS n FROM ${schema}.submissions WHERE owner_id=$1 AND state<>'cancelled'`, [ownerId])).rows[0].n);
            if (count >= 100) throw new KnowledgeError("保存できる投稿の上限です", 429, "LIMIT_REACHED");
            await c.query(`INSERT INTO ${schema}.submissions(id,owner_id,current_revision,state_version,state) VALUES($1,$2,1,1,'draft')`, [input.id, ownerId]);
          } else await c.query(`UPDATE ${schema}.submissions SET current_revision=$2,state_version=state_version+1,state='draft',updated_at=clock_timestamp() WHERE id=$1`, [input.id, revision]);
          if(options?.memberStore){
            await c.query(`INSERT INTO ${schema}.submission_revisions(submission_id,revision,raw_input,content,digest,source_capsule) VALUES($1,$2,$3,$4,$5,$6)`,[input.id,revision,input.action==="save" && "content" in (raw as object) ? (raw as {content:unknown}).content : input.content,input.content,knowledgeDigest(input.content),sourceCapsule]);
          }else await c.query(`INSERT INTO ${schema}.submission_revisions(submission_id,revision,raw_input,content,digest) VALUES($1,$2,$3,$4,$5)`,[input.id,revision,(raw as {content:unknown}).content,input.content,knowledgeDigest(input.content)]);
        } else {
          if (input.action === "submit") {
            if (seed.state !== "draft") throw new KnowledgeError("この版は受付済みです", 409, "ALREADY_SUBMITTED");
            await c.query(`INSERT INTO ${schema}.submission_receipts(submission_id,revision,digest)
              SELECT submission_id,revision,digest FROM ${schema}.submission_revisions WHERE submission_id=$1 AND revision=$2`, [input.id, seed.current_revision]);
          }
          await c.query(`UPDATE ${schema}.submissions SET state=$2,state_version=state_version+1,updated_at=clock_timestamp() WHERE id=$1`, [input.id, input.action === "submit" ? "queued" : "cancelled"]);
        }
        const result = await read(c, ownerId, input.id);
        await c.query(`INSERT INTO ${schema}.submission_requests(owner_id,request_id,submission_id,digest,response) VALUES($1,$2,$3,$4,$5)`, [ownerId, input.requestId, input.id, digest, result]);
        return result;
      });
    },
  };
}
