import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import configured from "../../../data/theme-discovery.json";
import { featuredThemeSettingsSchema, type SaveFeaturedThemes, type FeaturedThemeSettings } from "../../domain/featured-themes";
import { MemberError } from "./http";

const targetId = "686a42bd-d9bc-4f34-b158-2c9c601c9874";
export async function readFeaturedThemes(db: Pick<Pool | PoolClient, "query">): Promise<FeaturedThemeSettings> {
  const row = (await db.query("SELECT revision,theme_ids,updated_at FROM site_featured_themes WHERE singleton=true")).rows[0];
  return featuredThemeSettingsSchema.parse(row ? {
    revision: row.revision, themeIds: row.theme_ids, updatedAt: new Date(row.updated_at).toISOString(),
  } : { revision: 0, themeIds: configured.featuredThemeIds, updatedAt: null });
}
// Called only within the site-operator transaction, after current session authorization.
export async function saveFeaturedThemes(db: PoolClient, operatorId: string, input: SaveFeaturedThemes, publishedIds: Set<string>) {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('site-featured-themes',0))");
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const receipt = (await db.query("SELECT payload_hash,result FROM site_operation_request WHERE operator_id=$1 AND request_id=$2", [operatorId,input.requestId])).rows[0];
  if (receipt) {
    if (receipt.payload_hash !== hash) throw new MemberError(409,"REQUEST_REUSED");
    return { ...featuredThemeSettingsSchema.parse(receipt.result), replayed: true };
  }
  const before = await readFeaturedThemes(db);
  if (before.revision !== input.expectedRevision) throw new MemberError(409,"FEATURED_THEMES_CHANGED");
  // Previously selected, now unavailable themes can be retained or removed. They are never shown on TOP.
  if (input.themeIds.some(id => !publishedIds.has(id) && !before.themeIds.includes(id))) throw new MemberError(409,"THEME_NOT_PUBLISHED");
  const row = (await db.query(`INSERT INTO site_featured_themes(singleton,revision,theme_ids,updated_by)
    VALUES(true,1,$1,$2) ON CONFLICT(singleton) DO UPDATE SET revision=site_featured_themes.revision+1,
    theme_ids=excluded.theme_ids,updated_by=excluded.updated_by,updated_at=clock_timestamp()
    RETURNING revision,theme_ids,updated_at`, [input.themeIds,operatorId])).rows[0];
  const result: FeaturedThemeSettings = { revision: row.revision, themeIds: row.theme_ids, updatedAt: new Date(row.updated_at).toISOString() };
  await db.query(`INSERT INTO site_operation_request(operator_id,request_id,payload_hash,action,target_kind,target_id,reason,result)
    VALUES($1,$2,$3,'set-featured-themes','homepage',$4,'TOPの紹介テーマを更新',$5)`, [operatorId,input.requestId,hash,targetId,result]);
  return { ...result, replayed: false };
}
