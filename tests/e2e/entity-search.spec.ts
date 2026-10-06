import { test, expect, type Page } from "@playwright/test";
async function search(page: Page, name: string, kind = "") {
  await page.getByLabel("名前・別名").fill(name);
  await page.getByLabel("検索対象", { exact: true }).selectOption(kind);
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^${name} —`) })).toBeVisible();
}
async function choose(page: Page, name: string) { await page.getByRole("button", { name: new RegExp(`^${name} —`) }).click(); }
async function overview(page: Page) {
  await page.getByRole("button", { name: "関係概要を見る", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "このデータセットに登録された関係概要" });
  await expect(modal.getByText("関係概要を取得中…")).toHaveCount(0);
  await expect(modal.getByRole("heading", { level: 3 }).nth(1)).toBeVisible();
  await page.keyboard.press("Escape");
}
test("人物・作品・組織の一つの入口と検索だけでは変わらないGraph", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "対象を探す" })).toBeVisible();
  await search(page, "青葉ハル", "person"); await choose(page, "青葉ハル");
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  await overview(page);
  await search(page, "星の航路", "work");
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  await choose(page, "星の航路");
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 3");
  await overview(page);
  await page.getByRole("button", { name: "青葉ハルを選択・展開", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 7 / Claim 9");
  await page.getByRole("button", { name: "この対象から広く見る", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 7 / Claim 9");
  await search(page, "青空出版", "organization"); await choose(page, "青空出版");
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 2");
  await overview(page);
  await page.getByRole("button", { name: "青葉ハルを選択・展開", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 6 / Claim 8");
  await page.screenshot({ path: "test-results/phase09-demo-organization.png" });
});
test("別名と同名候補を識別し、種別の空結果を示す", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("名前・別名").fill("あおば はる");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  const result = page.getByRole("button", { name: /^青葉ハル —/ });
  await expect(result).toContainText("人物"); await expect(result).toContainText("別名：あおば はる");
  await page.getByLabel("名前・別名").fill("佐藤アキ");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await expect(page.getByRole("button", { name: /^佐藤アキ —/ })).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^佐藤アキ —/ }).filter({ hasText: "編集者" })).toHaveCount(1);
  await page.getByLabel("検索対象", { exact: true }).selectOption("work");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await expect(page.getByText("検索結果はありません。名前や検索対象を変えて検索してください。")).toBeVisible();
});

import { checkStartExamples } from "./start-examples";
checkStartExamples("demo");
