import { test, expect, type Page } from "@playwright/test";
import type { Core } from "cytoscape";
const pluto = "2b7c6289-d050-4dc0-93e3-9307681253cc";
const view = (page: Page) => page.getByTestId("graph-canvas").evaluate(el => {
  const cy = (el as unknown as { _cyreg?: { cy: Core } })._cyreg?.cy;
  return cy ? { points: Object.fromEntries(cy.nodes().map(n => [n.id(), n.position()])), edges: cy.edges().map(e => e.id()).sort(), zoom: cy.zoom() } : { points: {}, edges: [], zoom: 0 };
});
for (const locale of ["ja", "en"]) for (const width of [1440, 390, 320]) test(`${locale} ${width}px Home→探索・展開→ロゴHome→Back→再読込`, async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 800, hasTouch: width < 800 });
  await context.addInitScript(() => localStorage.setItem("plunode:privacy:v1", '{"analytics":false,"ads":false}'));
  const page = await context.newPage(), errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const root = locale === "en" ? "/en" : "/";
  await page.goto(info.project.use.baseURL! + root);
  const home = page.getByTestId("discovery-home"); await expect(home).toBeVisible();
  await expect(home).toContainText(locale === "en" ? "Recently added knowledge" : "最近加わった知識");
  await expect(page.getByTestId("graph-canvas")).toBeHidden();
  if (width < 800) { await expect(page.getByRole("button", { name: "Home", exact: true })).toHaveAttribute("aria-pressed", "true"); expect((await page.getByTestId("site-header").boundingBox())!.height).toBeLessThanOrEqual(56); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({ path: info.outputPath(`home-${locale}-${width}.png`), fullPage: true });
  await page.getByTestId("discovery-featured").click();
  await expect.poll(async () => Object.keys((await view(page)).points).length).toBe(4);
  await page.getByTestId("graph-canvas").evaluate(el => { const cy = (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy; cy.nodes().filter(n => n.data("label") === "浦沢直樹").first().emit("tap"); });
  await expect.poll(async () => Object.keys((await view(page)).points).length).toBe(12);
  await page.getByTestId("graph-canvas").evaluate(el => { const cy = (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy; cy.nodes().first().shift({ x: 67, y: -35 }); cy.zoom(.71); cy.emit("dragfree"); });
  await expect(page).toHaveURL(new RegExp(`/explore/${pluto}\\?s=`)); const before = await view(page);
  await page.getByRole("link", { name: locale === "en" ? "Plunode Home" : "Plunode ホーム", exact: true }).click();
  await expect(page).toHaveURL(info.project.use.baseURL! + root); await expect(home).toBeVisible();
  await page.goBack(); await expect.poll(async () => Object.keys((await view(page)).points).length).toBe(12);
  for (const after of [await view(page), await (async () => { await page.reload(); await expect.poll(async () => Object.keys((await view(page)).points).length).toBe(12); return view(page); })()]) {
    expect(after.edges).toEqual(before.edges); expect(after.zoom).toBeCloseTo(before.zoom, 2);
    for (const [id, p] of Object.entries(before.points)) { expect(after.points[id].x).toBeCloseTo(p.x, 0); expect(after.points[id].y).toBeCloseTo(p.y, 0); }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width); expect(errors).toEqual([]);
  await context.close();
});
test("Homeのテーマ・新着対象・資料リンク・検索が実データへ接続する", async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => localStorage.setItem("plunode:privacy:v1", '{"analytics":false,"ads":false}'));
  const page = await context.newPage(); await page.goto(info.project.use.baseURL! + "/");
  const home = page.getByTestId("discovery-home");
  const science = home.getByTestId("discovery-field").filter({ hasText: "ニールス・ボーア研究所" }); await science.click();
  await expect.poll(async () => Object.keys((await view(page)).points).length).toBeGreaterThan(1);
  await page.getByRole("link", { name: "Plunode ホーム", exact: true }).click();
  const recent = home.locator("ul").first().getByRole("link").first(), name = await recent.locator("strong").textContent(); await recent.click();
  await expect(page.getByTestId("exploration-root")).toContainText(name!); await expect.poll(async () => Object.keys((await view(page)).points).length).toBeGreaterThan(1);
  await page.getByRole("link", { name: "Plunode ホーム", exact: true }).click();
  await home.getByRole("link", { name: "資料と記録を読む", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible(); await expect(page.getByRole("dialog")).toContainText("出典");
  await page.getByRole("dialog").getByRole("button", { name: "探索画面へ戻る", exact: true }).click();
  await expect(home).toBeVisible(); await expect(page.getByRole("dialog")).toHaveCount(0);
  await home.getByRole("button", { name: "名前・別名で検索する", exact: true }).click();
  await expect(page.getByLabel("名前・別名", { exact: true })).toBeFocused(); await page.getByLabel("名前・別名", { exact: true }).fill("PLUTO");
  await page.locator("#explorer-search").getByRole("button", { name: "検索", exact: true }).click();
  await page.locator("#explorer-search").getByRole("button", { name: /PLUTO/ }).first().click();
  await expect.poll(async () => Object.keys((await view(page)).points).length).toBe(4);
  await expect(page).toHaveURL(new RegExp(`/explore/${pluto}\\?s=`));
  await page.goBack(); await expect(home).toBeVisible();
  await context.close();
});
test("英語HomeはJSなしで実在の起点と新着記録へ進める", async ({ browser }, info) => {
  const context = await browser.newContext({ javaScriptEnabled: false }); const page = await context.newPage();
  await page.goto(info.project.use.baseURL! + "/en"); const home = page.getByTestId("discovery-home");
  await expect(home).toContainText("One curiosity. Many connections.");
  await expect(home.getByRole("link", { name: "Read the record & sources", exact: true }).first()).toHaveAttribute("href", /^\/en\?read=claim/);
  await home.getByTestId("discovery-featured").click(); await expect(page).toHaveURL(new RegExp(`/en/explore/${pluto}$`));
  await expect(page.getByTestId("public-discovery")).toContainText("Sources for these records"); await context.close();
});
