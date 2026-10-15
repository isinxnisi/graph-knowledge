import { test, expect, type Page } from "@playwright/test";
import type { Core } from "cytoscape";
const snapshot = (page: Page) => page.getByTestId("graph-canvas").evaluate(el => {
  const cy = (el as unknown as { _cyreg?: { cy: Core } })._cyreg?.cy;
  if (!cy) return { points: {} as Record<string, { x: number; y: number }>, edges: [] as string[], zoom: 0 };
  return { points: Object.fromEntries(cy.nodes().map(n => [n.id(), n.position()])), edges: cy.edges().map(e => e.id()).sort(), zoom: cy.zoom() };
});
for (const locale of ["ja", "en"]) for (const width of [1440, 390, 320]) test(`${locale} ${width}px: ヘッダー・共通フッターから任意支援へ進み、探索へ戻れる`, async ({ browser }, info) => {
  const en = locale === "en", label = en ? "Support Plunode" : "Plunodeを支援する";
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 800, hasTouch: width < 800 });
  await context.addInitScript(locale => { localStorage.setItem("graph-knowledge.ui-locale.v1", locale); localStorage.setItem("plunode:privacy:v1", '{"analytics":false,"ads":false}'); }, locale);
  const page = await context.newPage(); const paymentRequests: { url: string; referer?: string }[] = [];
  await context.route("https://buymeacoffee.com/**", async route => {
    const headers = await route.request().allHeaders(); paymentRequests.push({ url: route.request().url(), referer: headers.referer });
    await route.fulfill({ contentType: "text/html", body: "<title>External support page fixture</title><p>Buy Me a Coffee</p>" });
  });
  try {
    await page.goto(info.project.use.baseURL!);
    const header = page.getByTestId("site-header"), footer = page.getByTestId("site-footer");
    if (width < 800) expect((await header.boundingBox())!.height).toBeLessThanOrEqual(56);
    await page.getByRole("button", { name: en ? "Explore from PLUTO" : "PLUTOから探索を開始", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toContainText("Entity 4");
    await page.getByTestId("graph-canvas").evaluate(el => {
      const cy = (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy;
      cy.nodes().filter(n => n.data("label") === "浦沢直樹").first().emit("tap");
    });
    await expect.poll(async () => Object.keys((await snapshot(page)).points).length).toBe(12);
    await page.getByTestId("graph-canvas").evaluate(el => {
      const cy = (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy;
      cy.nodes().first().shift({ x: 73, y: -29 }); cy.zoom(.7); cy.emit("dragfree");
    });
    const before = await snapshot(page);
    expect(await footer.evaluate(el => !!el.closest("#explorer-graph"))).toBe(false);
    await expect(page.getByTestId("public-services").locator("footer")).toHaveCount(0);
    if (width < 800) await header.getByLabel(en ? "Display settings" : "表示設定", { exact: true }).click();
    await header.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(/\/support$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(en ? "Help Plunode grow" : "Plunodeの開発を支える");
    await expect(page.locator("main")).toHaveAttribute("lang", locale);
    await expect(page.locator("main")).toContainText(en ? "Support is optional" : "支援は任意です");
    expect(paymentRequests).toHaveLength(0); expect(page.frames()).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const action = page.locator("main").getByRole("link", { name: en ? "Support on Buy Me a Coffee" : "Buy Me a Coffeeで支援する", exact: true });
    await expect(action).toHaveAttribute("href", "https://buymeacoffee.com/plunode");
    await expect(action).toHaveAttribute("rel", "noopener noreferrer");
    await action.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`support-${locale}-${width}.png`), fullPage: true });
    const popupPromise = context.waitForEvent("page"); await action.click(); const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded"); expect(popup.url()).toBe("https://buymeacoffee.com/plunode");
    expect(paymentRequests).toEqual([{ url: "https://buymeacoffee.com/plunode", referer: undefined }]);
    expect(page.url()).toMatch(/\/support$/); await popup.close();
    await header.getByRole("link", { name: en ? "Back to exploration" : "探索へ戻る", exact: true }).click();
    await expect.poll(async () => Object.keys((await snapshot(page)).points).length).toBe(12);
    const after = await snapshot(page); expect(after.edges).toEqual(before.edges); expect(after.zoom).toBeCloseTo(before.zoom, 2);
    for (const [id, p] of Object.entries(before.points)) { expect(after.points[id].x).toBeCloseTo(p.x, 0); expect(after.points[id].y).toBeCloseTo(p.y, 0); }
    await footer.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(/\/support$/); expect(context.pages()).toHaveLength(1);
  } finally { await context.close(); }
});
test("支援ページの公開meta・sitemapと広告originの分離", async ({ request }, info) => {
  const base = info.project.use.baseURL!;
  const formal = await request.get(base + "/support", { headers: { host: "plunode.net" } });
  expect(formal.status()).toBe(200); const html = await formal.text();
  expect(html).toContain('name="robots" content="index, follow');
  expect(html).toContain('rel="canonical" href="https://plunode.net/support"');
  expect(html).toContain("https://buymeacoffee.com/plunode");
  expect(await (await request.get(base + "/support")).text()).toContain('name="robots" content="noindex');
  expect(await (await request.get(base + "/sitemap.xml", { headers: { host: "plunode.net" } })).text()).toContain("https://plunode.net/support");
  expect((await request.get(base + "/support", { headers: { host: "ads.plunode.net" } })).status()).toBe(404);
});
