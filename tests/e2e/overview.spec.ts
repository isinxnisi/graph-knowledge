import { test, expect, type Page } from "@playwright/test";
import fixture from "../../fixtures/demo.json" with { type: "json" };
import { editConditions } from "./conditions";
const root = fixture.entities[0], other = fixture.entities[1];
async function start(page: Page) {
  await page.goto("/"); await page.getByLabel("名前・別名").fill(root.name);
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(`^${root.name} —`) }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
}
async function view(page: Page) {
  return page.getByTestId("graph-canvas").evaluate((el) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return { positions: Object.fromEntries(cy.nodes().map((n) => [n.id(), n.position()])), pan: cy.pan(), zoom: cy.zoom(), chosen: cy.elements(".chosen").map((n) => n.id()) };
  });
}
async function doubleNode(page: Page, id: string) {
  const point = await page.getByTestId("graph-canvas").evaluate(async (el, id) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    cy.zoom(1); cy.center(cy.getElementById(id));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return cy.getElementById(id).renderedPosition();
  }, id);
  await page.getByTestId("graph-canvas").dblclick({ position: point, delay: 0 });
  // 閾値内の実マウス入力を送る。delayは各押下・離上にも掛かるため指定しない。
}
test("概要ボタンはGraph不変・条件外の主張も集計・Escape・再試行・0件", async ({ page }) => {
  await start(page); await editConditions(page);
  await page.getByRole("button", { name: "選択を解除", exact: true }).click();
  await page.getByRole("checkbox", { name: "制作に関わった", exact: true }).check();
  await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  const before = await view(page);
  await page.getByRole("button", { name: "関係概要を見る", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "このデータセットに登録された関係概要" });
  await expect(dialog).toContainText("肯定 2件 ／ 否定 1件");
  await expect(dialog).toContainText("影響を与えた関係についての主張");
  await expect(dialog).toContainText("現在の探索条件では絞っていません");
  expect(await view(page)).toEqual(before);
  await dialog.getByText("制作役割の内訳").click(); await expect(dialog).toContainText("役割を限定していない主張");
  await page.screenshot({ path: "/tmp/phase08-demo-overview.png", fullPage: true });
  await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "関係概要を見る", exact: true })).toBeFocused();
  await page.route("**/overview", (route) => route.fulfill({ status: 503, json: { error: { message: "unavailable" } } }));
  await page.getByRole("button", { name: "関係概要を見る", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("データベース");
  await expect(dialog.getByRole("button", { name: "この対象から広く見る", exact: true })).toBeEnabled();
  await page.unroute("**/overview"); await dialog.getByRole("button", { name: "関係概要を再試行" }).click();
  await expect(dialog).toContainText("肯定 2件 ／ 否定 1件"); await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByLabel("名前・別名").fill("森ユウ"); await page.getByRole("button", { name: "検索", exact: true }).click();
  await page.getByRole("button", { name: /^森ユウ —/ }).click();
  await page.getByRole("button", { name: "関係概要を見る", exact: true }).click();
  await expect(dialog).toContainText("公開された関係の主張はまだ登録されていません");
});
test("ダブルクリックは初回選択・展開を保ち二度目で閉じない・切替と位置復帰", async ({ page }) => {
  await start(page); await doubleNode(page, other.id);
  const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
  await expect(page.getByTestId("selection-status")).toContainText(other.name);
  await expect(dialog).toContainText("アシスタントに迎えていた関係についての主張");
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByRole("button", { name: "展開を閉じる", exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 6 / Claim 8");
  await page.getByTestId("graph-canvas").evaluate((el) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    cy.nodes().first().position({ x: 90, y: 110 }); cy.zoom(0.9); cy.pan({ x: 55, y: 75 });
  });
  const before = await view(page); const counts = await page.getByTestId("graph-counts").textContent();
  await page.getByRole("button", { name: "この対象から広く見る", exact: true }).click();
  await expect(page.getByTestId("exploration-root")).toContainText(other.name);
  await expect(page.getByRole("button", { name: "直前の探索へ戻る" })).toBeVisible();
  await page.getByRole("button", { name: "直前の探索へ戻る" }).click();
  await expect(page.getByTestId("exploration-root")).toContainText(root.name);
  await expect(page.getByTestId("graph-counts")).toHaveText(counts!);
  expect(await view(page)).toEqual(before);
  await doubleNode(page, other.id); await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "この対象から広く見る", exact: true }).click();
  await expect(page.getByTestId("exploration-root")).toContainText(other.name);
});
test("同条件切替・広く見る・確定条件の復帰", async ({ page }) => {
  await start(page); await editConditions(page);
  await page.getByRole("button", { name: "選択を解除", exact: true }).click();
  await page.getByRole("checkbox", { name: "アシスタントだった", exact: true }).check();
  await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 3");
  await doubleNode(page, other.id); const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "同じ条件でこの対象から見る", exact: true }).click();
  await expect(page.getByTestId("exploration-root")).toContainText(other.name);
  await expect(page.getByTestId("active-predicates")).toContainText("アシスタントだった");
  await page.getByRole("button", { name: "直前の探索へ戻る" }).click();
  await page.getByRole("button", { name: "この対象から広く見る", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 4");
  await expect(page.getByTestId("active-predicates")).toContainText("すべて");
});
test("概要404は切替不可・通信途中の切替/復帰は未受理応答を混ぜない", async ({ page }) => {
  await start(page);
  await page.route("**/overview", (route) => route.fulfill({ status: 404, json: { error: { message: "対象が見つかりません" } } }));
  await page.getByRole("button", { name: "関係概要を見る", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "この対象から広く見る" })).toBeDisabled();
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click(); await page.unroute("**/overview");
  let release!: () => void; const hold = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/entities/${other.id}/neighbors*`, async (route) => {
    const response = await route.fetch(); await hold;
    await route.fulfill({ response }).catch(() => {});
  });
  await doubleNode(page, other.id); await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "この対象から広く見る" }).click();
  await expect(page.getByTestId("exploration-root")).toContainText(other.name);
  await page.getByRole("button", { name: "直前の探索へ戻る" }).click();
  await expect(page.getByTestId("exploration-root")).toContainText(root.name);
  release(); await page.unroute(`**/api/entities/${other.id}/neighbors*`);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  await expect(page.getByRole("alert").filter({ hasText: "切替時に取得を中断" })).toContainText("切替時に取得を中断");
  await page.getByRole("button", { name: "Graph取得を再試行" }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 6 / Claim 8");
});
test("組織への直接起点切替と復帰は、明示閉鎖・休止子孫の意図を維持する", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "星の航路を選択・展開", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 7 / Claim 9");
  await page.getByRole("button", { name: "白石ミオを選択・展開", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 8 / Claim 11");
  const detail = page.getByRole("region", { name: "Entity詳細" });
  await detail.getByRole("button", { name: "展開を閉じる", exact: true }).click();
  await page.getByRole("button", { name: "星の航路を選択・展開", exact: true }).click();
  await detail.getByRole("button", { name: "展開を閉じる", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  await page.getByRole("button", { name: "青葉ハルを選択・展開", exact: true }).click();
  await page.getByRole("button", { name: "青空出版を選択・展開", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 6 / Claim 8");
  await page.getByRole("button", { name: "関係概要を見る", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("この組織との関わりについての主張");
  await expect(dialog).toContainText("肯定 2件 ／ 否定 0件");
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "この対象から広く見る", exact: true }).click();
  await expect(page.getByTestId("exploration-root")).toContainText("青空出版");
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 2");
  await page.getByRole("button", { name: "直前の探索へ戻る" }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 6 / Claim 8");
  await page.getByRole("button", { name: "青葉ハルを選択・展開", exact: true }).click();
  await page.getByRole("button", { name: "星の航路を選択・展開", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 7 / Claim 10");
  await page.getByRole("button", { name: "白石ミオを選択・展開", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 8 / Claim 12");
});
