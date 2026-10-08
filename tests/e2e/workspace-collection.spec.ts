import { test, expect, type Page } from "@playwright/test";
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };

const root = examples.neighbors.nodes[0];
const key = "graph-knowledge:workspace:demo";
const entries = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).workspaces as { id: string; title: string; branches: { open: boolean }[] }[], key);

for (const width of [390, 1440]) {
  test(`複数の調査を保存し選択した途中だけを再開・置換・削除する（${width}px）`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    let neighborRequests = 0;
    await page.route("**/api/entities/**", async route => {
      if (new URL(route.request().url()).pathname.endsWith("/neighbors")) {
        neighborRequests++;
        await route.fulfill({ json: examples.neighbors });
      } else await route.fulfill({ json: { entity: { ...root, aliases: [], event: null } } });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    const launch = page.locator("#explorer-graph").getByRole("button", { name: "探索途中を保存・再開", exact: true });
    const dialog = page.getByRole("dialog", { name: "探索途中の保存", exact: true });
    await launch.click();
    await dialog.getByLabel("途中保存の名前").fill("広く辿る調査");
    await dialog.getByRole("button", { name: "現在の探索途中を保存", exact: true }).click();
    const [wide] = await entries(page);
    await page.keyboard.press("Escape");
    await page.getByRole("region", { name: "選択Entityの隣接関係", exact: true }).getByRole("button", { name: "展開を閉じる", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
    await launch.click();
    await dialog.getByLabel("途中保存の名前").fill("閉じて休止した調査");
    await dialog.getByRole("button", { name: "現在の探索途中を保存", exact: true }).click();
    const [closed, preserved] = await entries(page);
    expect(preserved).toEqual(wide);
    expect(closed.branches[0].open).toBe(false);
    expect(neighborRequests).toBe(1);
    await expect(dialog).toContainText("2 / 10件を保存済み");
    await dialog.getByLabel("再開・管理する途中保存").selectOption(wide.id);
    await expect(dialog.getByRole("heading", { name: "広く辿る調査", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`workspace-collection-${width}.png`) });
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await dialog.getByRole("button", { name: "保存した途中を再開", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    expect(neighborRequests).toBe(2);

    await page.reload();
    await page.locator("#explorer-search").getByRole("button", { name: "探索途中を保存・再開", exact: true }).click();
    await expect(dialog.getByLabel("再開・管理する途中保存")).toHaveValue(closed.id);
    await dialog.getByRole("button", { name: "保存した途中を再開", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
    expect(neighborRequests).toBe(3);

    await launch.click();
    await dialog.getByLabel("途中保存の名前").fill("休止した調査の続き");
    await dialog.getByRole("button", { name: "「閉じて休止した調査」を現在の探索で置き換える", exact: true }).click();
    const [updated, untouched] = await entries(page);
    expect(updated.id).not.toBe(closed.id); expect(updated.title).toBe("休止した調査の続き");
    expect(untouched).toEqual(wide);
    await dialog.getByLabel("再開・管理する途中保存").selectOption(wide.id);
    await dialog.getByRole("button", { name: "途中保存を削除", exact: true }).click();
    await expect(dialog).toContainText("「広く辿る調査」を削除しますか？");
    await dialog.getByRole("button", { name: "削除を取り消す", exact: true }).click();
    expect(await entries(page)).toHaveLength(2);
    await dialog.getByRole("button", { name: "途中保存を削除", exact: true }).click();
    await dialog.getByRole("button", { name: "この途中保存を削除する", exact: true }).click();
    expect(await entries(page)).toEqual([updated]);
    await expect(dialog.getByLabel("再開・管理する途中保存")).toHaveValue("");
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
    expect(neighborRequests).toBe(3);
    await page.keyboard.press("Escape");
    await expect(launch).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
