import { expect, test, type Page } from "@playwright/test";
import fixture from "../../fixtures/demo.json" with { type: "json" };

const work = fixture.entities[8];
const view = (page: Page) => page.getByTestId("graph-canvas").evaluate(el => {
  const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
  return { positions: Object.fromEntries(cy.nodes().map(node => [node.id(), node.position()])),
    pan: cy.pan(), zoom: cy.zoom(), selected: cy.elements(".chosen").map(element => element.id()),
    opacity: cy.nodes().map(node => node.numericStyle("opacity")), edges: cy.edges().map(edge => edge.id()).sort() };
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`実DB: ${reducedMotion}で選択・追加・開閉・復帰を待たせず表示する`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/");
    await page.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    await expect.poll(async () => (await view(page)).opacity.every(value => value === 1)).toBe(true);
    const fade = page.getByTestId("selection-status").locator("..");
    const animation = await fade.evaluate(el => getComputedStyle(el).animationName);
    expect(animation === "none").toBe(reducedMotion === "reduce");
    expect(await page.getByRole("button", { name: "Graphを拡大", exact: true }).evaluate(el => getComputedStyle(el).transitionDuration))
      .toBe(reducedMotion === "reduce" ? "0s" : "0.16s, 0.16s, 0.16s, 0.16s");

    // 実DBの応答だけを保留し、選択・通信中表示と取得後の追加効果を分けて確認する。
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let requests = 0;
    const response = await page.request.get(`/api/entities/${work.id}/neighbors`);
    expect(response.status()).toBe(200);
    const neighbors = await response.json();
    page.on("request", request => { if (new URL(request.url()).pathname === `/api/entities/${work.id}/neighbors`) requests++; });
    await page.route(`**/api/entities/${work.id}/neighbors*`, async route => {
      await held; await route.fulfill({ json: neighbors });
    }, { times: 1 });
    await page.getByTestId("graph-canvas").evaluate(el => {
      const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
      const surface = el as HTMLElement;
      surface.dataset.revealed = "";
      cy.on("style", "node", event => {
        if (event.target.numericStyle("opacity") < 1) surface.dataset.revealed += `${event.target.id()},`;
      });
    });
    try {
      const before = await view(page);
      await page.getByTestId(`relation-${fixture.claims[6].id}`).getByRole("button", { name: "星の航路を選択・展開" }).click();
      await expect(page.getByTestId("selection-status")).toContainText("星の航路");
      await expect(page.getByTestId("graph-overlay")).toContainText("Graphを取得中");
      expect((await view(page)).positions).toEqual(before.positions);
      release();
      await expect(page.getByTestId("graph-counts")).toHaveText("Entity 7 / Claim 9");
      await expect.poll(async () => (await view(page)).opacity.every(value => value === 1)).toBe(true);
      const added = await view(page);
      for (const [id, position] of Object.entries(before.positions)) expect(added.positions[id]).toEqual(position);
      expect(added.pan).toEqual(before.pan); expect(added.zoom).toBe(before.zoom);
      expect(await page.getByTestId("graph-canvas").getAttribute("data-revealed") === "").toBe(reducedMotion === "reduce");

      const detail = page.getByRole("region", { name: "Entity詳細", exact: true });
      await detail.getByRole("button", { name: "展開を閉じる", exact: true }).click();
      await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
      await expect(page.getByTestId("graph-overlay")).toContainText("展開を閉じました");
      await detail.getByRole("button", { name: "展開を再開", exact: true }).click();
      await expect(page.getByTestId("graph-counts")).toHaveText("Entity 7 / Claim 9");
      await expect.poll(async () => (await view(page)).opacity.every(value => value === 1)).toBe(true);
      expect(await view(page)).toEqual(added); expect(requests).toBe(1);
      await detail.getByRole("button", { name: "関係概要を見る", exact: true }).click();
      const dialog = page.getByRole("dialog");
      expect(await dialog.evaluate(el => getComputedStyle(el).animationName) === "none").toBe(reducedMotion === "reduce");
      await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
      expect(await view(page)).toEqual(added);
      await detail.getByRole("button", { name: "この対象から広く見る", exact: true }).click();
      await expect(page.getByTestId("exploration-root")).toContainText(work.name);
      await expect(page.getByTestId("graph-overlay")).toContainText("展開済み");
      await page.getByTestId("graph-canvas").evaluate(el => { (el as HTMLElement).dataset.revealed = ""; });
      await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click();
      await expect(page.getByTestId("exploration-root")).toContainText("青葉ハル");
      expect(await view(page)).toEqual(added);
      expect(await page.getByTestId("graph-canvas").getAttribute("data-revealed")).toBe("");
      await page.screenshot({ path: `test-results/step9-${reducedMotion}.png` });
    } finally { release(); }
  });
}
