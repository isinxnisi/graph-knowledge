import { expect, test } from "@playwright/test";
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };

const root = examples.neighbors.nodes[0];
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};

for (const width of [390, 1440]) {
  test(`URL復元の待機・失敗・再試行で作業領域を動かさず、作成を条件操作の左へ置く（${width}px）`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const first = deferred(), retry = deferred();
    let requests = 0;
    await page.route("**/api/entities/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/neighbors")) {
        await route.fulfill({ json: examples.neighbors });
        return;
      }
      requests += 1;
      if (requests === 1) {
        await first.promise;
        await route.fulfill({ status: 503, json: { error: { code: "SERVICE_UNAVAILABLE", message: "一時的な取得失敗" } } });
      } else {
        await retry.promise;
        await route.fulfill({ json: { entity: { ...root, aliases: [], event: null } } });
      }
    });
    await page.goto(`/explore/${root.id}`);
    const pending = page.getByRole("status").filter({ hasText: "URLから探索を復元しています" });
    await expect(pending).toBeVisible();
    const main = page.locator("main[data-active-pane]");
    const bounds = await main.boundingBox();
    const canvas = await page.getByTestId("graph-canvas").elementHandle();
    expect(canvas).not.toBeNull();
    await expect(page.getByRole("button", { name: "Capsule作成", exact: true, includeHidden: true })).toBeDisabled();

    first.resolve();
    await expect(page.getByRole("alert")).toContainText("探索を完全には復元できませんでした");
    expect(await main.boundingBox()).toEqual(bounds);
    await page.getByRole("button", { name: "再試行", exact: true }).click();
    await expect(pending).toBeVisible();
    expect(await main.boundingBox()).toEqual(bounds);
    retry.resolve();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    await expect(pending).toHaveCount(0);
    expect(await main.boundingBox()).toEqual(bounds);
    expect(await canvas!.evaluate(element => element.isConnected)).toBe(true);

    const create = page.getByRole("button", { name: "Capsule作成", exact: true });
    const edit = page.getByRole("button", { name: "見る関係を編集", exact: true });
    await expect(create).toHaveCount(1);
    await expect(create).toBeEnabled();
    const createBounds = await create.boundingBox(), editBounds = await edit.boundingBox();
    expect(createBounds!.x + createBounds!.width).toBeLessThanOrEqual(editBounds!.x);
    expect(Math.abs(createBounds!.y - editBounds!.y)).toBeLessThan(1);
    expect(editBounds!.x + editBounds!.width).toBeLessThanOrEqual(width);
    expect(requests).toBe(2);
  });
}
