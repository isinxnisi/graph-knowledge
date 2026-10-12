import { createHash, randomUUID } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import type { DatasetMode } from "../../domain/dataset";
import { MEMBER_CAPSULE_LIMITS, memberCapsuleSchema, memberCreateSchema, memberDeleteSchema, memberUpdateSchema, type MemberCapsuleContent } from "../../domain/member-capsule";
import { memberAuthReady, type MemberAuth } from "./auth";
import { MemberUnavailable, type MemberConfig } from "./config";
import { APIError } from "better-auth/api";
import { assertMemberOrigin, MemberError, memberId, memberInput, memberJson } from "./http";
import { createCapsuleSharing } from "./sharing";
import { createCapsuleDiscussion } from "./discussion";
import { memberProfileUpdateSchema } from "../../domain/member-profile";

function dto(row: QueryResultRow) {
  return memberCapsuleSchema.parse({ id: row.id, schemaVersion: row.schema_version, revision: Number(row.revision),
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), content: row.content });
}
function digest(content: MemberCapsuleContent) {
  return createHash("sha256").update(JSON.stringify({ ...content, entityIds: [...content.entityIds].sort(), claimIds: [...content.claimIds].sort() })).digest("hex");
}

// No public method accepts an owner. Private operations read the database
// session and active user; shared reads use a separate pinned-revision capability.
export function createMemberService(config: MemberConfig, pool: Pool, auth: MemberAuth, dataset: DatasetMode) {
  async function owner(request: Request) {
    await memberAuthReady(auth);
    const session = await auth.api.getSession({ headers: request.headers, query: { disableCookieCache: true } }).catch(error => {
      // Better Auth wraps database failures; do not mistake unavailable session
      // storage for a logged-out user and prompt a pointless login loop.
      if (error instanceof APIError && error.statusCode >= 500) throw new MemberUnavailable();
      throw error;
    });
    if (!session || session.user.active !== true || (request.headers.has("x-member-user") && request.headers.get("x-member-user") !== session.user.id)) throw new MemberError(401, "UNAUTHENTICATED");
    return session.user;
  }
  function contentDataset(content: MemberCapsuleContent) {
    if (content.dataset !== dataset) throw new MemberError(400, "DATASET_MISMATCH");
  }
  return {
    ...createCapsuleSharing(pool, dataset, config.origin, owner),
    ...createCapsuleDiscussion(pool, dataset, config.origin, owner),
    async profile(request: Request) {
      const user = await owner(request);
      return memberJson({ user: { id: user.id, name: user.name, locale: user.locale } });
    },
    async updateProfile(request: Request) {
      assertMemberOrigin(request, config.origin);
      if (!request.headers.has("x-member-user")) throw new MemberError(400, "INVALID_ARGUMENT");
      const user = await owner(request);
      const input = await memberInput(request, memberProfileUpdateSchema);
      const result = await pool.query('UPDATE "user" SET name = $1, "updatedAt" = clock_timestamp() WHERE id = $2 AND active = true RETURNING id, name, locale', [input.name, user.id]);
      if (!result.rows[0]) throw new MemberError(401, "UNAUTHENTICATED");
      return memberJson({ user: result.rows[0] });
    },
    async list(request: Request) {
      const user = await owner(request);
      const result = await pool.query("SELECT * FROM member_capsule WHERE owner_user_id = $1 AND dataset = $2 ORDER BY updated_at DESC, id", [user.id, dataset]);
      return memberJson({ capsules: result.rows.map(dto) });
    },
    async read(request: Request, rawId: string) {
      const user = await owner(request);
      const id = memberId(rawId);
      const result = await pool.query("SELECT * FROM member_capsule WHERE id = $1 AND owner_user_id = $2 AND dataset = $3", [id, user.id, dataset]);
      if (!result.rows[0]) throw new MemberError(404, "NOT_FOUND");
      return memberJson({ capsule: dto(result.rows[0]) });
    },
    async create(request: Request) {
      assertMemberOrigin(request, config.origin);
      const user = await owner(request);
      const input = await memberInput(request, memberCreateSchema);
      contentDataset(input.content);
      const hash = digest(input.content);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Serialize quota/idempotency checks for this owner, including requests
        // on different app processes. There is no count-then-insert race.
        const active = await client.query('SELECT active FROM "user" WHERE id = $1 FOR UPDATE', [user.id]);
        if (active.rows[0]?.active !== true) throw new MemberError(401, "UNAUTHENTICATED");
        const receipt = await client.query("SELECT * FROM member_capsule_request WHERE owner_user_id = $1 AND request_id = $2", [user.id, input.requestId]);
        if (receipt.rows[0]) {
          if (receipt.rows[0].content_hash !== hash) throw new MemberError(409, "REQUEST_CONFLICT");
          const existing = await client.query("SELECT * FROM member_capsule WHERE id = $1 AND owner_user_id = $2 AND dataset = $3", [receipt.rows[0].capsule_id, user.id, dataset]);
          if (!existing.rows[0]) throw new MemberError(409, "REQUEST_CONFLICT");
          await client.query("COMMIT");
          return memberJson({ capsule: dto(existing.rows[0]), replayed: true });
        }
        const count = await client.query("SELECT count(*) FROM member_capsule WHERE owner_user_id = $1 AND dataset = $2", [user.id, dataset]);
        if (Number(count.rows[0].count) >= MEMBER_CAPSULE_LIMITS.count) throw new MemberError(422, "CAPSULE_LIMIT");
        const id = randomUUID();
        const result = await client.query("INSERT INTO member_capsule (id, owner_user_id, dataset, content) VALUES ($1, $2, $3, $4) RETURNING *", [id, user.id, dataset, JSON.stringify(input.content)]);
        await client.query("INSERT INTO member_capsule_request (owner_user_id, request_id, content_hash, capsule_id) VALUES ($1, $2, $3, $4)", [user.id, input.requestId, hash, id]);
        await client.query("COMMIT");
        return memberJson({ capsule: dto(result.rows[0]), replayed: false }, 201);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    },
    async update(request: Request, rawId: string) {
      assertMemberOrigin(request, config.origin);
      const user = await owner(request);
      const id = memberId(rawId);
      const input = await memberInput(request, memberUpdateSchema);
      contentDataset(input.content);
      const result = await pool.query(`UPDATE member_capsule SET content = $1, revision = revision + 1, updated_at = clock_timestamp()
        WHERE id = $2 AND owner_user_id = $3 AND dataset = $4 AND revision = $5 RETURNING *`,
      [JSON.stringify(input.content), id, user.id, dataset, input.expectedRevision]);
      if (!result.rows[0]) {
        const exists = await pool.query("SELECT id FROM member_capsule WHERE id = $1 AND owner_user_id = $2 AND dataset = $3", [id, user.id, dataset]);
        throw new MemberError(exists.rowCount ? 409 : 404, exists.rowCount ? "REVISION_CONFLICT" : "NOT_FOUND");
      }
      return memberJson({ capsule: dto(result.rows[0]) });
    },
    async remove(request: Request, rawId: string) {
      assertMemberOrigin(request, config.origin);
      const user = await owner(request);
      const id = memberId(rawId);
      const input = await memberInput(request, memberDeleteSchema);
      const result = await pool.query("DELETE FROM member_capsule WHERE id = $1 AND owner_user_id = $2 AND dataset = $3 AND revision = $4 RETURNING id", [id, user.id, dataset, input.expectedRevision]);
      if (!result.rowCount) {
        const exists = await pool.query("SELECT id FROM member_capsule WHERE id = $1 AND owner_user_id = $2 AND dataset = $3", [id, user.id, dataset]);
        throw new MemberError(exists.rowCount ? 409 : 404, exists.rowCount ? "REVISION_CONFLICT" : "NOT_FOUND");
      }
      return memberJson({ deleted: true });
    },
  };
}
