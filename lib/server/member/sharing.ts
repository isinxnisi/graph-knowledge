import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import type { DatasetMode } from "../../domain/dataset";
import { memberCapsuleSchema } from "../../domain/member-capsule";
import { capsuleShareIssueSchema, capsuleShareRevokeSchema, capsuleShareSchema, capsuleShareTokenSchema, sharedRevisionListSchema, SHARED_REVISION_LIMIT } from "../../domain/capsule-sharing";
import { assertMemberOrigin, MemberError, memberId, memberInput, memberJson } from "./http";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
function shareDto(row: QueryResultRow) {
  return capsuleShareSchema.parse({ id: row.id, revision: Number(row.revision), createdAt: row.created_at.toISOString() });
}
export function createCapsuleSharing(pool: Pool, dataset: DatasetMode, origin: string, owner: (request: Request) => Promise<{ id: string }>) {
  return {
    async readSharedRevisions(request: Request, rawId: string) {
      const user = await owner(request), id = memberId(rawId);
      const query = new URL(request.url).searchParams;
      const rawRevision = query.get("revision");
      if (query.getAll("revision").length > 1 || (rawRevision !== null && (!/^[1-9]\d*$/.test(rawRevision) || !Number.isSafeInteger(Number(rawRevision))))) throw new MemberError(400, "INVALID_ARGUMENT");
      // One statement authorizes and reads an immutable snapshot. A live link
      // grants no access to this owner-only endpoint, even for the same version.
      const result = await pool.query(`SELECT r.snapshot FROM member_capsule c
        JOIN "user" u ON u.id = c.owner_user_id AND u.active = true
        LEFT JOIN member_capsule_revision r ON r.capsule_id = c.id AND ($4::bigint IS NULL OR r.revision = $4)
        WHERE c.id = $1 AND c.owner_user_id = $2 AND c.dataset = $3
        ORDER BY r.revision DESC`, [id, user.id, dataset, rawRevision]);
      if (!result.rows.length) throw new MemberError(404, "NOT_FOUND");
      const snapshots = result.rows.filter(row => row.snapshot !== null).map(row => memberCapsuleSchema.parse(row.snapshot));
      if (rawRevision !== null) {
        if (!snapshots.length) throw new MemberError(404, "NOT_FOUND");
        return memberJson({ capsule: snapshots[0] });
      }
      return memberJson(sharedRevisionListSchema.parse({ revisions: snapshots.map(value => ({ revision: value.revision, updatedAt: value.updatedAt, title: value.content.title })) }));
    },
    async shareStatus(request: Request, rawId: string) {
      const user = await owner(request), id = memberId(rawId);
      const result = await pool.query(`SELECT s.id, s.revision, s.created_at FROM member_capsule c
        LEFT JOIN member_capsule_share s ON s.capsule_id = c.id
        WHERE c.id = $1 AND c.owner_user_id = $2 AND c.dataset = $3`, [id, user.id, dataset]);
      if (!result.rows[0]) throw new MemberError(404, "NOT_FOUND");
      return memberJson({ share: result.rows[0].id ? shareDto(result.rows[0]) : null });
    },
    async issueShare(request: Request, rawId: string) {
      assertMemberOrigin(request, origin);
      const user = await owner(request), id = memberId(rawId);
      const input = await memberInput(request, capsuleShareIssueSchema);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const active = await client.query('SELECT active FROM "user" WHERE id = $1 FOR SHARE', [user.id]);
        if (active.rows[0]?.active !== true) throw new MemberError(401, "UNAUTHENTICATED");
        // Serialize issuance/revocation with current-content update/deletion.
        const current = await client.query("SELECT * FROM member_capsule WHERE id = $1 AND owner_user_id = $2 AND dataset = $3 FOR UPDATE", [id, user.id, dataset]);
        const row = current.rows[0];
        if (!row) throw new MemberError(404, "NOT_FOUND");
        if (Number(row.revision) !== input.expectedRevision) throw new MemberError(409, "REVISION_CONFLICT");
        const existing = await client.query("SELECT id FROM member_capsule_share WHERE capsule_id = $1", [id]);
        if ((existing.rows[0]?.id ?? null) !== input.expectedShareId) throw new MemberError(409, "SHARE_CONFLICT");
        const frozen = await client.query("SELECT revision FROM member_capsule_revision WHERE capsule_id = $1 AND revision = $2", [id, input.expectedRevision]);
        if (!frozen.rowCount) {
          const count = await client.query("SELECT count(*) FROM member_capsule_revision WHERE capsule_id = $1", [id]);
          if (Number(count.rows[0].count) >= SHARED_REVISION_LIMIT) throw new MemberError(422, "SHARE_REVISION_LIMIT");
          const snapshot = memberCapsuleSchema.parse({ id, schemaVersion: row.schema_version, revision: Number(row.revision),
            createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), content: row.content });
          await client.query("INSERT INTO member_capsule_revision (capsule_id, revision, snapshot) VALUES ($1, $2, $3)", [id, input.expectedRevision, JSON.stringify(snapshot)]);
        }
        const token = randomBytes(32).toString("base64url");
        await client.query("DELETE FROM member_capsule_share WHERE capsule_id = $1", [id]);
        const issued = await client.query("INSERT INTO member_capsule_share (id, capsule_id, revision, token_hash) VALUES ($1, $2, $3, $4) RETURNING *", [randomUUID(), id, input.expectedRevision, hashToken(token)]);
        await client.query("COMMIT");
        return memberJson({ share: shareDto(issued.rows[0]), token }, 201);
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    },
    async revokeShare(request: Request, rawId: string) {
      assertMemberOrigin(request, origin);
      const user = await owner(request), id = memberId(rawId);
      const input = await memberInput(request, capsuleShareRevokeSchema);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query("SELECT id FROM member_capsule WHERE id = $1 AND owner_user_id = $2 AND dataset = $3 FOR UPDATE", [id, user.id, dataset]);
        if (!current.rowCount) throw new MemberError(404, "NOT_FOUND");
        const existing = await client.query("SELECT id FROM member_capsule_share WHERE capsule_id = $1", [id]);
        // A retry after success is safe; an old screen cannot revoke a new link.
        if (existing.rows[0] && existing.rows[0].id !== input.expectedShareId) throw new MemberError(409, "SHARE_CONFLICT");
        await client.query("DELETE FROM member_capsule_share WHERE capsule_id = $1", [id]);
        await client.query("COMMIT");
        return memberJson({ revoked: true });
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    },
    async readShared(request: Request) {
      // The bearer is sent in a header, never in a logged request URL. Cookies
      // grant no access, and the response contains no owner identity or token.
      const token = capsuleShareTokenSchema.safeParse(request.headers.get("x-capsule-token"));
      if (!token.success) throw new MemberError(404, "NOT_FOUND");
      const result = await pool.query(`SELECT r.snapshot FROM member_capsule_share s
        JOIN member_capsule_revision r ON r.capsule_id = s.capsule_id AND r.revision = s.revision
        JOIN member_capsule c ON c.id = s.capsule_id JOIN "user" u ON u.id = c.owner_user_id
        WHERE s.token_hash = $1 AND c.dataset = $2 AND u.active = true`, [hashToken(token.data), dataset]);
      if (!result.rows[0]) throw new MemberError(404, "NOT_FOUND");
      return memberJson({ capsule: memberCapsuleSchema.parse(result.rows[0].snapshot) });
    },
  };
}
