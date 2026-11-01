import { Pool } from "pg";
import neo4j, { type Driver } from "neo4j-driver";
import { themeGuard, ThemeError } from "./theme-workbench";
import { createKnowledgePublicationService, ensureKnowledgePublicationSchema } from "./knowledge-publication";

let pool: Pool | undefined;
let driver: Driver | undefined;
let initialized: Promise<void> | undefined;
export async function knowledgePublicationPreview() {
  themeGuard();
  const url = new URL(process.env.THEME_DATABASE_URL ?? "");
  if (url.hostname !== "127.0.0.1" || url.port !== "55475" || url.pathname !== "/plunode_theme75")
    throw new ThemeError("公開読取の専用DB設定が一致しません", 503);
  if (process.env.KNOWLEDGE_PUBLICATION_ENABLED !== "1" || process.env.KNOWLEDGE_NEO4J_URL !== "bolt://127.0.0.1:7698" || !process.env.KNOWLEDGE_NEO4J_PASSWORD)
    throw new ThemeError("公開読取の起動設定を確認してください", 503);
  pool ??= new Pool({ connectionString: url.toString(), max: 4, statement_timeout: 15000 });
  driver ??= neo4j.driver("bolt://127.0.0.1:7698", neo4j.auth.basic("neo4j", process.env.KNOWLEDGE_NEO4J_PASSWORD), { maxConnectionPoolSize: 3, connectionAcquisitionTimeout: 10000 });
  initialized ??= ensureKnowledgePublicationSchema(pool).then(() => undefined).catch((error) => { initialized = undefined; throw error; });
  await initialized;
  return createKnowledgePublicationService(pool, driver);
}
export async function closeKnowledgePublicationPreview() {
  await driver?.close(); await pool?.end(); driver = undefined; pool = undefined; initialized = undefined;
}
