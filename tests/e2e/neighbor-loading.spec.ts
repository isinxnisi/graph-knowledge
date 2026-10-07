import { test, expect, type Page } from "@playwright/test";
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };

const canvasView = (page: Page) => page.getByTestId("graph-canvas").evaluate(el => {
  const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
  return { positions: Object.fromEntries(cy.nodes().map(node => [node.id(), node.position()])), pan: cy.pan(), zoom: cy.zoom() };
});

for (const width of [390, 1440]) {
  test(`${width}px幅で隣接一覧から初回失敗・続きの失敗を再試行し探索を維持する`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const requests: (string | null)[] = [];
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const cursor = examples.neighbors.claims[0].id;
    await page.route("**/api/entities/**", async route => {
      const url = new URL(route.request().url());
      if (!url.pathname.endsWith("/neighbors")) return route.fulfill({ json: examples.entity });
      const after = url.searchParams.get("after");
      requests.push(after);
      if (requests.length === 1 || requests.length === 3) {
        if (requests.length === 3) await held;
        return route.fulfill({ status: 503, json: { error: { message: "取得失敗" } } });
      }
      return route.fulfill({ json: {
        ...examples.neighbors,
        claims: after ? examples.neighbors.claims.slice(1) : examples.neighbors.claims.slice(0, 1),
        page: { hasMore: !after, nextCursor: after ? null : cursor },
      } });
    });
    try {
      await page.goto("/");
      await page.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).click();
      const list = page.getByRole("region", { name: "選択Entityの隣接関係", exact: true });
      const graph = page.locator("#explorer-graph");
      await expect(list.getByRole("alert")).toContainText("データベースを利用できません");
      await list.getByRole("button", { name: "隣接関係の取得を再試行" }).click();
      await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
      await expect(list.getByRole("alert")).toHaveCount(0);
      await expect(list).toContainText("未取得の続きがあります");
      const before = await canvasView(page);
      await list.getByRole("button", { name: "隣接関係の続きを表示" }).click();
      await expect(list.getByRole("status")).toHaveText("隣接関係の続きを取得中…");
      await expect(list.getByRole("button", { name: "隣接関係の続きを取得中…" })).toBeDisabled();
      await expect(list.getByRole("button", { name: "主張と出典を見る" })).toHaveCount(1);
      release();
      await expect(list.getByRole("alert")).toBeVisible();
      expect(await canvasView(page)).toEqual(before);
      await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
      await list.getByRole("button", { name: "隣接関係の取得を再試行" }).click();
      await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
      await expect(list.getByRole("button", { name: "主張と出典を見る" })).toHaveCount(7);
      await expect(list.getByRole("alert")).toHaveCount(0);
      await expect(list.getByRole("button", { name: "隣接関係の続きを表示" })).toHaveCount(0);
      expect(requests).toEqual([null, null, cursor, cursor]);
      const after = await canvasView(page);
      for (const [id, position] of Object.entries(before.positions)) expect(after.positions[id]).toEqual(position);
      expect(after.pan).toEqual(before.pan);
      expect(after.zoom).toBe(before.zoom);
      await expect(page.getByTestId("exploration-root")).toContainText("青葉ハル");
      await expect(page.getByTestId("selection-status")).toContainText("青葉ハル");
      await expect(graph).toBeVisible();
      if (width < 800) await expect(page.locator("#explorer-detail")).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // Accepted pages restore from cache even after the retry sequence.
      await list.getByRole("button", { name: "展開を閉じる", exact: true }).click();
      await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
      await list.getByRole("button", { name: "展開を再開", exact: true }).click();
      await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
      expect(await canvasView(page)).toEqual(after);
      expect(requests).toHaveLength(4);
    } finally {
      release();
    }
  });
}
