import { test, expect } from "@playwright/test";
import { CLIENT_REQUEST_TIMEOUT_MS } from "../../lib/client/api";
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };

const timeoutText = "取得に時間がかかりすぎたため中断しました";

test("検索の応答が止まっても再検索でき、入力変更による取消はエラーにしない", async ({ page }) => {
  let calls = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/entities?*", async route => {
    if (++calls !== 2) await held;
    await route.fulfill({ json: { items: [examples.entity.entity], hasMore: false } });
  });
  try {
    await page.goto("/");
    const search = page.getByRole("region", { name: "対象を探す", exact: true });
    await search.getByLabel("名前・別名").fill("青葉");
    await page.clock.install();
    await search.getByRole("button", { name: "名前で検索", exact: true }).click();
    await expect.poll(() => calls).toBe(1);
    await expect(search.getByRole("button", { name: "検索中…", exact: true })).toBeDisabled();
    await page.clock.fastForward(CLIENT_REQUEST_TIMEOUT_MS);
    await expect(search.getByRole("alert")).toContainText(timeoutText);
    await search.getByRole("button", { name: "名前で検索", exact: true }).click();
    await expect(search.getByRole("status")).toHaveText("1件の候補");
    await expect(search.getByRole("alert")).toHaveCount(0);
    await search.getByRole("button", { name: "名前で検索", exact: true }).click();
    await expect.poll(() => calls).toBe(3);
    await search.getByLabel("名前・別名").fill("変更後");
    await page.clock.fastForward(CLIENT_REQUEST_TIMEOUT_MS);
    release();
    await expect(search.getByRole("alert")).toHaveCount(0);
    await expect(search.getByRole("status")).toHaveCount(0);
    await expect(search.getByRole("button", { name: "名前で検索", exact: true })).toBeEnabled();
  } finally {
    release();
  }
});

test("近傍の続きが応答しなくてもGraphを維持し同じcursorで再試行できる", async ({ page }) => {
  const requests: (string | null)[] = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const cursor = examples.neighbors.claims[0].id;
  await page.route("**/api/entities/**", async route => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith("/neighbors")) return route.fulfill({ json: examples.entity });
    const after = url.searchParams.get("after");
    requests.push(after);
    if (requests.length === 2) await held;
    await route.fulfill({ json: {
      ...examples.neighbors,
      claims: after ? examples.neighbors.claims.slice(1) : examples.neighbors.claims.slice(0, 1),
      page: { hasMore: !after, nextCursor: after ? null : cursor },
    } });
  });
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
    const view = () => page.getByTestId("graph-canvas").evaluate(el => {
      const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
      return { positions: Object.fromEntries(cy.nodes().map(node => [node.id(), node.position()])), pan: cy.pan(), zoom: cy.zoom() };
    });
    const before = await view();
    const list = page.getByRole("region", { name: "選択Entityの隣接関係", exact: true });
    await page.clock.install();
    await list.getByRole("button", { name: "隣接関係の続きを表示" }).click();
    await expect.poll(() => requests.length).toBe(2);
    await page.clock.fastForward(CLIENT_REQUEST_TIMEOUT_MS);
    await expect(list.getByRole("alert")).toContainText(timeoutText);
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
    expect(await view()).toEqual(before);
    await list.getByRole("button", { name: "隣接関係の取得を再試行" }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    await expect(list.getByRole("alert")).toHaveCount(0);
    expect(requests).toEqual([null, cursor, cursor]);
    const after = await view();
    for (const [id, position] of Object.entries(before.positions)) expect(after.positions[id]).toEqual(position);
    expect(after.pan).toEqual(before.pan);
    expect(after.zoom).toBe(before.zoom);
    // Even a late response from the expired attempt must not change the result.
    release();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    await expect(page.getByTestId("selection-status")).toContainText("青葉ハル");
  } finally {
    release();
  }
});
