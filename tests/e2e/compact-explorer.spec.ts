import { test, expect, type Page } from "@playwright/test";
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };

async function canvasView(page: Page) {
  return page.getByTestId("graph-canvas").evaluate(el => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return { positions: Object.fromEntries(cy.nodes().map(node => [node.id(), node.position()])), pan: cy.pan(), zoom: cy.zoom() };
  });
}

for (const width of [390, 320]) {
  test(`${width}px幅で検索・Graph・根拠を往復し状態とフォーカスを維持する`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    let neighborRequests = 0;
    const primary = examples.claim;
    await page.route("**/api/entities**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/neighbors")) {
        neighborRequests++;
        await route.fulfill({ json: examples.neighbors });
      } else if (url.pathname === "/api/entities") {
        await route.fulfill({ json: { items: [examples.entity.entity], hasMore: false } });
      } else await route.fulfill({ json: examples.entity });
    });
    await page.route("**/api/claims/**", async route => {
      const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
      await route.fulfill({ json: id === primary.claim.id ? primary : { claim: { ...primary.claim, id, citations: [] }, relatedClaimIds: [] } });
    });
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "探索画面の切り替え" });
    const search = page.locator("#explorer-search");
    const graph = page.locator("#explorer-graph");
    const detail = page.locator("#explorer-detail");
    await expect(search).toBeVisible();
    await expect(graph).toBeHidden();
    await expect(detail).toBeHidden();
    await page.locator("#entity-search").fill("青葉");
    await search.getByRole("button", { name: "名前で検索", exact: true }).click();
    await search.getByRole("button", { name: /青葉ハル —/ }).click();
    await expect(graph).toBeVisible();
    await expect(graph).toBeFocused();
    await expect(search).toBeHidden();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    await expect(nav.getByRole("button", { name: "Graph", exact: true })).toHaveAttribute("aria-pressed", "true");
    await graph.getByRole("button", { name: "全体を表示", exact: true }).click();
    const before = await canvasView(page);
    await page.screenshot({ path: `test-results/compact-graph-${width}.png` });
    await graph.getByTestId(`relation-${primary.claim.id}`).getByRole("button", { name: "主張と出典を見る" }).click();
    await expect(detail).toBeVisible();
    await expect(detail).toBeFocused();
    await expect(graph).toBeHidden();
    const metadata = page.getByTestId(`claim-card-${primary.claim.id}`).locator("details").first();
    await metadata.locator("summary").click();
    await expect(metadata).toHaveAttribute("open", "");
    await page.screenshot({ path: `test-results/compact-detail-${width}.png` });
    for (const name of ["検索", "Graph", "選択の詳細"]) {
      await nav.getByRole("button", { name, exact: true }).click();
      expect(await page.locator("main").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await expect(metadata).toHaveAttribute("open", "");
    await nav.getByRole("button", { name: "検索", exact: true }).click();
    await expect(page.locator("#entity-search")).toHaveValue("青葉");
    await expect(search.getByRole("button", { name: /青葉ハル —/ })).toBeVisible();
    await nav.getByRole("button", { name: "Graph", exact: true }).click();
    expect(await canvasView(page)).toEqual(before);
    expect(neighborRequests).toBe(1);

    // Resizing restores the three-column view without remounting or losing the selection.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(nav).toBeHidden();
    await expect(search).toBeVisible();
    await expect(graph).toBeVisible();
    await expect(detail).toBeVisible();
    await expect(metadata).toHaveAttribute("open", "");
    await page.setViewportSize({ width, height: 844 });
    await expect(graph).toBeVisible();
    await expect(detail).toBeHidden();
    expect(neighborRequests).toBe(1);
  });
}

test("非表示中に初回取得が完了してもGraphを配置でき、線から根拠へ進める", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/entities/**", async route => {
    if (new URL(route.request().url()).pathname.endsWith("/neighbors")) {
      await pending;
      await route.fulfill({ json: examples.neighbors });
    } else await route.fulfill({ json: examples.entity });
  });
  await page.route("**/api/claims/**", route => route.fulfill({ json: { ...examples.claim, relatedClaimIds: [] } }));
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).click();
    const nav = page.getByRole("navigation", { name: "探索画面の切り替え" });
    await nav.getByRole("button", { name: "検索", exact: true }).click();
    release();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    await nav.getByRole("button", { name: "Graph", exact: true }).click();
    const view = await canvasView(page);
    expect(Object.values(view.positions).every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
    expect(new Set(Object.values(view.positions).map(point => `${point.x},${point.y}`)).size).toBe(5);
    await page.getByTestId("graph-canvas").evaluate(el => {
      const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
      cy.edges().first().emit("tap");
    });
    await expect(page.locator("#explorer-detail")).toBeFocused();
    await expect(page.getByRole("region", { name: "Claim詳細", exact: true })).toBeVisible();
    await nav.getByRole("button", { name: "Graph", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#explorer-graph")).toBeFocused();
  } finally { release(); }
});

test("狭い画面で条件編集・Entity詳細からの起点切替・直前探索への復帰を使える", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const work = examples.neighbors.nodes.find(node => node.kind === "work")!;
  let neighborRequests = 0;
  await page.route("**/api/entities/**", async route => {
    const url = new URL(route.request().url());
    const id = url.pathname.split("/")[3];
    if (url.pathname.endsWith("/neighbors")) {
      neighborRequests++;
      await route.fulfill({ json: { ...examples.neighbors, centerId: id } });
    } else {
      const entity = examples.neighbors.nodes.find(node => node.id === id)!;
      await route.fulfill({ json: { entity: { ...entity, aliases: [], event: null } } });
    }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  await page.getByRole("button", { name: "見る関係を編集", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await dialog.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: /表示中の対象へ移動/ }).click();
  await page.getByRole("button", { name: /^星の航路.*位置と詳細へ移動/ }).click();
  const before = await canvasView(page);
  const nav = page.getByRole("navigation", { name: "探索画面の切り替え" });
  await nav.getByRole("button", { name: "選択の詳細", exact: true }).click();
  await expect(page.getByRole("region", { name: "Entity詳細", exact: true }).getByRole("heading", { name: work.name })).toBeVisible();
  await page.getByRole("button", { name: "この対象から広く見る", exact: true }).click();
  await expect(page.locator("#explorer-graph")).toBeFocused();
  await expect(page.getByTestId("exploration-root")).toContainText(work.name);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click();
  await expect(page.getByTestId("exploration-root")).toContainText("青葉ハル");
  expect(await canvasView(page)).toEqual(before);
  expect(neighborRequests).toBe(2);
});
