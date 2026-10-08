import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };

const root = examples.neighbors.nodes[0];
const work = examples.neighbors.nodes[1];
const key = "graph-knowledge:workspace:demo";
const workspace = {
  version: 1, dataset: "demo", id: "10000000-0000-4000-8000-000000000001",
  title: "制作の枝と配置を持ち運ぶ", savedAt: "2026-10-08T12:00:00.000Z", rootId: root.id,
  conditions: { predicates: null, contributionRoles: null, organizationPositions: null, eventRoles: null },
  branches: [{ id: root.id, open: false, pages: 1 }, { id: work.id, open: true, pages: 1 }],
  view: {
    positions: Object.fromEntries(examples.neighbors.nodes.map((node, index) => [node.id, { x: 100 + index * 70, y: 90 + index * 30 }])),
    pan: { x: 31, y: 47 }, zoom: 0.7, initialLayoutDone: true,
  },
};
const readWorkspace = (page: Page) => page.evaluate(key => {
  const stored = JSON.parse(localStorage.getItem(key)!);
  return stored?.version === 2 ? stored.workspaces[0] ?? null : stored;
}, key);

for (const width of [390, 1440]) {
  test(`途中保存の控えを別ブラウザで確認し、枝と配置から再開する（${width}px）`, async ({ page, browser }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.evaluate(({ key, workspace }) => localStorage.setItem(key, JSON.stringify(workspace)), { key, workspace });
    await page.locator("#explorer-search").getByRole("button", { name: "探索途中を保存・再開", exact: true }).click();
    const source = page.getByRole("dialog", { name: "探索途中の保存", exact: true });
    await source.getByText("途中保存をファイルに控える・読み込む", { exact: true }).click();
    const downloading = page.waitForEvent("download");
    await source.getByRole("button", { name: "途中保存を書き出す", exact: true }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("graph-knowledge-workspace-demo.json");
    const path = testInfo.outputPath("workspace.json");
    await download.saveAs(path);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(workspace);

    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      const destination = await context.newPage();
      const requests: string[] = [];
      await destination.route("**/api/entities/**", async route => {
        const url = new URL(route.request().url()); requests.push(url.pathname + url.search);
        if (url.pathname.endsWith("/neighbors")) {
          const id = url.pathname.split("/")[3];
          await route.fulfill({ json: id === root.id ? examples.neighbors : {
            centerId: work.id, nodes: [root, work], claims: [examples.neighbors.claims[0]], page: { hasMore: false, nextCursor: null },
          } });
        } else await route.fulfill({ json: { entity: { ...root, aliases: [], event: null } } });
      });
      await destination.goto(page.url());
      const launch = destination.locator("#explorer-search").getByRole("button", { name: "探索途中を保存・再開", exact: true });
      await launch.click();
      const dialog = destination.getByRole("dialog", { name: "探索途中の保存", exact: true });
      await dialog.getByText("途中保存をファイルに控える・読み込む", { exact: true }).click();
      const input = dialog.getByLabel("途中保存のJSONファイル");
      await input.setInputFiles({ name: "other.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...workspace, dataset: "pilot-event-v1" })) });
      await expect(dialog.getByRole("alert")).toContainText("別のデータセット");
      expect(await readWorkspace(destination)).toBeNull();
      await input.setInputFiles(path);
      const preview = dialog.getByRole("region", { name: "読み込む途中保存の確認" });
      await expect(preview).toContainText(workspace.title);
      await expect(preview).toContainText("保存した枝：2件 / 取得済み：2ページ");
      await expect(preview).toContainText(root.id);
      expect(await readWorkspace(destination)).toBeNull();
      await dialog.getByRole("button", { name: "ファイルの読み込みを取り消す", exact: true }).click();
      await expect(input).toBeFocused(); await expect(preview).toHaveCount(0);
      await input.setInputFiles(path);
      await dialog.getByRole("button", { name: "確認した途中保存を読み込む", exact: true }).scrollIntoViewIfNeeded();
      await destination.screenshot({ path: testInfo.outputPath(`workspace-import-${width}.png`) });
      expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await dialog.getByRole("button", { name: "確認した途中保存を読み込む", exact: true }).click();
      await expect(dialog.getByRole("status")).toContainText("ファイルの途中保存を保存しました");
      await expect(input).toBeFocused();
      const imported = await readWorkspace(destination);
      expect(imported.id).not.toBe(workspace.id);
      expect({ ...imported, id: workspace.id }).toEqual(workspace);
      expect(requests).toEqual([]);

      // Replacement is now opt-in; additions preserve all existing entries.
      await dialog.getByRole("checkbox").check();
      await input.setInputFiles(path);
      await expect(preview).toContainText(`「${workspace.title}」を置き換えます`);
      const otherTab = await context.newPage();
      await otherTab.goto(page.url());
      const changed = { ...imported, id: "10000000-0000-4000-8000-000000000002", title: "別タブの続き" };
      await otherTab.evaluate(({ key, changed }) => localStorage.setItem(key, JSON.stringify(changed)), { key, changed });
      await otherTab.close();
      await expect(dialog.getByRole("alert")).toContainText("確認中に保存内容が変わりました");
      await expect(dialog.getByRole("button", { name: "確認したファイルで途中保存を置き換える", exact: true })).toBeDisabled();
      expect(await readWorkspace(destination)).toEqual(changed);
      await dialog.getByLabel("再開・管理する途中保存").selectOption(changed.id);
      await input.setInputFiles(path);
      await expect(preview).toContainText("「別タブの続き」を置き換えます");
      await dialog.getByRole("button", { name: "確認したファイルで途中保存を置き換える", exact: true }).click();
      expect((await readWorkspace(destination)).id).not.toBe(imported.id);
      expect(requests).toEqual([]);
      await destination.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0); await expect(launch).toBeFocused();
      await destination.reload();
      await launch.click();
      await dialog.getByRole("button", { name: "保存した途中を再開", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(destination.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
      expect(requests.filter(url => url.includes("/neighbors"))).toEqual([`/api/entities/${root.id}/neighbors`, `/api/entities/${work.id}/neighbors`]);
      await destination.getByRole("region", { name: "選択Entityの隣接関係", exact: true }).getByRole("button", { name: "展開を再開", exact: true }).click();
      await expect(destination.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
      const restored = await destination.getByTestId("graph-canvas").evaluate(el => {
        const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
        return { positions: Object.fromEntries(cy.nodes().map(node => [node.id(), node.position()])), pan: cy.pan(), zoom: cy.zoom() };
      });
      expect(restored.positions).toEqual(workspace.view.positions);
      expect(restored.pan).toEqual(workspace.view.pan); expect(restored.zoom).toBeCloseTo(workspace.view.zoom);
      expect(requests.filter(url => url.includes("/neighbors"))).toHaveLength(2);
      expect(await destination.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally { await context.close(); }
    expect(await readWorkspace(page)).toEqual(workspace);
  });
}
