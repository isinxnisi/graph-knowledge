import { test, expect, type Page } from "@playwright/test";
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };

const root = examples.neighbors.nodes[0];
const work = examples.neighbors.nodes[1];
const extra = { ...root, id: "008dc14a-7b55-4697-8547-c1201c6df381", name: "別の作者" };
const extraClaim = { ...examples.neighbors.claims[0], id: "bd494b85-3225-42fb-a46e-0d51926357d5", subjectId: extra.id };
const canvasView = (page: Page) => page.getByTestId("graph-canvas").evaluate(el => {
  const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
  return { positions: Object.fromEntries(cy.nodes().map(node => [node.id(), node.position()])), pan: cy.pan(), zoom: cy.zoom() };
});

for (const width of [390, 1440]) {
  test(`探索途中の保存・再読込・休止枝と配置の再開（${width}px）`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const requests: { id: string; after: string | null }[] = [];
    let failChild = false;
    await page.route("**/api/entities/**", async route => {
      const url = new URL(route.request().url());
      const id = url.pathname.split("/")[3];
      if (url.pathname.endsWith("/neighbors")) {
        requests.push({ id, after: url.searchParams.get("after") });
        if (id === work.id && failChild) { await route.fulfill({ status: 503, json: { error: { message: "Unavailable" } } }); return; }
        await route.fulfill({ json: id === root.id ? examples.neighbors : {
          centerId: work.id, nodes: [root, work, extra], claims: [examples.neighbors.claims[0], extraClaim], page: { hasMore: false, nextCursor: null },
        } });
      } else {
        const entity = [...examples.neighbors.nodes, extra].find(node => node.id === id) ?? root;
        await route.fulfill({ json: { entity: { ...entity, aliases: [], event: null } } });
      }
    });
    await page.goto("/");
    await page.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    await page.getByRole("button", { name: "星の航路を選択・展開", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 6 / Claim 8");
    // Inspect the root without fetching again, then close it to suspend the child.
    const navigator = page.getByRole("region", { name: "表示中の対象へ移動", exact: true });
    await navigator.getByRole("button", { name: /表示中の対象へ移動/ }).click();
    await navigator.getByRole("button", { name: /^青葉ハル.*位置と詳細へ移動/ }).click();
    await page.getByTestId("graph-canvas").evaluate(el => {
      const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
      cy.nodes().forEach((node, index) => { node.position({ x: 90 + index * 65, y: 100 + index * 40 }); });
      cy.zoom(0.7); cy.pan({ x: 31, y: 47 });
    });
    const before = await canvasView(page);
    await page.getByRole("region", { name: "選択Entityの隣接関係", exact: true }).getByRole("button", { name: "展開を閉じる", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
    const launch = page.locator("#explorer-graph").getByRole("button", { name: "探索途中を保存・再開", exact: true });
    await launch.click();
    const dialog = page.getByRole("dialog", { name: "探索途中の保存", exact: true });
    await dialog.getByLabel("途中保存の名前").fill("制作の続きを調べる");
    await dialog.getByRole("button", { name: "現在の探索途中を保存", exact: true }).click();
    await expect(dialog.getByRole("status")).toContainText("探索途中を保存しました");
    expect(requests).toHaveLength(2);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("graph-knowledge:workspace:demo")!));
    expect(stored.branches).toEqual([{ id: root.id, open: false, pages: 1 }, { id: work.id, open: true, pages: 1 }]);
    expect(stored.view.positions).toEqual(before.positions);
    expect(stored).not.toHaveProperty("claims");
    await page.screenshot({ path: testInfo.outputPath(`workspace-saved-${width}.png`) });
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);

    await page.reload();
    await page.locator("#explorer-search").getByRole("button", { name: "探索途中を保存・再開", exact: true }).click();
    await expect(dialog).toContainText("制作の続きを調べる");
    await dialog.getByRole("button", { name: "保存した途中を再開", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
    expect(requests.slice(2)).toEqual([{ id: root.id, after: null }, { id: work.id, after: null }]);
    if (width === 390) await expect(page.locator("#explorer-graph")).toBeFocused();
    const collapsed = await canvasView(page);
    expect(collapsed.pan).toEqual(before.pan); expect(collapsed.zoom).toBeCloseTo(before.zoom);
    await page.getByRole("region", { name: "選択Entityの隣接関係", exact: true }).getByRole("button", { name: "展開を再開", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 6 / Claim 8");
    expect(requests).toHaveLength(4);
    expect((await canvasView(page)).positions).toEqual(before.positions);
    await page.screenshot({ path: testInfo.outputPath(`workspace-restored-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    // The root fetch succeeds but a descendant fails: do not replace any active state.
    await launch.click(); failChild = true;
    await dialog.getByRole("button", { name: "保存した途中を再開", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("今の探索はそのまま");
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 6 / Claim 8");
    expect((await canvasView(page)).positions).toEqual(before.positions);
    failChild = false;
    await dialog.getByRole("button", { name: "保存した途中を再開", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
    await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 6 / Claim 8");
    expect((await canvasView(page)).positions).toEqual(before.positions);
    await launch.click();
    await dialog.getByRole("button", { name: "途中保存を削除", exact: true }).click();
    await expect(dialog).toContainText("探索途中はまだ保存していません");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0); await expect(launch).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem("graph-knowledge:workspace:demo"))).toBeNull();
  });
}
