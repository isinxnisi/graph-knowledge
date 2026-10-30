import {parseArgs} from "node:util";
import { memberConfig } from "../lib/server/member/config";
import { memberPool } from "../lib/server/member/auth";
import { migrateMemberDatabase } from "../lib/server/member/migrate";

const {values}=parseArgs({options:{"google-profile-images":{type:"boolean",default:false},"capsule-publications":{type:"boolean",default:false},"capsule-share-recovery":{type:"boolean",default:false},"capsule-comments":{type:"boolean",default:false},"capsule-documents":{type:"boolean",default:false},"community-capsules":{type:"boolean",default:false},communities:{type:"boolean",default:false},"site-operations":{type:"boolean",default:false},"public-profiles":{type:"boolean",default:false},"confirm-origin":{type:"string"}}});
const config = memberConfig();
if (!config) throw new Error("Member storage must be explicitly configured before migration");
if((values.communities||values["site-operations"]||(values["public-profiles"]||values["google-profile-images"])||values["capsule-documents"]||values["community-capsules"]||values["capsule-comments"]||values["capsule-share-recovery"]||values["capsule-publications"])&&values["confirm-origin"]!==config.origin)throw new Error("Migration requires an explicit matching --confirm-origin");
const pool = memberPool(config);
try {
  await migrateMemberDatabase(pool,values.communities||values["site-operations"]||(values["public-profiles"]||values["google-profile-images"]),values["site-operations"]||(values["public-profiles"]||values["google-profile-images"]),(values["public-profiles"]||values["google-profile-images"]),values["capsule-documents"]||values["community-capsules"],values["community-capsules"],values["capsule-comments"],values["capsule-share-recovery"]||values["capsule-publications"],values["capsule-publications"],values["google-profile-images"]);
  console.log("Member migrations applied");
} catch {
  console.error("Member migration failed; check database availability and migration checksums");
  process.exitCode = 1;
} finally { await pool.end(); }
