import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { DatasetMode } from "../../domain/dataset";
import { capsuleShareTokenSchema } from "../../domain/capsule-sharing";
import { DISCUSSION_LIMITS, OWN_POSTS_PAGE_SIZE, ownDiscussionPostsSchema, discussionCloseSchema, discussionCreateSchema, discussionRevisionSchema, discussionSchema, discussionWithdrawSchema } from "../../domain/capsule-discussion";
import { assertMemberOrigin, MemberError, memberId, memberInput, memberJson } from "./http";

type Viewer = { id: string; name: string };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
// Preserve PostgreSQL microseconds: JS Date would skip rows at page boundaries.
const ownCursorSchema = z.strictObject({ at: z.iso.datetime({ precision: 6 }).refine(value => !value.startsWith("0000-")), id: z.uuidv4() });
function ownCursor(request: Request) {
  const query = new URL(request.url).searchParams;
  if ([...query.keys()].some(key => key !== "cursor") || query.getAll("cursor").length > 1) throw new MemberError(400, "INVALID_ARGUMENT");
  if (!query.has("cursor")) return null;
  const raw = query.get("cursor")!;
  try {
    if (!/^[A-Za-z0-9_-]{1,512}$/.test(raw)) throw new Error();
    return ownCursorSchema.parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
  } catch { throw new MemberError(400, "INVALID_ARGUMENT"); }
}
export function createCapsuleDiscussion(pool: Pool, dataset: DatasetMode, origin: string, authenticate: (request: Request) => Promise<Viewer>) {
  async function viewer(request: Request) {
    try { return await authenticate(request); }
    catch (error) {
      // An explicit expected user must never silently become an anonymous viewer.
      if (error instanceof MemberError && error.status === 401 && !request.headers.has("x-member-user")) return null;
      throw error;
    }
  }
  async function transaction<T>(action: (client: PoolClient) => Promise<T>) {
    const client = await pool.connect();
    try { await client.query("BEGIN"); const result = await action(client); await client.query("COMMIT"); return result; }
    catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  async function activeWriter(client: PoolClient, user: Viewer) {
    // Also serializes the per-author quota across Capsules and app processes.
    const result = await client.query('SELECT active FROM "user" WHERE id = $1 FOR UPDATE', [user.id]);
    if (result.rows[0]?.active !== true) throw new MemberError(401, "UNAUTHENTICATED");
  }
  async function authorize(client: PoolClient, request: Request, id: string, revision: number, user: Viewer | null, write: boolean) {
    // Sharing, content deletion, closure and posting use the same Capsule lock.
    const result = await client.query(`SELECT c.owner_user_id FROM member_capsule c JOIN "user" u ON u.id = c.owner_user_id
      WHERE c.id = $1 AND c.dataset = $2 AND u.active = true AND c.sharing_blocked = false ${write ? "FOR UPDATE OF c" : "FOR SHARE OF c"}`, [id, dataset]);
    const capsule = result.rows[0];
    if (!capsule) throw new MemberError(404, "NOT_FOUND");
    const own = capsule.owner_user_id === user?.id;
    if (own) {
      const frozen = await client.query("SELECT 1 FROM member_capsule_revision r WHERE capsule_id = $1 AND revision = $2 AND NOT COALESCE((to_jsonb(r)->>'sharing_blocked')::boolean,false)", [id, revision]);
      if (!frozen.rowCount) throw new MemberError(404, "NOT_FOUND");
    } else {
      const token = capsuleShareTokenSchema.safeParse(request.headers.get("x-capsule-token"));
      if (!token.success) throw new MemberError(404, "NOT_FOUND");
      const shared = await client.query(`SELECT 1 FROM member_capsule_share s
        JOIN member_capsule_publication p ON p.share_id=s.id AND p.capsule_id=s.capsule_id
        JOIN member_capsule_revision r ON r.capsule_id=p.capsule_id AND r.revision=p.revision
        JOIN member_capsule_revision live ON live.capsule_id=s.capsule_id AND live.revision=s.revision
        WHERE s.capsule_id=$1 AND p.revision=$2 AND s.token_hash=$3
          AND NOT COALESCE((to_jsonb(r)->>'sharing_blocked')::boolean,false)
          AND NOT COALESCE((to_jsonb(live)->>'sharing_blocked')::boolean,false)`, [id, revision, digest(token.data)]);
      if (!shared.rowCount) throw new MemberError(404, "NOT_FOUND");
    }
    return own;
  }
  return {
    async listOwnDiscussionPosts(request: Request) {
      const user = await authenticate(request), cursor = ownCursor(request);
      return transaction(async client => {
        const active = await client.query('SELECT active FROM "user" WHERE id = $1 FOR SHARE', [user.id]);
        if (active.rows[0]?.active !== true) throw new MemberError(401, "UNAUTHENTICATED");
        // This author-only projection deliberately has no Capsule content,
        // owner profile, share token, or other author's post. Revocation and
        // owner suspension do not prevent authors managing their own words.
        const result = await client.query(`SELECT p.id, p.capsule_id, p.revision, p.body, p.created_at, p.withdrawn_at, p.hidden_at,
          to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
          FROM member_capsule_post p JOIN member_capsule c ON c.id = p.capsule_id
          WHERE p.author_user_id = $1 AND c.dataset = $2
            AND ($3::timestamptz IS NULL OR (p.created_at, p.id) < ($3::timestamptz, $4::uuid))
          ORDER BY p.created_at DESC, p.id DESC LIMIT $5`,
        [user.id, dataset, cursor?.at ?? null, cursor?.id ?? null, OWN_POSTS_PAGE_SIZE + 1]);
        const rows = result.rows.slice(0, OWN_POSTS_PAGE_SIZE), last = rows.at(-1);
        return memberJson(ownDiscussionPostsSchema.parse({
          posts: rows.map(row => ({ id: row.id, capsuleId: row.capsule_id, revision: Number(row.revision),
            body: row.withdrawn_at || row.hidden_at ? null : row.body, createdAt: row.created_at.toISOString(), withdrawnAt: row.withdrawn_at?.toISOString() ?? null })),
          nextCursor: result.rows.length > OWN_POSTS_PAGE_SIZE && last
            ? Buffer.from(JSON.stringify({ at: last.cursor_at, id: last.id })).toString("base64url") : null,
        }));
      });
    },
    async readDiscussion(request: Request, rawId: string) {
      const id = memberId(rawId), user = await viewer(request);
      const query = new URL(request.url).searchParams;
      const rawRevision = query.get("revision");
      const revision = discussionRevisionSchema.safeParse(rawRevision && /^[1-9][0-9]*$/.test(rawRevision) ? Number(rawRevision) : null);
      if (!revision.success || [...query.keys()].some(key => key !== "revision") || query.getAll("revision").length !== 1) throw new MemberError(400, "INVALID_ARGUMENT");
      return transaction(async client => {
        const canManage = await authorize(client, request, id, revision.data, user, false);
        const thread = await client.query("SELECT closed FROM member_capsule_thread WHERE capsule_id = $1", [id]);
        const posts = await client.query(`SELECT p.*, u.name, u.active FROM member_capsule_post p JOIN "user" u ON u.id = p.author_user_id
          JOIN member_capsule_revision r ON r.capsule_id=p.capsule_id AND r.revision=p.revision
          WHERE p.capsule_id=$1 AND NOT COALESCE((to_jsonb(r)->>'sharing_blocked')::boolean,false)
          AND (EXISTS (SELECT 1 FROM member_capsule_share s
            JOIN member_capsule_publication context ON context.share_id=s.id AND context.capsule_id=s.capsule_id AND context.revision=$2
            JOIN member_capsule_publication visible ON visible.share_id=s.id AND visible.capsule_id=s.capsule_id AND visible.revision=p.revision
            WHERE s.capsule_id=$1 AND ($4::boolean OR s.token_hash=$5))
            OR ($4::boolean AND p.revision=$2))
          ORDER BY p.created_at,p.id LIMIT $3`, [id, revision.data, DISCUSSION_LIMITS.posts,canManage,digest(request.headers.get("x-capsule-token")??"")]);
        return memberJson(discussionSchema.parse({ capsuleId: id, revision: revision.data, closed: thread.rows[0]?.closed ?? false, viewer: user ? { id: user.id, name: user.name } : null, canManage,
          posts: posts.rows.map(row => ({ id: row.id, revision: Number(row.revision), authorName: row.withdrawn_at || row.hidden_at || !row.active ? null : row.name,
            body: row.withdrawn_at || row.hidden_at || !row.active ? null : row.body, createdAt: row.created_at.toISOString(), withdrawnAt: row.withdrawn_at?.toISOString() ?? null, own: row.author_user_id === user?.id })) }));
      });
    },
    async createDiscussionPost(request: Request, rawId: string) {
      assertMemberOrigin(request, origin);
      const user = await authenticate(request), id = memberId(rawId), input = await memberInput(request, discussionCreateSchema);
      return transaction(async client => {
        await activeWriter(client, user);
        await authorize(client, request, id, input.revision, user, true);
        const hash = digest(JSON.stringify([id, input.revision, input.body]));
        const replay = await client.query("SELECT id, content_hash FROM member_capsule_post WHERE author_user_id = $1 AND request_id = $2", [user.id, input.requestId]);
        if (replay.rows[0]) {
          if (replay.rows[0].content_hash !== hash) throw new MemberError(409, "REQUEST_CONFLICT");
          return memberJson({ postId: replay.rows[0].id, replayed: true });
        }
        await client.query("INSERT INTO member_capsule_thread (capsule_id, closed) VALUES ($1, false) ON CONFLICT DO NOTHING", [id]);
        const thread = await client.query("SELECT closed FROM member_capsule_thread WHERE capsule_id = $1", [id]);
        if (thread.rows[0].closed) throw new MemberError(403, "THREAD_CLOSED");
        const count = await client.query("SELECT count(*) FROM member_capsule_post WHERE capsule_id = $1", [id]);
        if (Number(count.rows[0].count) >= DISCUSSION_LIMITS.posts) throw new MemberError(422, "THREAD_LIMIT");
        const recent = await client.query("SELECT count(*) FROM member_capsule_post WHERE author_user_id = $1 AND created_at > clock_timestamp() - interval '1 minute'", [user.id]);
        if (Number(recent.rows[0].count) >= DISCUSSION_LIMITS.perMinute) throw new MemberError(429, "POST_RATE_LIMIT");
        const postId = randomUUID();
        await client.query("INSERT INTO member_capsule_post (id, capsule_id, revision, author_user_id, request_id, content_hash, body) VALUES ($1,$2,$3,$4,$5,$6,$7)", [postId, id, input.revision, user.id, input.requestId, hash, input.body]);
        return memberJson({ postId, replayed: false }, 201);
      });
    },
    async closeDiscussion(request: Request, rawId: string) {
      assertMemberOrigin(request, origin);
      const user = await authenticate(request), id = memberId(rawId), input = await memberInput(request, discussionCloseSchema);
      return transaction(async client => {
        await activeWriter(client, user);
        const own = await client.query("SELECT id FROM member_capsule WHERE id = $1 AND owner_user_id = $2 AND dataset = $3 AND sharing_blocked = false FOR UPDATE", [id, user.id, dataset]);
        if (!own.rowCount) throw new MemberError(404, "NOT_FOUND");
        await client.query("INSERT INTO member_capsule_thread (capsule_id, closed) VALUES ($1, false) ON CONFLICT DO NOTHING", [id]);
        const updated = await client.query("UPDATE member_capsule_thread SET closed = $2 WHERE capsule_id = $1 AND closed = $3 RETURNING closed", [id, input.closed, input.expectedClosed]);
        if (!updated.rowCount) throw new MemberError(409, "THREAD_CONFLICT");
        return memberJson({ closed: input.closed });
      });
    },
    async withdrawDiscussionPost(request: Request, rawId: string) {
      assertMemberOrigin(request, origin);
      const user = await authenticate(request), id = memberId(rawId), input = await memberInput(request, discussionWithdrawSchema);
      // Withdrawal stays possible for the author even after link revocation or
      // thread closure. It grants no read access to the Capsule or other posts.
      return transaction(async client => {
        await activeWriter(client, user);
        const capsule = await client.query("SELECT id FROM member_capsule WHERE id = $1 AND dataset = $2 FOR UPDATE", [id, dataset]);
        if (!capsule.rowCount) throw new MemberError(404, "NOT_FOUND");
        const result = await client.query("UPDATE member_capsule_post SET body = NULL, withdrawn_at = COALESCE(withdrawn_at, clock_timestamp()) WHERE id = $1 AND capsule_id = $2 AND author_user_id = $3 RETURNING id", [input.postId, id, user.id]);
        if (!result.rowCount) throw new MemberError(404, "NOT_FOUND");
        return memberJson({ withdrawn: true });
      });
    },
  };
}
