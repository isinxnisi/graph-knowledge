import { test, expect, type Page } from "@playwright/test";
import type { Core } from "cytoscape";
const pluto = "2b7c6289-d050-4dc0-93e3-9307681253cc";
const view = (page: Page) => page.getByTestId("graph-canvas").evaluate(el => {
  const cy = (el as unknown as { _cyreg?: { cy: Core } })._cyreg?.cy;
  if (!cy) return { points: {}, edges: [], zoom: 0, pan: { x: 0, y: 0 } };
  return { points: Object.fromEntries(cy.nodes().map(n => [n.id(), n.position()])), edges: cy.edges().map(e => e.id()).sort(), zoom: cy.zoom(), pan: cy.pan() };
});
for (const locale of ["ja", "en"]) for (const width of [1440, 390, 320]) test(`${locale} ${width}px 空欄・一覧・候補→Graphと閉じる／Back`, async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width, height: 800 }, isMobile: width < 800, hasTouch: width < 800 });
  await context.addInitScript(() => localStorage.setItem("plunode:privacy:v1", '{"analytics":false,"ads":false}'));
  const page = await context.newPage(), errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const en = locale === "en", base = info.project.use.baseURL!, root = en ? "/en" : "/";
  await page.goto(base + root); await page.getByTestId("discovery-search-entry").click();
  await page.getByRole("tab", { name: en ? "Browse & refine" : "一覧・条件から", exact: true }).click();
  const dialog = page.getByRole("dialog"), name = en ? "Name or alias" : "名前・別名";
  await expect(dialog).toBeVisible(); await expect(dialog.getByLabel(name, { exact: true })).toHaveValue("");
  const results = dialog.locator("ul > li > button"); await expect(results).toHaveCount(20);
  const firstPage = await results.first().getAttribute("aria-label");
  await dialog.getByRole("button", { name: en ? "Next 20" : "次の20件", exact: true }).click();
  await expect(results).toHaveCount(20); await expect(results.first()).not.toHaveAttribute("aria-label", firstPage!);
  await dialog.getByRole("button", { name: en ? "Previous 20" : "前の20件", exact: true }).click();
  await expect(results.first()).toHaveAttribute("aria-label", firstPage!);
  await dialog.getByRole("button", { name: en ? "Around PLUTO" : "PLUTOの周辺", exact: true }).click();
  await expect(results).toHaveCount(4);
  await dialog.getByRole("button", { name: en ? "Work" : "作品", exact: true }).click(); await expect(results).toHaveCount(1);
  await dialog.getByLabel(name, { exact: true }).fill("該当なし__");
  await expect(dialog).toContainText(en ? "No registered entities match" : "この条件に一致する登録対象はありません");
  await dialog.getByRole("complementary").getByRole("button", { name: en ? "Clear filters" : "条件をクリア", exact: true }).click(); await expect(results).toHaveCount(20);
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath(`search-${locale}-${width}.png`) });
  // Browser Back closes just this search, retaining Home and its route.
  await page.goBack(); await expect(dialog).toHaveCount(0); await expect(page).toHaveURL(base + root);
  await page.goForward(); await expect(dialog).toBeVisible(); await expect(results).toHaveCount(20);
  await dialog.getByRole("button", { name: en ? "Close search" : "検索を閉じる", exact: true }).click(); await expect(dialog).toHaveCount(0); await expect(page).toHaveURL(base + root);
  if (width < 800) await page.getByRole("navigation", { name: en ? "Explorer panels" : "探索画面の切り替え" }).getByRole("button", { name: en ? "Search" : "検索", exact: true }).click();
  const pane = page.locator("#explorer-search"), paneInput = pane.getByLabel(name, { exact: true }), kindSelect = pane.locator("#search-kind");
  const discover = pane.getByRole("button", { name: en ? "Discover connections" : "つながりを見つける", exact: true });
  await expect(kindSelect).toBeHidden(); await expect(kindSelect).toBeDisabled();
  await expect(pane.locator('[data-discovery-launch="list"]')).toHaveCount(0);
  await paneInput.focus(); await page.keyboard.press("Tab"); await expect(discover).toBeFocused();
  await page.screenshot({ path: info.outputPath(`pane-empty-${locale}-${width}.png`) });
  await discover.click();
  await expect(dialog.getByRole("tab", { name: en ? "Existing connections" : "今ある接点から", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("tab", { name: en ? "Browse & refine" : "一覧・条件から", exact: true })).toBeVisible();
  await page.goBack(); await expect(dialog).toHaveCount(0); await expect(discover).toBeFocused();
  await page.goForward(); await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: en ? "Existing connections" : "今ある接点から", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(discover).toBeFocused();
  await paneInput.fill("PLUTO");
  await expect(pane.getByRole("button", { name: /^PLUTO —/ })).toBeVisible();
  // Carry the existing name and kind into the wider search without a new input step.
  await expect(kindSelect).toBeVisible(); await kindSelect.selectOption("work");
  await expect(pane.getByRole("button", { name: /^PLUTO —/ })).toBeVisible();
  await pane.getByRole("button", { name: en ? "Search by name" : "名前で検索", exact: true }).click();
  await expect(pane.getByRole("button", { name: /^PLUTO —/ })).toBeVisible();
  await page.screenshot({ path: info.outputPath(`pane-name-${locale}-${width}.png`) });
  await pane.getByRole("button", { name: en ? "See all results" : "すべての結果を見る", exact: true }).click();
  await expect(dialog.getByLabel(name, { exact: true })).toHaveValue("PLUTO");
  await expect(dialog.getByRole("button", { name: en ? "Work" : "作品", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: en ? "JA" : "EN", exact: true }).click();
  await expect(dialog.getByLabel(en ? "名前・別名" : "Name or alias", { exact: true })).toHaveValue("PLUTO");
  await dialog.getByRole("button", { name: locale.toUpperCase(), exact: true }).click();
  await dialog.getByRole("button", { name: /^PLUTO —/ }).click();
  await expect(dialog).toHaveCount(0); await expect.poll(async () => Object.keys((await view(page)).points).length).toBe(4);
  await expect(page).toHaveURL(new RegExp(`/explore/${pluto}\\?s=`));
  const before = await view(page);
  if (width < 800) await page.getByRole("navigation", { name: en ? "Explorer panels" : "探索画面の切り替え" }).getByRole("button", { name: en ? "Search" : "検索", exact: true }).click();
  await paneInput.fill(" 　");
  await expect(kindSelect).toBeHidden(); await expect(kindSelect).toBeDisabled(); await expect(kindSelect).toHaveValue("");
  await expect(pane.getByRole("alert")).toHaveCount(0); await expect(pane.locator("#entity-suggestions")).toHaveCount(0);
  await discover.click();
  await expect(dialog.getByRole("tab", { name: en ? "Existing connections" : "今ある接点から", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(dialog).toBeVisible(); await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); expect(await view(page)).toEqual(before);
  await paneInput.fill("浦沢"); await expect(kindSelect).toHaveValue("");
  await expect(pane.getByRole("button", { name: /^浦沢直樹 —/ })).toBeVisible();
  await pane.getByRole("button", { name: /^浦沢直樹 —/ }).click();
  await expect(page.getByTestId("exploration-root")).toContainText("浦沢直樹");
  await expect.poll(async () => Object.keys((await view(page)).points).length).toBeGreaterThan(4);
  await page.getByRole("link", { name: en ? "Plunode Home" : "Plunode ホーム", exact: true }).click(); await expect(page.getByTestId("discovery-home")).toBeVisible();
  await page.goBack(); await expect.poll(async () => Object.keys((await view(page)).points).length).toBeGreaterThan(4);
  const saved = await view(page); await page.reload(); await expect.poll(async () => Object.keys((await view(page)).points).length).toBe(Object.keys(saved.points).length);
  expect((await view(page)).edges).toEqual(saved.edges); expect((await view(page)).zoom).toBeCloseTo(saved.zoom, 2);
  expect(errors).toEqual([]); await context.close();
});

test("Discovery APIは空欄・ページ条件・公開境界を守る", async ({ request }, info) => {
  const url = info.project.use.baseURL! + "/api/discovery/entities";
  const first = await (await request.get(url)).json(); expect(first.items).toHaveLength(20);
  const second = await (await request.get(url, { params: { after: first.nextCursor } })).json();
  expect(second.items.some((e: { id: string }) => first.items.some((x: { id: string }) => x.id === e.id))).toBe(false);
  const invalid: Record<string, string>[] = [{ after: first.nextCursor, kind: "work" }, { after: "invalid" }, { tag: "manga" }, { q: "x".repeat(101) }];
  for (const params of invalid) expect((await request.get(url, { params })).status()).toBe(400);
  const works = await (await request.get(url, { params: { kind: "work" } })).json(); expect(works.items.every((e: { kind: string }) => e.kind === "work")).toBe(true);
  expect((await request.post(url)).status()).toBe(405);
  // TLS routing rejects an ads Host on a beta SNI. Test the actual HTTPS origin instead.
  expect((await request.get(new URL(url).protocol === "https:" ? "https://ads.plunode.net/api/discovery/entities" : url,
    new URL(url).protocol === "https:" ? {} : { headers: { host: "ads.plunode.net" } })).status()).toBe(404);
});


test("検索ペインのIME・消去中の遅い応答・動きを減らす設定", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("plunode:privacy:v1", '{"analytics":false,"ads":false}'));
  await page.goto(info.project.use.baseURL! + "/");
  await page.getByRole("navigation", { name: "探索画面の切り替え" }).getByRole("button", { name: "検索", exact: true }).click();
  const pane = page.locator("#explorer-search"), input = pane.locator("#entity-search"), discover = pane.getByRole("button", { name: "つながりを見つける", exact: true });
  const requests: string[] = []; page.on("request", r => { if (new URL(r.url()).pathname === "/api/entities") requests.push(r.url()); });
  await input.dispatchEvent("compositionstart"); await discover.click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  await input.fill("PLUTO"); await page.waitForTimeout(350); expect(requests).toHaveLength(0);
  await expect(pane.locator('[data-visible="true"]')).toHaveCSS("transition-duration", "0s");
  await page.route("**/api/entities?**", async route => { const response = await route.fetch(); await new Promise(r => setTimeout(r, 600)); await route.fulfill({ response }).catch(() => {}); });
  const pending = page.waitForRequest(r => new URL(r.url()).pathname === "/api/entities");
  await input.dispatchEvent("compositionend"); await pending;
  await input.fill(""); await expect(discover).toBeEnabled(); await expect(pane.locator("#search-kind")).toBeHidden();
  await page.waitForTimeout(700); await expect(pane.locator("#entity-suggestions")).toHaveCount(0); await expect(pane.getByRole("alert")).toHaveCount(0);
  expect(requests).toHaveLength(1); await page.unroute("**/api/entities?**");
  await discover.click(); await expect(page.getByRole("tab", { name: "今ある接点から", exact: true })).toHaveAttribute("aria-selected", "true");
});
