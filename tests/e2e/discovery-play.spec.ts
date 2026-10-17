import { test, expect } from "@playwright/test";
import { decodeExploration } from "../../lib/client/exploration-url";
const urasawa = "d900543a-9c11-48c1-be76-1822b756fcc4";
for (const [locale, width, height] of [["ja", 1440, 900], ["ja", 390, 844], ["en", 320, 568]] as const) test(`${locale} ${width}px テーマを試す・複数切り口・解除・Graph引継ぎ`, async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 800, hasTouch: width < 800 });
  await context.addInitScript(() => localStorage.setItem("plunode:privacy:v1", '{"analytics":false,"ads":false}'));
  const page = await context.newPage(), en = locale === "en", errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(info.project.use.baseURL! + (en ? "/en" : "/"));
  await page.getByTestId("discovery-search-entry").click();
  await page.getByRole("tab", { name: en ? "Browse & refine" : "一覧・条件から", exact: true }).click();
  const dialog = page.getByRole("dialog"), matches = dialog.locator("section[aria-busy]"), themes = dialog.locator("[data-theme]"), cuts = dialog.getByTestId("discovery-cuts");
  await expect(matches).toHaveAttribute("aria-busy", "false"); await expect(themes).toHaveCount(3);
  const original = await dialog.boundingBox();
  // Delayed real request: choices respond immediately; the previous result remains visible but cannot be selected.
  await page.route("**/api/discovery/entities**", async route => { if (new URL(route.request().url()).searchParams.get("theme") === "science") await new Promise(r => setTimeout(r, 650)); await route.continue(); });
  await dialog.locator('[data-theme="science"]').click();
  await expect(dialog.locator('[data-theme="science"]')).toHaveAttribute("aria-pressed", "true");
  await expect(matches).toHaveAttribute("aria-busy", "true");
  await expect(dialog.locator("[data-testid=discovery-results] > [inert]")).toHaveCount(1);
  expect((await dialog.boundingBox())!.height).toBe(original!.height);
  await expect(matches).toHaveAttribute("aria-busy", "false");
  await expect(cuts.getByRole("button", { name: /Organizations|組織との関わり/ })).toBeVisible();
  await expect(cuts.getByRole("button", { name: /Making works|作品づくり/ })).toHaveCount(0);
  await dialog.locator('[data-theme="manga"]').click(); await expect(matches).toHaveAttribute("aria-busy", "false");
  const making = cuts.getByRole("button", { name: /Making works|作品づくり/ }), influence = cuts.getByRole("button", { name: /Influences|影響のつながり/ });
  await making.click(); await influence.click(); await expect(matches).toHaveAttribute("aria-busy", "false");
  await expect(making).toHaveAttribute("aria-pressed", "true"); await expect(influence).toHaveAttribute("aria-pressed", "true");
  await making.click();
  await expect(making).toHaveAttribute("aria-pressed", "false"); await expect(matches).toHaveAttribute("aria-busy", "false");
  const keyword = dialog.getByTestId("discovery-keyword"), results = dialog.getByTestId("discovery-results");
  expect(await keyword.evaluate(el => !!el.nextElementSibling?.querySelector("h3"))).toBe(true);
  await dialog.getByLabel(en ? "Name or alias" : "名前・別名", { exact: true }).fill("浦沢");
  await expect(matches).toHaveAttribute("aria-busy", "false"); await expect(results.locator("ul > li")).toHaveCount(1);
  await page.screenshot({ path: info.outputPath(`play-${locale}-${width}.png`) });
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await results.getByRole("button", { name: /^浦沢直樹 —/ }).click(); await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/explore/${urasawa}\\?s=`));
  await expect.poll(async () => new URL(page.url()).searchParams.has("s")).toBe(true);
  const saved = decodeExploration(new URL(page.url()).searchParams.get("s")!, urasawa, "public-kg");
  expect(saved.conditions.predicates).toEqual(["INFLUENCED_BY"]);
  await expect(page.getByTestId("exploration-root")).toContainText("浦沢直樹");
  await page.reload(); await expect(page.getByTestId("exploration-root")).toContainText("浦沢直樹");
  expect(decodeExploration(new URL(page.url()).searchParams.get("s")!, urasawa, "public-kg").conditions.predicates).toEqual(["INFLUENCED_BY"]);
  expect(errors).toEqual([]); await context.close();
});

test("切り口解除で戻れる／通信失敗とreduced-motion／IME入力", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("plunode:privacy:v1", '{"analytics":false,"ads":false}'));
  await page.goto(info.project.use.baseURL! + "/"); await page.getByTestId("discovery-search-entry").click();
  await page.getByRole("tab", { name: "一覧・条件から", exact: true }).click();
  const dialog = page.getByRole("dialog"), matches = dialog.locator("section[aria-busy]");
  await expect(matches).toHaveAttribute("aria-busy", "false");
  await dialog.locator('[data-theme="manga"]').click(); await expect(matches).toHaveAttribute("aria-busy", "false");
  expect(await dialog.locator('[data-theme="manga"]').evaluate(el => getComputedStyle(el).transitionDuration)).toBe("0s");
  await dialog.locator('[data-theme="manga"]').click(); await expect(matches).toHaveAttribute("aria-busy", "false");
  await expect(dialog.locator('[data-theme="manga"]')).toHaveAttribute("aria-pressed", "false");
  const input = dialog.getByLabel("名前・別名", { exact: true });
  const requests: string[] = []; page.on("request", request => { if (request.url().includes("/api/discovery/entities")) requests.push(request.url()); });
  await input.dispatchEvent("compositionstart"); await input.fill("PLUTO");
  await page.waitForTimeout(400); expect(requests).toHaveLength(0);
  await input.dispatchEvent("compositionend"); await expect(matches).toHaveAttribute("aria-busy", "false");
  await expect(dialog.getByRole("button", { name: /^PLUTO —/ })).toHaveCount(1);
  await page.route("**/api/discovery/entities**", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "DATABASE_UNAVAILABLE", message: "検索を取得できません。" } }) }));
  await input.fill("missing"); await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.locator("[data-testid=discovery-results] > [inert]")).toHaveCount(1);
  await page.unroute("**/api/discovery/entities**"); await dialog.getByRole("button", { name: "検索をやり直す", exact: true }).click();
  await expect(matches).toHaveAttribute("aria-busy", "false"); await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("complementary").getByRole("button", { name: "条件をクリア", exact: true }).click(); await expect(matches).toHaveAttribute("aria-busy", "false");
  await expect(dialog.locator("ul > li")).toHaveCount(20);
});

test("実データのテーマ・関係OR・scope別cursorが検索できる", async ({ request }, info) => {
  const url = info.project.use.baseURL! + "/api/discovery/entities";
  const manga = await (await request.get(url, { params: { theme: "manga" } })).json();
  expect(manga.total).toBeGreaterThan(10); expect(manga.facets.some((f: { predicate: string }) => f.predicate === "INFLUENCED_BY")).toBe(true);
  const influences = await (await request.get(url, { params: { theme: "manga", predicates: "INFLUENCED_BY" } })).json();
  expect(influences.items.map((e: { name: string }) => e.name).sort()).toEqual(["手塚治虫", "浦沢直樹"]);
  const both = await (await request.get(url, { params: { theme: "manga", predicates: "INFLUENCED_BY,CONTRIBUTED_TO" } })).json();
  expect(both.total).toBeGreaterThan(influences.total);
  const all = await (await request.get(url)).json();
  const invalid: Record<string, string>[] = [{ theme: "manga", after: all.nextCursor }, { predicates: "INFLUENCED_BY", after: all.nextCursor }, { theme: "fiction" }, { predicates: "WRITTEN_BY" }];
  for (const params of invalid) expect((await request.get(url, { params })).status()).toBe(400);
});

test("既存Graphから切り口を引継いで移動し、直前の配置と枝へ戻れる", async ({ page }, info) => {
  const pluto = "2b7c6289-d050-4dc0-93e3-9307681253cc";
  await page.addInitScript(() => localStorage.setItem("plunode:privacy:v1", '{"analytics":false,"ads":false}'));
  await page.goto(info.project.use.baseURL! + `/explore/${pluto}`);
  const canvas = page.getByTestId("graph-canvas");
  const snapshot = () => canvas.evaluate(el => {
    const cy = (el as unknown as { _cyreg?: { cy: import("cytoscape").Core } })._cyreg?.cy;
    if (!cy) return { points: {}, edges: [], zoom: 0 };
    return { points: Object.fromEntries(cy.nodes().map(n => [n.id(), n.position()])), edges: cy.edges().map(e => e.id()).sort(), zoom: cy.zoom() };
  });
  await expect.poll(async () => Object.keys((await snapshot()).points).length).toBe(4);
  await canvas.evaluate(el => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    const node = cy.nodes().first(); node.position({ x: node.position("x") + 73, y: node.position("y") - 29 }); cy.emit("dragfree");
  });
  const before = await snapshot();
  await page.locator("#explorer-search").getByRole("button", { name: "つながりを見つける", exact: true }).click();
  await page.getByRole("tab", { name: "一覧・条件から", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("discovery-cuts").getByRole("button", { name: "影響のつながり", exact: true }).click();
  await dialog.getByLabel("名前・別名", { exact: true }).fill("浦沢");
  await dialog.getByRole("button", { name: /^浦沢直樹 —/ }).click();
  await expect(page.getByTestId("exploration-root")).toContainText("浦沢直樹");
  await expect.poll(async () => Object.keys((await snapshot()).points).length).toBe(2);
  await expect(page).toHaveURL(new RegExp(`/explore/${urasawa}\\?s=`));
  expect(decodeExploration(new URL(page.url()).searchParams.get("s")!, urasawa, "public-kg").conditions.predicates).toEqual(["INFLUENCED_BY"]);
  await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click();
  await expect(page.getByTestId("exploration-root")).toContainText("PLUTO");
  await expect.poll(async () => Object.keys((await snapshot()).points).length).toBe(4);
  const after = await snapshot(); expect(after.edges).toEqual(before.edges); expect(after.zoom).toBeCloseTo(before.zoom, 2);
  for (const [id, p] of Object.entries(before.points)) { expect(after.points[id].x).toBeCloseTo(p.x, 0); expect(after.points[id].y).toBeCloseTo(p.y, 0); }
});
