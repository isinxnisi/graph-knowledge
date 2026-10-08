import { test, expect, type Page } from "@playwright/test";
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };

const root = examples.neighbors.nodes[0], work = examples.neighbors.nodes[1];
const contributor = { ...root, id: "c2222222-2222-4222-8222-222222222222", name: "経路検証の人物", description: "架空の制作関係者" };
const forward = examples.neighbors.claims[0];
const denied = { ...forward, id: "d2222222-2222-4222-8222-222222222222", polarity: "denied" };
const reverse = { ...denied, id: "e2222222-2222-4222-8222-222222222222", subjectId: contributor.id };
const allNodes = [root, work, contributor];
const allClaims = [forward, denied, reverse];
const view = (page: Page) => page.getByTestId("graph-canvas").evaluate(el => {
  const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
  return { positions: Object.fromEntries(cy.nodes().map(node => [node.id(), node.position()])), pan: cy.pan(), zoom: cy.zoom() };
});

for (const width of [390, 1440]) test(`${width}pxで起点から2関係を辿り、逆向きの否定主張の根拠を読む`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const neighborRequests: string[] = [];
  await page.route("**/api/entities/**", async route => {
    const url = new URL(route.request().url());
    const id = url.pathname.split("/")[3];
    if (url.pathname.endsWith("/neighbors")) {
      neighborRequests.push(id);
      return route.fulfill({ json: { centerId: id,
        nodes: id === root.id ? [root, work] : allNodes,
        claims: id === root.id ? [forward, denied] : allClaims,
        page: { hasMore: false, nextCursor: null },
      } });
    }
    return route.fulfill({ json: { entity: { ...allNodes.find(node => node.id === id), aliases: [], event: null } } });
  });
  await page.route("**/api/claims/**", route => {
    const claim = allClaims.find(claim => claim.id === route.request().url().split("/").pop())!;
    return route.fulfill({ json: { claim: { ...examples.claim.claim, ...claim }, relatedClaimIds: [] } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 2");
  await page.getByTestId("graph-canvas").evaluate((el, id) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    cy.getElementById(id).emit("tap");
  }, work.id);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 3");
  const navigator = page.getByRole("region", { name: "表示中の対象へ移動", exact: true });
  await navigator.getByRole("button", { name: /表示中の対象へ移動/ }).click();
  await navigator.getByRole("button", { name: /経路検証の人物.*位置と詳細へ移動/ }).click();
  if (width < 800) await page.getByRole("navigation", { name: "探索画面の切り替え" }).getByRole("button", { name: "選択の詳細" }).click();
  await expect(page.getByRole("region", { name: "Entity詳細", exact: true })).toHaveCount(1);
  const before = await view(page);
  const requestsBefore = [...neighborRequests];
  const path = page.getByRole("region", { name: "起点からの経路", exact: true });
  await path.getByText("表示中の最短経路（2関係）").focus();
  await page.keyboard.press("Enter");
  await expect(path.getByText(/実際に操作した履歴ではありません/)).toBeVisible();
  await expect(path.getByText("→ 制作に関わった / 肯定・否定あり →")).toBeVisible();
  await expect(path.getByText("← 制作に関わった / （否定） ←")).toBeVisible();
  await path.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/graph-path-${width}.png` });
  const step = path.getByRole("button", { name: /星の航路.*経路検証の人物.*関係と根拠を見る/ });
  await step.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#explorer-detail")).toBeFocused();
  const details = page.getByRole("region", { name: "Claim詳細", exact: true });
  await expect(details.getByText(examples.claim.claim.citations[0].source.title, { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "関係する対象" }).getByRole("button", { name: "経路検証の人物の詳細を見る" })).toBeVisible();
  expect(await view(page)).toEqual(before);
  expect(neighborRequests).toEqual(requestsBefore);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 3");
  await page.getByRole("button", { name: "経路検証の人物の詳細を見る", exact: true }).click();
  await expect(page.getByRole("region", { name: "Entity詳細", exact: true })).toHaveCount(1);
  await expect(path.getByText("表示中の最短経路（2関係）")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(neighborRequests).toEqual(requestsBefore);
});
