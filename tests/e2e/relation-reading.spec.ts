import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import type { Core } from "cytoscape";
const data = JSON.parse(readFileSync("datasets/public-kg/releases/20261014-credits-001/data.json", "utf8")) as { entities: { id: string; name: string }[] };
const id = (name: string) => data.entities.find(e => e.name === name)!.id;
const paths: [string, string, string, number?][] = [
  ["手塚眞", "手塚プロダクション", "取締役"],
  ["手塚眞", "手塚プロダクション", "取締役", 390],
  ["浦沢直樹", "PLUTO", "著者"],
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
  if (subject === "手塚眞" || subject === "浦沢直樹") await page.screenshot({ path: `test-results/relation-reading-${subject}-${width}.png` });
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
