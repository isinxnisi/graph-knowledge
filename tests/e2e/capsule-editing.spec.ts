import { test, expect, type Page } from "@playwright/test";
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };

const key = "graph-knowledge:capsules:demo";
const claim = examples.claim.claim;
const isolated = examples.neighbors.nodes.find(node => node.id !== claim.subjectId && node.id !== claim.objectId)!;
const secondClaim = examples.neighbors.claims.find(item => item.id !== claim.id && item.subjectId === claim.subjectId && item.objectId === claim.objectId)!;
const original = { id: "8cb38bde-9c26-44f4-a9a3-0a437f03d3b4", dataset: "demo", revision: 1, title: "育てる調査メモ", note: "最初の説明", language: "ja", createdAt: "2026-10-09T00:00:00Z", entityIds: [claim.subjectId, claim.objectId], claimIds: [claim.id] };
const dialog = (page: Page) => page.getByRole("dialog", { name: "自分のCapsule" });
const stored = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).capsules[0], key);
async function fixture(page: Page) {
  let neighbors = 0;
  await page.route("**/api/entities/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/neighbors")) { neighbors++; await route.fulfill({ json: examples.neighbors }); return; }
    const entity = examples.neighbors.nodes.find(node => node.id === path.split("/")[3]);
    await route.fulfill({ json: { entity: { ...entity, aliases: [], event: null } } });
  });
  await page.route("**/api/claims/**", async route => {
    const summary = examples.neighbors.claims.find(item => item.id === route.request().url().split("/").at(-1));
    await route.fulfill({ json: { claim: { ...claim, ...summary }, relatedClaimIds: examples.claim.relatedClaimIds } });
  });
  return () => neighbors;
}
async function open(page: Page) {
  await page.locator("#explorer-search").getByRole("button", { name: "Capsuleを作る・読む", exact: true }).click();
  await dialog(page).getByRole("button", { name: "読む", exact: true }).click();
  await dialog(page).getByRole("button", { name: "このCapsuleを編集", exact: true }).click();
}

for (const width of [390, 1440]) {
  test(`Capsuleを編集して次版を再訪し、根拠と探索を保持する（${width}px）`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    const neighbors = await fixture(page);
    await page.goto("/");
    await page.evaluate(({ key, original }) => localStorage.setItem(key, JSON.stringify({ format: "local-capsules", version: 1, capsules: [original] })), { key, original });
    await page.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    const graphState = () => page.locator("#explorer-graph").getByTestId("graph-canvas").evaluate(el => {
      const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
      return { positions: Object.fromEntries(cy.nodes().map(node => [node.id(), node.position()])), pan: cy.pan(), zoom: cy.zoom() };
    });
    const before = await graphState();
    const launch = page.locator("#explorer-graph").getByRole("button", { name: "Capsuleを作る・読む", exact: true });
    await launch.click();
    const modal = dialog(page);
    await modal.getByRole("button", { name: "読む", exact: true }).click();
    await modal.getByRole("button", { name: "このCapsuleを編集", exact: true }).click();
    await expect(modal.getByLabel("Capsuleの題名", { exact: true })).toBeFocused();
    await expect(modal.getByRole("button", { name: "変更を保存", exact: true })).toBeDisabled();
    await modal.getByLabel("Capsuleの題名", { exact: true }).fill("期間の違いを残したメモ");
    await modal.getByRole("textbox", { name: "自分の説明", exact: true }).fill("資料による期間の違いを比較する。\n同じ主張として統合しない。");
    await modal.getByRole("group", { name: "含める対象", exact: true }).getByRole("checkbox", { name: new RegExp(isolated.name) }).check();
    await modal.getByRole("group", { name: "含める主張", exact: true }).getByRole("checkbox", { name: new RegExp(secondClaim.id) }).check();
    await expect(modal.getByRole("status")).toHaveText("選択：対象 3件 / 主張 2件");
    await modal.evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: testInfo.outputPath(`capsule-edit-${width}.png`) });
    await modal.getByRole("button", { name: "変更を保存", exact: true }).click();
    await expect(modal.getByRole("heading", { name: "期間の違いを残したメモ", exact: true })).toBeFocused();
    await expect(modal).toContainText("内容版 2");
    await expect(modal).toContainText("現在のGraph：対象 3件 / 主張 2件");
    const revised = await stored(page);
    expect(revised.id).toBe(original.id); expect(revised.createdAt).toBe(original.createdAt); expect(revised.revision).toBe(2);
    expect(revised.claimIds).toEqual([claim.id, secondClaim.id]); expect(revised.entityIds).toContain(isolated.id);
    await modal.getByRole("button", { name: new RegExp(`ID: ${claim.id}`) }).click();
    await expect(modal.getByRole("heading", { name: "青葉ハルへのインタビュー", exact: true })).toBeVisible();
    await expect(modal).toContainText("pp.12–13");
    await modal.getByRole("button", { name: "探索へ戻る", exact: true }).click();
    await expect(launch).toBeFocused(); expect(await graphState()).toEqual(before); expect(neighbors()).toBe(1);

    await page.reload(); await open(page);
    await expect(modal.getByRole("textbox", { name: "自分の説明", exact: true })).toHaveValue("資料による期間の違いを比較する。\n同じ主張として統合しない。");
    // Remove an independent claim and an isolated entity without rebuilding the Capsule.
    await modal.getByRole("group", { name: "含める主張", exact: true }).getByRole("checkbox", { name: new RegExp(secondClaim.id) }).uncheck();
    await modal.getByRole("group", { name: "含める対象", exact: true }).getByRole("checkbox", { name: new RegExp(isolated.name) }).uncheck();
    await modal.getByRole("button", { name: "変更を保存", exact: true }).click();
    await expect(modal).toContainText("内容版 3");
    await expect(modal).toContainText("現在のGraph：対象 2件 / 主張 1件");
    await modal.getByTestId("graph-canvas").scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`capsule-revised-${width}.png`) });
    expect((await stored(page)).claimIds).toEqual([claim.id]);
    expect(await modal.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 0 / Claim 0");
    expect(neighbors()).toBe(1); expect(errors).toEqual([]);
  });
}

