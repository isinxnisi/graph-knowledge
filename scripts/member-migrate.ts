import {parseArgs} from "node:util";
import { memberConfig } from "../lib/server/member/config";
import { memberPool } from "../lib/server/member/auth";
import { migrateMemberDatabase } from "../lib/server/member/migrate";

const {values}=parseArgs({options:{communities:{type:"boolean",default:false},"confirm-origin":{type:"string"}}});
const config = memberConfig();
if (!config) throw new Error("Member storage must be explicitly configured before migration");
if(values.communities&&values["confirm-origin"]!==config.origin)throw new Error("Community migration requires an explicit matching --confirm-origin");
const pool = memberPool(config);
try {
  await migrateMemberDatabase(pool,values.communities);
  console.log("Member migrations applied");
} catch {
  console.error("Member migration failed; check database availability and migration checksums");
  process.exitCode = 1;
} finally { await pool.end(); }
