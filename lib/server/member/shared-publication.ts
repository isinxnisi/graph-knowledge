import {publicPeople} from "./public-people";
import type { Pool } from "pg";
import type { DatasetMode } from "../../domain/dataset";
import { capsuleShareTokenSchema, sharedCapsuleSchema } from "../../domain/capsule-sharing";
import { hashCapsuleShareToken } from "./share-token";
import { MemberError } from "./http";

// One statement is the authorization boundary for HTML, OGP, images and JSON.
// Neither cookies nor a community placement grant access through this endpoint.
export async function readSharedPublication(pool: Pool, dataset: DatasetMode, rawToken: string | null, revision?: number) {
  const token = capsuleShareTokenSchema.safeParse(rawToken);
  if (!token.success || revision !== undefined && (!Number.isSafeInteger(revision) || revision < 1)) throw new MemberError(404, "NOT_FOUND");
  const result = await pool.query(`SELECT c.owner_user_id,r.snapshot, s.revision AS current_revision,
    (SELECT jsonb_agg(jsonb_build_object('revision',p2.revision,'publishedAt',p2.published_at) ORDER BY p2.revision DESC)
       FROM member_capsule_publication p2 JOIN member_capsule_revision r2 ON r2.capsule_id=p2.capsule_id AND r2.revision=p2.revision
       WHERE p2.share_id=s.id AND p2.capsule_id=s.capsule_id AND NOT COALESCE((to_jsonb(r2)->>'sharing_blocked')::boolean,false)) AS publications
    FROM member_capsule_share s
    JOIN member_capsule c ON c.id=s.capsule_id JOIN "user" u ON u.id=c.owner_user_id
    JOIN member_capsule_revision live ON live.capsule_id=s.capsule_id AND live.revision=s.revision
    JOIN member_capsule_publication p ON p.share_id=s.id AND p.capsule_id=s.capsule_id AND p.revision=COALESCE($3::bigint,s.revision)
    JOIN member_capsule_revision r ON r.capsule_id=p.capsule_id AND r.revision=p.revision
    WHERE (to_jsonb(c)->>'trashed_at') IS NULL AND s.token_hash=$1 AND c.dataset=$2 AND u.active AND NOT c.sharing_blocked
      AND NOT COALESCE((to_jsonb(live)->>'sharing_blocked')::boolean,false)
      AND NOT COALESCE((to_jsonb(r)->>'sharing_blocked')::boolean,false)`, [hashCapsuleShareToken(token.data),dataset,revision??null]);
  const row=result.rows[0];
  if (!row) throw new MemberError(404,"NOT_FOUND");
  const author=(await publicPeople(pool,[row.owner_user_id])).get(row.owner_user_id)??null;
  return sharedCapsuleSchema.parse({capsule:row.snapshot,author,currentRevision:Number(row.current_revision),revisions:(row.publications??[]).map((p: {revision:number;publishedAt:string})=>({...p,publishedAt:new Date(p.publishedAt).toISOString()}))});
}
