import { Pool } from "pg";
import { themeGuard, ThemeError } from "./theme-workbench";
import { createKnowledgeFoundationService, ensureKnowledgeFoundationSchema } from "./knowledge-foundation";

let pool: Pool | undefined;
let initialized: Promise<void> | undefined;

/** Local operator surface only. Production/member authentication belongs to U5. */
export const knowledgePreviewActor = { kind: "operator" as const, id: "local-preview-operator" };
export async function knowledgePreview() {
  themeGuard();
  const url = new URL(process.env.THEME_DATABASE_URL ?? "");
  if (url.hostname !== "127.0.0.1" || url.port !== "55475" || url.pathname !== "/plunode_theme75")
    throw new ThemeError("共通記録の専用DB設定が一致しません", 503);
  pool ??= new Pool({ connectionString: url.toString(), max: 3, statement_timeout: 10000 });
  initialized ??= ensureKnowledgeFoundationSchema(pool).then(() => undefined).catch((error) => { initialized = undefined; throw error; });
  await initialized;
  return createKnowledgeFoundationService(pool);
}
