import { test, expect, type Page } from "@playwright/test";
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };

const root = examples.neighbors.nodes[0];
const work = examples.neighbors.nodes[1];
const readView = (page: Page) => page.getByTestId("graph-canvas").evaluate(el => {
  const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
  return { positions: Object.fromEntries(cy.nodes().map(node => [node.id(), node.position()])), pan: cy.pan(), zoom: cy.zoom() };
});

for (const width of [390, 1440]) {
  test(`条件適用後に枝・選択・表示位置を復元し取得済みの続きへ進む（${width}px）`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const requests: string[] = [];
    await page.route("**/api/entities/**", async route => {
      const url = new URL(route.request().url());
      const id = url.pathname.split("/")[3];
      if (url.pathname.endsWith("/neighbors")) {
        requests.push(url.search);
        if (url.searchParams.has("predicates")) {
          await route.fulfill({ status: 503, json: { error: { code: "SERVICE_UNAVAILABLE", message: "一時的な取得失敗" } } });
        } else {
          await route.fulfill({ json: { ...examples.neighbors, centerId: id,
            page: { hasMore: !url.searchParams.has("after"), nextCursor: url.searchParams.has("after") ? null : "accepted-cursor" } } });
        }
      } else {
        const entity = examples.neighbors.nodes.find(node => node.id === id);
        await route.fulfill({ json: { entity: { ...entity, aliases: [], event: null } } });
      }
    });
    await page.goto("/");
    await page.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    // Inspect a non-root node without expanding it, then choose an unmistakable viewport.
    const navigator = page.getByRole("region", { name: "表示中の対象へ移動", exact: true });
    await navigator.getByRole("button", { name: /表示中の対象へ移動/ }).click();
    await navigator.getByRole("button", { name: /^星の航路.*位置と詳細へ移動/ }).click();
    await page.getByTestId("graph-canvas").evaluate(el => {
      const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
      cy.getElementById(cy.nodes()[0].id()).position({ x: 90, y: 120 });
      cy.zoom(0.85); cy.pan({ x: 25, y: 35 });
    });
    const before = await readView(page);
    await page.getByRole("button", { name: "見る関係を編集", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "見る関係の編集" });
    await dialog.getByRole("button", { name: "選択を解除", exact: true }).click();
    await expect(dialog).toContainText("直前の探索へ戻る");
    await dialog.getByRole("button", { name: "適用", exact: true }).click();
    await expect(page.getByRole("button", { name: "隣接関係の取得を再試行", exact: true })).toBeVisible();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
    expect(requests).toHaveLength(2);
    await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    await expect(page.getByTestId("selection-status")).toContainText(work.name);
    await expect(page.getByTestId("active-predicates")).toContainText("すべての関係");
    await expect(page.getByRole("button", { name: "直前の探索へ戻る", exact: true })).toHaveCount(0);
    expect(await readView(page)).toEqual(before);
    expect(requests).toHaveLength(2);
    await navigator.getByRole("button", { name: /表示中の対象へ移動/ }).click();
    await navigator.getByRole("button", { name: /^青葉ハル.*位置と詳細へ移動/ }).click();
    await page.getByRole("button", { name: "隣接関係の続きを表示", exact: true }).click();
    await expect(page.getByRole("button", { name: "隣接関係の続きを表示", exact: true })).toHaveCount(0);
    expect(requests).toHaveLength(3);
    expect(new URLSearchParams(requests[2]).get("after")).toBe("accepted-cursor");
    expect(new URLSearchParams(requests[2]).has("predicates")).toBe(false);
    await expect(page.getByTestId("exploration-root")).toContainText(root.name);
  });
}
