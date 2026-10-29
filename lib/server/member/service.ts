import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { DatasetMode } from "../../domain/dataset";
import { MEMBER_CAPSULE_LIMITS, memberCreateSchema, memberDeleteSchema, memberUpdateSchema, type MemberCapsuleContent } from "../../domain/member-capsule";
import { memberAuthReady, type MemberAuth } from "./auth";
import { MemberUnavailable, type MemberConfig } from "./config";
import { APIError } from "better-auth/api";
import { assertMemberOrigin, MemberError, memberId, memberInput, memberJson } from "./http";
import { createCapsuleSharing } from "./sharing";
import { createCapsuleDiscussion } from "./discussion";
import { z } from "zod";
import { activeMember, deleteMember, memberTransaction } from "./operations";
import {createSiteOperationsService,isSiteOperator} from "./site-operations";
import { createCommunityService } from "./community";
import { memberProfileUpdateSchema } from "../../domain/member-profile";
import { publicProfilesEnabled, createPublicProfiles } from "./public-profiles";
import { assertCapsuleStorage, capsuleStorageUsage, capsuleDto as dto, requireCapsuleDocuments } from "./capsule-revisions";

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
    return { ...session.user, sessionId: session.session.id };
  }
  function contentDataset(content: MemberCapsuleContent) {
    if (content.dataset !== dataset) throw new MemberError(400, "DATASET_MISMATCH");
  }
  return {
    accounts: createPublicProfiles(pool, config.origin, owner, config.secret),
    community: createCommunityService(pool, config.origin, owner, config.secret, dataset),
    operator: createSiteOperationsService(pool, config.origin, owner, config.secret),
    ...createCapsuleSharing(pool, dataset, config.origin, owner),
    ...createCapsuleDiscussion(pool, dataset, config.origin, owner),
    async profile(request: Request) {
      const user = await owner(request);
      const row=(await pool.query('SELECT id,name,locale FROM "user" WHERE id=$1 AND active=true',[user.id])).rows[0];
      if(!row)throw new MemberError(401,'UNAUTHENTICATED');
      const profile=publicProfilesEnabled()?(await pool.query('SELECT handle,icon FROM public_profile WHERE user_id=$1',[user.id])).rows[0]:null;
      return memberJson({ user: { ...row, ...(profile?{profile}:{}), ...(isSiteOperator(user.id)?{siteOperator:true}:{}) } });
    },
    async deleteAccount(request: Request) {
      assertMemberOrigin(request, config.origin);
      if (!request.headers.has("x-member-user")) throw new MemberError(400, "INVALID_ARGUMENT");
      const user = await owner(request);
      await memberInput(request, z.strictObject({ confirmation: z.literal("delete-account") }));
      await deleteMember(pool, user.id, user.sessionId);
      // 古いcookieは認証に使えない。全端末のsessionをDBで削除済み。
      return memberJson({ deleted: true });
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
      const listingsReady = (await pool.query("SELECT to_regclass('community_capsule_listing') IS NOT NULL AS ready")).rows[0].ready;
      const published = listingsReady ? `EXISTS(SELECT 1 FROM community_capsule_listing l JOIN community place ON place.id=l.community_id
        JOIN community_member issuer ON issuer.community_id=l.community_id AND issuer.user_id=c.owner_user_id AND issuer.status='active' AND issuer.generation=l.issuer_generation
        JOIN member_capsule_revision r ON r.capsule_id=c.id AND r.revision=l.capsule_revision
        WHERE l.capsule_id=c.id AND l.owner_user_id=c.owner_user_id AND l.status='active' AND place.status<>'suspended' AND c.sharing_blocked=false AND r.sharing_blocked=false)` : 'false';
      // Return only the presence of a usable link, never its capability or hash.
      // Private edits can advance the Capsule while the shared revision stays fixed.
      const shared = `EXISTS(SELECT 1 FROM member_capsule_share s JOIN member_capsule_revision r ON r.capsule_id=s.capsule_id AND r.revision=s.revision
        WHERE s.capsule_id=c.id AND c.sharing_blocked=false AND COALESCE((to_jsonb(r)->>'sharing_blocked')::boolean,false)=false)`;
      const result = await pool.query(`SELECT c.id,c.schema_version,c.revision,c.created_at,c.updated_at,c.content-'document' AS content,(c.content ? 'document') AS has_document,${shared} AS shared,${published} AS published FROM member_capsule c WHERE c.owner_user_id = $1 AND c.dataset = $2 ORDER BY c.updated_at DESC, c.id`, [user.id, dataset]);
      return memberJson({ capsules: result.rows.map(row => ({ id:row.id,schemaVersion:row.schema_version,revision:Number(row.revision),createdAt:row.created_at.toISOString(),updatedAt:row.updated_at.toISOString(),content:row.content,hasDocument:row.has_document,shared:row.shared,published:row.published })) });
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
      const input = await memberInput(request, memberCreateSchema, MEMBER_CAPSULE_LIMITS.bytes);
      contentDataset(input.content);
      const hash = digest(input.content);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Serialize quota/idempotency checks for this owner, including requests
        // on different app processes. There is no count-then-insert race.
        const active = await client.query('SELECT active FROM "user" WHERE id = $1 FOR UPDATE', [user.id]);
        if (active.rows[0]?.active !== true) throw new MemberError(401, "UNAUTHENTICATED");
        if (input.content.document) await requireCapsuleDocuments(client);
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
        await assertCapsuleStorage(client,user.id,JSON.stringify(input.content));
        const result = await client.query("INSERT INTO member_capsule (id, owner_user_id, dataset, content, schema_version) VALUES ($1, $2, $3, $4, $5) RETURNING *", [id, user.id, dataset, JSON.stringify(input.content), input.content.document ? 2 : 1]);
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
      const input = await memberInput(request, memberUpdateSchema, MEMBER_CAPSULE_LIMITS.bytes);
      contentDataset(input.content);
      return memberTransaction(pool, async client => {
        if ((await client.query('SELECT active FROM "user" WHERE id=$1 FOR UPDATE',[user.id])).rows[0]?.active!==true) throw new MemberError(401,"UNAUTHENTICATED");
        if (input.content.document || input.requestId) await requireCapsuleDocuments(client);
        const hash = digest(input.content);
        if (input.requestId) {
          await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [user.id + ':capsule-update:' + input.requestId]);
          const receipt = (await client.query("SELECT * FROM member_capsule_update_request WHERE owner_user_id=$1 AND request_id=$2", [user.id, input.requestId])).rows[0];
          if (receipt) {
            if (receipt.capsule_id !== id || Number(receipt.expected_revision) !== input.expectedRevision || receipt.content_hash !== hash) throw new MemberError(409, "REQUEST_CONFLICT");
            const current = (await client.query("SELECT * FROM member_capsule WHERE id=$1 AND owner_user_id=$2 AND dataset=$3", [id,user.id,dataset])).rows[0];
            if (!current) throw new MemberError(404, "NOT_FOUND");
            return memberJson({ capsule: dto(current), replayed: true, appliedRevision: Number(receipt.result_revision) });
          }
        }
        await assertCapsuleStorage(client,user.id,JSON.stringify(input.content),id);
        const result = await client.query(`UPDATE member_capsule SET content = $1, revision = revision + 1, updated_at = clock_timestamp(), schema_version=$6
          WHERE id = $2 AND owner_user_id = $3 AND dataset = $4 AND revision = $5 AND (schema_version=1 OR $6=2) RETURNING *`,
        [JSON.stringify(input.content), id, user.id, dataset, input.expectedRevision, input.content.document ? 2 : 1]);
        if (!result.rows[0]) {
          const exists = await client.query("SELECT id,schema_version FROM member_capsule WHERE id = $1 AND owner_user_id = $2 AND dataset = $3", [id, user.id, dataset]);
          if (exists.rows[0]?.schema_version === 2 && !input.content.document) throw new MemberError(409, "CAPSULE_SCHEMA_CONFLICT");
          throw new MemberError(exists.rowCount ? 409 : 404, exists.rowCount ? "REVISION_CONFLICT" : "NOT_FOUND");
        }
        if (input.requestId) await client.query("INSERT INTO member_capsule_update_request(owner_user_id,request_id,capsule_id,expected_revision,result_revision,content_hash) VALUES($1,$2,$3,$4,$5,$6)", [user.id,input.requestId,id,input.expectedRevision,result.rows[0].revision,hash]);
        return memberJson({ capsule: dto(result.rows[0]), replayed: false, appliedRevision: Number(result.rows[0].revision) });
      });
    },
    async updateStatus(request: Request, rawId: string, rawRequestId: string) {
      const user = await owner(request), id = memberId(rawId), requestId = memberId(rawRequestId);
      await requireCapsuleDocuments(pool);
      const row = (await pool.query(`SELECT r.request_id,r.result_revision,r.content_hash FROM member_capsule_update_request r
        JOIN member_capsule c ON c.id=r.capsule_id WHERE r.owner_user_id=$1 AND r.capsule_id=$2 AND r.request_id=$3 AND c.owner_user_id=$1 AND c.dataset=$4`, [user.id,id,requestId,dataset])).rows[0];
      if (!row) throw new MemberError(404, "NOT_FOUND");
      return memberJson({ operation: { requestId: row.request_id, revision: Number(row.result_revision), contentHash: row.content_hash } });
    },
    async capabilities(request: Request) {
      const user=await owner(request);
      const row = (await pool.query("SELECT to_regclass('member_capsule_update_request') IS NOT NULL AS documents, to_regclass('community_capsule_listing') IS NOT NULL AS community")).rows[0];
      return memberJson({...row,storageBytes:await capsuleStorageUsage(pool,user.id),totalBytes:MEMBER_CAPSULE_LIMITS.totalBytes});
    },
    async remove(request: Request, rawId: string) {
      assertMemberOrigin(request, config.origin);
      const user = await owner(request);
      const id = memberId(rawId);
      const input = await memberInput(request, memberDeleteSchema);
      return memberTransaction(pool, async client => {
        await activeMember(client, user.id);
        const result = await client.query("DELETE FROM member_capsule WHERE id = $1 AND owner_user_id = $2 AND dataset = $3 AND revision = $4 RETURNING id", [id, user.id, dataset, input.expectedRevision]);
        if (!result.rowCount) {
          const exists = await client.query("SELECT id FROM member_capsule WHERE id = $1 AND owner_user_id = $2 AND dataset = $3", [id, user.id, dataset]);
          throw new MemberError(exists.rowCount ? 409 : 404, exists.rowCount ? "REVISION_CONFLICT" : "NOT_FOUND");
        }
        return memberJson({ deleted: true });
      });
    },
  };
}
