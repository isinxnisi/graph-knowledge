import { Pool } from "pg";
import neo4j, { type Driver } from "neo4j-driver";
import { ThemeError } from "./theme-workbench";
import { knowledgeReadConfiguration } from "./knowledge-read-runtime";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { createKnowledgePublicationService, ensureKnowledgePublicationSchema } from "./knowledge-publication";

let pool: Pool | undefined;
let driver: Driver | undefined;
let initialized: Promise<void> | undefined;
export async function knowledgePublicationPreview(publisher=false) {
  const config=knowledgeReadConfiguration();
  pool ??= new Pool({ connectionString:config.databaseUrl,max:4,statement_timeout:15000,...(config.beta&&!publisher?{options:"-c default_transaction_read_only=on"}:{}) });
  driver ??= neo4j.driver(config.neo,neo4j.auth.basic("neo4j",config.password),{maxConnectionPoolSize:3,connectionAcquisitionTimeout:10000});
  initialized ??= (config.beta ? verifyKnowledgeReadSchema(pool) : ensureKnowledgePublicationSchema(pool)).then(()=>undefined).catch(error=>{initialized=undefined;throw error;});
  await initialized;
  return createKnowledgePublicationService(pool, driver, {}, {prepareSchema:()=>initialized!});
}
export async function closeKnowledgePublicationPreview() {
  await driver?.close(); await pool?.end(); driver = undefined; pool = undefined; initialized = undefined;
}

/** Beta Web never performs migrations as a side effect of opening the TOP. */
export async function verifyKnowledgeReadSchema(target:Pool){
 for(const name of ["001-records.sql","002-publication.sql","006-entity-identities.sql"]){
  const checksum=createHash("sha256").update(await readFile(path.join(process.cwd(),"migrations/knowledge-foundation",name),"utf8")).digest("hex");
  const row=(await target.query("SELECT checksum FROM knowledge75.migrations WHERE name=$1",[name])).rows[0];
  if(row?.checksum!==checksum)throw new ThemeError("知識DBの明示migrationを確認してください",503);
 }
}
