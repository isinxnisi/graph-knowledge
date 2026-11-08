import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { migrateMemberDatabase } from "../lib/server/member/migrate";
import { createSiteOperationsService } from "../lib/server/member/site-operations";
import { MemberError, memberHandle } from "../lib/server/member/http";
import { knowledgeThemeHome } from "../lib/server/knowledge-theme-home";
import type { KnowledgeThemePage } from "../lib/domain/knowledge-theme-reader";
vi.mock("server-only", () => ({}));
vi.mock("../lib/server/member/runtime", () => ({ memberRuntime: () => ({ pool }) }));
vi.mock("../lib/server/knowledge-publication-preview", () => ({ knowledgePublicationPreview: vi.fn() }));
const pool = new Pool({ connectionString: process.env.MEMBER_DATABASE_URL, max: 5 });
const origin = "http://127.0.0.1:3221", operator = randomUUID(), other = randomUUID(), member = randomUUID();
const sessions = new Map([operator, other, member].map(id => [id, randomUUID()]));
const service = createSiteOperationsService(pool, origin, async req => {
  const id = req.headers.get("x-member-user");
  if (!id || !sessions.has(id)) throw new MemberError(401, "UNAUTHENTICATED");
  return { id, sessionId: sessions.get(id)! };
}, "fixture-secret".repeat(4));
const themes: KnowledgeThemePage["themes"] = ["one", "two", "three"].map((id, n) => ({ id, revision: n+1, title: id, description: "published", initialView: "graph", hasTimeline: false, hasRelations: true, entityIds: [] }));
let published = themes;
const catalog = vi.fn(async () => ({ themes: published }));
const read = (id = operator) => memberHandle(() => service.featuredThemes(new Request(origin, { headers: { "x-member-user": id } }), catalog));
const save = (body: unknown, id = operator, from = origin) => memberHandle(() => service.saveFeaturedThemes(new Request(origin, { method: "POST", headers: { origin: from, "x-member-user": id, "content-type": "application/json" }, body: JSON.stringify(body) }), catalog));
const input = (themeIds = ["two", "one"], expectedRevision = 0) => ({ requestId: randomUUID(), themeIds, expectedRevision });
beforeAll(async () => {
  expect((await pool.query("SELECT current_database() name")).rows[0].name).toBe("graph_member_test");
  await migrateMemberDatabase(pool, ...Array(27).fill(true));
  const old = (await pool.query("SELECT name,checksum FROM member_migration ORDER BY name")).rows;
  for (const id of [operator, other, member]) {
    await pool.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt",active,locale) VALUES($1,$2,$3,true,now(),now(),true,$4)', [id, "Fixture operator", id+"@example.invalid", "ja"]);
    await pool.query(`INSERT INTO session(id,"userId",token,"expiresAt","updatedAt") VALUES($1,$2,$3,now()+interval '1 day',now())`, [sessions.get(id), id, randomUUID()]);
  }
  await migrateMemberDatabase(pool, ...Array(28).fill(true));
  await migrateMemberDatabase(pool, ...Array(28).fill(true));
  expect((await pool.query("SELECT name,checksum FROM member_migration WHERE name<>'037-featured-themes.sql' ORDER BY name")).rows).toEqual(old);
  expect((await pool.query("SELECT count(*)::int n FROM member_migration")).rows[0].n).toBe(38);
  expect((await pool.query('SELECT count(*)::int n FROM "user"')).rows[0].n).toBe(3);
  process.env.SITE_OPERATOR_USER_IDS = operator+","+other;
}, 30000);
beforeEach(async () => { published = themes; catalog.mockClear(); await pool.query("TRUNCATE site_featured_themes,site_operation_request"); });
afterAll(async () => { await pool.end(); delete process.env.SITE_OPERATOR_USER_IDS; });
it("authorizes operators before catalog access and rejects forged or invalid writes", async () => {
  expect((await read("")).status).toBe(401); expect((await read(member)).status).toBe(403);
  expect(catalog).not.toHaveBeenCalled();
  expect((await save(input(), operator, "https://other.invalid")).status).toBe(403);
  expect((await save({ ...input(), themeIds: ["one", "one"] })).status).toBe(400);
  expect((await save({ ...input(), actor: other })).status).toBe(400);
  expect(catalog).not.toHaveBeenCalled();
});
it("saves explicit order, filters by current publication and preserves the recent list", async () => {
  const response = await save(input()); expect(response.status).toBe(200);
  expect((await response.json()).themeIds).toEqual(["two", "one"]);
  let home = await knowledgeThemeHome({ themes: catalog });
  expect(home.featured.map(t => t.id)).toEqual(["two", "one"]); expect(home.recent).toEqual(themes);
  published = [{ ...themes[1], revision: 9 }, themes[2]];
  home = await knowledgeThemeHome({ themes: catalog });
  expect(home.featured.map(t => [t.id,t.revision])).toEqual([["two",9]]);
  expect((await save(input(["one", "two"],1))).status).toBe(200); // retained, unavailable prior selection
  expect((await save(input([],2))).status).toBe(200);
  expect((await knowledgeThemeHome({ themes: catalog })).featured).toEqual([]);
});
it("does not accept a private or nonexistent newly selected theme", async () => {
  const result = await save(input(["private-theme"])); expect(result.status).toBe(409);
  expect((await result.json()).error.code).toBe("THEME_NOT_PUBLISHED");
  expect((await pool.query("SELECT count(*)::int n FROM site_featured_themes")).rows[0].n).toBe(0);
});
it("serializes concurrent operators, rejects stale edits, and replays a lost reply only once", async () => {
  const body = input(); const responses = await Promise.all([save(body), save(input(["three"]),other)]);
  expect(responses.map(r => r.status).sort()).toEqual([200,409]);
  const firstSucceeded = responses[0].status === 200;
  const retry = await save(body);
  if (firstSucceeded) { expect(retry.status).toBe(200); expect((await retry.json()).replayed).toBe(true); }
  else expect(retry.status).toBe(409);
  const state = await (await read()).json(); expect(state.revision).toBe(1);
  expect((await pool.query("SELECT count(*)::int n FROM site_operation_request")).rows[0].n).toBe(1);
  if (firstSucceeded) expect((await save({ ...body, themeIds: ["three"] })).status).toBe(409);
});
it("blocks a revoked operator and an expired session without updating the setting", async () => {
  await pool.query('UPDATE "user" SET active=false WHERE id=$1', [operator]);
  try { expect((await save(input())).status).toBe(401); } finally { await pool.query('UPDATE "user" SET active=true WHERE id=$1', [operator]); }
  await pool.query(`UPDATE session SET "expiresAt"=now()-interval '1 second' WHERE id=$1`, [sessions.get(operator)]);
  try { expect((await save(input())).status).toBe(401); } finally { await pool.query(`UPDATE session SET "expiresAt"=now()+interval '1 day' WHERE id=$1`, [sessions.get(operator)]); }
  expect((await pool.query("SELECT count(*)::int n FROM site_featured_themes")).rows[0].n).toBe(0);
});
