import { test, expect, type Page } from "@playwright/test";
import type { Core } from "cytoscape";
import { privacyKey } from "../../lib/client/privacy-preferences";
import { AD_ORIGIN, PUBLIC_ORIGIN } from "../../lib/domain/publication";
import http from "node:http";

async function formalProxy(page: Page, base: string) {
  const handler: Parameters<Page["route"]>[1] = async route => {
    const request = route.request();
    const destination = request.resourceType() === "document" ? (request.frame().parentFrame() ? "iframe" : "document") : "empty";
    // Keep the real browser origin and Fetch Metadata; no product auth bypass.
    const target = new URL(request.url());
    const headers = { ...await request.allHeaders(), host: target.hostname, "sec-fetch-dest": destination, "accept-encoding": "identity" };
    try {
      const response = await new Promise<{ status: number; headers: Record<string, string>; body: Buffer }>((resolve, reject) => {
        const outgoing = http.request(base + target.pathname + target.search, { method: request.method(), headers }, incoming => {
          const parts: Buffer[] = []; incoming.on("data", part => parts.push(part)); incoming.on("error", reject);
          incoming.on("end", () => resolve({ status: incoming.statusCode!, headers: Object.fromEntries(Object.entries(incoming.headers).filter(([key]) => !["transfer-encoding", "content-length", "connection"].includes(key)).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value ?? ""])), body: Buffer.concat(parts) }));
        });
        outgoing.setTimeout(15000, () => outgoing.destroy(new Error("Public-origin test proxy timeout"))); outgoing.on("error", reject); outgoing.end(request.postDataBuffer() ?? undefined);
      });
      await route.fulfill(response);
    } catch (error) { if (!page.isClosed() && !/closed|aborted|handled/i.test(String(error))) throw error; }
  };
  await page.route(PUBLIC_ORIGIN + "/**", handler); await page.route(AD_ORIGIN + "/**", handler);
}
const view = (page: Page) => page.getByTestId("graph-canvas").evaluate(el => {
  const cy = (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy;
  return { positions: Object.fromEntries(cy.nodes().map(n => [n.id(), n.position()])), edges: cy.edges().map(e => e.id()).sort(), zoom: cy.zoom() };
});

test("正式／previewのindex制御・sitemap・匿名の会員保護", async ({ request }, info) => {
  const base = info.project.use.baseURL!;
  const formal = { host: "plunode.net" };
  const root = await request.get(base + "/", { headers: formal });
  expect(await root.text()).toContain('name="robots" content="index, follow');
  expect(await root.text()).toMatch(/rel="canonical" href="https:\/\/plunode\.net\/?"/);
  expect(await (await request.get(base + "/?s=invalid&name=SECRET", { headers: formal })).text()).toContain('name="robots" content="noindex');
  const preview = await request.get(base + "/");
  expect(await preview.text()).toContain('name="robots" content="noindex');
  expect(await (await request.get(base + "/robots.txt")).text()).toContain("Disallow: /");
  const robots = await (await request.get(base + "/robots.txt", { headers: formal })).text();
  expect(robots).toContain("Disallow: /member"); expect(robots).toContain("Sitemap: https://plunode.net/sitemap.xml");
  const sitemap = await (await request.get(base + "/sitemap.xml", { headers: formal })).text();
  expect((sitemap.match(/<loc>/g) ?? []).length).toBeGreaterThan(1000);
  expect(sitemap).not.toMatch(/\?s=|\/member|\/shared|token=/);
  const entity = sitemap.match(/https:\/\/plunode.net\/explore\/[0-9a-f-]{36}/)![0].replace(PUBLIC_ORIGIN, "");
  const entityPage = await (await request.get(base + entity, { headers: formal })).text();
  expect(entityPage).toContain('name="robots" content="index, follow');
  expect(await (await request.get(base + entity + "?s=invalid", { headers: formal })).text()).toContain('name="robots" content="noindex');
  for (const path of ["/api/member/profile", "/api/member/capsules", "/api/member/capsules/10000000-0000-4000-8000-000000000001"]) {
    const result = await request.get(base + path, { headers: formal }); expect(result.status()).toBe(401); expect(result.headers()["x-robots-tag"]).toContain("noindex");
  }
  for (const path of ["/member", "/shared"]) expect((await request.get(base + path, { headers: formal })).headers()["x-robots-tag"]).toContain("noindex");
  expect((await request.get(base + "/integrations/analytics")).status()).toBe(404);
  for (const path of ["/", "/member", "/api/member/profile", "/api/entities"]) expect((await request.get(base + path, { headers: { host: "ads.plunode.net" } })).status()).toBe(404);
  expect((await request.get(base + "/integrations/analytics?s=SECRET", { headers: { ...formal, "sec-fetch-dest": "iframe" } })).status()).toBe(404);
  const og = await request.get(base + "/opengraph-image"); expect(og.status()).toBe(200); expect(og.headers()["content-type"]).toContain("image/png");
});

for (const width of [1440, 375, 320]) test(`広告の配信・非配信でGraphを動かさず、適切な寸法と隔離を保つ ${width}px`, async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 800, hasTouch: width < 800 });
  await context.addInitScript(key => localStorage.setItem(key, '{"analytics":true,"ads":true}'), privacyKey);
  const page = await context.newPage(); let filled = false; const tags: string[] = [];
  if (process.env.GRAPH_TEST_AD_BACKEND_URL) await formalProxy(page, process.env.GRAPH_TEST_AD_BACKEND_URL);
  await context.route("https://adm.shinobi.jp/s/**", route => {
    tags.push(route.request().url());
    const [w, h] = width < 800 ? [320, 50] : [728, 90];
    const creative = `<meta charset="utf-8"><body style="margin:0;background:#edf2f5;display:grid;place-items:center;font:14px sans-serif;height:100vh">広告・配置確認</body>`;
    return route.fulfill({ contentType: "application/javascript", body: `document.write('<div id="admax-banner-fixture"></div>');const f=document.createElement('iframe');f.width=${w};f.height=${h};f.style.border='0';document.getElementById('admax-banner-fixture').append(f);const d=f.contentWindow.document;d.open();d.write(${JSON.stringify(filled ? creative : "")});d.close();` });
  });
  await context.route("https://ad.example/**", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: '<meta charset="utf-8"><body style="margin:0;background:#edf2f5;display:grid;place-items:center;font:14px sans-serif;height:100vh">広告・配置確認</body>' }));
  try {
    await page.goto(info.project.use.baseURL!);
    await page.getByRole("button", { name: "PLUTOから探索を開始", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toContainText("Entity 4");
    await expect.poll(() => tags.length).toBe(1);
    const slot = page.locator('[data-testid="public-services"] > [data-device]');
    await expect(slot).toHaveCSS("height", "0px");
    const previous = await view(page);
    const canvasBefore = await page.getByTestId("graph-canvas").boundingBox();
    filled = true;
    await page.getByTitle("広告").evaluate((el: HTMLIFrameElement) => { el.src = el.src; });
    await expect(slot).toHaveAttribute("data-filled", "true");
    expect(await view(page)).toEqual(previous);
    expect(await page.getByTestId("graph-canvas").boundingBox()).toEqual(canvasBefore);
    const frame = page.getByTitle("広告"); const box = await frame.boundingBox();
    expect(box!.width).toBe(width < 800 ? 320 : 728); expect(box!.height).toBe(width < 800 ? 50 : 90);
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    const iframe = page.frames().find(f => f.url().includes("/integrations/ad/"))!;
    expect(await iframe.evaluate(() => { try { return !!parent.document.body; } catch { return false; } })).toBe(false);
    expect(page.frames().some(f => f.url().includes("/integrations/analytics"))).toBe(false);
    expect(tags[0]).toContain(width < 800 ? "93ba1c5c8d797794cf1c721bce01ff42" : "ef4ef4eaf302d0f6b49e5114ad6d5213");
    await slot.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`advertisement-${width}.png`) });
    await expect(slot).toHaveAttribute("data-filled", "true");
    await page.getByRole("button", { name: "計測・広告の設定", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("checkbox", { name: /^広告/ }).uncheck(); await page.getByRole("button", { name: "設定を保存", exact: true }).click();
    await expect(frame).toHaveCount(0);
  } finally { await context.close(); }
});

