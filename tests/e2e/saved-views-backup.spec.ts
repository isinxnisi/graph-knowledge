import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };

const root = examples.neighbors.nodes[0];
const key = "graph-knowledge:saved-views:demo";
const saved = {
  id: "10000000-0000-4000-8000-000000000001", title: "青葉の制作を別ブラウザで再訪", rootId: root.id,
  conditions: { predicates: ["CONTRIBUTED_TO"], contributionRoles: null, organizationPositions: null, eventRoles: null },
  createdAt: "2026-10-08T12:00:00.000Z",
};
const collection = { version: 1, dataset: "demo", views: [saved] };

for (const width of [390, 1440]) {
  test(`保存ファイルを書き出し、別ブラウザで確認・追加・再訪する（${width}px）`, async ({ page, browser }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.evaluate(({ key, collection }) => localStorage.setItem(key, JSON.stringify(collection)), { key, collection });
    await page.locator("#explorer-search").getByRole("button", { name: "保存・再訪", exact: true }).click();
    const sourceDialog = page.getByRole("dialog", { name: "このブラウザの保存ビュー" });
    await sourceDialog.getByText("ファイルに控える・読み込む", { exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await sourceDialog.getByRole("button", { name: "保存ビューを書き出す", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("graph-knowledge-saved-views-demo.json");
    const path = testInfo.outputPath("saved-views.json");
    await download.saveAs(path);
    const raw = await readFile(path, "utf8");
    expect(JSON.parse(raw)).toEqual(collection);

    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      const destination = await context.newPage();
      const requests: string[] = [];
      await destination.route("**/api/entities/**", async route => {
        const url = new URL(route.request().url()); requests.push(url.pathname + url.search);
        if (url.pathname.endsWith("/neighbors")) {
          const claims = examples.neighbors.claims.filter(claim => claim.predicate === "CONTRIBUTED_TO");
          const ids = new Set([root.id, ...claims.flatMap(claim => [claim.subjectId, claim.objectId])]);
          await route.fulfill({ json: { centerId: root.id, claims, nodes: examples.neighbors.nodes.filter(node => ids.has(node.id)), page: { hasMore: false, nextCursor: null } } });
        } else {
          await route.fulfill({ json: { entity: { ...root, aliases: [], event: null } } });
        }
      });
      await destination.goto(page.url());
      await destination.locator("#explorer-search").getByRole("button", { name: "保存・再訪", exact: true }).click();
      const dialog = destination.getByRole("dialog", { name: "このブラウザの保存ビュー" });
      await dialog.getByText("ファイルに控える・読み込む", { exact: true }).click();
      const input = dialog.getByLabel("保存ビューのJSONファイル");
      await input.setInputFiles({ name: "wrong-dataset.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...collection, dataset: "pilot-event-v1" })) });
      await expect(dialog.getByRole("alert")).toContainText("別のデータセット");
      expect(await destination.evaluate(key => localStorage.getItem(key), key)).toBeNull();
      await input.setInputFiles(path);
      await expect(dialog.getByRole("region", { name: "読み込む内容の確認" })).toContainText(saved.title);
      await expect(dialog.getByRole("status")).toContainText("追加予定：1件");
      expect(await destination.evaluate(key => localStorage.getItem(key), key)).toBeNull();
      await dialog.getByRole("button", { name: "読み込みを取り消す", exact: true }).click();
      await expect(input).toBeFocused();
      await expect(dialog.getByRole("region", { name: "読み込む内容の確認" })).toHaveCount(0);
      await input.setInputFiles(path);
      await expect(dialog.getByRole("status")).toContainText("追加予定：1件");
      await dialog.getByRole("button", { name: "確認したビューを追加", exact: true }).scrollIntoViewIfNeeded();
      await destination.screenshot({ path: testInfo.outputPath(`backup-preview-${width}.png`) });
      expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await dialog.getByRole("button", { name: "確認したビューを追加", exact: true }).click();
      await expect(dialog.getByRole("status")).toContainText("1件を追加しました");
      await expect(input).toBeFocused();
      expect(requests).toEqual([]);
      expect(await destination.evaluate(key => JSON.parse(localStorage.getItem(key)!), key)).toEqual(collection);

      await input.setInputFiles(path);
      await expect(dialog.getByRole("status")).toContainText("追加予定：0件 / 保存済みで追加しない：1件");
      await expect(dialog.getByRole("button", { name: "確認したビューを追加", exact: true })).toBeDisabled();
      await dialog.getByRole("button", { name: "読み込みを取り消す", exact: true }).click();
      await input.setInputFiles({ name: "conflicting.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...collection, views: [{ ...saved, title: "異なる内容" }] })) });
      await expect(dialog.getByRole("alert")).toContainText("同じ保存IDで内容の異なるビュー");
      await expect(dialog.getByRole("button", { name: "確認したビューを追加", exact: true })).toBeDisabled();
      expect(await destination.evaluate(key => JSON.parse(localStorage.getItem(key)!), key)).toEqual(collection);
      await destination.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(destination.locator("#explorer-search").getByRole("button", { name: "保存・再訪", exact: true })).toBeFocused();
      await destination.reload();
      await destination.locator("#explorer-search").getByRole("button", { name: "保存・再訪", exact: true }).click();
      await dialog.getByRole("button", { name: `${saved.title}を開く`, exact: true }).click();
      await expect(destination.getByTestId("exploration-root")).toContainText(root.name);
      await expect(destination.getByTestId("active-predicates")).toContainText("作品制作への関与");
      await expect(destination.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
      expect(requests[0]).toBe(`/api/entities/${root.id}`);
      expect(requests.filter(url => url.includes("/neighbors"))).toEqual([`/api/entities/${root.id}/neighbors?predicates=CONTRIBUTED_TO`]);
      // The selected entity detail may also read the root after it opens.
      expect(requests.every(url => url === `/api/entities/${root.id}` || url === `/api/entities/${root.id}/neighbors?predicates=CONTRIBUTED_TO`)).toBe(true);
    } finally { await context.close(); }
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key)).toEqual(collection);
  });
}
