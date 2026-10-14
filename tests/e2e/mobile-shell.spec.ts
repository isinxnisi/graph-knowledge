import { test, expect } from "@playwright/test";
import type { Core } from "cytoscape";
const user = { id: "10000000-0000-4000-8000-000000000001", name: "表示確認の利用者", locale: "ja" };
const view = (page: import("@playwright/test").Page) => page.getByTestId("graph-canvas").evaluate(el => {
  const cy = (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy;
  return { points: cy.nodes().map(n => [n.id(), n.position()]), edges: cy.edges().map(e => e.id()), pan: cy.pan(), zoom: cy.zoom() };
});
for (const [width, height] of [[375, 667], [320, 568]]) test(`${width}x${height}: Graphの高さ、メニューの重なり、本人表示と閉じる操作`, async ({ page }) => {
  await page.setViewportSize({ width, height });
  let signedIn = true, name = user.name;
  // Display-state fixture only: no test identity is enabled in the server or database.
  await page.route("**/api/member/profile", route => route.fulfill(signedIn
    ? { json: { user: { ...user, name } } } : { status: 401, json: { error: { code: "UNAUTHENTICATED" } } }));
  await page.goto("/");
  const header = page.getByTestId("site-header");
  await expect(header.getByRole("link", { name: `${name}のアカウントを開く（別タブ）` })).toBeVisible();
  await page.getByRole("button", { name: "PLUTOから探索を開始", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "探索画面の切り替え" });
  await nav.getByRole("button", { name: "Graph", exact: true }).click();
  const canvas = page.getByTestId("graph-canvas");
  await expect.poll(() => canvas.evaluate(el => (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy.nodes().length)).toBe(4);
  expect((await header.boundingBox())!.height).toBeLessThanOrEqual(56);
  expect((await nav.boundingBox())!.height).toBeLessThanOrEqual(46);
  expect((await canvas.boundingBox())!.y).toBeLessThanOrEqual(230);
  expect((await canvas.locator("..").boundingBox())!.height).toBeGreaterThanOrEqual(360);
  await canvas.evaluate(el => { (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy.nodes().filter(n => n.data("label") === "浦沢直樹").first().emit("tap"); });
  await nav.getByRole("button", { name: "選択の詳細", exact: true }).click();
  await page.getByRole("region", { name: "Entity詳細", exact: true }).getByRole("button", { name: "この対象から広く見る", exact: true }).click();
  await nav.getByRole("button", { name: "Graph", exact: true }).click();
  await expect(page.getByTestId("exploration-root")).toContainText("浦沢直樹");
  await expect(page.getByRole("button", { name: "直前の探索へ戻る", exact: true })).toBeVisible();
  expect((await canvas.boundingBox())!.y).toBeLessThanOrEqual(230);
  await expect.poll(() => canvas.evaluate(el => (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy.nodes().length)).toBe(10);
  const before = await view(page);
  let neighbors = 0;
  page.on("request", r => { if (r.url().includes("/neighbors")) neighbors++; });
  await header.locator("summary").click();
  await expect(header.getByText("ログイン中", { exact: true })).toBeVisible();
  await expect(header.getByRole("button", { name: "ダークモード", exact: true })).toBeVisible();
  const panel = header.getByRole("group", { name: "表示テーマ", exact: true }).locator("..");
  expect(await panel.evaluate(el => {
    const r = el.getBoundingClientRect();
    return [.3, .6, .9].every(fraction => el.contains(document.elementFromPoint(r.right - 12, r.top + r.height * fraction)));
  })).toBe(true);
  await header.getByRole("button", { name: "ダークモード", exact: true }).click();
  await expect(header.getByRole("button", { name: "ダークモード", exact: true })).toHaveAttribute("aria-pressed", "true");
  await header.getByRole("button", { name: "ダークモード", exact: true }).click();
  if (width === 375) await page.screenshot({ path: "test-results/mobile-shell-menu.png" });
  await page.keyboard.press("Escape");
  name = "切替後の本人";
  await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "graph-knowledge:member-session-changed", newValue: "changed" })));
  await expect(header.getByRole("link", { name: `${name}のアカウントを開く（別タブ）` })).toBeVisible();
  expect(await view(page)).toEqual(before); expect(neighbors).toBe(0);
  if (width === 375) await page.screenshot({ path: "test-results/mobile-shell-graph.png" });
  await nav.getByRole("button", { name: "選択の詳細", exact: true }).click();
  await page.getByRole("button", { name: "関係概要を見る", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const close = dialog.getByRole("button", { name: "閉じる", exact: true });
  await expect(close).toBeVisible();
  await expect.poll(() => close.evaluate(el => el.getBoundingClientRect().width)).toBe(44);
  // Async overview content animates the dialog's height and top. Compare one frame.
  const alignment = await dialog.evaluate(el => ({
    close: el.querySelector("[data-dialog-close]")!.getBoundingClientRect().top,
    title: el.querySelector("h2")!.getBoundingClientRect().top,
  }));
  expect(alignment.close).toBeLessThanOrEqual(alignment.title + 5);
  if (width === 375) await page.screenshot({ path: "test-results/mobile-shell-overview.png" });
  await close.click(); await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "関係概要を見る", exact: true }).click();
  await expect(dialog).toBeVisible(); await page.mouse.click(2, 2); await expect(dialog).toHaveCount(0);
  await nav.getByRole("button", { name: "Graph", exact: true }).click();
  expect(await view(page)).toEqual(before); expect(neighbors).toBe(0);
  signedIn = false;
  await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "graph-knowledge:member-session-changed", newValue: "logout" })));
  await expect(header.getByRole("link", { name: "アカウントを開く（別タブ）", exact: true })).toHaveAttribute("data-signed-in", "false");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
