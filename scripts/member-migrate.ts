import { memberConfig } from "../lib/server/member/config";
import { memberPool } from "../lib/server/member/auth";
import { migrateMemberDatabase } from "../lib/server/member/migrate";

const config = memberConfig();
if (!config) throw new Error("Member storage must be explicitly configured before migration");
const pool = memberPool(config);
try {
  await migrateMemberDatabase(pool);
  console.log("Member migrations applied");
} catch {
  console.error("Member migration failed; check database availability and migration checksums");
  process.exitCode = 1;
} finally { await pool.end(); }
