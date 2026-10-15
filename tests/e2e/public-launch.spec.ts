import { test, expect, type Page } from "@playwright/test";
import type { Core } from "cytoscape";
import { privacyKey } from "../../lib/client/privacy-preferences";
import { AD_ORIGIN, PUBLIC_ORIGIN } from "../../lib/domain/publication";
import http from "node:http";

async function formalProxy(page: Page, base: string, clientIp?: string) {
  const handler: Parameters<Page["route"]>[1] = async route => {
    const request = route.request();
    const destination = request.resourceType() === "document" ? (request.frame().parentFrame() ? "iframe" : "document") : "empty";
    // Keep the real browser origin and Fetch Metadata; no product auth bypass.
    const target = new URL(request.url());
    const headers = { ...await request.allHeaders(), host: target.hostname, "sec-fetch-dest": destination, "accept-encoding": "identity", ...(clientIp ? { "x-forwarded-for": clientIp } : {}) };
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
async function openPrivacySettings(page: Page) {
  const button = page.getByRole("button", { name: "計測・広告の設定", exact: true });
  if (!await button.isVisible()) await page.getByTestId("site-header").getByLabel("表示設定", { exact: true }).click();
  await button.click();
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
    // Real AdMax removes the banner id before rendering; it must not hide filled ads.
    return route.fulfill({ contentType: "application/javascript", body: `document.write('<div id="admax-banner-fixture"></div>');const banner=document.getElementById('admax-banner-fixture');banner.removeAttribute('id');const f=document.createElement('iframe');f.width=${w};f.height=${h};f.style.border='0';banner.append(f);const d=f.contentWindow.document;d.open();d.write(${JSON.stringify(filled ? creative : "")});d.close();` });
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
    const adjacency = await page.getByTestId("adjacency-card").boundingBox();
    expect(box!.y).toBeGreaterThan(canvasBefore!.y + canvasBefore!.height);
    expect(adjacency!.y).toBeGreaterThan(box!.y + box!.height);
    const iframe = page.frames().find(f => f.url().includes("/integrations/ad/"))!;
    expect(await iframe.evaluate(() => { try { return !!parent.document.body; } catch { return false; } })).toBe(false);
    expect(page.frames().some(f => f.url().includes("/integrations/analytics"))).toBe(false);
    expect(tags[0]).toContain(width < 800 ? "93ba1c5c8d797794cf1c721bce01ff42" : "ef4ef4eaf302d0f6b49e5114ad6d5213");
    await slot.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`advertisement-${width}.png`) });
    await expect(slot).toHaveAttribute("data-filled", "true");
    await openPrivacySettings(page);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("checkbox", { name: /^広告/ }).uncheck(); await page.getByRole("button", { name: "設定を保存", exact: true }).click();
    await expect(frame).toHaveCount(0);
    expect(await view(page)).toEqual(previous);
    await page.setViewportSize({ width: width < 800 ? 390 : 1024, height: 900 });
    expect((await view(page)).positions).toEqual(previous.positions);
  } finally { await context.close(); }
});

test("初回の標準広告はGA4を伴わず、狭いPC幅では読込を止め、拒否を再訪でも保つ", async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage(); let ads = 0, metrics = 0;
  await context.route("https://adm.shinobi.jp/**", route => { ads++; return route.fulfill({ contentType: "application/javascript", body: "" }); });
  await context.route("https://www.googletagmanager.com/**", route => { metrics++; return route.abort(); });
  try {
    // Loopback is explicitly allowed for layout testing; country headers are covered separately.
    await page.goto(info.project.use.baseURL!);
    await expect(page.getByTestId("public-services")).toHaveAttribute("data-ad-default", "on");
    await expect.poll(() => ads).toBe(1); expect(metrics).toBe(0);
    expect(await page.evaluate(key => localStorage.getItem(key), privacyKey)).toBeNull();
    expect((await page.getByTitle("広告").boundingBox())!.width).toBe(728);
    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(page.getByTitle("広告")).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByTitle("広告")).toHaveCount(1);
    await openPrivacySettings(page);
    await page.getByRole("checkbox", { name: /^広告/ }).uncheck(); await page.getByRole("button", { name: "設定を保存", exact: true }).click();
    await expect(page.getByTitle("広告")).toHaveCount(0);
    const count = ads; await page.reload();
    await expect(page.getByTestId("public-services")).toHaveAttribute("data-ad-default", "on");
    expect(await page.getByTitle("広告").count()).toBe(0); expect(ads).toBe(count); expect(metrics).toBe(0);
  } finally { await context.close(); }
});

