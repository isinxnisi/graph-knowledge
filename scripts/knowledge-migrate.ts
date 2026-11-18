/** Explicit deployment migration. It never seeds knowledge or changes the legacy KG. */
import {parseArgs} from "node:util";
import {pathToFileURL} from "node:url";
import {Pool} from "pg";
import {knowledgeDeployment} from "../lib/server/knowledge-deployment";
import {knowledgeReadConfiguration} from "../lib/server/knowledge-read-runtime";
import {ensureKnowledgeFoundationSchema} from "../lib/server/knowledge-foundation";
import {migrateKnowledgeSubmissions} from "../lib/server/knowledge-submissions";
import {migrateKnowledgeTranslations} from "../lib/server/knowledge-translation-migrate";
import {migrateKnowledgeIdentities} from "../lib/server/knowledge-identity-migrate";
import {ensureKnowledgePublicationSchema} from "../lib/server/knowledge-publication";
import {migrateKnowledgePatrol} from "../lib/server/knowledge-patrol-schema";
import {migrateKnowledgeOrganization} from "../lib/server/knowledge-organization-schema";

export async function migrateDeploymentKnowledge(args=process.argv.slice(2)){
 const {values}=parseArgs({args,options:{"confirm-origin":{type:"string"},"confirm-database":{type:"string"},"publication-storage-only":{type:"boolean"}}});
 const profile=knowledgeDeployment();
 if(!profile||!profile.capabilities.includes("operator")||values["confirm-origin"]!==profile.origin||values["confirm-database"]!==profile.database.database)throw Error("An explicit deployment, origin and database confirmation are required");
 const config=knowledgeReadConfiguration();
 const pool=new Pool({connectionString:config.databaseUrl,max:2,statement_timeout:30000});
 try{
  const db=(await pool.query("SELECT current_database() AS name")).rows[0].name;
  if(db!==profile.database.database)throw Error("Connected database differs from the confirmed deployment");
  if(values["publication-storage-only"]){
   // The beta intentionally has no private submission tables in this database.
   // Check that initialization has nothing to add except the requested storage migration.
   const names=["001-records.sql","002-publication.sql","004-submission-references.sql","006-entity-identities.sql",
    "007-acquisition-inventory.sql","010-theme-publication.sql","011-theme-knowledge-updates.sql"];
   const previous=(await pool.query("SELECT name FROM knowledge75.migrations WHERE name=ANY($1::text[])",[names])).rowCount;
   if(previous!==names.length)throw Error("Apply the existing publication prerequisites before migrating storage");
   await ensureKnowledgePublicationSchema(pool);
  }else{
   await ensureKnowledgeFoundationSchema(pool);
   await migrateKnowledgeSubmissions(pool);
   await migrateKnowledgeTranslations(pool);
   await migrateKnowledgeIdentities(pool);
   await ensureKnowledgePublicationSchema(pool);
   await migrateKnowledgePatrol(pool);
   await migrateKnowledgeOrganization(pool);
  }
  return {database:db,migrations:(await pool.query("SELECT name,checksum FROM knowledge75.migrations ORDER BY name")).rows};
 }finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 migrateDeploymentKnowledge().then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error("Knowledge migration failed. Check the confirmed deployment and existing checksums; no seed or automatic restore was performed.");process.exitCode=1;});
}
