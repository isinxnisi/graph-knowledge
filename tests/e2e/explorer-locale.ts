import { expect, test, type Page } from "@playwright/test";

async function language(page: Page, locale: "ja" | "en") {
  const header = page.getByTestId("site-header");
  await header.locator("summary").click();
  await header.locator('select').last().selectOption(locale);
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
}
const view = (page: Page) => page.getByTestId("graph-canvas").evaluate(el => {
  const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
  return { nodes: cy.nodes().map(n => ({ id: n.id(), point: n.position(), classes: n.classes().sort() })), edges: cy.edges().map(e => ({ id: e.id(), claims: e.data("claimIds"), classes: e.classes().sort() })), pan: cy.pan(), zoom: cy.zoom() };
});
async function tap(page: Page, id: string) {
  await page.getByTestId("graph-canvas").evaluate((el, id) => {
    (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy.getElementById(id).emit("tap");
  }, id);
}

export function checkExplorerLocale() {
  test("日英: Graph・根拠・開閉・表示範囲を保ち、翻訳だけで再取得しない", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/");
    await page.getByRole("button", { name: "PLUTOから探索を開始", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
    const relationId = await page.getByTestId("graph-canvas").evaluate(el => {
      const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
      cy.zoom(0.8); cy.pan({ x: 150, y: 180 });
      cy.nodes().first().position({ x: 50, y: 80 });
      return cy.edges().filter(e => e.data("canvasLabel") === "プロデュース").first().id();
    });
    await tap(page, relationId);
    const detail = page.locator("#explorer-detail");
    await expect(detail.getByRole("heading", { name: "個別の主張と根拠" })).toBeVisible();
    await expect(detail.getByText("根拠となる出典と参照箇所").first()).toBeVisible();
    // 関連Claimの取得中に言語を変えると、通信完了による通常の追記も差分になる。
    await expect(detail.locator('[data-testid^="claim-card-"]')).toHaveCount(2);
    await expect(detail.getByRole("status")).toHaveCount(0);
    const source = await detail.locator('[data-testid^="claim-card-"] h5').allTextContents();
    const before = await view(page);
    let reads = 0;
    page.on("request", request => { if (/\/api\/entities|\/api\/claims/.test(request.url())) reads++; });
    await language(page, "en");
    await expect(detail.getByRole("heading", { name: "Individual claims and evidence" })).toBeVisible();
    await expect(detail.getByText("Producing", { exact: true }).first()).toBeVisible();
    expect(await detail.locator('[data-testid^="claim-card-"] h5').allTextContents()).toEqual(source.map(s => s === "根拠となる出典と参照箇所" ? "Supporting sources and references" : s));
    await expect(page.locator('[data-relation-id="' + relationId + '"]')).toHaveText("Production");
    expect(await view(page)).toEqual(before); expect(reads).toBe(0);
    await page.screenshot({ path: "test-results/public/locale-manga.png", fullPage: true });
    await language(page, "ja");
    expect(await view(page)).toEqual(before); expect(reads).toBe(0);
    await language(page, "en");
    const person = before.edges.find(e => e.id === relationId)!.id.split(":")[1];
    await tap(page, person);
    const entity = page.getByRole("region", { name: "Entity details" });
    await expect(entity.getByRole("button", { name: "Close branch", exact: true })).toBeVisible();
    await entity.getByRole("button", { name: "Close branch", exact: true }).click();
    const closed = await view(page);
    await language(page, "ja"); expect(await view(page)).toEqual(closed);
    await page.getByRole("region", { name: "Entity詳細" }).getByRole("button", { name: "展開を再開", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).not.toHaveText("Entity 1 / Claim 0");
    await language(page, "en");
    await page.getByRole("button", { name: "Edit relations to follow", exact: true }).click();
    const editor = page.getByRole("dialog");
    await editor.getByRole("button", { name: "Adjust production roles", exact: true }).click();
    await editor.getByRole("radio", { name: "Choose roles", exact: true }).check();
    await editor.getByRole("checkbox", { name: "Producing", exact: true }).check();
    await editor.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
    await page.getByRole("button", { name: "Return to previous exploration", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).not.toHaveText("Entity 2 / Claim 1");
  });

  test("日英: Event期間・仏語根拠・三条件・概要・起点切替と復帰", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/"); await language(page, "en");
    await page.getByRole("button", { name: "Explore from 第5回ソルヴェイ物理会議（1927）", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 3");
    const entity = page.getByRole("region", { name: "Entity details" });
    await expect(entity).toContainText("1927-10-24 – 1927-10-29");
    await entity.getByRole("button", { name: "View relation overview", exact: true }).click();
    const overview = page.getByRole("dialog");
    await expect(overview).toContainText("Had participants");
    await overview.getByText("Claim and qualifier breakdown", { exact: true }).click();
    await expect(overview).toContainText("Affirmed 3 / Denied 0");
    await overview.getByRole("button", { name: "Close", exact: true }).click();
    const edge = await page.getByTestId("graph-canvas").evaluate(el => {
      const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
      return cy.edges().filter(e => e.data("canvasLabel") === "Conference chair").first().id();
    });
    await tap(page, edge);
    const detail = page.getByRole("region", { name: "Claim details" });
    await expect(detail).toContainText("Président"); await expect(detail).toContainText("Period unknown");
    await page.screenshot({ path: "test-results/public/locale-event.png", fullPage: true });
    await expect(detail.getByRole("link", { name: "Open source URL", exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Edit relations to follow", exact: true }).click();
    const editor = page.getByRole("dialog");
    await editor.getByRole("button", { name: "Adjust production roles" }).click();
    await editor.getByRole("radio", { name: "Choose roles", exact: true }).check();
    await editor.getByRole("checkbox", { name: "Producing", exact: true }).check();
    await editor.getByRole("button", { name: "Adjust organization positions" }).click();
    await editor.getByRole("radio", { name: "Choose positions", exact: true }).check();
    await editor.getByRole("checkbox", { name: "Visitor", exact: true }).check();
    await editor.getByRole("button", { name: "Adjust participation positions" }).click();
    await editor.getByRole("radio", { name: "Choose participation positions", exact: true }).check();
    await editor.getByRole("checkbox", { name: "Conference chair", exact: true }).check();
    await editor.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
    await expect(page.getByTestId("active-predicates")).toContainText("Producing");
    await expect(page.getByTestId("active-predicates")).toContainText("Visitor");
    await expect(page.getByTestId("active-predicates")).toContainText("Conference chair");
    const lorentz = edge.split(":")[1]; await tap(page, lorentz);
    await page.getByRole("region", { name: "Entity details" }).getByRole("button", { name: "Explore from this entity with the same conditions", exact: true }).click();
    await expect(page.getByTestId("exploration-root")).toContainText("ローレンツ");
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
    await page.getByRole("button", { name: "Return to previous exploration", exact: true }).click();
    await expect(page.getByTestId("exploration-root")).toContainText("ソルヴェイ");
    await page.getByLabel("Name or alias").fill("Heisenberg"); await page.locator("#explorer-search").getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("button", { name: /^ヴェルナー・ハイゼンベルク —/ }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
    await expect(page.locator('[data-relation-id]').filter({ hasText: "Organization" })).toBeVisible();
    await page.getByRole("region", { name: "Entity details" }).getByRole("button", { name: "Explore broadly from this entity", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 4");
    await expect(page.getByTestId("active-predicates")).toContainText("All relations (no additional conditions)");
  });

  test("日英: 別タブ変更でもdraftを維持、明示適用前はGraph不変、再訪・狭幅・503の再試行", async ({ page, context }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/"); await language(page, "en");
    await page.getByRole("button", { name: "Explore from PLUTO", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
    await page.getByRole("button", { name: "Edit relations to follow", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Adjust production roles", exact: true }).click();
    await page.getByRole("radio", { name: "Choose roles", exact: true }).check();
    await page.getByRole("checkbox", { name: "Producing", exact: true }).check();
    const before = await view(page);
    await page.screenshot({ path: "test-results/public/locale-phone-conditions.png", fullPage: true });
    let reads = 0; page.on("request", request => { if (request.url().includes("/neighbors")) reads++; });
    const other = await context.newPage(); await other.goto("/");
    await expect(other.locator("html")).toHaveAttribute("lang", "en");
    await language(other, "ja"); await page.bringToFront();
    await expect(page.getByRole("checkbox", { name: "プロデュース", exact: true })).toBeChecked();
    await expect(page.getByTestId("active-predicates")).toContainText("追加条件なし");
    expect(await view(page)).toEqual(before); expect(reads).toBe(0);
    await page.getByRole("button", { name: "キャンセル", exact: true }).click();
    await other.close(); await language(page, "en");
    await page.reload(); await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.route("**/api/entities?**", route => route.fulfill({ status: 503, json: { error: { message: "データベースを利用できません。時間をおいて再試行してください。" } } }));
    await page.getByLabel("Name or alias").fill("PLUTO"); await page.locator("#explorer-search").getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.locator("#explorer-search").getByRole("alert")).toContainText("database is unavailable");
    await page.unroute("**/api/entities?**"); await page.locator("#explorer-search").getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("button", { name: /^PLUTO —/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/public/locale-phone.png", fullPage: true });
  });
}
