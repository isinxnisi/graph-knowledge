import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { MemberError } from "./http";

export const memberOperationSchema = z.strictObject({
  action: z.enum(["suspend-user", "resume-user", "block-sharing", "hide-post"]),
  target: z.uuidv4().transform(value => value.toLowerCase()),
  actor: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_.@-]+$/),
  reason: z.enum(["abuse", "security", "request", "correction"]),
});
export type MemberOperation = z.infer<typeof memberOperationSchema>;

export async function memberTransaction<T>(pool: Pool, action: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const result = await action(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
export async function activeMember(client: PoolClient, userId: string) {
  const result = await client.query('SELECT active FROM "user" WHERE id=$1 FOR SHARE', [userId]);
  if (result.rows[0]?.active !== true) throw new MemberError(401, "UNAUTHENTICATED");
}

// HTTP公開しない。DBへ接続できる運営者だけがCLIから呼ぶ。
export async function operateMember(pool: Pool, raw: MemberOperation, apply = false) {
  const input = memberOperationSchema.parse(raw);
  return memberTransaction(pool, async client => {
    let changed = false;
    if (input.action === "suspend-user" || input.action === "resume-user") {
      const user = await client.query('SELECT active FROM "user" WHERE id=$1 FOR UPDATE', [input.target]);
      if (!user.rowCount) throw new MemberError(404, "NOT_FOUND");
      changed = user.rows[0].active !== (input.action === "resume-user");
      if (apply) {
        await client.query('UPDATE "user" SET active=$2, "updatedAt"=clock_timestamp() WHERE id=$1', [input.target, input.action === "resume-user"]);
        if (input.action === "suspend-user") {
          await client.query('DELETE FROM "session" WHERE "userId"=$1', [input.target]);
          // 再開しても旧tokenと受付を復活させない。
          await client.query("SELECT id FROM member_capsule WHERE owner_user_id=$1 ORDER BY id FOR UPDATE", [input.target]);
          await client.query("DELETE FROM member_capsule_share WHERE capsule_id IN (SELECT id FROM member_capsule WHERE owner_user_id=$1)", [input.target]);
          await client.query("UPDATE member_capsule_thread SET closed=true WHERE capsule_id IN (SELECT id FROM member_capsule WHERE owner_user_id=$1)", [input.target]);
        }
      }
    } else if (input.action === "block-sharing") {
      const capsule = await client.query("SELECT sharing_blocked FROM member_capsule WHERE id=$1 FOR UPDATE", [input.target]);
      if (!capsule.rowCount) throw new MemberError(404, "NOT_FOUND");
      changed = !capsule.rows[0].sharing_blocked;
      if (apply) {
        await client.query("UPDATE member_capsule SET sharing_blocked=true WHERE id=$1", [input.target]);
        await client.query("DELETE FROM member_capsule_share WHERE capsule_id=$1", [input.target]);
        await client.query("UPDATE member_capsule_thread SET closed=true WHERE capsule_id=$1", [input.target]);
      }
    } else {
      // 投稿者とCapsuleの既存lock順へ合わせる。別投稿・別版を非表示にしない。
      const post = await client.query("SELECT author_user_id, capsule_id FROM member_capsule_post WHERE id=$1", [input.target]);
      if (!post.rowCount) throw new MemberError(404, "NOT_FOUND");
      await client.query('SELECT id FROM "user" WHERE id=$1 FOR SHARE', [post.rows[0].author_user_id]);
      await client.query("SELECT id FROM member_capsule WHERE id=$1 FOR UPDATE", [post.rows[0].capsule_id]);
      const current = await client.query("SELECT hidden_at FROM member_capsule_post WHERE id=$1 FOR UPDATE", [input.target]);
      if (!current.rowCount) throw new MemberError(404, "NOT_FOUND");
      changed = !current.rows[0].hidden_at;
      if (apply) await client.query("UPDATE member_capsule_post SET hidden_at=COALESCE(hidden_at,clock_timestamp()) WHERE id=$1", [input.target]);
    }
    if (apply && changed) await client.query("INSERT INTO member_operation(action,target_id,actor,reason) VALUES ($1,$2,$3,$4)", [input.action, input.target, input.actor, input.reason]);
    return { action: input.action, target: input.target, applied: apply, changed };
  });
}

export async function deleteMember(pool: Pool, userId: string, sessionId: string) {
  return memberTransaction(pool, async client => {
    const user = await client.query('SELECT active FROM "user" WHERE id=$1 FOR UPDATE', [userId]);
    if (user.rows[0]?.active !== true) throw new MemberError(401, "UNAUTHENTICATED");
    const recent = await client.query(`SELECT id FROM "session" WHERE id=$1 AND "userId"=$2
      AND "expiresAt">clock_timestamp() AND "createdAt">clock_timestamp()-interval '30 minutes'`, [sessionId, userId]);
    if (!recent.rowCount) throw new MemberError(403, "RECENT_LOGIN_REQUIRED");
    // 相互投稿のある二人が同時退会しても、投稿先を含む同じ順でlockする。
    await client.query(`SELECT c.id FROM member_capsule c WHERE c.owner_user_id=$1
      OR EXISTS (SELECT 1 FROM member_capsule_post p WHERE p.capsule_id=c.id AND p.author_user_id=$1)
      ORDER BY c.id FOR UPDATE OF c`, [userId]);
    // 他人のCapsuleへの本人投稿も消す。他人のCapsule自体は保持する。
    await client.query("DELETE FROM member_capsule_post WHERE author_user_id=$1", [userId]);
    await client.query("DELETE FROM member_capsule WHERE owner_user_id=$1", [userId]);
    await client.query("DELETE FROM member_capsule_request WHERE owner_user_id=$1", [userId]);
    await client.query('DELETE FROM "user" WHERE id=$1', [userId]);
    // 復旧時に削除意図を再適用できるよう、UUIDだけを残す。認証／本文は残さない。
    await client.query("INSERT INTO member_operation(action,target_id,actor,reason) VALUES ('delete-account',$1,'self','request')", [userId]);
    // account/sessionは既存FK、共有版・リンク・会話はCapsule FKで削除する。
  });
}
