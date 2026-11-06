import {parseArgs} from "node:util";
import { memberConfig } from "../lib/server/member/config";
import { memberPool } from "../lib/server/member/auth";
import { migrateMemberDatabase } from "../lib/server/member/migrate";

const {values}=parseArgs({options:{"knowledge-organization":{type:"boolean",default:false},"knowledge-import":{type:"boolean",default:false},"translation-generation":{type:"boolean",default:false},"collection-reading":{type:"boolean",default:false},"knowledge-collection":{type:"boolean",default:false},"knowledge-appeals":{type:"boolean",default:false},"knowledge-repair":{type:"boolean",default:false},"knowledge-acceptance":{type:"boolean",default:false},"knowledge-review":{type:"boolean",default:false},"knowledge-submissions":{type:"boolean",default:false},"capsule-post-reports":{type:"boolean",default:false},"capsule-trash":{type:"boolean",default:false},"official-profiles":{type:"boolean",default:false},"google-profile-images":{type:"boolean",default:false},"capsule-publications":{type:"boolean",default:false},"capsule-share-recovery":{type:"boolean",default:false},"capsule-comments":{type:"boolean",default:false},"capsule-documents":{type:"boolean",default:false},"community-capsules":{type:"boolean",default:false},communities:{type:"boolean",default:false},"site-operations":{type:"boolean",default:false},"public-profiles":{type:"boolean",default:false},"confirm-origin":{type:"string"}}});
const config = memberConfig();
if (!config) throw new Error("Member storage must be explicitly configured before migration");
if((values["knowledge-organization"]||values["knowledge-import"]||values["translation-generation"]||values["collection-reading"]||values["knowledge-collection"]||values["knowledge-appeals"]||values["knowledge-repair"]||values["knowledge-acceptance"]||values["knowledge-review"]||values["knowledge-submissions"]||values["capsule-post-reports"]||values["capsule-trash"]||values.communities||values["site-operations"]||(values["public-profiles"]||values["google-profile-images"]||values["official-profiles"])||values["capsule-documents"]||values["community-capsules"]||values["capsule-comments"]||values["capsule-share-recovery"]||values["capsule-publications"])&&values["confirm-origin"]!==config.origin)throw new Error("Migration requires an explicit matching --confirm-origin");
const pool = memberPool(config);
try {
  if(values["knowledge-organization"]) {
    await migrateMemberDatabase(pool,...Array(24).fill(true));
  } else if(values["knowledge-import"]) {
    await migrateMemberDatabase(pool,...Array(23).fill(true));
  } else if(values["translation-generation"]) {
    await migrateMemberDatabase(pool,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true);
  } else if(values["collection-reading"]) {
    await migrateMemberDatabase(pool,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true);
  } else if(values["knowledge-collection"]) {
    await migrateMemberDatabase(pool,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true);
  } else if(values["knowledge-appeals"]) {
    await migrateMemberDatabase(pool,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true);
  } else if(values["knowledge-repair"]) {
    await migrateMemberDatabase(pool,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true);
  } else if(values["knowledge-acceptance"] || values["knowledge-review"] || values["knowledge-submissions"] || values["capsule-post-reports"]) {
    await migrateMemberDatabase(pool,true,true,true,true,true,true,true,true,true,true,true,true,values["knowledge-submissions"]||values["knowledge-review"]||values["knowledge-acceptance"],values["knowledge-review"]||values["knowledge-acceptance"],values["knowledge-acceptance"]);
  } else await migrateMemberDatabase(pool,values.communities||values["site-operations"]||(values["public-profiles"]||values["google-profile-images"]||values["official-profiles"]),values["site-operations"]||(values["public-profiles"]||values["google-profile-images"]||values["official-profiles"]),(values["public-profiles"]||values["google-profile-images"]||values["official-profiles"]),values["capsule-documents"]||values["community-capsules"],values["community-capsules"],values["capsule-comments"],values["capsule-share-recovery"]||values["capsule-publications"],values["capsule-publications"],values["google-profile-images"],values["official-profiles"],values["capsule-trash"]);
  console.log("Member migrations applied");
} catch {
  console.error("Member migration failed; check database availability and migration checksums");
  process.exitCode = 1;
} finally { await pool.end(); }
