import { expect, test, type Page } from "@playwright/test";

async function language(page: Page, locale: "ja" | "en") {
  const header = page.getByTestId("site-header");
  await header.locator("summary").click();
  await header.locator("select").last().selectOption(locale);
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
}
const graph = (page: Page) => page.getByTestId("graph-canvas").first().evaluate(el => {
  const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
  return { nodes: cy.nodes().map(node => [node.id(), node.position()]), edges: cy.edges().map(edge => edge.id()), pan: cy.pan(), zoom: cy.zoom() };
});

export function checkContentLocale() {
  test("閲覧の日英: 実Roleの参照から根拠を読み、320pxでも元の探索へ戻る", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/"); await language(page, "en");
    await page.getByRole("button", { name: "Explore from PLUTO", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
    const ids = await page.getByTestId("graph-canvas").evaluate(el => {
      const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
      const edge = cy.edges().filter(edge => edge.data("canvasLabel") === "Producing").first(); edge.emit("tap"); return edge.data("claimIds") as string[];
    });
    const candidates = await Promise.all(ids.map(async id => (await (await page.request.get(`/api/claims/${id}`)).json()).claim));
    const id = candidates.find(claim => claim.contribution?.roleId === "PRODUCING")!.id;
    const detail = page.getByRole("region", { name: "Claim details", exact: true });
    const link = detail.locator(`a[href*="read=claim"][href*="id=${id}"]`);
    await expect(link).toBeVisible(); const before = await graph(page);
    await link.click();
    const reader = page.getByRole("dialog", { name: "Linked entity or claim" });
    await expect(reader).toContainText("Producing"); await expect(reader).toContainText("第1巻");
    await expect(reader.getByRole("link", { name: "Open source URL", exact: true })).toBeVisible();
    await reader.getByText("Reading URL", { exact: true }).first().click();
    await reader.evaluate(el => { el.scrollTop = el.scrollHeight; });
    expect(await reader.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: "test-results/public/step16-reading-320.png" });
    await reader.getByRole("button", { name: "Return to exploration", exact: true }).click();
    expect(await graph(page)).toEqual(before); await expect(link).toBeFocused();
  });

  test("保存の日英: Capsule草稿・参照と探索を保ち、保存ビュー・途中保存から再訪できる", async ({ page, context }) => {
    test.setTimeout(120000);
    await page.goto("/"); await language(page, "en");
    await page.getByRole("button", { name: "Explore from PLUTO", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
    const before = await graph(page);
    await page.locator("#explorer-search").getByRole("button", { name: "Create or read a Capsule", exact: true }).click();
    let modal = page.getByRole("dialog");
    await modal.getByRole("button", { name: "Create from the visible graph", exact: true }).click();
    await modal.getByRole("textbox", { name: "Capsule title", exact: true }).fill("保存内容は翻訳しない");
    await modal.getByRole("textbox", { name: "My description", exact: true }).fill("第1巻の資料を再確認するメモ");
    await modal.getByRole("checkbox", { name: /長崎尚志 → Contributed to → PLUTO.*Producing/ }).check();
    const other = await context.newPage(); await other.goto("/"); await language(other, "ja"); await page.bringToFront();
    await expect(modal.getByRole("textbox", { name: "Capsuleの題名", exact: true })).toHaveValue("保存内容は翻訳しない");
    await expect(modal.getByRole("textbox", { name: "自分の説明", exact: true })).toHaveValue("第1巻の資料を再確認するメモ");
    await other.bringToFront(); await language(other, "en"); await page.bringToFront(); await other.close();
    await modal.getByRole("button", { name: "Save Capsule", exact: true }).click();
    await expect(modal.getByText("Current graph: 2 entities / 1 claim", { exact: true })).toBeVisible();
    await modal.getByRole("button", { name: /長崎尚志 → Contributed to → PLUTO.*Producing/ }).click();
    await expect(modal.getByRole("heading", { name: "小学館：PLUTO 第1巻 商品情報", exact: true })).toBeVisible();
    const capsuleGraph = () => modal.getByTestId("graph-canvas").evaluate(el => {
      const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
      return { nodes: cy.nodes().map(node => [node.id(), node.position()]), edges: cy.edges().map(edge => edge.id()), pan: cy.pan(), zoom: cy.zoom() };
    });
    const diagram = await capsuleGraph();
    const settings = await context.newPage(); await settings.goto("/"); await language(settings, "ja"); await page.bringToFront();
    await expect(modal.getByRole("heading", { name: "Capsuleに選んだ主張", exact: true })).toBeVisible();
    expect(await capsuleGraph()).toEqual(diagram);
    await settings.bringToFront(); await language(settings, "en"); await page.bringToFront(); await settings.close();
    expect(await capsuleGraph()).toEqual(diagram);
    await expect(modal.getByRole("heading", { name: "小学館：PLUTO 第1巻 商品情報", exact: true })).toBeVisible();
    await page.screenshot({ path: "test-results/public/step16-local-capsule.png" });
    await modal.getByRole("button", { name: "Return to exploration", exact: true }).click();
    expect(await graph(page)).toEqual(before);
    await page.locator("#explorer-search").getByRole("button", { name: "Save or revisit", exact: true }).click();
    modal = page.getByRole("dialog");
    await modal.getByLabel("Saved view name").fill("英語UIからの保存ビュー");
    await modal.getByRole("button", { name: "Save current start and conditions" }).click();
    await modal.getByRole("button", { name: "Close saved views" }).click();
    await page.locator("#explorer-search").getByRole("button", { name: "Save or resume exploration", exact: true }).click();
    modal = page.getByRole("dialog");
    await modal.getByLabel("Session name").fill("途中保存の名前も変えない");
    await modal.getByRole("button", { name: "Save current exploration session", exact: true }).click();
    await modal.getByRole("button", { name: "Resume saved session", exact: true }).click();
    await expect(modal).toHaveCount(0); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
    const contents = await page.evaluate(() => JSON.parse(localStorage.getItem("graph-knowledge:capsules:public-kg")!));
    expect(contents.capsules[0].title).toBe("保存内容は翻訳しない"); expect(contents.capsules[0].language).toBe("ja");
    await language(page, "ja");
    await page.locator("#explorer-search").getByRole("button", { name: "保存・再訪", exact: true }).click();
    modal = page.getByRole("dialog");
    await modal.getByRole("button", { name: "英語UIからの保存ビューを開く", exact: true }).click();
    await expect(modal).toHaveCount(0); await expect(page.getByTestId("exploration-root")).toContainText("PLUTO");
  });
}
