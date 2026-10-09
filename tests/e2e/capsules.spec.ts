import { test, expect, type Page } from "@playwright/test";
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };

const root = examples.neighbors.nodes[0];
const claim = examples.claim.claim;
const isolated = examples.neighbors.nodes.find(node => node.id !== claim.subjectId && node.id !== claim.objectId)!;
const key = "graph-knowledge:capsules:demo";
const canvasState = (page: Page) => page.locator("#explorer-graph").getByTestId("graph-canvas").evaluate(el => {
  const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
  return { positions: Object.fromEntries(cy.nodes().map(node => [node.id(), node.position()])), pan: cy.pan(), zoom: cy.zoom() };
});

for (const width of [390, 1440]) {
  test(`説明付きCapsuleを作成・reload・出典確認して探索へ戻る（${width}px）`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    const claimRequests: string[] = []; let neighbors = 0;
    await page.route("**/api/entities/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/neighbors")) { neighbors++; await route.fulfill({ json: examples.neighbors }); }
      else {
        const entity = examples.neighbors.nodes.find(node => node.id === url.pathname.split("/")[3]);
        await route.fulfill({ json: { entity: { ...entity, aliases: [], event: null } } });
      }
    });
    await page.route("**/api/claims/**", async route => { claimRequests.push(route.request().url().split("/").at(-1)!); await route.fulfill({ json: examples.claim }); });
    await page.goto("/");
    await page.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    const before = await canvasState(page);
    const launch = page.locator("#explorer-graph").getByRole("button", { name: "Capsuleを作る・読む", exact: true });
    await launch.click();
    const dialog = page.getByRole("dialog", { name: "自分のCapsule" });
    await dialog.getByRole("button", { name: "表示中のGraphから作る", exact: true }).click();
    await dialog.getByLabel("Capsuleの題名", { exact: true }).fill("師と作品を辿ったメモ");
    await dialog.getByLabel("自分の説明", { exact: true }).fill("アシスタントの期間を調べた。\n作品との関係はこれから確認する。");
    await dialog.getByRole("group", { name: "含める主張", exact: true }).getByRole("checkbox", { name: /青葉ハル → アシスタントだった → 黒川レン.*2001年〜2003年/ }).check();
    await expect(dialog.getByText("選んだ主張の対象", { exact: true })).toHaveCount(2);
    await dialog.getByRole("group", { name: "含める対象", exact: true }).getByRole("checkbox", { name: new RegExp(isolated.name) }).check();
    await expect(dialog.getByRole("status")).toContainText("選択：対象 3件 / 主張 1件");
    await dialog.evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: testInfo.outputPath(`capsule-create-${width}.png`) });
    await dialog.getByRole("button", { name: "Capsuleを保存", exact: true }).click();
    await expect(dialog).toContainText("現在のGraph：対象 3件 / 主張 1件");
    await expect(dialog.getByTestId("graph-canvas")).toBeVisible();
    const shape = await dialog.getByTestId("graph-canvas").evaluate(el => {
      const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
      return { nodes: cy.nodes().map(node => node.id()), claims: cy.edges().map(edge => edge.data("claimIds")).flat(), positions: cy.nodes().map(node => node.position()) };
    });
    expect(shape.nodes.sort()).toEqual([claim.subjectId, claim.objectId, isolated.id].sort());
    expect(shape.claims).toEqual([claim.id]);
    expect(new Set(shape.positions.map(point => `${point.x}:${point.y}`)).size).toBe(3);
    await dialog.getByTestId("graph-canvas").scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`capsule-graph-${width}.png`) });
    await dialog.getByRole("button", { name: /青葉ハル → アシスタントだった → 黒川レン.*2001年〜2003年/ }).click();
    await expect(dialog.getByRole("heading", { name: "青葉ハルへのインタビュー", exact: true })).toBeVisible();
    await expect(dialog).toContainText("pp.12–13");
    await page.screenshot({ path: testInfo.outputPath(`capsule-evidence-${width}.png`) });
    expect(claimRequests).toEqual([claim.id]); expect(neighbors).toBe(1);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await dialog.getByRole("button", { name: "探索へ戻る", exact: true }).click();
    await expect(dialog).toHaveCount(0); await expect(launch).toBeFocused();
    expect(await canvasState(page)).toEqual(before);
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    // Existing close/reopen remains independent of the Capsule membership.
    const region = page.getByRole("region", { name: "選択Entityの隣接関係", exact: true });
    await region.getByRole("button", { name: "展開を閉じる", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
    await region.getByRole("button", { name: "展開を再開", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    expect(neighbors).toBe(1);
    const raw = await page.evaluate(key => localStorage.getItem(key), key);
    expect(raw).not.toContain("cursor"); expect(raw).not.toContain("sourceCount");
    expect(await page.evaluate(() => localStorage.getItem("graph-knowledge:workspace:demo"))).toBeNull();

    await page.reload();
    await page.locator("#explorer-search").getByRole("button", { name: "Capsuleを作る・読む", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "師と作品を辿ったメモ", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "読む", exact: true }).click();
    await expect(dialog).toContainText("現在のGraph：対象 3件 / 主張 1件");
    await expect(dialog).toContainText("作品との関係はこれから確認する。");
    await dialog.getByRole("button", { name: /青葉ハル → アシスタントだった → 黒川レン.*2001年〜2003年/ }).click();
    await expect(dialog.getByRole("heading", { name: "青葉ハルへのインタビュー", exact: true })).toBeVisible();
    expect(claimRequests).toEqual([claim.id, claim.id]); expect(neighbors).toBe(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 0 / Claim 0");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("参照失効・一部通信失敗を残して再取得し、確認削除を扱う", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/");
  const stored = { id: "8cb38bde-9c26-44f4-a9a3-0a437f03d3b4", dataset: "demo", revision: 1, title: "参照の変化を読む", note: "説明は消さない", language: "ja", createdAt: "2026-10-09T00:00:00Z", entityIds: [claim.subjectId, claim.objectId, isolated.id], claimIds: [claim.id] };
  await page.evaluate(({ key, stored }) => localStorage.setItem(key, JSON.stringify({ format: "local-capsules", version: 1, capsules: [stored] })), { key, stored });
  let failed = true;
  await page.route("**/api/entities/**", async route => {
    const id = new URL(route.request().url()).pathname.split("/")[3];
    if (failed && id !== root.id) { await route.fulfill({ status: id === isolated.id ? 503 : 404, json: { error: { message: "Unavailable" } } }); return; }
    const entity = examples.neighbors.nodes.find(node => node.id === id)!;
    await route.fulfill({ json: { entity: { ...entity, aliases: [], event: null } } });
  });
  await page.route("**/api/claims/**", route => route.fulfill({ json: examples.claim }));
  const launch = page.locator("#explorer-search").getByRole("button", { name: "Capsuleを作る・読む", exact: true });
  const dialog = page.getByRole("dialog", { name: "自分のCapsule" });
  await launch.click(); await dialog.getByRole("button", { name: "読む", exact: true }).click();
  await expect(dialog).toContainText("現在のデータに参照が見つかりません");
  await expect(dialog).toContainText("取得できませんでした");
  await expect(dialog).toContainText("現在のGraph：対象 1件 / 主張 0件");
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).capsules[0], key)).toEqual(stored);
  failed = false;
  await dialog.getByRole("button", { name: "現在データを再取得", exact: true }).click();
  await expect(dialog).toContainText("現在のGraph：対象 3件 / 主張 1件");
  await dialog.getByRole("button", { name: "保存したCapsuleの一覧へ", exact: true }).click();
  await dialog.getByRole("button", { name: "削除", exact: true }).click();
  await dialog.getByRole("button", { name: "削除を取り消す", exact: true }).click();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).capsules.length, key)).toBe(1);
  await dialog.getByRole("button", { name: "削除", exact: true }).click();
  await dialog.getByRole("button", { name: "このCapsuleを削除する", exact: true }).click();
  await expect(dialog).toContainText("Capsuleはまだありません。");
  await page.keyboard.press("Escape"); await expect(launch).toBeFocused();
});
