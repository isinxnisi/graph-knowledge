import { test, expect, type Page } from "@playwright/test";
import fixture from "../../fixtures/demo.json" with { type: "json" };
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };
const root = examples.neighbors.nodes[0];
async function search(page: Page, name: string) {
  await page.getByLabel("人物名・別名").fill(name); await page.getByRole("button", { name: "検索", exact: true }).click();
}
async function choose(page: Page, name = "青葉ハル") {
  await search(page, name); await page.getByRole("button", { name: new RegExp(`^${name} —`) }).first().click();
}
async function canvasTap(page: Page, id: string, edge = false) {
  const point = await page.getByTestId("graph-canvas").evaluate(async (el, args) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    const target = cy.getElementById(args.id);
    cy.zoom(1); cy.center(target);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const p = args.edge ? target.renderedMidpoint() : target.renderedPosition();
    return { x: p.x, y: p.y };
  }, { id, edge });
  await page.getByTestId("graph-canvas").click({ position: point });
}
test.beforeEach(async ({ page }) => { await page.goto("/"); await expect(page.getByText("架空のデモデータ", { exact: true })).toBeVisible(); });
test("実DB: 検索・Graph・Work展開・循環・出典比較", async ({ page }) => {
  await choose(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  const cyData = () => page.getByTestId("graph-canvas").evaluate((el) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return { positions: Object.fromEntries(cy.nodes().map((n) => [n.id(), n.position()])), denied: cy.edges('[polarity="denied"]').map((e) => ({ label: e.data("label"), line: e.style("line-style"), arrow: e.style("target-arrow-shape") })) };
  });
  const before = await cyData(); expect(before.denied).toEqual([expect.objectContaining({ label: expect.stringContaining("否定"), line: "dashed", arrow: "triangle" })]);
  await canvasTap(page, fixture.entities[8].id);
  await expect(page.getByRole("heading", { name: "星の航路の隣接関係" })).toBeVisible();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 7 / Claim 9");
  const after = await cyData(); for (const [id, position] of Object.entries(before.positions)) expect(after.positions[id]).toEqual(position);
  await canvasTap(page, fixture.entities[3].id); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 8 / Claim 10");
  await canvasTap(page, root.id); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 8 / Claim 10");
  await canvasTap(page, fixture.claims[0].id, true);
  await expect(page.getByTestId(`claim-card-${fixture.claims[0].id}`)).toContainText("出典 2件");
  await expect(page.getByTestId(`claim-card-${fixture.claims[0].id}`)).toContainText("pp.12–13");
  await expect(page.getByTestId(`claim-card-${fixture.claims[1].id}`)).toContainText("2002年〜2004年");
  await expect(page.getByTestId(`claim-card-${fixture.claims[2].id}`)).toContainText("否定する主張");
  await expect(page.getByRole("link", { name: "出典のURLを開く" })).toHaveCount(0);
  await page.screenshot({ path: "/tmp/graph-knowledge-step4.png", fullPage: true });
});
test("実DB: 同名人物・出典未確認・孤立・検索結果なし・テキスト操作", async ({ page }) => {
  await search(page, "佐藤アキ"); const candidates = page.getByRole("button", { name: /^佐藤アキ —/ }); await expect(candidates).toHaveCount(2);
  expect(await candidates.nth(0).getAttribute("aria-label")).not.toBe(await candidates.nth(1).getAttribute("aria-label"));
  await page.getByRole("button", { name: `佐藤アキ — ${fixture.entities[5].description}` }).click();
  await page.getByTestId(`relation-${fixture.claims[12].id}`).getByRole("button", { name: "主張と出典を見る" }).click();
  await expect(page.getByTestId(`claim-card-${fixture.claims[12].id}`)).toContainText("出典未確認");
  await choose(page, "森ユウ"); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
  await expect(page.getByText("関係は登録されていません（孤立Entity）。")).toBeVisible();
  await choose(page); await page.getByTestId(`relation-${fixture.claims[6].id}`).getByRole("button", { name: "星の航路を選択・展開" }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 7 / Claim 9");
  await search(page, "存在しない人物XYZ"); await expect(page.getByText(/検索結果はありません/)).toBeVisible();
});
test("実DB: ページング・取得中・二重取得抑止", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/entities/*/neighbors*", async (route) => {
    requests++; const url = new URL(route.request().url()); url.searchParams.set("limit", "2");
    const response = await route.fetch({ url: url.toString() });
    if (url.searchParams.has("after")) await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({ response });
  });
  await choose(page); await expect(page.getByTestId("graph-counts")).toContainText("Claim 2");
  for (const count of [4, 6, 7]) {
    await page.getByRole("button", { name: "続きを表示", exact: true }).click();
    await expect(page.getByRole("button", { name: "続きを取得中…" })).toBeDisabled();
    await expect(page.getByTestId("graph-counts")).toContainText(`Claim ${count}`);
  }
  expect(requests).toBe(4); await expect(page.getByRole("button", { name: "続きを表示", exact: true })).toHaveCount(0);
});
for (const kind of ["Entity", "Claim"] as const) {
  test(`${kind}上限: 超過ページを追加しない`, async ({ page }) => {
    let index = 0;
    await page.route("**/api/entities/*/neighbors*", async (route) => {
      const start = index++ * 20;
      const nodes = kind === "Entity" ? Array.from({ length: 20 }, (_, i) => ({ ...root, id: `00000000-0000-4000-8000-${String(start+i+1).padStart(12,"0")}`, name: `追加人物${start+i}` })) : [{ ...root, id: fixture.entities[1].id }];
      const claims = Array.from({ length: 20 }, (_, i) => ({ ...examples.neighbors.claims[0], id: `10000000-0000-4000-8000-${String(start+i+1).padStart(12,"0")}`, subjectId: root.id, objectId: nodes[kind === "Entity" ? i : 0].id }));
      await route.fulfill({ json: { centerId: root.id, nodes: [root,...nodes], claims, page: { nextCursor: claims[19].id, hasMore: true } } });
    });
    await choose(page); await expect(page.getByTestId("graph-counts")).toContainText("Claim 20");
    const pages = kind === "Entity" ? 4 : 10;
    for (let i = 1; i < pages; i++) {
      await page.getByRole("button", { name: "続きを表示", exact: true }).click();
      await expect(page.getByTestId("graph-counts")).toContainText(`Claim ${(i+1)*20}`);
    }
    const counts = await page.getByTestId("graph-counts").textContent();
    await page.getByRole("button", { name: "続きを表示", exact: true }).click();
    await expect(page.getByText(/表示上限に達したため/).first()).toBeVisible();
    await expect(page.getByTestId("graph-counts")).toHaveText(counts!);
    await expect(page.getByRole("button", { name: "続きを表示", exact: true })).toBeDisabled();
  });
}
test("API失敗・DB unavailable・Graph再試行", async ({ page }) => {
  await page.route("**/api/entities?*", (r) => r.fulfill({ status: 503, json: { error: { code: "SERVICE_UNAVAILABLE", message: "unavailable" } } }));
  await search(page, "青葉ハル"); await expect(page.getByRole("alert").filter({ hasText: "データベース" })).toContainText("データベース");
  await page.unroute("**/api/entities?*");
  await page.route("**/api/entities/*/neighbors*", (r) => r.fulfill({ status: 500, json: { error: { code: "INTERNAL_ERROR", message: "取得に失敗しました。" } } }));
  await choose(page); await expect(page.getByRole("alert").filter({ hasText: "取得に失敗しました。" })).toContainText("取得に失敗しました。");
  await page.unroute("**/api/entities/*/neighbors*"); await page.getByRole("button", { name: "Graph取得を再試行" }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
});

test("Step 5: 全体展開・同名補助・並行Claim・選択と一覧の同期", async ({ page }) => {
  await choose(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  await page.screenshot({ path: "/tmp/graph-knowledge-step5-initial.png", fullPage: true });
  const positions = () => page.getByTestId("graph-canvas").evaluate((el) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return Object.fromEntries(cy.nodes().map((node) => [node.id(), node.position()]));
  });
  for (const index of [8, 3, 1, 2, 4, 9, 10, 11]) {
    const before = await positions();
    await canvasTap(page, fixture.entities[index].id);
    await expect(page.getByRole("region", { name: "Entity詳細" })).toContainText("近傍は取得済み");
    const after = await positions(); for (const [id, position] of Object.entries(before)) expect(after[id]).toEqual(position);
  }
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 11 / Claim 15");
  const labels = await page.getByTestId("graph-canvas").evaluate((el, ids) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return ids.map((id) => cy.getElementById(id).data("label"));
  }, [fixture.entities[5].id, fixture.entities[6].id, root.id]);
  expect(labels[0]).toMatch(/^佐藤アキ\n漫画家/); expect(labels[1]).toMatch(/^佐藤アキ\n編集者/); expect(labels[2]).toBe("青葉ハル");
  const midpoints = await page.getByTestId("graph-canvas").evaluate((el, ids) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return ids.map((id) => cy.getElementById(id).midpoint());
  }, fixture.claims.slice(0,3).map((claim) => claim.id));
  for (let i = 0; i < 3; i++) for (let j = i+1; j < 3; j++) expect(Math.hypot(midpoints[i].x-midpoints[j].x,midpoints[i].y-midpoints[j].y)).toBeGreaterThan(30);
  await page.getByRole("button", { name: "全体を表示", exact: true }).click();
  await page.screenshot({ path: "/tmp/graph-knowledge-step5-expanded.png", fullPage: true });
  await canvasTap(page, fixture.entities[5].id);
  await expect(page.getByTestId("selection-status")).toContainText("佐藤アキ / 漫画家");
  await canvasTap(page, fixture.entities[6].id);
  await expect(page.getByTestId("selection-status")).toContainText("佐藤アキ / 編集者");
  await canvasTap(page, fixture.claims[0].id, true);
  await expect(page.getByTestId(`claim-card-${fixture.claims[0].id}`)).toContainText("出典 2件");
  await expect(page.getByTestId(`relation-${fixture.claims[0].id}`).getByRole("button", { name: "主張と出典を見る" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId(`claim-card-${fixture.claims[2].id}`)).toContainText("否定する主張");
  await page.screenshot({ path: "/tmp/graph-knowledge-step5-detail.png", fullPage: true });
  await page.getByTestId(`relation-${fixture.claims[0].id}`).getByRole("button", { name: "黒川レンを選択・展開" }).click();
  await expect(page.getByTestId("selection-status")).toContainText("黒川レン");
  const selected = await page.getByTestId("graph-canvas").evaluate((el) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return cy.elements(".chosen").map((element) => element.id());
  });
  expect(selected).toEqual([fixture.entities[1].id]);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.setViewportSize({ width: 1160, height: 650 });
  await page.getByRole("button", { name: "全体を表示", exact: true }).click();
  expect((await page.getByTestId("graph-canvas").boundingBox())!.height).toBeGreaterThan(260);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.screenshot({ path: "/tmp/graph-knowledge-step5-compact.png", fullPage: true });
});
