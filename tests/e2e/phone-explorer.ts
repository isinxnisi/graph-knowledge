import { expect, test, type Page } from "@playwright/test";

const canvasView = (page: Page) => page.getByTestId("graph-canvas").evaluate(el => {
  const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
  return { positions: Object.fromEntries(cy.nodes().map(node => [node.id(), node.position()])), pan: cy.pan(), zoom: cy.zoom() };
});

async function tapGraph(page: Page, target: string, edge = false, double = false) {
  const canvas = page.getByTestId("graph-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const point = await canvas.evaluate((el, { target, edge }) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    const element = cy.getElementById(target);
    const point = edge ? (element as import("cytoscape").EdgeSingular).renderedMidpoint() : element.renderedPosition();
    const rect = el.getBoundingClientRect();
    return { x: rect.x + point.x, y: rect.y + point.y };
  }, { target, edge });
  await page.touchscreen.tap(point.x, point.y);
  if (double) await page.touchscreen.tap(point.x, point.y);
}

async function expectFitted(page: Page) {
  const view = await page.getByTestId("graph-canvas").evaluate(el => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return { bounds: cy.nodes().renderedBoundingBox({ includeLabels: true, includeOverlays: false }), width: cy.width(), height: cy.height() };
  });
  expect(view.bounds.x1).toBeGreaterThanOrEqual(0);
  expect(view.bounds.y1).toBeGreaterThanOrEqual(0);
  expect(view.bounds.x2).toBeLessThanOrEqual(view.width);
  expect(view.bounds.y2).toBeLessThanOrEqual(view.height);
}

