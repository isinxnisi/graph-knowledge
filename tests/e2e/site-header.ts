import { test, expect, type Page } from "@playwright/test";

async function graphView(page: Page) {
  return page.getByTestId("graph-canvas").evaluate(el => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return { nodes: cy.nodes().map(node => ({ id: node.id(), position: node.position() })), edges: cy.edges().map(edge => edge.id()), pan: cy.pan(), zoom: cy.zoom() };
  });
}

export function checkSiteHeader(example: string, counts: string) {
  for (const width of [1440, 390]) {
    test(`共通ヘッダのテーマ・別タブ入口が探索状態を維持する ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/");
      const header = page.getByTestId("site-header");
      await expect(header.getByRole("heading", { level: 1 })).toHaveText("関係性を探索する");
      await page.getByRole("button", { name: `${example}から探索を開始`, exact: true }).click();
      await expect(page.getByTestId("graph-counts")).toHaveText(counts);
      if (width === 1440) {
        const sideScroll = () => page.evaluate(() => ["explorer-search", "explorer-detail"].map(id => document.getElementById(id)!.scrollTop));
        const sides = await sideScroll();
        const center = page.locator("#explorer-graph");
        await center.hover({ position: { x: 80, y: 25 } });
        await page.mouse.wheel(0, 500);
        await expect.poll(() => center.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
        expect(await sideScroll()).toEqual(sides);
        await center.evaluate(el => el.scrollTo({ top: 0 }));
      }
      const before = await graphView(page);
      let requests = 0;
      page.on("request", request => { if (request.url().includes("/neighbors")) requests++; });
      await header.getByRole("button", { name: "ダークモード", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark-brown");
      await header.getByLabel("ダーク配色").selectOption("blue");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark-blue");
      await header.getByRole("button", { name: "ダークモード", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      const popupPromise = page.waitForEvent("popup");
      await header.getByRole("link", { name: "アカウントを開く（別タブ）", exact: true }).click();
      const account = await popupPromise;
      await expect(account.getByRole("heading", { level: 1 })).toHaveText("アカウントのCapsule");
      await expect(account.getByRole("region", { name: "アカウントのCapsule", exact: true }).getByRole("alert")).toContainText("会員保存を現在利用できません");
      await expect(account.getByRole("button", { name: "Googleで登録・ログイン" })).toHaveCount(0);
      await expect(account.getByTestId("site-header").locator('[aria-current="page"]')).toHaveText("アカウント");
      await expect(account.getByTestId("site-header").getByRole("link", { name: "探索を開く（別タブ）", exact: true })).toHaveAttribute("target", "_blank");
      expect(await account.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 1440) await account.screenshot({ path: "test-results/step8-account.png" });
      await account.close();
      await page.bringToFront();
      expect(await graphView(page)).toEqual(before);
      expect(requests).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/step8-explore-${width}.png` });
      // 共有リンクのtokenを伴わない入口でも、共通ヘッダと既存の失効表示を維持。
      await page.goto("/shared");
      await expect(page.getByTestId("site-header")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    });
  }
}