test("GA4は同意後の公開探索だけ。URL更新・非公開画面へ本文やtokenを送らない", async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(); await formalProxy(page, info.project.use.baseURL!);
  let tagLoads = 0;
  await context.route("https://www.googletagmanager.com/**", route => { tagLoads++; return route.fulfill({ contentType: "application/javascript", body: "window.__commands=window.dataLayer.map(args=>Array.from(args));const old=window.dataLayer.push.bind(window.dataLayer);window.dataLayer.push=function(args){window.__commands.push(Array.from(args));return old(args)}" }); });
  await context.route("https://adm.shinobi.jp/**", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  try {
    await page.goto(PUBLIC_ORIGIN + "/");
    expect(tagLoads).toBe(0); expect(page.frames()).toHaveLength(1);
    await page.getByRole("button", { name: "両方を許可" }).click();
    await expect.poll(() => tagLoads).toBe(1);
    const frame = page.frames().find(f => f.url().includes("/integrations/analytics"))!;
    const commands = () => frame.evaluate(() => (window as unknown as { __commands: unknown[][] }).__commands);
    await expect.poll(async () => (await commands()).filter(c => c[0] === "event" && c[1] === "page_view").length).toBe(1);
    await page.locator('#entity-search').fill("PLUTO");
    await page.getByRole('button', { name: '検索', exact: true }).click();
    await expect.poll(async () => (await commands()).filter(c => c[1] === "search").length).toBe(1);
    await page.getByRole("button", { name: "PLUTOから探索を開始", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toContainText("Entity 4");
    await page.evaluate(() => { history.replaceState(history.state, '', location.pathname + '?s=SECRET&private=PRIVATE#SHARED_TOKEN'); });
    const recorded = await commands();
    expect(recorded.filter(c => c[0] === "event" && c[1] === "page_view")).toHaveLength(1);
    expect(JSON.stringify(recorded)).not.toMatch(/SECRET|PRIVATE|SHARED_TOKEN|PLUTO|search_term/);
    for (const path of ["/member", "/shared#SHARED_TOKEN", "/privacy"]) {
      await page.goto(PUBLIC_ORIGIN + path); expect(page.frames()).toHaveLength(1); expect(tagLoads).toBe(1);
    }
    await page.getByRole("button", { name: "計測・広告の設定", exact: true }).click();
    await page.getByRole("checkbox", { name: /^利用状況/ }).uncheck(); await page.getByRole("button", { name: "設定を保存", exact: true }).click();
    await page.goto(PUBLIC_ORIGIN + "/"); expect(tagLoads).toBe(1);
    const gear = page.getByTestId('site-header').getByLabel('表示設定'); await gear.click();
    await page.getByRole("combobox", { name: "表示言語", exact: true }).selectOption("en");
    await expect(page.getByRole("button", { name: "Analytics & ads settings", exact: true })).toHaveCount(1);
  } finally { await context.close(); }
});
