import { test, expect, type Page, type CDPSession } from "@playwright/test";
import type { Core } from "cytoscape";

const pluto = "2b7c6289-d050-4dc0-93e3-9307681253cc";
const view = (page: Page) => page.getByTestId("graph-canvas").evaluate(el => {
  const cy = (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy;
  return { points: Object.fromEntries(cy.nodes().map(n => [n.id(), n.position()])), edges: cy.edges().map(e => e.id()).sort(), zoom: cy.zoom(), pan: cy.pan(), selected: cy.elements(".chosen").map(e => e.id()) };
});
// Trusted browser touch input: DOM-dispatched events and scrollTo cannot prove chaining.
async function swipe(page: Page, cdp: CDPSession, x: number, y: number, dy: number) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 16; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + dy * i / 16 }] });
    await page.waitForTimeout(20);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(300);
}

for (const width of [1440, 390, 320]) test(`${width}px ペインの端→ページ→フッターとGraphジェスチャー`, async ({ browser }, info) => {
  const mobile = width < 800, height = mobile ? 700 : 800;
  const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
  await context.addInitScript(() => localStorage.setItem("plunode:privacy:v1", '{"analytics":false,"ads":false}'));
  const page = await context.newPage(), cdp = await context.newCDPSession(page);
  const input = async (x: number, y: number) => {
    if (mobile) await swipe(page, cdp, x, y, -240);
    else { await page.mouse.move(x, y); await page.mouse.wheel(0, 580); await page.waitForTimeout(250); }
  };
  const atFooter = async () => {
    for (let i = 0; i < 15; i++) {
      if (await page.getByTestId("site-footer").evaluate(el => el.getBoundingClientRect().bottom <= innerHeight + 1)) break;
      await input(width / 2, height - 100);
    }
    expect(await page.getByTestId("site-footer").evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; })).toBe(true);
  };
  await page.goto(info.project.use.baseURL! + "/");
  await expect(page.getByTestId("discovery-home")).toBeVisible();
  await page.waitForTimeout(800);
  // Home is ordinary content: actual input first scrolls its pane without moving the page.
  const homeBox = (await page.locator("#explorer-graph").boundingBox())!;
  await input(homeBox.x + homeBox.width / 2, height - 110);
  expect(await page.locator("#explorer-graph").evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await atFooter();
  await page.screenshot({ path: info.outputPath(`home-footer-${width}.png`) });

  await page.goto(info.project.use.baseURL! + `/explore/${pluto}`);
  await expect.poll(async () => Object.keys((await view(page)).points).length).toBe(4);
  // Read a real relation using the adjacency action before exercising all three panes.
  await page.locator("#explorer-relations").getByRole("button", { name: "主張と出典を見る", exact: true }).first().click();
  const before = await view(page);
  for (const pane of ["search", "graph", "detail"]) {
    // Set up the boundary only. The transition to the document must use wheel/touch input.
    await page.evaluate(() => window.scrollTo(0, 0));
    if (mobile) await page.getByRole("navigation", { name: "探索画面の切り替え" }).getByRole("button", { name: pane === "search" ? "検索" : pane === "graph" ? "Graph" : "選択の詳細", exact: true }).tap();
    const locator = page.locator(`#explorer-${pane}`);
    await locator.evaluate(el => el.scrollTop = el.scrollHeight);
    // Let the compositor settle after tab/focus/scroll changes before starting a new gesture.
    await page.waitForTimeout(700);
    const box = (await locator.boundingBox())!;
    const other = await page.locator("#explorer-search, #explorer-graph, #explorer-detail").evaluateAll(els => els.map(el => el.scrollTop));
    await input(box.x + box.width / 2, Math.min(box.y + box.height * .7, height - 110));
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    expect(await page.locator("#explorer-search, #explorer-graph, #explorer-detail").evaluateAll(els => els.map(el => el.scrollTop))).toEqual(other);
    await atFooter();
    await page.screenshot({ path: info.outputPath(`${pane}-footer-${width}.png`) });
    expect(await view(page)).toEqual(before);
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  if (mobile) await page.getByRole("navigation", { name: "探索画面の切り替え" }).getByRole("button", { name: "Graph", exact: true }).tap();
  await page.locator("#explorer-graph").evaluate(el => el.scrollTop = 0);
  await page.waitForTimeout(700);
  const canvas = (await page.getByTestId("graph-canvas").boundingBox())!;
  const start = { x: canvas.x + 35, y: canvas.y + 150 };
  const old = await view(page);
  if (mobile) await swipe(page, cdp, start.x, start.y, 65);
  else { await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 50, start.y + 35, { steps: 8 }); await page.mouse.up(); }
  await expect.poll(async () => (await view(page)).pan).not.toEqual(old.pan);
  expect((await view(page)).points).toEqual(old.points);
  expect((await view(page)).selected).toEqual(old.selected);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(await page.locator("#explorer-graph").evaluate(el => el.scrollTop)).toBe(0);
  if (!mobile) {
    const zoom = (await view(page)).zoom;
    await page.mouse.move(start.x, start.y); await page.mouse.wheel(0, -80);
    await expect.poll(async () => (await view(page)).zoom).not.toBe(zoom);
    expect(await page.evaluate(() => scrollY)).toBe(0);
  } else {
    const zoom = (await view(page)).zoom;
    const touches = (spread: number) => [{ x: canvas.x + 30 - spread, y: start.y, id: 0 }, { x: canvas.x + canvas.width - 30 + spread, y: start.y, id: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touches(0) });
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touches(i * 2) });
      await page.waitForTimeout(20);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(async () => (await view(page)).zoom).toBeGreaterThan(zoom);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await page.getByRole("button", { name: "Graphを拡大", exact: true }).tap();
    await expect.poll(async () => (await view(page)).zoom).toBeGreaterThan(old.zoom);
  }
  const saved = await view(page);
  await expect(page).toHaveURL(/\?s=/);
  await page.waitForTimeout(700); // Existing URL updates debounce for 350ms after view changes.
  await page.reload();
  await expect.poll(async () => Object.keys((await view(page)).points).length).toBe(4);
  const restored = await view(page);
  expect(restored.edges).toEqual(saved.edges); expect(restored.zoom).toBeCloseTo(saved.zoom, 2);
  for (const [id, point] of Object.entries(saved.points)) { expect(restored.points[id].x).toBeCloseTo(point.x, 0); expect(restored.points[id].y).toBeCloseTo(point.y, 0); }
  await context.close();
});