test("実際の別タブ更新・削除を検出し、未保存入力を上書きしない", async ({ page, context }) => {
  await fixture(page); await page.goto("/");
  await page.evaluate(({ key, original }) => localStorage.setItem(key, JSON.stringify({ format: "local-capsules", version: 1, capsules: [original] })), { key, original });
  await open(page);
  const other = await context.newPage(); await fixture(other); await other.goto("/"); await open(other);
  await dialog(other).getByRole("textbox", { name: "自分の説明", exact: true }).fill("後から保存したい入力");
  await dialog(page).getByLabel("Capsuleの題名", { exact: true }).fill("先に保存した題名");
  await dialog(page).getByRole("button", { name: "変更を保存", exact: true }).click();
  await expect(dialog(other)).toContainText("別のタブでこのCapsuleが更新・削除されました");
  await expect(dialog(other).getByRole("textbox", { name: "自分の説明", exact: true })).toHaveValue("後から保存したい入力");
  await expect(dialog(other).getByRole("button", { name: "変更を保存", exact: true })).toBeDisabled();
  expect((await stored(other)).title).toBe("先に保存した題名");
  await dialog(other).getByRole("button", { name: "保存したCapsuleの一覧へ", exact: true }).click();
  await dialog(other).getByRole("button", { name: "編集を続ける", exact: true }).click();
  await expect(dialog(other).getByRole("textbox", { name: "自分の説明", exact: true })).toHaveValue("後から保存したい入力");
  await dialog(other).getByRole("button", { name: "保存したCapsuleの一覧へ", exact: true }).click();
  await dialog(other).getByRole("button", { name: "保存せず戻る", exact: true }).click();
  await dialog(other).getByRole("button", { name: "読む", exact: true }).click();
  await dialog(other).getByRole("button", { name: "このCapsuleを編集", exact: true }).click();
  await expect(dialog(other).getByLabel("Capsuleの題名", { exact: true })).toHaveValue("先に保存した題名");
  await dialog(page).getByRole("button", { name: "保存したCapsuleの一覧へ", exact: true }).click();
  await dialog(page).getByRole("button", { name: "削除", exact: true }).click();
  await dialog(page).getByRole("button", { name: "このCapsuleを削除する", exact: true }).click();
  await expect(dialog(other)).toContainText("別のタブでこのCapsuleが更新・削除されました");
  await expect(dialog(other).getByRole("button", { name: "変更を保存", exact: true })).toBeDisabled();
  expect(await stored(other)).toBeUndefined();
  await other.close();
});

test("取得できない参照を保持して説明を直し、回復後に根拠を再閲覧する", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await fixture(page);
  let unavailable = true;
  await page.route("**/api/claims/**", route => unavailable ? route.fulfill({ status: 404, json: { error: { message: "missing" } } }) : route.fallback());
  await page.route(`**/api/entities/${claim.objectId}`, route => unavailable ? route.fulfill({ status: 503, json: { error: { message: "failed" } } }) : route.fallback());
  await page.goto("/");
  await page.evaluate(({ key, original }) => localStorage.setItem(key, JSON.stringify({ format: "local-capsules", version: 1, capsules: [original] })), { key, original });
  await open(page);
  const modal = dialog(page);
  await expect(modal).toContainText("確認できない主張も選択したまま保持しています");
  const entities = modal.getByRole("group", { name: "含める対象", exact: true }).getByRole("checkbox");
  await expect(entities).toHaveCount(2);
  for (const box of await entities.all()) { await expect(box).toBeChecked(); await expect(box).toBeDisabled(); }
  await expect(modal.getByRole("group", { name: "含める主張", exact: true }).getByRole("checkbox")).toBeChecked();
  await modal.getByRole("textbox", { name: "自分の説明", exact: true }).fill("根拠を後日もう一度確認する。");
  await page.keyboard.press("Escape");
  await modal.getByRole("button", { name: "編集を続ける", exact: true }).click();
  await expect(modal.getByRole("textbox", { name: "自分の説明", exact: true })).toHaveValue("根拠を後日もう一度確認する。");
  await modal.getByRole("button", { name: "変更を保存", exact: true }).click();
  await expect(modal).toContainText("内容版 2");
  expect(await stored(page)).toMatchObject({ entityIds: original.entityIds, claimIds: original.claimIds, revision: 2, note: "根拠を後日もう一度確認する。" });
  unavailable = false;
  await page.reload();
  await page.locator("#explorer-search").getByRole("button", { name: "Capsuleを作る・読む", exact: true }).click();
  await modal.getByRole("button", { name: "読む", exact: true }).click();
  await expect(modal).toContainText("現在のGraph：対象 2件 / 主張 1件");
  await modal.getByRole("button", { name: new RegExp(`ID: ${claim.id}`) }).click();
  await expect(modal.getByRole("heading", { name: "青葉ハルへのインタビュー", exact: true })).toBeVisible();
  await expect(modal).toContainText("根拠を後日もう一度確認する。");
  await expect(modal).toContainText("内容版 2");
});
