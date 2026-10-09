import { test, expect, type Page } from "@playwright/test";
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };
import { readingHref } from "../../lib/client/reading-reference";

const claim = examples.claim.claim;
const nodes = examples.neighbors.nodes;
const href = (kind: "entity" | "claim", id: string) => readingHref({ kind, dataset: "demo", id });
const reader = (page: Page) => page.getByRole("dialog", { name: "リンク先の対象・主張" });
const canvasState = (page: Page) => page.getByTestId("graph-canvas").evaluate(el => {
  const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
  return { positions: Object.fromEntries(cy.nodes().map(node => [node.id(), node.position()])), pan: cy.pan(), zoom: cy.zoom() };
});
async function mockKnowledge(page: Page) {
  const requests = { neighbors: 0, claims: [] as string[], entities: [] as string[] };
  await page.route("**/api/entities/**", async route => {
    const url = new URL(route.request().url()), id = url.pathname.split("/")[3];
    const entity = nodes.find(node => node.id === id)!;
    if (url.pathname.endsWith("/neighbors")) {
      requests.neighbors++;
      return route.fulfill({ json: id === examples.neighbors.centerId ? examples.neighbors : {
        centerId: id, nodes: [entity], claims: [], page: { hasMore: false, nextCursor: null },
      } });
    }
    requests.entities.push(id);
    await route.fulfill({ json: { entity: { ...entity, aliases: [], event: null } } });
  });
  await page.route("**/api/claims/**", route => {
    requests.claims.push(new URL(route.request().url()).pathname.split("/")[3]);
    return route.fulfill({ json: { ...examples.claim, relatedClaimIds: [] } });
  });
  return requests;
}

