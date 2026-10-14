import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import type { Core } from "cytoscape";
const data = JSON.parse(readFileSync("datasets/public-kg/releases/20261014-credits-001/data.json", "utf8")) as { entities: { id: string; name: string }[] };
const id = (name: string) => data.entities.find(e => e.name === name)!.id;
const paths: [string, string, string, number?][] = [
  ["手塚眞", "手塚プロダクション", "取締役"],
  ["手塚眞", "手塚プロダクション", "取締役", 390],
  ["浦沢直樹", "PLUTO", "著者"],
  ["浦沢直樹", "パイナップルARMY", "画", 1440],
  ["浦沢直樹", "パイナップルARMY", "画", 390],
  ["ヴェルナー・ハイゼンベルク", "ニールス・ボーア研究所", "Visitor"],
  ["ヘンドリック・ローレンツ", "第5回ソルヴェイ物理会議（1927）", "Président"],
];
for (const [subject, object, wording, width = 1440] of paths) test(`${width}pxで関係を読み、二対象から探索へ戻れる: ${subject} → ${object}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto("/");
  await expect.poll(() => page.getByTestId("graph-canvas").evaluate(el => !!(el as unknown as { _cyreg?: { cy: Core } })._cyreg?.cy)).toBe(true);
  await page.getByLabel("名前・別名").fill(subject);
  await page.locator("#explorer-search").getByRole("button", { name: "検索", exact: true }).click();
  await page.locator("#explorer-search").getByRole("button", { name: new RegExp(`^${subject} —`) }).click();
  const canvas = page.getByTestId("graph-canvas");
  await expect.poll(() => canvas.evaluate((el, pair) => {
    const cy = (el as unknown as { _cyreg?: { cy: Core } })._cyreg?.cy;
    return cy?.edges().filter(e => e.source().id() === pair[0] && e.target().id() === pair[1]).length ?? 0;
  }, [id(subject), id(object)])).toBe(1);
  await canvas.evaluate((el, pair) => {
    const cy = (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy;
    cy.edges().filter(e => e.source().id() === pair[0] && e.target().id() === pair[1]).first().emit("tap");
  }, [id(subject), id(object)]);
  const detail = page.getByRole("region", { name: "Claim詳細" });
  const overview = detail.getByTestId("relation-overview");
  const notes = overview.locator("details");
  await expect(notes).not.toHaveAttribute("open");
  const endpoints = detail.getByRole("navigation", { name: "この関係に出てくる対象" });
  await expect(endpoints.getByRole("button")).toHaveCount(2);
  await expect(endpoints.getByRole("button", { name: `${subject}の詳細を見る` })).toBeVisible();
  await expect(endpoints.getByRole("button", { name: `${object}の詳細を見る` })).toBeVisible();
  await expect(detail.getByRole("heading", { name: "資料と記録", exact: true })).toBeVisible();
  await expect(detail.getByRole("button", { name: "根拠を読む", exact: true })).toHaveCount(0);
  await expect(detail.locator('[data-testid^="claim-card-"]').first()).toBeVisible();
  await expect(detail).toContainText(wording);
  await expect(detail.getByRole("link", { name: "出典のURLを開く" }).first()).toBeVisible();
  await notes.locator("summary").click();
  await expect(notes).toContainText("人数や関係の強さではありません");
  await notes.locator("summary").click();
  const record = detail.locator('[data-testid^="claim-card-"]').first();
  const scope = record.locator("summary").filter({ hasText: "期間・役割と確認範囲" });
  await scope.click();
  await expect(record.getByText("関係の期間", { exact: true })).toBeVisible();
  await scope.click();
  const fullNote = record.getByRole("button", { name: "確認メモを全文表示" }).first();
  if (await fullNote.count()) {
    await fullNote.click();
    await expect(record.getByRole("button", { name: "短く表示" }).first()).toHaveAttribute("aria-expanded", "true");
    await record.getByRole("button", { name: "短く表示" }).first().click();
  }
  await overview.scrollIntoViewIfNeeded();
  const before = await canvas.evaluate(el => {
    const cy = (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy;
    return { points: cy.nodes().map(n => [n.id(), n.position()]), edges: cy.edges().map(e => e.id()), pan: cy.pan(), zoom: cy.zoom() };
  });
  if (object === "パイナップルARMY") {
    if (width < 800) await page.getByRole("navigation", { name: "探索画面の切り替え" }).getByRole("button", { name: "Graph", exact: true }).click();
    const copyIcon = page.getByRole("button", { name: "探索URLをコピー", exact: true }).locator("svg");
    expect(await copyIcon.evaluate(el => {
      const b = (el as SVGSVGElement).getBBox(); return b.x >= 1 && b.y >= 1 && b.x + b.width <= 23 && b.y + b.height <= 23;
    })).toBe(true);
    if (width < 800) await page.getByRole("navigation", { name: "探索画面の切り替え" }).getByRole("button", { name: "選択の詳細", exact: true }).click();
    const memo = record.getByRole("button", { name: "確認メモを全文表示" });
    if (await memo.count()) await memo.click();
    const bibliography = record.locator("summary").filter({ hasText: "資料の書誌情報" });
    await bibliography.click(); await expect(record).toContainText("発行者");
    await scope.click(); await expect(record.getByText("関係の期間", { exact: true })).toBeVisible();
    await record.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/reading-polish-detail-${width}.png` });
    await record.getByRole("link", { name: "この記録を個別に開く", exact: true }).click();
    const reader = page.getByRole("dialog", { name: "記録と出典", exact: true });
    await expect(reader.getByRole("button", { name: "この表示のURLをコピー" })).toBeVisible();
    await expect(reader).toContainText("一つの記録とその出典");
    await expect(reader).not.toContainText("同じ環境");
    await expect(reader.getByRole("heading", { name: /パイナップルARMY.*小学館/ }).first()).toBeVisible();
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await reader.getByRole("button", { name: "この表示のURLをコピー" }).click();
    await expect(reader.getByRole("status")).toContainText("URLをコピーしました");
    const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
    expect(copied.searchParams.get("read")).toBe("claim");
    expect(copied.searchParams.has("s")).toBe(false);
    await reader.getByText("URLの詳細", { exact: true }).click();
    await expect(reader).toContainText("その時点で登録されている内容");
    await expect(reader.getByRole("textbox", { name: "この表示のURL", exact: true })).toHaveValue(copied.href);
    await reader.getByRole("heading", { name: "記録と出典", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/reading-polish-modal-${width}.png` });
    await page.keyboard.press("Escape");
    await expect(reader).toHaveCount(0);
  }
  let neighborReads = 0;
  page.on("request", r => { if (r.url().includes("/neighbors")) neighborReads++; });
  if (subject === "手塚眞" && width === 1440) {
    const header = page.getByTestId("site-header");
    await header.locator("summary").click();
    await header.locator("select").last().selectOption("en");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: "Claim details", exact: true }).getByRole("heading", { name: "Sources and records", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Claim details", exact: true }).getByRole("navigation", { name: "Entities in this relation" })).toContainText("Person");
    await header.locator("summary").click();
    await header.locator("select").last().selectOption("ja");
    await page.keyboard.press("Escape");
  }
  await endpoints.getByRole("button", { name: `${object}の詳細を見る` }).click();
  await expect(page.getByRole("region", { name: "Entity詳細" })).toContainText(object);
  const after = await canvas.evaluate(el => {
    const cy = (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy;
    return { points: cy.nodes().map(n => [n.id(), n.position()]), edges: cy.edges().map(e => e.id()), pan: cy.pan(), zoom: cy.zoom() };
  });
  expect(after).toEqual(before); expect(neighborReads).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
