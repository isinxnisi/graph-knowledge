import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";

// Explicit additive migrations, pinned in Git. Never run during requests or
// execute generated SQL from a newly upgraded auth dependency without review.
export async function migrateMemberDatabase(pool: Pool, communities = false, siteOperations = false, publicProfiles = false, capsuleDocuments = false, communityCapsules = false, capsuleComments = false, capsuleShareRecovery = false, capsulePublications = false, googleProfileImages = false, officialProfiles = false) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(71900261)");
    await client.query("CREATE TABLE IF NOT EXISTS member_migration (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
    if(siteOperations&&!communities)throw new Error("Site operations require community migrations");
    if(publicProfiles&&(!communities||!siteOperations))throw new Error("Public profiles require migrations 000-008");
    if (communityCapsules && (!communities || !capsuleDocuments)) throw new Error("Community Capsules require community and document migrations");
    if (capsulePublications && !capsuleShareRecovery) throw new Error("Capsule publications require share recovery migration");
    if (googleProfileImages && !publicProfiles) throw new Error("Google profile images require public profile migrations");
    if (officialProfiles && !publicProfiles) throw new Error("Official profiles require public profile migrations");
    for (const name of ["000-auth.sql", "001-capsules.sql", "002-capsule-sharing.sql", "003-capsule-discussion.sql", "004-account-operations.sql", ...(communities ? ["005-communities.sql", "006-community-continuity.sql", "007-community-safety.sql"] : []), ...(siteOperations ? ["008-site-operations.sql"] : []), ...(publicProfiles ? ["009-public-profiles.sql", "010-account-initial-experience.sql"] : []), ...(capsuleDocuments ? ["011-capsule-documents.sql"] : []), ...(communityCapsules ? ["012-community-capsules.sql"] : []), ...(capsuleComments ? ["013-capsule-comment-default.sql"] : []), ...(capsuleShareRecovery ? ["014-capsule-share-recovery.sql"] : []), ...(capsulePublications ? ["015-capsule-publications.sql"] : []), ...(googleProfileImages ? ["016-google-profile-images.sql"] : []), ...(officialProfiles ? ["017-official-profiles.sql"] : [])]) {
      const sql = await readFile(new URL(`../../../db/member/${name}`, import.meta.url), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = await client.query("SELECT checksum FROM member_migration WHERE name = $1", [name]);
      if (previous.rows[0]) {
        if (previous.rows[0].checksum !== checksum) throw new Error("Applied member migration has changed");
      } else {
        await client.query(sql);
        await client.query("INSERT INTO member_migration (name, checksum) VALUES ($1, $2)", [name, checksum]);
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
