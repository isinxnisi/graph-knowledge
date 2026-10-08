import { test, expect, type Page } from "@playwright/test";
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };

const canvasView = (page: Page) => page.getByTestId("graph-canvas").evaluate(el => {
  const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
  return {
    positions: Object.fromEntries(cy.nodes().map(node => [node.id(), node.position()])),
    rendered: Object.fromEntries(cy.nodes().map(node => [node.id(), node.renderedPosition()])),
    selected: cy.elements(".chosen").map(element => element.id()),
    width: cy.width(), height: cy.height(), zoom: cy.zoom(),
    center: { x: (cy.width() / 2 - cy.pan().x) / cy.zoom(), y: (cy.height() / 2 - cy.pan().y) / cy.zoom() },
  };
});

for (const width of [320, 1440]) {
  test(`${width}px: 表示操作で配置・選択・取得状態を保ちGraphを読み直せる`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    let neighbors = 0;
    await page.route("**/api/entities/**", async route => {
      if (new URL(route.request().url()).pathname.endsWith("/neighbors")) {
        neighbors++;
        await route.fulfill({ json: examples.neighbors });
      } else await route.fulfill({ json: examples.entity });
    });
    await page.route("**/api/claims/**", route => route.fulfill({ json: examples.claim }));
    await page.goto("/");
    const controls = page.getByRole("group", { name: "Graphの表示操作", exact: true });
    const paneNav = page.getByRole("navigation", { name: "探索画面の切り替え" });
    if (width < 800) await paneNav.getByRole("button", { name: "Graph", exact: true }).click();
    for (const button of await controls.getByRole("button").all()) await expect(button).toBeDisabled();
    if (width < 800) await paneNav.getByRole("button", { name: "検索", exact: true }).click();
    await page.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    const before = await canvasView(page);
    const enlarge = controls.getByRole("button", { name: "Graphを拡大", exact: true });
    const shrink = controls.getByRole("button", { name: "Graphを縮小", exact: true });
    await enlarge.focus();
    await page.keyboard.press("Enter");
    const enlarged = await canvasView(page);
    expect(enlarged.zoom).toBeCloseTo(before.zoom * 1.25);
    expect(enlarged.center.x).toBeCloseTo(before.center.x);
    expect(enlarged.center.y).toBeCloseTo(before.center.y);
    await expect(enlarge).toBeFocused();
    await expect(controls.getByLabel("Graphの表示倍率")).toHaveText(`${Math.round(enlarged.zoom * 100)}%`);
    await shrink.focus();
    await page.keyboard.press("Space");
    expect((await canvasView(page)).zoom).toBeCloseTo(before.zoom);

    // Wheel/pinch and restored views also update the controls through Cytoscape's zoom event.
    await page.getByTestId("graph-canvas").evaluate(el => {
      const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
      cy.zoom(1.9);
    });
    await enlarge.click();
    await expect(enlarge).toBeDisabled();
    await expect(controls.getByLabel("Graphの表示倍率")).toHaveText("200%");
    await page.getByTestId("graph-canvas").evaluate(el => {
      const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
      cy.zoom(0.16); cy.pan({ x: -2000, y: -2000 });
    });
    await shrink.click();
    await expect(shrink).toBeDisabled();
    await expect(controls.getByLabel("Graphの表示倍率")).toHaveText("15%");
    await controls.getByRole("button", { name: "選択を表示", exact: true }).click();
    const focused = await canvasView(page);
    const root = focused.rendered[examples.neighbors.centerId];
    expect(root.x).toBeCloseTo(focused.width / 2);
    expect(root.y).toBeCloseTo(focused.height / 2);
    expect(focused.zoom).toBe(1);

    // An individual Claim maps to its visible Relation, without opening either endpoint.
    await page.getByTestId(`relation-${examples.claim.claim.id}`).getByRole("button", { name: "主張と出典を見る" }).click();
    if (width < 800) await paneNav.getByRole("button", { name: "Graph", exact: true }).click();
    const relation = await canvasView(page);
    await controls.getByRole("button", { name: "選択を表示", exact: true }).click();
    const relationFocused = await canvasView(page);
    for (const id of [examples.claim.claim.subjectId, examples.claim.claim.objectId]) {
      const point = relationFocused.rendered[id];
      expect(point.x).toBeGreaterThan(0);
      expect(point.x).toBeLessThan(relationFocused.width);
      expect(point.y).toBeGreaterThan(0);
      expect(point.y).toBeLessThan(relationFocused.height);
    }
    expect(relationFocused.selected).toEqual(relation.selected);
    await controls.getByRole("button", { name: "全体を表示", exact: true }).click();
    const fitted = await canvasView(page);
    expect(fitted.positions).toEqual(before.positions);
    expect(fitted.selected).toEqual(relation.selected);
    for (const point of Object.values(fitted.rendered)) {
      expect(point.x).toBeGreaterThan(0);
      expect(point.x).toBeLessThan(fitted.width);
      expect(point.y).toBeGreaterThan(0);
      expect(point.y).toBeLessThan(fitted.height);
    }
    expect(neighbors).toBe(1);
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/graph-viewport-${width}.png` });
  });
}
