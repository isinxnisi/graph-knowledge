import { test, expect } from "@playwright/test";
import { decodeExploration } from "../../lib/client/exploration-url";
import { workspaceLabels } from "../../lib/i18n/workspace";
import { relationText } from "../../lib/i18n/relation-condition";
const runtime = {
 rootId: "604eb49e-df41-4157-8b49-bd92a0d93ad4",
 personId: "490ee589-76db-4a5e-8923-13d24b7cb3a2",
 endpointId: "805b9630-cd9a-4931-8cde-0bcb92bf8a9f",
};
for (const width of [1440, 390]) test("film candidates: conditions, evidence, Graph and saved restore " + width, async ({ browser }, info) => {
 const mobile = width < 800, context = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: mobile, hasTouch: mobile, userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36" });
 await context.addInitScript(() => localStorage.setItem("plunode:privacy:v1", '{"analytics":false,"ads":false}'));
 const page = await context.newPage(), errors: string[] = [], endpoints: string[] = [];
 page.on("pageerror", e => errors.push(e.message));
 page.on("requestfinished", r => { const path = new URL(r.url()).pathname; if (path.startsWith("/api/discovery/")) endpoints.push(path); });
 await page.route("**/*", route => [new URL(info.project.use.baseURL!).hostname].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
 const response = await page.request.get(info.project.use.baseURL + "/api/dataset");
 expect((await response.json()).revision).toBe("film-beta-issue43-unaccepted-v1");
 const status = await page.request.get(info.project.use.baseURL + "/api/member/status");
 expect((await status.json()).provider).toBe("google");
 expect((await page.request.get(info.project.use.baseURL + "/api/member/profile")).status()).toBe(401);
 await page.goto("/");
 await expect(page.getByTestId("film-beta-notice")).toContainText("未正式受入");
 await page.getByTestId("discovery-search-entry").click();
 await page.getByTestId("preset-browser").locator('[data-catalog-result="other-works"]').getByRole("button", { name: "条件に合う対象を探す", exact: true }).click();
 const flow = page.getByTestId("discovery-connections");
 await flow.getByLabel("段ごとにRoleを指定（作品を起点）").check();
 await flow.getByRole("group", { name: "起点作品側", exact: true }).getByRole("button", { name: "出演（演技）", exact: true }).click();
 await flow.getByRole("group", { name: "別作品側", exact: true }).getByRole("button", { name: "監督", exact: true }).click();
 await flow.getByRole("textbox").fill("許されざる者");
 const rows = flow.locator("[data-target-id]"); await expect(rows).toHaveCount(1); await expect(rows.first()).toContainText("許されざる者");
 await page.screenshot({ path: info.outputPath("film-search.png"), animations: "disabled" });
 await rows.first().getByRole("button", { name: "この対象から探す", exact: true }).click();
 await flow.getByRole("button", { name: "成立証拠と根拠を確認 ＋", exact: true }).click();
 await expect(flow.getByTestId("prototype-claim")).toHaveCount(2);
 await flow.getByRole("button", { name: "根拠を開く ＋", exact: true }).first().click();
 await expect(flow.getByRole("link", { name: "この記録の詳細ページへ" })).toBeVisible();
 // Follow the original citation into the actual server-rendered Claim page, then return.
 await flow.getByRole("link", { name: "この記録の詳細ページへ" }).click();
 await expect(page.getByText(/CAST|Dir/, {exact:true}).first()).toBeVisible();
 await page.goBack();
 if (!await flow.isVisible()) await page.getByTestId("discovery-search-entry").click();
 const proof = flow.getByRole("button", {name:"成立証拠と根拠を確認 ＋",exact:true});
 if (await proof.isVisible()) await proof.click();
 await expect(flow.getByTestId("prototype-claim")).toHaveCount(2);
 await flow.getByTestId("discovery-relation-graph").click();
 await expect(page.getByTestId("exploration-root")).toContainText("許されざる者");
 await expect.poll(() => new URL(page.url()).searchParams.has("match")).toBe(false);
 const model = () => decodeExploration(new URL(page.url()).searchParams.get("s")!, runtime.rootId, "public-kg");
 expect(model().relation).toMatchObject({ pattern: { revision: 3 }, contributionRoles: null, stepRoles: [["ACTING"], ["DIRECTING"]] });
 const canvas = page.getByTestId("graph-canvas");
 await expect(canvas).toBeVisible();
 const snapshot = () => canvas.evaluate(el => {
  const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
  return { ids: cy.nodes().map(n => n.id()).sort(), edges: cy.edges().map(e => e.id()).sort() };
 });
 await expect.poll(async () => (await snapshot()).ids).toEqual([runtime.rootId, runtime.personId].sort());
 await canvas.scrollIntoViewIfNeeded();
 const location = await canvas.evaluate((el, id) => {
  const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
  const p = cy.getElementById(id).renderedPosition(), rect = el.getBoundingClientRect();
  return { x: rect.x + p.x, y: rect.y + p.y };
 }, runtime.personId);
 if (mobile) await page.touchscreen.tap(location.x, location.y); else await page.mouse.click(location.x, location.y);
 await expect.poll(async () => (await snapshot()).ids).toEqual([runtime.rootId, runtime.personId, runtime.endpointId].sort());
 await expect.poll(async () => (await snapshot()).edges.length).toBe(2);
 await expect.poll(() => {
  const execution = model().execution;
  return execution.type === "pattern" && execution.entityState?.branches.find(b => b.id === runtime.personId)?.open;
 }).toBe(true);
 const expected = model().execution, ws = workspaceLabels("ja");
 const nav = page.locator('nav[aria-label="探索画面の切り替え"]');
 const openSaved = async () => {
  if (mobile) await nav.getByRole("button", { name: "検索", exact: true }).click();
  await page.locator("#explorer-search").getByRole("button", { name: ws.launch, exact: true }).click();
 };
 const backGraph = async () => { if (mobile) await nav.getByRole("button", { name: "Graph", exact: true }).click(); };
 await openSaved();
 let dialog = page.getByRole("dialog");
 await dialog.getByLabel(ws.name, { exact: true }).fill("映画2段探索");
 await dialog.getByRole("button", { name: ws.save, exact: true }).click();
 await expect(dialog).toContainText(ws.saved);
 await dialog.getByRole("button", { name: ws.close, exact: true }).click();
 await backGraph();
 await page.locator("#explorer-graph").getByRole("button", { name: relationText("ja").free, exact: true }).click();
 await expect.poll(() => model().relation.type).toBe("adjacent");
 await openSaved(); dialog = page.getByRole("dialog");
 await dialog.getByRole("button", { name: ws.open, exact: true }).click();
 await expect.poll(() => model().execution).toEqual(expected);
 await backGraph();
 await expect.poll(async () => (await snapshot()).ids).toEqual([runtime.rootId, runtime.personId, runtime.endpointId].sort());
 await page.reload();
 await expect.poll(() => model().execution).toEqual(expected);
 await expect.poll(async () => (await snapshot()).edges.length).toBe(2);
 await page.screenshot({ path: info.outputPath("film-restored.png"), animations: "disabled" });
 expect(endpoints).toContain("/api/discovery/entities");
 expect(endpoints).toContain("/api/discovery/paths");
 expect(errors).toEqual([]);
 expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
 await info.attach("film-route", { body: JSON.stringify({ root: runtime.rootId, person: runtime.personId, endpoint: runtime.endpointId, relation: model().relation, execution: model().execution }), contentType: "application/json" });
 // Return through the persisted discovery state; change Role order and verify no accidental OR match.
 await page.goto("/?discovery=presets");
 await page.getByTestId("discovery-search-entry").click();
 await page.getByTestId("preset-browser").locator('[data-catalog-result="other-works"]').getByRole("button", { name: "条件に合う対象を探す", exact: true }).click();
 const again = page.getByTestId("discovery-connections");
 if (await again.getByRole("button", {name:"← 対象検索へ戻る",exact:true}).isVisible()) await again.getByRole("button", {name:"← 対象検索へ戻る",exact:true}).click();
 await again.getByLabel("段ごとにRoleを指定（作品を起点）").check();
 const first = again.getByRole("group", {name:"起点作品側",exact:true});
 const second = again.getByRole("group", {name:"別作品側",exact:true});
 // A fresh catalog selection starts with wildcard steps.
 for (const group of [first,second]) for (const role of ["出演（演技）","監督"]) {
  const button=group.getByRole("button",{name:role,exact:true});
  if(await button.getAttribute("aria-pressed")==="true") await button.click();
 }
 await first.getByRole("button",{name:"監督",exact:true}).click();
 await second.getByRole("button",{name:"出演（演技）",exact:true}).click();
 await again.getByRole("textbox").fill("許されざる者");
 await expect(again.locator("[data-target-id]")).toHaveCount(0);
 await context.close();
});