test("本番imageの接続元判定で日本は初回広告、海外・不明は明示許可後、GA4は別", async ({ browser }, info) => {
  test.skip(process.env.GRAPH_TEST_PRODUCTION !== "1", "Production image with a trusted reverse-proxy fixture only");
  for (const ip of ["1.0.16.1", "81.2.69.142", "80.128.0.1", undefined]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage(); let ads = 0, metrics = 0;
    await formalProxy(page, info.project.use.baseURL!, ip);
    await context.route("https://adm.shinobi.jp/**", route => { ads++; return route.fulfill({ contentType: "application/javascript", body: "" }); });
    await context.route("https://www.googletagmanager.com/**", route => { metrics++; return route.abort(); });
    try {
      const response = await page.goto(PUBLIC_ORIGIN + "/");
      expect(response!.headers()["cache-control"]).toContain("no-store");
      await expect(page.getByTestId("public-services")).toHaveAttribute("data-ad-default", ip === "1.0.16.1" ? "on" : "consent");
      if (ip !== "1.0.16.1") { await expect(page.getByRole("button", { name: "広告を許可" })).toBeVisible(); expect(ads).toBe(0); await page.getByRole("button", { name: "広告を許可" }).click(); }
      await expect.poll(() => ads).toBe(1); expect(metrics).toBe(0);
    } finally { await context.close(); }
  }
});

test("広告同意後だけ掲載originをSDKへ渡し、探索パス・query・hashを参照元に含めない", async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(); await formalProxy(page, info.project.use.baseURL!);
  let tagLoads = 0;
  await context.route("https://adm.shinobi.jp/s/**", route => {
    tagLoads++;
    // The documented browser behaviour used by the real SDK for a cross-origin parent.
    return route.fulfill({ contentType: "application/javascript", body: "try{window.__admaxListing=parent.document.URL}catch{window.__admaxListing=document.referrer}" });
  });
  try {
    await page.goto(PUBLIC_ORIGIN + "/?private=SECRET#SHARED_TOKEN");
    await expect(page.getByRole("button", { name: "広告を許可" })).toBeVisible();
    expect(tagLoads).toBe(0); expect(page.frames()).toHaveLength(1);
    await page.evaluate(() => history.replaceState(history.state, "", "/explore/10000000-0000-4000-8000-000000000001?private=SECRET#SHARED_TOKEN"));
    await openPrivacySettings(page);
    await page.getByRole("checkbox", { name: /^広告/ }).check();
    await page.getByRole("button", { name: "設定を保存", exact: true }).click();
    await expect.poll(() => tagLoads).toBe(1);
    const frame = page.frames().find(f => f.url().startsWith(AD_ORIGIN))!;
    await expect.poll(() => frame.evaluate(() => (window as unknown as { __admaxListing?: string }).__admaxListing)).toBe(PUBLIC_ORIGIN + "/");
    expect(await frame.evaluate(() => { try { return !!parent.document.body; } catch { return false; } })).toBe(false);
    expect(page.frames().some(f => f.url().includes("/integrations/analytics"))).toBe(false);
    await openPrivacySettings(page);
    await page.getByRole("checkbox", { name: /^広告/ }).uncheck();
    await page.getByRole("button", { name: "設定を保存", exact: true }).click();
    await expect(page.getByTitle("広告", { exact: true })).toHaveCount(0);
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
    await openPrivacySettings(page);
    await page.getByRole("checkbox", { name: /^利用状況/ }).check();
    await page.getByRole("button", { name: "設定を保存", exact: true }).click();
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
    await openPrivacySettings(page);
    await page.getByRole("checkbox", { name: /^利用状況/ }).uncheck(); await page.getByRole("button", { name: "設定を保存", exact: true }).click();
    await page.goto(PUBLIC_ORIGIN + "/"); expect(tagLoads).toBe(1);
    const gear = page.getByTestId('site-header').getByLabel('表示設定'); await gear.click();
    await page.getByRole("combobox", { name: "表示言語", exact: true }).selectOption("en");
    await expect(page.getByRole("button", { name: "Analytics & ads settings", exact: true })).toHaveCount(1);
  } finally { await context.close(); }
});

for (const width of [1440, 375]) test(`共通設定を広告枠から分離し、どのペインからも開閉できる ${width}px`, async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 800, hasTouch: width < 800 });
  await context.route("https://adm.shinobi.jp/**", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  const page = await context.newPage();
  try {
    await page.goto(info.project.use.baseURL!);
    const services = page.getByTestId("public-services"), header = page.getByTestId("site-header");
    await expect(services.locator("footer")).toHaveCount(0);
    await openPrivacySettings(page);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /^広告/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(header.getByLabel("表示設定", { exact: true })).toBeFocused();
    await page.getByRole("button", { name: "PLUTOから探索を開始", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toContainText("Entity 4");
    const before = await view(page);
    if (width < 800) await page.getByRole("navigation", { name: "探索画面の切り替え" }).getByRole("button", { name: "選択の詳細", exact: true }).click();
    await openPrivacySettings(page); await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "設定を保存", exact: true }).click();
    expect(await view(page)).toEqual(before);
    await header.getByLabel("表示設定", { exact: true }).click();
    await expect(header.getByRole("link", { name: "プライバシー・外部送信について", exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`privacy-menu-${width}.png`) });
  } finally { await context.close(); }
});
