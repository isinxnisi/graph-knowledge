import { test, expect } from "@playwright/test";
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };

const root = examples.neighbors.nodes[0];
const work = examples.neighbors.nodes[1];
const dialogName = "このブラウザの保存ビュー";

for (const width of [390, 1440]) {
  test(`保存・再読込・条件付き再訪・直前復帰・削除（${width}px）`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const requests: { id: string; query: string }[] = [];
    let missing = false;
    await page.route("**/api/entities/**", async route => {
      const url = new URL(route.request().url());
      const id = url.pathname.split("/")[3];
      if (url.pathname.endsWith("/neighbors")) {
        requests.push({ id, query: url.search });
        const predicates = url.searchParams.get("predicates");
        const claims = examples.neighbors.claims.filter(claim => (claim.subjectId === id || claim.objectId === id) && (predicates === null || predicates.split(",").includes(claim.predicate)));
        const nodeIds = new Set([id, ...claims.flatMap(claim => [claim.subjectId, claim.objectId])]);
        await route.fulfill({ json: { centerId: id, claims, nodes: examples.neighbors.nodes.filter(node => nodeIds.has(node.id)), page: { hasMore: false, nextCursor: null } } });
      } else if (missing && id === root.id) {
        await route.fulfill({ status: 404, json: { error: { message: "Missing" } } });
      } else {
        const entity = examples.neighbors.nodes.find(node => node.id === id) ?? root;
        await route.fulfill({ json: { entity: { ...entity, aliases: [], event: null } } });
      }
    });
    await page.goto("/");
    await page.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    await page.getByRole("button", { name: "見る関係を編集", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "見る関係の編集" });
    await editor.getByRole("radio", { name: "関係の種類から選ぶ", exact: true }).check();
    await editor.getByRole("checkbox", { name: "作品制作への関与", exact: true }).check();
    await editor.getByRole("button", { name: "適用", exact: true }).click();
    await expect(page.getByTestId("active-predicates")).toContainText("作品制作への関与");
    await page.locator("#explorer-graph").getByRole("button", { name: "保存・再訪", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: dialogName });
    await dialog.getByLabel("保存ビューの名前").fill("青葉の制作を再訪");
    await dialog.getByRole("button", { name: "現在の起点と条件を保存", exact: true }).click();
    await expect(dialog.getByRole("status")).toContainText("保存しました");
    await expect(dialog.getByRole("button", { name: "青葉の制作を再訪を開く" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`saved-views-${width}.png`) });
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("graph-knowledge:saved-views:demo")!));
    expect(stored.views[0]).toMatchObject({ rootId: root.id, conditions: { predicates: ["CONTRIBUTED_TO"], contributionRoles: null, organizationPositions: null, eventRoles: null } });
    expect(stored.views[0]).not.toHaveProperty("nodes");
    await page.reload();
    await page.locator("#explorer-search").getByRole("button", { name: "保存・再訪", exact: true }).click();
    dialog = page.getByRole("dialog", { name: dialogName });
    await expect(dialog).toContainText("探索の起点を選ぶと保存できます");
    const before = requests.length;
    await dialog.getByRole("button", { name: "青葉の制作を再訪を開く" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("exploration-root")).toContainText(root.name);
    await expect(page.getByTestId("active-predicates")).toContainText("作品制作への関与");
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
    expect(requests.slice(before)).toEqual([{ id: root.id, query: "?predicates=CONTRIBUTED_TO" }]);
    if (width === 390) await expect(page.locator("#explorer-graph")).toBeFocused();

    // Opening an unavailable saved root leaves the current graph and conditions intact.
    const navigator = page.getByRole("region", { name: "表示中の対象へ移動", exact: true });
    await navigator.getByRole("button", { name: /表示中の対象へ移動/ }).click();
    await navigator.getByRole("button", { name: /^星の航路.*位置と詳細へ移動/ }).click();
    if (width === 390) await page.getByRole("navigation", { name: "探索画面の切り替え" }).getByRole("button", { name: "選択の詳細", exact: true }).click();
    await page.getByRole("button", { name: "この対象から広く見る", exact: true }).click();
    await expect(page.getByTestId("exploration-root")).toContainText(work.name);
    await expect(page.getByTestId("active-predicates")).toContainText("すべての関係");
    await page.locator("#explorer-graph").getByRole("button", { name: "保存・再訪", exact: true }).click();
    missing = true;
    await dialog.getByRole("button", { name: "青葉の制作を再訪を開く" }).click();
    await expect(dialog.getByRole("alert")).toContainText("起点が見つかりません");
    await expect(page.getByTestId("exploration-root")).toContainText(work.name);
    missing = false;
    await dialog.getByRole("button", { name: "青葉の制作を再訪を開く" }).click();
    await expect(page.getByTestId("exploration-root")).toContainText(root.name);
    await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click();
    await expect(page.getByTestId("exploration-root")).toContainText(work.name);
    await expect(page.getByTestId("active-predicates")).toContainText("すべての関係");
    await page.locator("#explorer-graph").getByRole("button", { name: "保存・再訪", exact: true }).click();
    await dialog.getByRole("button", { name: "青葉の制作を再訪を削除" }).click();
    await expect(dialog.getByRole("button", { name: "青葉の制作を再訪を開く" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("#explorer-graph").getByRole("button", { name: "保存・再訪", exact: true })).toBeFocused();
    await page.reload();
    await page.locator("#explorer-search").getByRole("button", { name: "保存・再訪", exact: true }).click();
    await expect(dialog).toContainText("まだ保存ビューはありません");
  });
}
