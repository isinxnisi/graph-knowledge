import { checkRelationPresentation } from "./relation-presentation";
import { test, expect } from "@playwright/test";
checkRelationPresentation("demo");

test("Phase21: 未取得の関連主張を確認してもGraph・cursorを進めず、取得失敗を全件と見せない", async ({ page }) => {
  const claimId = "580dd445-3287-401d-bcce-43af3caaf509", deniedId = "c7e05a6c-6295-4ce6-9f5d-4c06bbab551d";
  const requests: string[] = [];
  page.on("request", request => { if (request.url().includes("/neighbors")) requests.push(request.url()); });
  await page.route("**/neighbors**", route => { const url = new URL(route.request().url()); url.searchParams.set("limit", "2"); return route.continue({ url: url.toString() }); });
  await page.goto("/"); await page.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 2");
  await page.getByTestId("graph-canvas").evaluate((el, id) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    cy.edges().filter(e => e.data("claimIds").includes(id)).first().emit("tap");
  }, claimId);
  await expect(page.getByTestId("claim-group-unseen").locator('[data-testid^="claim-card-"]')).toHaveCount(2);
  await expect(page.getByTestId("relation-overview")).toContainText("Graphに表示中の主張 1件");
  await expect(page.getByTestId("relation-overview")).not.toContainText("肯定・否定あり");
  expect(requests).toHaveLength(1);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 2");
  await page.screenshot({ path: "test-results/phase21/demo-unseen.png" });
  await page.route(`**/api/claims/${deniedId}`, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "DB_UNAVAILABLE", message: "試験用の取得失敗" } }) }));
  const detail = page.getByRole("region", { name: "Claim詳細" });
  // 個別Claim詳細でも、関連主張の一部失敗を全件取得として扱わない。
  await page.getByTestId(`relation-${claimId}`).getByRole("button", { name: "主張と出典を見る", exact: true }).click();
  await expect(detail.getByRole("alert")).toContainText("取得が完了していません");
  await page.unroute(`**/api/claims/${deniedId}`);
  await page.getByRole("button", { name: "他の主張を再試行", exact: true }).click();
  await expect(detail.getByRole("alert")).toHaveCount(0);
  await expect(page.getByTestId(`claim-card-${deniedId}`)).toBeAttached();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 2");
  expect(requests).toHaveLength(1);
  await page.getByRole("button", { name: "黒川レンを選択・展開", exact: true }).first().click();
  // 青葉の続きは未消費のままで、取得済みページは独立Claimとして維持する。
  await page.getByRole("button", { name: "青葉ハルを選択・展開", exact: true }).first().click();
  await expect(page.getByRole("region", { name: "Entity詳細" }).getByRole("button", { name: "続きを表示", exact: true })).toBeVisible();
});
