import { test, expect, type Page } from "@playwright/test";
import type { Core } from "cytoscape";
const pluto = "2b7c6289-d050-4dc0-93e3-9307681253cc";
const formal = { host: "plunode.net" };
const snapshot = (page: Page) => page.getByTestId("graph-canvas").evaluate(el => {
  const cy = (el as unknown as { _cyreg?: { cy: Core } })._cyreg?.cy;
  return cy ? { points: Object.fromEntries(cy.nodes().map(n => [n.id(), n.position()])), edges: cy.edges().map(e => e.id()).sort(), zoom: cy.zoom() } : { points: {}, edges: [], zoom: 0 };
});
test("公開日英のSSR本文・自己canonical・相互言語リンク・公開境界", async ({ request }, info) => {
  const base = info.project.use.baseURL!;
  for (const [prefix, locale] of [["", "ja"], ["/en", "en"]]) for (const path of ["", `/explore/${pluto}`, "/support", "/privacy"]) {
    const url = prefix + path || "/";
    const response = await request.get(base + url, { headers: formal }); expect(response.status(), url).toBe(200);
    const html = await response.text();
    expect(html).toMatch(new RegExp(`<html[^>]*lang="${locale}"`));
    expect(html).toContain(`rel="canonical" href="https://plunode.net${url === "/" ? "" : url}"`);
    expect(html).toContain('hrefLang="en"'); expect(html).toContain('hrefLang="ja"');
    expect(html).toContain('name="robots" content="index, follow');
    if (path.startsWith("/explore")) { expect(html).toContain('data-testid="public-discovery"'); expect(html).toContain("PLUTO"); expect(html).toContain("浦沢直樹"); expect(html).toContain(locale === "en" ? "Sources for these records" : "この記録の出典"); }
    if (!path) { expect(html).toContain('data-testid="discovery-home"'); expect(html).not.toContain('data-testid="public-discovery"'); expect(html).toContain('data-testid="featured-credit"'); }
    if (prefix && !path) expect(html).toContain("Public exploration is free and does not require an account");
    const stateful = await (await request.get(base + url + "?s=PRIVATE_GRAPH&secret=PRIVATE", { headers: formal })).text();
    if (!path || path.startsWith("/explore")) { expect(stateful).toContain('name="robots" content="noindex'); expect(stateful).not.toMatch(/property="og:[^"]+" content="[^"]*PRIVATE/); }
  }
  const xml = await (await request.get(base + "/sitemap.xml", { headers: formal })).text();
  expect(xml).toContain(`https://plunode.net/en/explore/${pluto}`); expect(xml).toContain("https://plunode.net/en/support"); expect(xml).not.toContain("?s="); expect(xml).not.toContain("/member");
  expect(await (await request.get(base + "/en", { headers: { host: "graph-beta.isinxnisi.com" } })).text()).toContain('name="robots" content="noindex');
  for (const path of ["/en/member", "/en/shared", "/en/api/member/profile", "/en/explore/not-a-uuid", "/en/explore/00000000-0000-4000-8000-000000000000"]) expect((await request.get(base + path, { headers: formal })).status()).toBe(404);
  expect((await request.get(base + "/en", { headers: { host: "ads.plunode.net" } })).status()).toBe(404);
  expect((await request.get(base + "/api/member/capsules")).status()).toBe(401);
});
test("JSなしでも英語の紹介・関係・出典を読み、実在する対象へ進める", async ({ browser }, info) => {
  const context = await browser.newContext({ javaScriptEnabled: false }); const page = await context.newPage();
  await page.goto(info.project.use.baseURL! + "/en");
  await expect(page.getByTestId("discovery-home")).toContainText("interactive knowledge graph");
  await expect(page.getByTestId("public-discovery")).toHaveCount(0);
  await expect(page.getByTestId("discovery-featured")).toHaveCSS("transform", "none");
  await page.getByTestId("discovery-featured").click();
  await expect(page).toHaveURL(new RegExp(`/en/explore/${pluto}$`));
  const overview = page.getByTestId("public-discovery"); await expect(overview).toContainText("Sources for these records");
  expect(await overview.locator('a[target="_blank"]').count()).toBeGreaterThan(0);
  const related = overview.locator('a[href^="/en/explore/"]').filter({ hasText: "浦沢直樹" }).first();
  await related.click(); await expect(overview).toContainText("浦沢直樹"); await expect(overview).toContainText("Sources for these records");
  await context.close();
});
test("OG画像とfaviconが実画像を返し、メタ情報は対象・言語に一致する", async ({ request }, info) => {
  const base = info.project.use.baseURL!;
  for (const path of ["/opengraph-image", "/en/opengraph-image", `/explore/${pluto}/opengraph-image`, `/en/explore/${pluto}/opengraph-image`]) {
    const response = await request.get(base + path); expect(response.status(), path).toBe(200); expect(response.headers()["content-type"]).toContain("image/png");
    const body = await response.body(); expect(body.readUInt32BE(16)).toBe(1200); expect(body.readUInt32BE(20)).toBe(630);
  }
  for (const userAgent of ["Twitterbot", "facebookexternalhit/1.1", "Googlebot"]) {
    const crawler = await (await request.get(base + `/en/explore/${pluto}`, { headers: { ...formal, "user-agent": userAgent } })).text();
    expect(crawler.split("</head>")[0]).toContain(`content="https://plunode.net/en/explore/${pluto}/opengraph-image"`);
  }
  for (const path of ["/favicon.ico", "/icon.svg", "/apple-icon.png"]) { const response = await request.get(base + path); expect(response.status()).toBe(200); expect(response.headers()["content-type"]).toMatch(/image\//); }
  const html = await (await request.get(base + `/en/explore/${pluto}`, { headers: formal })).text();
  expect(html).toContain(`content="https://plunode.net/en/explore/${pluto}/opengraph-image"`); expect(html).toContain("PLUTO — Connections and sources | Plunode"); expect(html).toContain("summary_large_image");
  expect((await request.get(base + "/en/explore/00000000-0000-4000-8000-000000000000/opengraph-image")).status()).toBe(404);
});
for (const width of [1440, 390, 320]) test(`${width}px 英語の検索入口→Graph展開→支援・会員往復→URL復元`, async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 800, hasTouch: width < 800 });
  await context.addInitScript(() => { if (localStorage.getItem("graph-knowledge.ui-locale.v1") === null) localStorage.setItem("graph-knowledge.ui-locale.v1", "ja"); localStorage.setItem("plunode:privacy:v1", '{"analytics":false,"ads":false}'); });
  const page = await context.newPage(), errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(info.project.use.baseURL! + `/en/explore/${pluto}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect.poll(async () => Object.keys((await snapshot(page)).points).length).toBe(4);
  await page.getByTestId("graph-canvas").evaluate(el => { const cy = (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy; cy.nodes().filter(n => n.data("label") === "浦沢直樹").first().emit("tap"); });
  await expect.poll(async () => Object.keys((await snapshot(page)).points).length).toBe(12);
  await page.getByTestId("graph-canvas").evaluate(el => { const cy = (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy; cy.nodes().first().shift({ x: 60, y: -30 }); cy.zoom(.7); cy.emit("dragfree"); });
  await expect(page).toHaveURL(new RegExp(`/en/explore/${pluto}\\?s=`)); const before = await snapshot(page);
  const header = page.getByTestId("site-header");
  if (width < 800) { expect((await header.boundingBox())!.height).toBeLessThanOrEqual(56); await header.getByLabel("Display settings", { exact: true }).click(); }
  await header.getByRole("link", { name: "Support Plunode", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/support$/); await expect(page.getByRole("heading", { level: 1 })).toHaveText("Help Plunode grow");
  await expect(page.locator('a[href="https://buymeacoffee.com/plunode"]')).toHaveAttribute("rel", "noopener noreferrer");
  await header.getByRole("link", { name: "Back to exploration", exact: true }).click();
  await expect.poll(async () => Object.keys((await snapshot(page)).points).length).toBe(12); const after = await snapshot(page);
  expect(after.edges).toEqual(before.edges); expect(after.zoom).toBeCloseTo(before.zoom,2);
  for(const [id,p] of Object.entries(before.points)){expect(after.points[id].x).toBeCloseTo(p.x,0);expect(after.points[id].y).toBeCloseTo(p.y,0);}
  await header.getByRole("link", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/member$/); await expect(page.getByRole("heading", { level: 1 })).toHaveText("Save knowledge to revisit");
  await expect(page.locator("main")).toHaveAttribute("lang", "en");
  await header.getByRole("link", { name: "Back to exploration", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/en/explore/${pluto}\\?s=`));
  await expect.poll(async () => Object.keys((await snapshot(page)).points).length).toBe(12);
  await page.reload(); await expect.poll(async () => Object.keys((await snapshot(page)).points).length).toBe(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
  await page.getByTestId("public-discovery").scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`discovery-en-${width}.png`), fullPage: true });
  await header.getByLabel("Display settings", { exact: true }).click();
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("ja");
  await expect(page).toHaveURL(new RegExp(`/explore/${pluto}\\?s=`)); await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect.poll(async () => Object.keys((await snapshot(page)).points).length).toBe(12);
  const japanese = await snapshot(page); expect(japanese.zoom).toBeCloseTo(before.zoom, 2); expect(japanese.edges).toEqual(before.edges);
  await context.close();
});