for (const width of [390, 1440]) {
  test(`閲覧URL・ブラウザ履歴・出典・明示探索を往復する（${width}px）`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    const requests = await mockKnowledge(page);
    await page.goto("/");
    await page.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    const before = await canvasState(page);
    if (width < 800) await page.getByRole("navigation", { name: "探索画面の切り替え" }).getByRole("button", { name: "選択の詳細", exact: true }).click();
    const entityLink = page.getByRole("link", { name: "この対象の閲覧リンクを開く" });
    await entityLink.click();
    await expect(page).toHaveURL(href("entity", claim.subjectId));
    await expect(reader(page).getByRole("heading", { name: "青葉ハル", exact: true })).toBeVisible();
    await expect(reader(page).getByRole("heading", { name: "リンク先の対象・主張" })).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath(`reference-entity-${width}.png`) });
    await page.goBack();
    await expect(reader(page)).toHaveCount(0);
    await expect(entityLink).toBeFocused();
    expect(await canvasState(page)).toEqual(before);
    await page.goForward();
    await expect(reader(page).getByRole("heading", { name: "青葉ハル", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(reader(page)).toHaveCount(0);
    expect(requests.neighbors).toBe(1);
    if (width < 800) await page.getByRole("navigation", { name: "探索画面の切り替え" }).getByRole("button", { name: "Graph", exact: true }).click();
    await page.getByTestId(`relation-${claim.id}`).getByRole("button", { name: "主張と出典を見る" }).click();
    await page.getByRole("link", { name: "この主張の閲覧リンクを開く" }).click();
    await expect(page).toHaveURL(href("claim", claim.id));
    await expect(reader(page).getByRole("heading", { name: "青葉ハルへのインタビュー", exact: true })).toBeVisible();
    await expect(reader(page)).toContainText("pp.12–13");
    await page.screenshot({ path: testInfo.outputPath(`reference-claim-${width}.png`) });
    expect(await reader(page).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const endpoints = reader(page).getByRole("region", { name: "この主張の対象" });
    await endpoints.getByRole("link", { name: "黒川レン", exact: true }).click();
    await expect(page).toHaveURL(href("entity", claim.objectId));
    await expect(reader(page).getByRole("heading", { name: "黒川レン", exact: true })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(href("claim", claim.id));
    await expect(reader(page).getByRole("heading", { name: "青葉ハルへのインタビュー", exact: true })).toBeVisible();
    expect(await canvasState(page)).toEqual(before); expect(requests.neighbors).toBe(1);
    await reader(page).getByRole("button", { name: "黒川レンから関係を探索する", exact: true }).click();
    await expect(reader(page)).toHaveCount(0);
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
    await expect(page.getByTestId("exploration-root")).toContainText("黒川レン");
    await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    expect(await canvasState(page)).toEqual(before); expect(requests.neighbors).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("直接URLとreloadは指定Claimだけを読み、端点失敗中も根拠と再試行を残す", async ({ page }) => {
  const requests = await mockKnowledge(page);
  let failed = true;
  await page.route(`**/api/entities/${claim.objectId}`, async route => {
    if (failed) return route.fulfill({ status: 404, json: { error: { message: "missing" } } });
    return route.fallback();
  });
  await page.goto(href("claim", claim.id));
  await expect(reader(page).getByRole("heading", { name: "青葉ハルへのインタビュー", exact: true })).toBeVisible();
  await expect(reader(page).getByRole("alert")).toContainText("削除・非公開・未登録");
  expect(requests.neighbors).toBe(0); expect(new Set(requests.claims)).toEqual(new Set([claim.id]));
  await page.reload();
  await expect(reader(page).getByRole("heading", { name: "青葉ハルへのインタビュー", exact: true })).toBeVisible();
  await expect(reader(page).getByRole("alert")).toContainText("削除・非公開・未登録");
  const claimsBeforeRetry = requests.claims.length;
  failed = false;
  await reader(page).getByRole("button", { name: "取得を再試行", exact: true }).click();
  await expect(reader(page).getByRole("button", { name: "黒川レンから関係を探索する", exact: true })).toBeVisible();
  expect(requests.neighbors).toBe(0); expect(requests.claims).toHaveLength(claimsBeforeRetry);
  expect(new Set(requests.claims)).toEqual(new Set([claim.id]));
  await reader(page).locator("summary").filter({ hasText: "閲覧URL" }).click();
  await expect(reader(page).getByRole("textbox", { name: "閲覧URL" })).toHaveValue(new URL(href("claim", claim.id), page.url()).href);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await reader(page).getByRole("button", { name: "探索画面へ戻る", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 0 / Claim 0");
});

test("不正・別datasetのリンクを取得せず、失効・通信失敗は再試行できる", async ({ page }) => {
  const requests: string[] = [];
  let status = 404;
  await page.route("**/api/**", route => {
    requests.push(route.request().url());
    return route.fulfill({ status, json: status === 200 ? { entity: { ...nodes[0], aliases: [], event: null } } : { error: { message: "Unavailable" } } });
  });
  for (const url of ["/?read=claim&id=bad&dataset=demo", href("claim", claim.id).replace("dataset=demo", "dataset=pilot-event-v1")]) {
    await page.goto(url);
    await expect(reader(page).getByRole("alert")).toBeVisible();
    expect(requests).toEqual([]);
    await reader(page).getByRole("button", { name: "探索画面へ戻る", exact: true }).click();
    await expect(page).toHaveURL("/");
  }
  await page.goto(href("entity", nodes[0].id));
  await expect(reader(page).getByRole("alert")).toContainText("削除・非公開・未登録");
  const initialRequests = requests.length;
  status = 503;
  await reader(page).getByRole("button", { name: "取得を再試行" }).click();
  await expect(reader(page).getByRole("alert")).toContainText("データベースを利用できません");
  status = 200;
  await reader(page).getByRole("button", { name: "取得を再試行" }).click();
  await expect(reader(page).getByRole("heading", { name: "青葉ハル", exact: true })).toBeVisible();
  expect(requests).toHaveLength(initialRequests + 2);
});
