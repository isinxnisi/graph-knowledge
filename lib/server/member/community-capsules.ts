import {publicPeople} from "./public-people";
import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";
import type { DatasetMode } from "../../domain/dataset";
import { memberCapsuleSchema } from "../../domain/member-capsule";
import { activeMember, memberTransaction } from "./operations";
import { MemberError, memberId, memberInput, memberJson } from "./http";
import { freezeCapsuleRevision } from "./capsule-revisions";
import { communityPage, pageTime } from "./community-pagination";
import { communityAllowance } from "./community-rate";

const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const details = { description: z.string().trim().max(1000), threadId: z.uuidv4().optional() };
const createSchema = z.strictObject({ requestId: z.uuidv4(), expectedRevision: revision, capsuleId: z.uuidv4(), capsuleRevision: revision, audience: z.enum(["public", "cohort"]), ...details });
const updateSchema = z.strictObject({ requestId: z.uuidv4(), expectedRevision: revision, capsuleRevision: revision, ...details });
const withdrawSchema = z.strictObject({ requestId: z.uuidv4(), expectedRevision: revision });
type Helpers = {
  actor: (req: Request) => Promise<{ id: string }>;
  identity: (req: Request, required?: boolean) => Promise<{ id: string } | null>;
  context: (c: PoolClient, id: string, user: string | null, write?: boolean) => Promise<QueryResultRow>;
  writable: (row: QueryResultRow) => void;
  member: (row: QueryResultRow) => void;
  expected: (row: QueryResultRow, n: number) => void;
};
const missing = () => new MemberError(404, "NOT_FOUND");

// The listing and its description have their own audience. Being able to read
// a thread or possessing a link token does not satisfy this predicate.
export const readableCapsuleListing = `(l.status='active' AND (to_jsonb(cap)->>'trashed_at') IS NULL AND cap.sharing_blocked=false AND r.sharing_blocked=false AND u.active=true
 AND issuer.status='active' AND issuer.generation=l.issuer_generation
 AND (l.audience='public' OR EXISTS(SELECT 1 FROM community_capsule_audience a JOIN community_member m
  ON m.community_id=l.community_id AND m.user_id=a.user_id AND m.generation=a.generation AND m.status='active'
  WHERE a.listing_id=l.id AND a.user_id=$2)))`;
export const capsuleListingJoins = `FROM community_capsule_listing l
 JOIN member_capsule cap ON cap.id=l.capsule_id AND cap.owner_user_id=l.owner_user_id
 JOIN member_capsule_revision r ON r.capsule_id=l.capsule_id AND r.revision=l.capsule_revision
 JOIN "user" u ON u.id=l.owner_user_id
 JOIN community_member issuer ON issuer.community_id=l.community_id AND issuer.user_id=l.owner_user_id`;
const joins = capsuleListingJoins;
const summaryProjection = `l.*,r.snapshot#>>'{content,title}' AS capsule_title,
  COALESCE(jsonb_array_length(r.snapshot#>'{content,document,nodes}'),jsonb_array_length(r.snapshot#>'{content,entityIds}')) AS entity_count,
  COALESCE(jsonb_array_length(r.snapshot#>'{content,document,relations}'),jsonb_array_length(r.snapshot#>'{content,claimIds}')) AS claim_count`;

export async function requireCapsuleListingAccess(c: PoolClient, id: string, userId: string | null) {
  const row = (await c.query(`SELECT l.*,r.snapshot ${joins} WHERE l.id=$1 AND ${readableCapsuleListing}`, [id,userId])).rows[0];
  if (!row) throw missing();
  return row;
}

export async function requireCommunityCapsules(c: Pick<PoolClient, "query">) {
  if (!(await c.query("SELECT to_regclass('community_capsule_listing') AS ready")).rows[0].ready) throw new MemberError(503, "CAPSULES_UNAVAILABLE");
}
export async function pinPublicCapsuleListings(c: PoolClient, communityId: string) {
  if (!(await c.query("SELECT to_regclass('community_capsule_listing') AS ready")).rows[0].ready) return;
  await c.query(`INSERT INTO community_capsule_audience(listing_id,user_id,generation)
    SELECT l.id,m.user_id,m.generation FROM community_capsule_listing l JOIN community_member m ON m.community_id=l.community_id AND m.status='active'
    WHERE l.community_id=$1 AND l.audience='public' AND l.status='active' ON CONFLICT DO NOTHING`, [communityId]);
  await c.query("UPDATE community_capsule_listing SET audience='cohort',revision=revision+1,updated_at=clock_timestamp() WHERE community_id=$1 AND audience='public' AND status='active'", [communityId]);
}

