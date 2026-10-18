import { test, expect } from "@playwright/test";
import { decodeExploration } from "../../lib/client/exploration-url";
import { relationText } from "../../lib/i18n/relation-condition";
import { entryLabels } from "../../lib/i18n/exploration-entry";
import { graphNavigationLabels } from "../../lib/i18n/graph-navigation";
import { workspaceLabels } from "../../lib/i18n/workspace";
import { overviewLabels } from "../../lib/i18n/entity-overview";
const root = "2b7c6289-d050-4dc0-93e3-9307681253cc";
for (const [locale, width] of [["ja", 1280], ["en", 390]] as const) test(`pattern entity gestures ${locale} ${width}`, async ({ browser }, info) => {
  const mobile = width < 800, ctx = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript(() => localStorage.setItem("plunode:privacy:v1", '{"analytics":false,"ads":false}'));
  const page = await ctx.newPage(), errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const text = relationText(locale), entry = entryLabels(locale), ws = workspaceLabels(locale), navText = graphNavigationLabels(locale);
  const graph = page.locator("#explorer-graph"), canvas = page.getByTestId("graph-canvas"), nav = page.locator('nav[aria-label="'+(locale === "en" ? "Explorer panels" : "探索画面の切り替え")+'"]');
  const paths = page.getByRole("region", { name: text.routes, exact: true });
  const model = () => decodeExploration(new URL(page.url()).searchParams.get("s")!, root, "public-kg");
  const pattern = () => { const ex = model().execution; if (ex.type !== "pattern") throw Error("Expected pattern"); return ex; };
  const snap = () => canvas.evaluate(el => { const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy; return { ids: cy.nodes().map(n => n.id()).sort(), edges: cy.edges().map(e => e.id()).sort(), points: Object.fromEntries(cy.nodes().map(n => [n.id(), { ...n.position() }])), zoom: cy.zoom(), pan: cy.pan() }; });
  const focus = async (id: string) => {
    const label = await canvas.evaluate((el, id) => (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy.getElementById(id).data("label") as string, id);
    const navigator = graph.getByRole("region", { name: navText.title, exact: true });
    await navigator.getByRole("button", { name: new RegExp(navText.title) }).click();
    await navigator.locator("li button").filter({ has: page.locator("strong").filter({ hasText: new RegExp("^"+label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"$") }) }).first().click();
    await canvas.scrollIntoViewIfNeeded();
  };
  const tap = async (id: string, double = true) => {
    const point = await canvas.evaluate((el, id) => { const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy, p = cy.getElementById(id).renderedPosition(), r = el.getBoundingClientRect(); return { x: r.x+p.x, y: r.y+p.y }; }, id);
    if (mobile) { await page.touchscreen.tap(point.x, point.y); if (double) await page.touchscreen.tap(point.x, point.y); }
    else if (double) await page.mouse.dblclick(point.x, point.y, { delay: 70 }); else await page.mouse.click(point.x, point.y);
  };
  const openTool = async () => { if (mobile) await nav.getByRole("button", { name: locale === "en" ? "Search" : "検索", exact: true }).click(); await page.locator("#explorer-search").getByRole("button", { name: ws.launch, exact: true }).click(); };
  const returnGraph = async () => { if (mobile) await nav.getByRole("button", { name: "Graph", exact: true }).click(); };
  await page.goto(info.project.use.baseURL!+(locale === "en" ? "/en" : "")+`/explore/${root}`);
  await graph.getByRole("button", { name: entry.edit, exact: true }).click(); await page.getByRole("radio", { name: text.pattern, exact: true }).check(); await page.getByRole("button", { name: entry.apply, exact: true }).click();
  await expect.poll(async () => (await snap()).ids.length).toBe(3); await expect.poll(() => model().relation.type).toBe("pattern");
  expect(pattern().routes.filter(r => r.open)).toHaveLength(1); await expect(paths.locator("li")).toHaveCount(10);
  const initial = pattern().routes.find(r => r.open)!.route;
  await page.screenshot({ path: info.outputPath("initial.png"), animations: "disabled" });
  for (const id of initial.nodeIds) {
    await focus(id);
    const before = await snap();
    for (let repeat = 0; repeat < 2; repeat++) {
      await tap(id); await expect.poll(async () => (await snap()).edges.length).toBe(0);
      const closed = await snap(); expect(closed.ids).toContain(id); expect(closed.points[id]).toEqual(before.points[id]); expect(closed.zoom).toBeCloseTo(before.zoom, 5); expect(closed.pan).toEqual(before.pan);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await tap(id); await expect.poll(async () => (await snap()).edges).toEqual(before.edges);
      const reopened = await snap(); expect(reopened.points).toEqual(before.points); expect(reopened.zoom).toBeCloseTo(before.zoom, 5); expect(reopened.pan).toEqual(before.pan);
    }
  }
  // Choose two actual routes sharing a creator, then close only one endpoint.
  const refs = pattern().routes.map(r => r.route), group = refs.filter(r => r.nodeIds[1] === refs.find(r => refs.filter(x => x.nodeIds[1] === r.nodeIds[1]).length > 1)!.nodeIds[1]).slice(0, 2);
  await focus(root); await tap(root); await expect.poll(async () => (await snap()).edges.length).toBe(0);
  for (const route of group) {
    const index = refs.findIndex(r => r.nodeIds.join(":") === route.nodeIds.join(":"));
    await paths.locator("li").nth(index).getByRole("button", { name: text.open, exact: true }).click();
  }
  await expect.poll(async () => (await snap()).edges.length).toBe(3);
  await focus(group[0].nodeIds[2]); const both = await snap(); await tap(group[0].nodeIds[2]);
  await expect.poll(async () => (await snap()).edges.length).toBe(2); expect((await snap()).ids).toContain(group[0].nodeIds[1]);
  await expect(paths.getByRole("button", { name: text.close, exact: true })).toHaveCount(1);
  await tap(group[0].nodeIds[2]); await expect.poll(async () => (await snap()).edges).toEqual(both.edges);
  // Collapsing the shared creator retains a handle and remembers BOTH paths.
  await focus(group[0].nodeIds[1]); await tap(group[0].nodeIds[1]); await expect.poll(async () => (await snap()).edges.length).toBe(0);
  await expect.poll(() => pattern().collapsedNodes?.find(n => n.id === group[0].nodeIds[1])?.routeKeys.length).toBe(2);
  const closedState = pattern(); await page.screenshot({ path: info.outputPath("closed.png"), animations: "disabled" });
  await openTool(); let dialog = page.getByRole("dialog"); await dialog.getByLabel(ws.name, { exact: true }).fill("closed pattern"); await dialog.getByRole("button", { name: ws.save, exact: true }).click(); await expect(dialog).toContainText(ws.saved); await dialog.getByRole("button", { name: ws.close, exact: true }).click(); await returnGraph();
  await page.reload(); await expect.poll(() => model().execution).toEqual(closedState); await expect.poll(async () => (await snap()).edges.length).toBe(0);
  await graph.getByRole("button", { name: text.free, exact: true }).click(); await expect.poll(() => model().relation.type).toBe("adjacent");
  await focus(root); const free = await snap(); expect(free.edges.length).toBeGreaterThan(0);
  await tap(root, false); await expect.poll(async () => (await snap()).edges.length).toBe(0);
  await tap(root, false); await expect.poll(async () => (await snap()).edges).toEqual(free.edges);
  await graph.getByRole("button", { name: overviewLabels(locale).restore, exact: true }).click(); await expect.poll(() => model().execution).toEqual(closedState);
  await focus(group[0].nodeIds[1]); await tap(group[0].nodeIds[1]); await expect.poll(async () => (await snap()).edges.length).toBe(3);
  await openTool(); dialog = page.getByRole("dialog"); await dialog.getByRole("button", { name: ws.open, exact: true }).click();
  await expect.poll(() => model().execution).toEqual(closedState); await expect.poll(async () => (await snap()).edges.length).toBe(0);
  await focus(group[0].nodeIds[1]); await tap(group[0].nodeIds[1]); await expect.poll(async () => (await snap()).edges.length).toBe(3);
  expect(errors).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await ctx.close();
});
