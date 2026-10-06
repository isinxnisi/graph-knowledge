import { test, expect, type Page } from "@playwright/test";
import demo from "../../fixtures/demo.json" with { type: "json" };
import manga from "../../datasets/pilot-urasawa/v2/data.json" with { type: "json" };
import science from "../../datasets/pilot-science/v2/data.json" with { type: "json" };
import event from "../../datasets/pilot-event/v1/data.json" with { type: "json" };
import { editConditions, editRoles } from "./conditions";

const datasets = { demo, manga, science, event };
const cases = {
  demo: { root: "青葉ハル", subject: "青葉ハル", object: "黒川レン", counts: "Entity 5 / Claim 7", label: "肯定・否定あり", claimCount: 3 },
  manga: { root: "浦沢直樹", subject: "浦沢直樹", object: "PLUTO", counts: "Entity 5 / Claim 4", label: "制作に関わった", claimCount: 1 },
  science: { root: "ヴェルナー・ハイゼンベルク", subject: "ヴェルナー・ハイゼンベルク", object: "ニールス・ボーア研究所", counts: "Entity 3 / Claim 4", label: "組織\nAssociate professor\nVisitor", claimCount: 3 },
  event: { root: "第5回ソルヴェイ物理会議（1927）", subject: "ヘンドリック・ローレンツ", object: "第5回ソルヴェイ物理会議（1927）", counts: "Entity 3 / Claim 3", label: "参加\n会議議長", claimCount: 2 },
};
const canvas = (page: Page) => page.getByTestId("graph-canvas");
async function readyGraph(page: Page) {
  // 開発Webのhydration／Effect初期化が完了してから、Graphの表示経路を検証する。
  await expect.poll(() => canvas(page).evaluate(el => {
    const cy = (el as unknown as { _cyreg?: { cy?: import("cytoscape").Core } })._cyreg?.cy;
    return !!cy && !cy.destroyed();
  })).toBe(true);
}
const view = (page: Page) => canvas(page).evaluate(el => {
  const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
  return { positions: cy.nodes().map(n => ({ id: n.id(), ...n.position() })).sort((a,b) => a.id.localeCompare(b.id)), edges: cy.edges().map(e => e.id()).sort(), selected: cy.elements(".chosen").map(e => e.id()), pan: cy.pan(), zoom: cy.zoom() };
});
async function clickRelation(page: Page, subject: string, object: string) {
  const position = await canvas(page).evaluate(async (el, args) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    const edge = cy.edges().filter(e => e.data("source") === args.subject && e.data("target") === args.object).first();
    cy.zoom(1); cy.center(edge);
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    return (edge as import("cytoscape").EdgeSingular).renderedMidpoint();
  }, { subject, object });
  await canvas(page).click({ position });
  await expect(page.getByTestId("relation-overview")).toBeVisible();
}
export function checkRelationPresentation(mode: keyof typeof datasets) {
  const data = datasets[mode], c = cases[mode];
  const id = (name: string) => data.entities.find(e => e.name === name)!.id;
  const pair = data.claims.filter(claim => claim.subjectId === id(c.subject) && claim.objectId === id(c.object));
  test(`Phase22 ${mode}: 線→関係全体→個別主張→根拠、Graph座標・選択を維持`, async ({ page }) => {
    await page.goto("/");
    await readyGraph(page);
    await page.getByRole("button", { name: `${c.root}から探索を開始`, exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText(c.counts);
    const labels = await canvas(page).evaluate((el, args) => {
      const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
      return cy.edges().filter(e => e.data("source") === args.subject && e.data("target") === args.object).map(e => ({ label: e.data("label") as string, ids: e.data("claimIds") as string[] }));
    }, { subject: id(c.subject), object: id(c.object) });
    expect(labels).toHaveLength(1); expect(labels[0].ids).toHaveLength(c.claimCount);
    expect(labels[0].label).toContain(c.label); expect(labels[0].label).not.toMatch(/異説|192[467]|200[1234]/);
    expect(labels[0].label).not.toMatch(/指定なし|種類|Claim|主張\s*\d/);
    if (mode === "manga") expect(labels[0].label).not.toMatch(/作画|作者|原作/);
    const patch = canvas(page).locator("..").locator(`button[data-relation-id="relation:${id(c.subject)}:${pair[0].predicate}:${id(c.object)}"]`);
    if (mode === "science" || mode === "event") {
      await expect(patch).toHaveText(mode === "science" ? "組織" : "参加");
      expect(await patch.evaluate(el => getComputedStyle(el).fontSize)).toBe("11px");
      const before = (await patch.boundingBox())!;
      const labelLeft = await canvas(page).evaluate((el, args) => {
        const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
        const edge = cy.edges().filter(e => e.data("source") === args.subject && e.data("target") === args.object).first();
        const box = edge.boundingBox({ includeNodes: false, includeEdges: false, includeLabels: true });
        return { x: el.getBoundingClientRect().left + box.x1 * cy.zoom() + cy.pan().x, zoom: cy.zoom() };
      }, { subject: id(c.subject), object: id(c.object) });
      expect(labelLeft.x - before.x - before.width).toBeCloseTo(3 * labelLeft.zoom, 0);
      await canvas(page).evaluate(el => { (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy.panBy({ x: 20, y: 12 }); });
      await expect.poll(async () => (await patch.boundingBox())?.x).toBeCloseTo(before.x + 20, 0);
      await expect.poll(async () => (await patch.boundingBox())?.y).toBeCloseTo(before.y + 12, 0);
      await canvas(page).evaluate(el => {
        const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
        cy.zoom(cy.zoom() * 1.1);
      });
      await expect.poll(async () => (await patch.boundingBox())?.width).toBeCloseTo(before.width * 1.1, 0);
    } else await expect(patch).toHaveCount(0);
    await page.screenshot({ path: `test-results/phase22/${mode}-graph.png` });
    if (mode === "science" || mode === "event") {
      await patch.click();
      await expect(patch).toHaveAttribute("data-selected", "true");
      await expect(page.getByTestId("relation-overview")).toContainText(c.subject);
      await expect(page.getByTestId("relation-overview")).toContainText(c.object);
    }
    await clickRelation(page, id(c.subject), id(c.object));
    await expect(page.getByTestId("selection-status")).toContainText(labels[0].label.replaceAll("\n", " / "));
    const detail = page.getByRole("region", { name: "Claim詳細" }), summary = page.getByTestId("relation-overview");
    await expect(summary).toContainText(`${c.subject} →`); await expect(summary).toContainText(c.object);
    await expect(summary).toContainText(`Graphに表示中の主張 ${c.claimCount}件`);
    const shown = page.getByTestId("claim-group-shown");
    await expect(shown.locator('[data-testid^="claim-card-"]')).toHaveCount(c.claimCount);
    await expect(detail).not.toContainText("限定比較の参照");
    const before = await view(page);
    await page.getByRole("button", { name: "詳細を広く読む", exact: true }).click();
    await page.screenshot({ path: `test-results/phase22/${mode}-detail.png` });
    if (mode === "demo") {
      await expect(summary).toContainText("肯定 2件 ／ 否定 1件");
      await expect(summary).toContainText("肯否の混在だけでは矛盾を判定しません");
      await expect(shown.getByRole("region", { name: "出典と参照箇所" })).toHaveCount(4);
    }
    if (mode === "manga") {
      await expect(summary).toContainText("役割指定なし");
      await expect(shown).toContainText("浦沢直樹×手塚治虫");
      await expect(shown).toContainText("PLUTO 第1巻の商品情報");
      await expect(shown.getByRole("link", { name: "出典のURLを開く" })).toHaveAttribute("href", "https://shogakukan-comic.jp/book?isbn=9784091874313");
    }
    if (mode === "science") {
      await expect(summary).toContainText("Visitor"); await expect(summary).toContainText("Associate professor");
      await expect(summary).toContainText("立場指定なし");
      await expect(shown).toContainText("1924年〜1925年"); await expect(shown).toContainText("1926年〜1927年");
    }
    if (mode === "event") {
      await expect(summary).toContainText("会議議長"); await expect(summary).toContainText("立場指定なし");
      await expect(shown).toContainText("Président"); await expect(shown).toContainText("言語：fr");
      for (const claim of pair) await expect(page.getByTestId(`claim-card-${claim.id}`)).toContainText("期間不明");
    }
    await detail.getByRole("button", { name: "主張 1を読む", exact: true }).click();
    const first = shown.locator('[data-testid^="claim-card-"]').first();
    await expect(first).toBeFocused();
    await first.getByRole("button", { name: "根拠を読む", exact: true }).click();
    await page.screenshot({ path: `test-results/phase22/${mode}-source.png` });
    expect(await view(page)).toEqual(before);
    await expect(page.getByTestId("graph-counts")).toHaveText(c.counts);
    await page.getByRole("button", { name: "詳細の幅を戻す", exact: true }).click();
    await page.getByRole("button", { name: `${c.object}を選択・展開`, exact: true }).first().click();
    await expect(page.getByRole("region", { name: "Entity詳細" })).toContainText(c.object);
    await expect(page.getByRole("region", { name: "Entity詳細" })).toContainText("取得済み");
  });
  if (mode === "manga") test("Phase22 manga: PLUTOから別の制作人物と広い／限定主張を読み分ける", async ({ page }) => {
    await page.goto("/"); await readyGraph(page);
    await page.getByRole("button", { name: "PLUTOから探索を開始", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
    const semanticLabels = await canvas(page).evaluate(el => {
      const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
      return cy.edges().map(e => ({ label: e.data("label") as string, claimCount: (e.data("claimIds") as string[]).length }));
    });
    expect(semanticLabels).toEqual(expect.arrayContaining([
      { label: "制作\nプロデュース", claimCount: 2 },
      { label: "制作\n監修", claimCount: 2 },
      { label: "制作に関わった", claimCount: 1 },
    ]));
    expect(semanticLabels).toHaveLength(3);
    await expect(canvas(page).locator("..").locator('button[data-relation-id]')).toHaveCount(2);
    await expect(canvas(page).locator("..").locator('button[data-relation-id]').first()).toHaveText("制作");
    await page.screenshot({ path: "test-results/phase22/manga-pluto-graph.png" });
    await clickRelation(page, id("長崎尚志"), id("PLUTO"));
    const summary = page.getByTestId("relation-overview");
    await expect(summary).toContainText("プロデュース"); await expect(summary).toContainText("役割指定なし");
    await expect(page.getByTestId("claim-group-shown").locator('[data-testid^="claim-card-"]')).toHaveCount(2);
    await page.getByRole("button", { name: "詳細を広く読む", exact: true }).click();
    await page.screenshot({ path: "test-results/phase22/manga-pluto-detail.png" });
    await editConditions(page); await editRoles(page);
    await page.getByRole("checkbox", { name: "プロデュース", exact: true }).check();
    await page.getByRole("button", { name: "適用", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
    await expect(canvas(page).locator("..").locator('button[data-relation-id]')).toHaveCount(1);
    expect(await canvas(page).evaluate(el => (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy.edges().first().data("label"))).toBe("制作\nプロデュース");
    await clickRelation(page, id("長崎尚志"), id("PLUTO"));
    await expect(summary).not.toContainText("役割指定なし");
    const outside = page.getByTestId("claim-group-outside");
    await expect(outside).toContainText("役割の限定なし");
    await expect(page.getByTestId("claim-group-shown")).toContainText("この巻だけの担当や、全巻・全版・全期間の担当を示しません");
    await page.screenshot({ path: "test-results/phase22/manga-filtered.png" });
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  });
}
