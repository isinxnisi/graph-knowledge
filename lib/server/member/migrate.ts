import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";

// Explicit additive migrations, pinned in Git. Never run during requests or
// execute generated SQL from a newly upgraded auth dependency without review.
export async function migrateMemberDatabase(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(71900261)");
    await client.query("CREATE TABLE IF NOT EXISTS member_migration (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
    for (const name of ["000-auth.sql", "001-capsules.sql", "002-capsule-sharing.sql", "003-capsule-discussion.sql", "004-account-operations.sql"]) {
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