export function checkPhoneExplorer() {
  test.describe("スマホの実KG探索", () => {
    test.use({ hasTouch: true, isMobile: true });
    for (const width of [320, 390]) {
      test(`${width}px: タッチで作品から人物を展開し、一覧・出典を往復する`, async ({ page, context }) => {
        await page.setViewportSize({ width, height: 844 });
        let requests = 0;
        page.on("request", request => { if (new URL(request.url()).pathname.endsWith("/neighbors")) requests++; });
        await page.goto("/");
        await page.getByRole("button", { name: "PLUTOから探索を開始", exact: true }).tap();
        await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
        await expectFitted(page);
        const graph = page.locator("#explorer-graph");
        const detail = page.locator("#explorer-detail");
        const nav = page.getByRole("navigation", { name: "探索画面の切り替え" });
        await expect(graph.getByRole("button", { name: "保存・再訪", exact: true })).toBeHidden();
        const before = await canvasView(page);
        const canvas = page.getByTestId("graph-canvas");
        await canvas.scrollIntoViewIfNeeded();
        const rect = (await canvas.boundingBox())!;
        // Chromiumの実タッチ入力で背景panと二本指pinch。Node座標は不変。
        const cdp = await context.newCDPSession(page);
        const touch = (x: number, y: number, id: number) => ({ x, y, id });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch(rect.x + 15, rect.y + rect.height / 2, 0)] });
        for (let step = 1; step <= 5; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [touch(rect.x + 15 + step * 8, rect.y + rect.height / 2 + step * 6, 0)] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        expect((await canvasView(page)).pan).not.toEqual(before.pan);
        const cx = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch(cx - 30, y, 0), touch(cx + 30, y, 1)] });
        for (let step = 1; step <= 5; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [touch(cx - 30 - step * 6, y, 0), touch(cx + 30 + step * 6, y, 1)] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await cdp.detach();
        expect((await canvasView(page)).zoom).toBeGreaterThan(before.zoom);
        expect((await canvasView(page)).positions).toEqual(before.positions);
        await graph.getByRole("button", { name: "全体を表示", exact: true }).tap();
        const person = (await (await page.request.get("/api/entities?q=長崎尚志")).json()).items[0];
        await tapGraph(page, person.id);
        await expect.poll(async () => Object.keys((await canvasView(page)).positions).length).toBeGreaterThan(4);
        const expanded = await canvasView(page);
        for (const [id, point] of Object.entries(before.positions)) expect(expanded.positions[id]).toEqual(point);
        await graph.getByRole("button", { name: "隣接一覧へ", exact: true }).tap();
        const list = page.getByRole("region", { name: "選択Entityの隣接関係" });
        await expect(list).toBeFocused();
        expect(await graph.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
        const scroll = await graph.evaluate(el => el.scrollTop);
        await list.getByRole("button", { name: "主張と出典を見る", exact: true }).first().tap();
        await expect(detail).toBeFocused();
        const claim = page.getByRole("region", { name: "Claim詳細", exact: true });
        await claim.getByRole("link", { name: "出典のURLを開く", exact: true }).first().scrollIntoViewIfNeeded();
        await expect(claim.getByRole("link", { name: "出典のURLを開く", exact: true }).first()).toBeVisible();
        const metadata = claim.locator("details").first();
        await metadata.locator("summary").tap();
        await expect(metadata).toHaveAttribute("open", "");
        const readingPosition = await detail.evaluate(el => el.scrollTop);
        expect(readingPosition).toBeGreaterThan(0);
        await nav.getByRole("button", { name: "Graph", exact: true }).tap();
        expect(await graph.evaluate(el => el.scrollTop)).toBeCloseTo(scroll, 0);
        const onGraph = await canvasView(page);
        expect(onGraph.positions).toEqual(expanded.positions);
        expect(onGraph.pan).toEqual(expanded.pan);
        expect(onGraph.zoom).toEqual(expanded.zoom);
        await nav.getByRole("button", { name: "選択の詳細", exact: true }).tap();
        expect(await detail.evaluate(el => el.scrollTop)).toBeCloseTo(readingPosition, 0);
        await expect(metadata).toHaveAttribute("open", "");
        await nav.getByRole("button", { name: "Graph", exact: true }).tap();
        await list.getByRole("button", { name: "主張と出典を見る", exact: true }).nth(1).tap();
        await expect(detail).toBeFocused();
        await expect.poll(() => detail.evaluate(el => el.scrollTop)).toBe(0);
        await nav.getByRole("button", { name: "Graph", exact: true }).tap();
        await list.getByRole("button", { name: "Graphへ戻る", exact: true }).tap();
        await expect.poll(() => graph.evaluate(el => el.scrollTop)).toBe(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await nav.getByRole("button", { name: "検索", exact: true }).tap();
        await expect(page.locator("#explorer-search").getByRole("button", { name: "保存・再訪", exact: true })).toBeVisible();
        expect(requests).toBe(2);
      });
    }

    test("390px: 長いEvent名、線から根拠、ダブルタップ概要、起点切替と復帰", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");
      await page.getByRole("button", { name: "第5回ソルヴェイ物理会議（1927）から探索を開始", exact: true }).tap();
      await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 3");
      await expectFitted(page);
      const nav = page.getByRole("navigation", { name: "探索画面の切り替え" });
      const person = (await (await page.request.get("/api/entities?q=ローレンツ")).json()).items[0];
      const edge = await page.getByTestId("graph-canvas").evaluate((el, id) => (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy.edges().filter(edge => edge.source().id() === id).first().id(), person.id);
      await tapGraph(page, edge, true, true);
      const detail = page.getByRole("region", { name: "Claim詳細", exact: true });
      await expect(detail).toContainText("会議議長");
      await expect(detail).toContainText("Président");
      await expect(detail.getByRole("link", { name: "出典のURLを開く", exact: true }).first()).toBeVisible();
      await nav.getByRole("button", { name: "Graph", exact: true }).tap();
      await tapGraph(page, person.id);
      await expect(page.getByTestId("selection-status")).toContainText(person.name);
      // 既存の300ms判定をまたいでから、同じ座標へ連続した二回の実タッチを送る。
      await page.waitForTimeout(320);
      await tapGraph(page, person.id, false, true);
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: "閉じる", exact: true }).tap();
      await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 3");
      const before = await canvasView(page);
      await nav.getByRole("button", { name: "選択の詳細", exact: true }).tap();
      await page.getByRole("region", { name: "Entity詳細", exact: true }).getByRole("button", { name: "この対象から広く見る", exact: true }).tap();
      await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 2");
      await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).tap();
      await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 3");
      expect(await canvasView(page)).toEqual(before);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    test("390px: 実ページcursorで初回503・続き503を再試行し、閉鎖と再開を保つ", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const root = (await (await page.request.get("/api/entities?q=PLUTO")).json()).items[0];
      const firstResponse = await page.request.get(`/api/entities/${root.id}/neighbors?limit=1`);
      expect(firstResponse.status()).toBe(200);
      const first = await firstResponse.json();
      expect(first.page.hasMore).toBe(true);
      const cursor = first.page.nextCursor;
      const nextResponse = await page.request.get(`/api/entities/${root.id}/neighbors?${new URLSearchParams({ after: cursor, revision: first.revision })}`);
      expect(nextResponse.status()).toBe(200);
      const next = await nextResponse.json();
      expect(next.page.hasMore).toBe(false);
      const requests: (string | null)[] = [];
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      await page.route(`**/api/entities/${root.id}/neighbors*`, async route => {
        const after = new URL(route.request().url()).searchParams.get("after");
        requests.push(after);
        if (requests.length === 1 || requests.length === 3) {
          if (requests.length === 3) await held;
          return route.fulfill({ status: 503, json: { error: { code: "DB_UNAVAILABLE", message: "検証用503" } } });
        }
        await route.fulfill({ json: after ? next : first });
      });
      try {
        await page.goto("/");
        await page.getByRole("button", { name: "PLUTOから探索を開始", exact: true }).tap();
        await page.getByRole("button", { name: "隣接一覧へ", exact: true }).tap();
        const list = page.getByRole("region", { name: "選択Entityの隣接関係", exact: true });
        await expect(list.getByRole("alert")).toContainText("データベースを利用できません");
        await list.getByRole("button", { name: "隣接関係の取得を再試行", exact: true }).tap();
        await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
        const before = await canvasView(page);
        await list.getByRole("button", { name: "隣接関係の続きを表示", exact: true }).tap();
        await expect(list.getByRole("button", { name: "隣接関係の続きを取得中…", exact: true })).toBeDisabled();
        await expect(list.getByRole("button", { name: "主張と出典を見る", exact: true })).toHaveCount(1);
        release();
        await expect(list.getByRole("alert")).toBeVisible();
        expect(await canvasView(page)).toEqual(before);
        await list.getByRole("button", { name: "隣接関係の取得を再試行", exact: true }).tap();
        await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
        const accepted = await canvasView(page);
        await list.getByRole("button", { name: "展開を閉じる", exact: true }).tap();
        await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
        await list.getByRole("button", { name: "展開を再開", exact: true }).tap();
        await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
        expect(await canvasView(page)).toEqual(accepted);
        expect(requests).toEqual([null, null, cursor, cursor]);
      } finally { release(); }
    });
  });
}
