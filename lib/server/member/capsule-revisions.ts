import type { PoolClient, QueryResultRow } from "pg";
import { MEMBER_CAPSULE_LIMITS, memberCapsuleSchema } from "../../domain/member-capsule";
import { SHARED_REVISION_LIMIT } from "../../domain/capsule-sharing";
import { MemberError } from "./http";

export function capsuleDto(row: QueryResultRow) {
  return memberCapsuleSchema.parse({ id: row.id, schemaVersion: row.schema_version, revision: Number(row.revision),
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), content: row.content });
}

// Caller holds the current Capsule row lock and has checked owner, dataset and
// expected revision. No read or ordinary save implicitly creates a shared copy.
export async function freezeCapsuleRevision(client: PoolClient, row: QueryResultRow) {
  const existing = (await client.query("SELECT snapshot, COALESCE((to_jsonb(member_capsule_revision)->>'sharing_blocked')::boolean,false) AS sharing_blocked FROM member_capsule_revision WHERE capsule_id=$1 AND revision=$2", [row.id, row.revision])).rows[0];
  if (existing) { if (existing.sharing_blocked) throw new MemberError(403, "SHARING_BLOCKED"); return memberCapsuleSchema.parse(existing.snapshot); }
  const count = await client.query("SELECT count(*) FROM member_capsule_revision WHERE capsule_id=$1", [row.id]);
  if (Number(count.rows[0].count) >= SHARED_REVISION_LIMIT) throw new MemberError(422, "SHARE_REVISION_LIMIT");
  const snapshot = capsuleDto(row);
  await assertCapsuleStorage(client,row.owner_user_id,JSON.stringify(snapshot));
  await client.query("INSERT INTO member_capsule_revision(capsule_id,revision,snapshot) VALUES($1,$2,$3)", [row.id, row.revision, JSON.stringify(snapshot)]);
  return snapshot;
}

export async function capsuleStorageUsage(client: Pick<PoolClient,"query">, ownerId: string) {
  const row = (await client.query(`SELECT
    COALESCE((SELECT sum(octet_length(content::text)) FROM member_capsule WHERE owner_user_id=$1),0)
    + COALESCE((SELECT sum(octet_length(r.snapshot::text)) FROM member_capsule_revision r JOIN member_capsule c ON c.id=r.capsule_id WHERE c.owner_user_id=$1),0) AS bytes`,[ownerId])).rows[0];
  return Number(row.bytes);
}

// The owner User row is write-locked by every saving/freezing caller. Quota is
// checked atomically across all datasets and includes immutable shared copies.
export async function assertCapsuleStorage(client: Pick<PoolClient,"query">, ownerId: string, incoming: string, replacingId?: string) {
  const used = await capsuleStorageUsage(client,ownerId);
  const row = (await client.query(`SELECT octet_length($1::jsonb::text) AS incoming,
    COALESCE((SELECT octet_length(content::text) FROM member_capsule WHERE id=$2 AND owner_user_id=$3),0) AS replaced`,[incoming,replacingId??null,ownerId])).rows[0];
  if (used + Number(row.incoming) - Number(row.replaced) > MEMBER_CAPSULE_LIMITS.totalBytes) throw new MemberError(422,"CAPSULE_STORAGE_LIMIT");
}

export async function requireCapsuleDocuments(client: Pick<PoolClient, "query">) {
  if (!(await client.query("SELECT to_regclass('member_capsule_update_request') AS ready")).rows[0].ready) throw new MemberError(503, "CAPSULE_DOCUMENTS_UNAVAILABLE");
}
