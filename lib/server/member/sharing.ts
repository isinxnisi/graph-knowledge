import { randomUUID } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import type { DatasetMode } from "../../domain/dataset";
import { memberCapsuleSchema } from "../../domain/member-capsule";
import { capsuleShareIssueSchema, capsuleSharePublishSchema, capsuleShareRevokeSchema, capsuleShareSchema, sharedRevisionListSchema } from "../../domain/capsule-sharing";
import { readSharedPublication } from "./shared-publication";
import { activeMember } from "./operations";
import { freezeCapsuleRevision } from "./capsule-revisions";
import { assertMemberOrigin, MemberError, memberId, memberInput, memberJson } from "./http";

import { CAPSULE_SHARE_TOKEN_VERSION, deriveCapsuleShareToken, hashCapsuleShareToken as hashToken, recoverCapsuleShareToken } from "./share-token";
function shareDto(row: QueryResultRow) {
  return capsuleShareSchema.parse({ id: row.id, revision: Number(row.revision), createdAt: row.created_at.toISOString(), updatedAt: row.updated_at?.toISOString() });
}
export function createCapsuleSharing(pool: Pool, dataset: DatasetMode, origin: string, owner: (request: Request) => Promise<{ id: string }>, secret: string) {
  return {
    async readSharedRevisions(request: Request, rawId: string) {
      const user = await owner(request), id = memberId(rawId);
      const query = new URL(request.url).searchParams;
      const rawRevision = query.get("revision");
      if (query.getAll("revision").length > 1 || (rawRevision !== null && (!/^[1-9]\d*$/.test(rawRevision) || !Number.isSafeInteger(Number(rawRevision))))) throw new MemberError(400, "INVALID_ARGUMENT");
      // One statement authorizes and reads an immutable snapshot. A live link
      // grants no access to this owner-only endpoint, even for the same version.
      const projection = rawRevision !== null ? "r.snapshot" : "r.revision,r.snapshot#>>'{content,title}' AS title,r.snapshot->>'updatedAt' AS snapshot_updated_at";
      const result = await pool.query(`SELECT ${projection} FROM member_capsule c
        JOIN "user" u ON u.id = c.owner_user_id AND u.active = true
        LEFT JOIN member_capsule_revision r ON r.capsule_id = c.id AND ($4::bigint IS NULL OR r.revision = $4)
        WHERE (to_jsonb(c)->>'trashed_at') IS NULL AND c.id = $1 AND c.owner_user_id = $2 AND c.dataset = $3
        ORDER BY r.revision DESC`, [id, user.id, dataset, rawRevision]);
      if (!result.rows.length) throw new MemberError(404, "NOT_FOUND");
      if (rawRevision !== null) {
        const snapshots = result.rows.filter(row => row.snapshot !== null).map(row => memberCapsuleSchema.parse(row.snapshot));
        if (!snapshots.length) throw new MemberError(404, "NOT_FOUND");
        return memberJson({ capsule: snapshots[0] });
      }
      return memberJson(sharedRevisionListSchema.parse({ revisions: result.rows.filter(row => row.revision !== null).map(row => ({ revision: Number(row.revision), updatedAt: row.snapshot_updated_at, title: row.title })) }));
    },
    async shareStatus(request: Request, rawId: string) {
      const user = await owner(request), id = memberId(rawId);
      // Recheck the active owner in the same statement that reads the bearer
      // material. This endpoint is never authorized by a shared-link token.
      const result = await pool.query(`SELECT s.id, s.revision, s.created_at, (to_jsonb(s)->>'updated_at')::timestamptz AS updated_at, COALESCE((to_jsonb(s)->>'token_revision')::bigint,s.revision) AS token_revision, s.token_hash, (to_jsonb(s)->>'token_derivation_version')::smallint AS token_derivation_version,
          c.sharing_blocked, COALESCE((to_jsonb(r)->>'sharing_blocked')::boolean,false) AS revision_blocked,
          COALESCE(t.closed, false) AS comments_closed FROM member_capsule c
        JOIN "user" u ON u.id = c.owner_user_id AND u.active = true
        LEFT JOIN member_capsule_share s ON s.capsule_id = c.id
        LEFT JOIN member_capsule_revision r ON r.capsule_id = s.capsule_id AND r.revision = s.revision
        LEFT JOIN member_capsule_thread t ON t.capsule_id = c.id
        WHERE (to_jsonb(c)->>'trashed_at') IS NULL AND c.id = $1 AND c.owner_user_id = $2 AND c.dataset = $3`, [id, user.id, dataset]);
      const row = result.rows[0];
      if (!row) throw new MemberError(404, "NOT_FOUND");
      const token = row.id && !row.sharing_blocked && !row.revision_blocked
        ? recoverCapsuleShareToken(secret, { dataset, capsuleId: id, shareId: row.id, revision: Number(row.token_revision) }, row.token_derivation_version, row.token_hash) : null;
      return memberJson({ share: row.id ? shareDto(row) : null, blocked: row.sharing_blocked, commentsClosed: row.comments_closed, token });
    },
    async issueShare(request: Request, rawId: string) {
      assertMemberOrigin(request, origin);
      const user = await owner(request), id = memberId(rawId);
      const input = await memberInput(request, capsuleShareIssueSchema);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const active = await client.query('SELECT active FROM "user" WHERE id = $1 FOR UPDATE', [user.id]);
        if (active.rows[0]?.active !== true) throw new MemberError(401, "UNAUTHENTICATED");
        // Serialize issuance/revocation with current-content update/deletion.
        const current = await client.query("SELECT * FROM member_capsule c WHERE (to_jsonb(c)->>'trashed_at') IS NULL AND id = $1 AND owner_user_id = $2 AND dataset = $3 FOR UPDATE", [id, user.id, dataset]);
        const row = current.rows[0];
        if (!row) throw new MemberError(404, "NOT_FOUND");
        if (row.sharing_blocked) throw new MemberError(403, "SHARING_BLOCKED");
        if (Number(row.revision) !== input.expectedRevision) throw new MemberError(409, "REVISION_CONFLICT");
        const existing = await client.query("SELECT * FROM member_capsule_share WHERE capsule_id = $1", [id]);
        if ((existing.rows[0]?.id ?? null) !== input.expectedShareId) throw new MemberError(409, "SHARE_CONFLICT");
        const ready = await client.query("SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'member_capsule_share'::regclass AND attname = 'token_derivation_version' AND NOT attisdropped) AS ready");
        if (!ready.rows[0]?.ready) throw new MemberError(503, "SHARE_RECOVERY_UNAVAILABLE");
        if (!(await client.query("SELECT to_regclass('member_capsule_publication') AS ready")).rows[0]?.ready) throw new MemberError(503, "SHARE_PUBLICATION_UNAVAILABLE");
        const targetRevision = Number(existing.rows[0]?.revision ?? row.revision);
        if (!existing.rows[0]) await freezeCapsuleRevision(client, row);
        else if ((await client.query("SELECT COALESCE((to_jsonb(r)->>'sharing_blocked')::boolean,false) AS blocked FROM member_capsule_revision r WHERE capsule_id=$1 AND revision=$2",[id,targetRevision])).rows[0]?.blocked) throw new MemberError(403,"SHARING_BLOCKED");
        // Issuing a link and selecting its comment setting are one operation.
        // An omitted setting preserves an existing owner's closure choice.
        await client.query("INSERT INTO member_capsule_thread (capsule_id, closed) VALUES ($1, false) ON CONFLICT DO NOTHING", [id]);
        if (input.commentsClosed !== undefined) await client.query("UPDATE member_capsule_thread SET closed = $2 WHERE capsule_id = $1", [id, input.commentsClosed]);
        const shareId = randomUUID();
        const token = deriveCapsuleShareToken(secret, { dataset, capsuleId: id, shareId, revision: targetRevision });
        await client.query("DELETE FROM member_capsule_share WHERE capsule_id = $1", [id]);
        const issued = await client.query("INSERT INTO member_capsule_share (id, capsule_id, revision, token_hash, token_derivation_version, token_revision) VALUES ($1, $2, $3, $4, $5, $3) RETURNING *", [shareId, id, targetRevision, hashToken(token), CAPSULE_SHARE_TOKEN_VERSION]);
        if (existing.rows[0]) await client.query("INSERT INTO member_capsule_publication(share_id,capsule_id,revision,published_at) SELECT $1,capsule_id,revision,published_at FROM member_capsule_publication WHERE share_id=$2 AND capsule_id=$3",[shareId,existing.rows[0].id,id]);
        await client.query("INSERT INTO member_capsule_publication(share_id,capsule_id,revision) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[shareId,id,targetRevision]);
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
        await activeMember(client, user.id);
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
    async publishShare(request: Request, rawId: string) {
      assertMemberOrigin(request,origin);
      const user=await owner(request),id=memberId(rawId),input=await memberInput(request,capsuleSharePublishSchema);
      const client=await pool.connect();
      try {
        await client.query("BEGIN");
        if (!(await client.query('SELECT active FROM "user" WHERE id=$1 FOR UPDATE',[user.id])).rows[0]?.active) throw new MemberError(401,"UNAUTHENTICATED");
        const row=(await client.query("SELECT * FROM member_capsule c WHERE (to_jsonb(c)->>'trashed_at') IS NULL AND id=$1 AND owner_user_id=$2 AND dataset=$3 FOR UPDATE",[id,user.id,dataset])).rows[0];
        if (!row) throw new MemberError(404,"NOT_FOUND");
        if (row.sharing_blocked) throw new MemberError(403,"SHARING_BLOCKED");
        if (Number(row.revision)!==input.expectedRevision) throw new MemberError(409,"REVISION_CONFLICT");
        const current=(await client.query("SELECT * FROM member_capsule_share WHERE capsule_id=$1",[id])).rows[0];
        if (!current || current.id!==input.expectedShareId) throw new MemberError(409,"SHARE_CONFLICT");
        if (Number(current.revision)!==input.expectedSharedRevision && Number(current.revision)!==input.expectedRevision) throw new MemberError(409,"SHARE_CONFLICT");
        await freezeCapsuleRevision(client,row);
        await client.query("INSERT INTO member_capsule_publication(share_id,capsule_id,revision) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[current.id,id,input.expectedRevision]);
        const published=(await client.query("UPDATE member_capsule_share SET revision=$2,updated_at=CASE WHEN revision=$2 THEN updated_at ELSE clock_timestamp() END WHERE capsule_id=$1 RETURNING *",[id,input.expectedRevision])).rows[0];
        await client.query("COMMIT");
        return memberJson({share:shareDto(published)});
      } catch(error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    },
    async readShared(request: Request) {
      const query=new URL(request.url).searchParams,raw=query.get("revision");
      if ([...query.keys()].some(k=>k!=="revision") || query.getAll("revision").length>1 || raw!==null && !/^[1-9]\d*$/.test(raw)) throw new MemberError(400,"INVALID_ARGUMENT");
      return memberJson(await readSharedPublication(pool,dataset,request.headers.get("x-capsule-token"),raw===null?undefined:Number(raw)));
    },
  };
}