export function createCommunityCapsules(pool: Pool, h: Helpers, secret: string, dataset: DatasetMode) {
  async function authorizeThread(c: PoolClient, communityId: string, threadId: string | undefined, userId: string, publicListing = false) {
    if (!threadId) return;
    const t = (await c.query(`SELECT t.id,t.audience FROM community_thread t WHERE t.id=$1 AND t.community_id=$3 AND
      (t.audience='public' OR EXISTS(SELECT 1 FROM community_audience_member a JOIN community_member m ON m.community_id=t.community_id AND m.user_id=a.user_id AND m.generation=a.generation AND m.status='active' WHERE a.thread_id=t.id AND a.user_id=$2))`, [threadId, userId, communityId])).rows[0];
    if (!t) throw missing();
    if (publicListing && t.audience !== 'public') throw new MemberError(400, "PRIVATE_THREAD_REFERENCE");
  }
  async function dto(c: PoolClient, row: QueryResultRow, userId: string | null) {
    let threadId: string | null = null;
    if (row.thread_id) {
      try { await authorizeThread(c, row.community_id, row.thread_id, userId ?? "00000000-0000-4000-8000-000000000000"); threadId = row.thread_id; }
      catch (error) { if (!(error instanceof MemberError && error.status === 404)) throw error; }
    }
    const snapshot = row.snapshot ? memberCapsuleSchema.parse(row.snapshot) : null;
    const creator=(await publicPeople(c,[row.owner_user_id])).get(row.owner_user_id)??null;
    return { creator,id: row.id, communityId: row.community_id, capsuleId: row.capsule_id, capsuleRevision: Number(row.capsule_revision),
      revision: row.revision, audience: row.audience, description: row.description, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
      title: snapshot?.content.title ?? row.capsule_title, entityCount: snapshot ? snapshot.content.document?.nodes.length ?? snapshot.content.entityIds.length : row.entity_count,
      claimCount: snapshot ? snapshot.content.document?.relations.length ?? snapshot.content.claimIds.length : row.claim_count, canManage: row.owner_user_id === userId, threadId };
  }
  async function readable(c: PoolClient, id: string, userId: string | null) {
    const row = (await c.query(`SELECT l.*,r.snapshot ${joins} WHERE l.id=$1 AND cap.dataset=$3 AND ${readableCapsuleListing}`, [id, userId, dataset])).rows[0];
    if (!row) throw missing();
    return row;
  }
  async function saved(c: PoolClient, id: string, userId: string, wanted: number) {
    const row = (await c.query("SELECT * FROM member_capsule c WHERE (to_jsonb(c)->>'trashed_at') IS NULL AND id=$1 AND owner_user_id=$2 AND dataset=$3 FOR UPDATE", [id, userId, dataset])).rows[0];
    if (!row) throw missing();
    if (row.sharing_blocked) throw new MemberError(403, "SHARING_BLOCKED");
    const frozen = (await c.query("SELECT snapshot,sharing_blocked FROM member_capsule_revision WHERE capsule_id=$1 AND revision=$2", [id, wanted])).rows[0];
    if (frozen) { if (frozen.sharing_blocked) throw new MemberError(403, "SHARING_BLOCKED"); return; }
    if (Number(row.revision) !== wanted) throw new MemberError(409, "REVISION_CONFLICT");
    await freezeCapsuleRevision(c, row);
  }
  async function receipt(c: PoolClient, userId: string, requestId: string, input: unknown) {
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const prior = (await c.query("SELECT hash,result_id FROM community_request WHERE user_id=$1 AND request_id=$2", [userId, requestId])).rows[0];
    if (prior && prior.hash !== hash) throw new MemberError(409, "REQUEST_CONFLICT");
    return { hash, id: prior?.result_id as string | undefined };
  }
  async function saveReceipt(c: PoolClient, userId: string, requestId: string, hash: string, id: string) {
    await c.query("INSERT INTO community_request(user_id,request_id,hash,result_id) VALUES($1,$2,$3,$4)", [userId, requestId, hash, id]);
  }
  async function writeActor(c: PoolClient, userId: string) {
    if ((await c.query('SELECT active FROM "user" WHERE id=$1 FOR UPDATE', [userId])).rows[0]?.active !== true) throw new MemberError(401, "UNAUTHENTICATED");
    await requireCommunityCapsules(c);
  }
  return {
    async ownCapsuleDestinations(req: Request, rawId: string) {
      const id=memberId(rawId), user=(await h.identity(req,true))!;
      return memberTransaction(pool,async c=>{
        await activeMember(c,user.id);
        const cap=(await c.query("SELECT revision FROM member_capsule c WHERE id=$1 AND owner_user_id=$2 AND dataset=$3 AND (to_jsonb(c)->>'trashed_at') IS NULL",[id,user.id,dataset])).rows[0];
        if(!cap)throw missing();
        await requireCommunityCapsules(c);
        // Apply the same listing, membership-generation and community access
        // rules before pagination. Capsule ownership is not a read bypass.
        const page=await communityPage(c,req,secret,'capsule-destinations:'+id,user.id,String(cap.revision),
          `SELECT l.id,l.community_id,l.capsule_revision,l.audience,place.title,place.visibility,l.id AS page_id,${pageTime('l.created_at')}
           ${joins} JOIN community place ON place.id=l.community_id
           WHERE l.capsule_id=$1 AND l.owner_user_id=$2 AND cap.dataset=$3 AND ${readableCapsuleListing}
           AND place.status<>'suspended' AND (place.visibility='public' OR EXISTS(SELECT 1 FROM community_member m WHERE m.community_id=place.id AND m.user_id=$2 AND m.status='active'))`,
          [id,user.id,dataset],'l.created_at','l.id');
        return memberJson({destinations:page.rows.map(row=>({id:row.id,communityId:row.community_id,title:row.title,visibility:row.visibility,audience:row.audience,revision:Number(row.capsule_revision)})),nextCursor:page.nextCursor});
      });
    },
    async threadCapsules(c: PoolClient, threadId: string, userId: string | null) {
      if (!(await c.query("SELECT to_regclass('community_capsule_listing') AS ready")).rows[0].ready) return [];
      const rows = (await c.query(`SELECT ${summaryProjection} ${joins} WHERE l.thread_id=$1 AND cap.dataset=$3 AND ${readableCapsuleListing} ORDER BY l.created_at DESC,l.id DESC LIMIT 20`, [threadId,userId,dataset])).rows;
      return Promise.all(rows.map(row => dto(c,row,userId)));
    },
    async listCapsules(req: Request, rawId: string) {
      const id = memberId(rawId), user = await h.identity(req);
      return memberTransaction(pool, async c => {
        if (user) await activeMember(c,user.id);
        await requireCommunityCapsules(c);
        const place = await h.context(c, id, user?.id ?? null);
        const page = await communityPage(c, req, secret, 'capsules:' + id, user?.id ?? null, String(place.revision),
          `SELECT ${summaryProjection},l.id AS page_id,${pageTime('l.created_at')} ${joins} WHERE l.community_id=$1 AND cap.dataset=$3 AND ${readableCapsuleListing}`, [id, user?.id ?? null, dataset], 'l.created_at', 'l.id');
        return memberJson({ listings: await Promise.all(page.rows.map(row => dto(c, row, user?.id ?? null))), nextCursor: page.nextCursor, partial: page.partial });
      });
    },
    async readCapsule(req: Request, rawId: string) {
      const id = memberId(rawId), user = await h.identity(req);
      return memberTransaction(pool, async c => {
        if (user) await activeMember(c,user.id);
        await requireCommunityCapsules(c);
        const seed = (await c.query("SELECT community_id FROM community_capsule_listing WHERE id=$1", [id])).rows[0];
        if (!seed) throw missing();
        await h.context(c, seed.community_id, user?.id ?? null);
        const row = await readable(c, id, user?.id ?? null);
        return memberJson({ listing: await dto(c, row, user?.id ?? null), capsule: memberCapsuleSchema.parse(row.snapshot) });
      });
    },
    async createCapsuleListing(req: Request, rawId: string) {
      const id = memberId(rawId), user = await h.actor(req), input = await memberInput(req, createSchema);
      return memberTransaction(pool, async c => {
        await writeActor(c, user.id);
        const place = await h.context(c, id, user.id, true); h.writable(place); h.member(place);
        const r = await receipt(c, user.id, input.requestId, ['capsule-list', id, input]);
        if (r.id) return memberJson({ listing: await dto(c, await readable(c, r.id, user.id), user.id) });
        h.expected(place, input.expectedRevision);
        if (place.visibility !== 'public' && input.audience === 'public') throw new MemberError(400, "PUBLIC_CAPSULE_NOT_ALLOWED");
        await authorizeThread(c, id, input.threadId, user.id, input.audience === 'public');
        await saved(c, input.capsuleId, user.id, input.capsuleRevision);
        const count = await c.query(`SELECT count(*) ${joins} WHERE l.community_id=$1 AND l.status='active'
          AND cap.sharing_blocked=false AND r.sharing_blocked=false AND u.active=true
          AND issuer.status='active' AND issuer.generation=l.issuer_generation`, [id]);
        if (Number(count.rows[0].count) >= 200) throw new MemberError(422, "CAPSULE_LISTING_LIMIT");
        await communityAllowance(c, user.id, 'thread');
        const listingId = randomUUID();
        await c.query("INSERT INTO community_capsule_listing(id,community_id,capsule_id,capsule_revision,owner_user_id,issuer_generation,audience,description,thread_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", [listingId, id, input.capsuleId, input.capsuleRevision, user.id, place.generation, input.audience, input.description, input.threadId ?? null]);
        if (input.audience === 'cohort') await c.query("INSERT INTO community_capsule_audience(listing_id,user_id,generation) SELECT $1,user_id,generation FROM community_member WHERE community_id=$2 AND status='active'", [listingId, id]);
        await saveReceipt(c, user.id, input.requestId, r.hash, listingId);
        await c.query('UPDATE community SET revision=revision+1 WHERE id=$1', [id]);
        return memberJson({ listing: await dto(c, await readable(c, listingId, user.id), user.id) }, 201);
      });
    },
    async changeCapsuleListing(req: Request, rawId: string, action: 'update' | 'withdraw') {
      const id = memberId(rawId), user = await h.actor(req);
      const input = await memberInput(req, action === 'update' ? updateSchema : withdrawSchema);
      return memberTransaction(pool, async c => {
        await writeActor(c, user.id);
        const seed = (await c.query("SELECT community_id,capsule_id FROM community_capsule_listing WHERE id=$1 AND owner_user_id=$2", [id, user.id])).rows[0];
        if (!seed) throw missing();
        const place = await h.context(c, seed.community_id, user.id, true);
        const r = await receipt(c, user.id, input.requestId, ['capsule-' + action, id, input]);
        if (r.id) return action === 'withdraw' ? memberJson({ changed: true }) : memberJson({ listing: await dto(c, await readable(c, id, user.id), user.id) });
        if (action === 'update') {
          h.writable(place); h.member(place);
          const v = updateSchema.parse(input);
          await saved(c, seed.capsule_id, user.id, v.capsuleRevision);
        }
        const row = (await c.query("SELECT * FROM community_capsule_listing WHERE id=$1 FOR UPDATE", [id])).rows[0];
        h.expected(row, input.expectedRevision);
        if (row.status !== 'active') throw new MemberError(409, 'LISTING_WITHDRAWN');
        if (action === 'withdraw') await c.query("UPDATE community_capsule_listing SET status='withdrawn',description='',thread_id=NULL,revision=revision+1,updated_at=clock_timestamp() WHERE id=$1", [id]);
        else {
          const v = updateSchema.parse(input);
          // Updates never widen or replace the original audience cohort.
          await authorizeThread(c, row.community_id, v.threadId, user.id, row.audience === 'public');
          await c.query("UPDATE community_capsule_listing SET capsule_revision=$2,description=$3,thread_id=$4,revision=revision+1,updated_at=clock_timestamp() WHERE id=$1", [id, v.capsuleRevision, v.description, v.threadId ?? null]);
        }
        await saveReceipt(c, user.id, input.requestId, r.hash, id);
        await c.query('UPDATE community SET revision=revision+1 WHERE id=$1', [seed.community_id]);
        return action === 'withdraw' ? memberJson({ changed: true }) : memberJson({ listing: await dto(c, await readable(c, id, user.id), user.id) });
      });
    },
  };
}
