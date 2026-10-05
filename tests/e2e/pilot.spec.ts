import { editConditions } from "./conditions";
import { test, expect, type Page } from "@playwright/test";
import data from "../../datasets/pilot-urasawa/v1/data.json" with { type: "json" };
const id = (name: string) => data.entities.find((entity) => entity.name === name)!.id;
const claimId = (subject: string, object: string) => data.claims.find((claim) => claim.subjectId === id(subject) && claim.objectId === id(object))!.id;
async function tap(page: Page, name: string, edge = false, subject = "") {
  const targetId = edge ? claimId(subject, name) : id(name);
  const position = await page.getByTestId("graph-canvas").evaluate(async (el, args) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    const target = args.edge ? cy.edges().filter((edge) => edge.data("claimIds").includes(args.targetId)).first() : cy.getElementById(args.targetId);
    cy.zoom(1); cy.center(target);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if (args.edge) {
      // 交差しやすい中点を避け、識別できる実際の線分をクリックする。
      const edge = target as import("cytoscape").EdgeSingular;
      const source = edge.renderedSourceEndpoint(); const object = edge.renderedTargetEndpoint();
      return { x: source.x + (object.x - source.x) * 0.3, y: source.y + (object.y - source.y) * 0.3 };
    }
    return (target as import("cytoscape").NodeSingular).renderedPosition();
  }, { edge, targetId });
  await page.getByTestId("graph-canvas").click({ position });
}
async function root(page: Page) {
  await page.goto("/"); await expect(page.getByText("少数実データパイロット v1", { exact: true })).toBeVisible();
  await page.getByLabel("名前・別名").fill("浦沢直樹"); await page.getByRole("button", { name: "検索", exact: true }).click();
  await page.getByRole("button", { name: /^浦沢直樹 —/ }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 4");
}
test("実在データの経路・役割・限定・出典・循環・開閉", async ({ page }) => {
  await root(page);
  await page.screenshot({ path: "docs/archive/phase-04-real-data-pilot/pilot-initial.png", fullPage: true });
  await tap(page, "PLUTO"); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 7 / Claim 6");
  await tap(page, "長崎尚志"); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 7 / Claim 8");
  await tap(page, "MASTERキートン"); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 8 / Claim 9");
  await tap(page, "勝鹿北星"); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 8 / Claim 9");
  await tap(page, "BILLY BAT"); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 8 / Claim 9");
  await page.getByRole("button", { name: "全体を表示", exact: true }).click();
  await page.screenshot({ path: "docs/archive/phase-04-real-data-pilot/pilot-expanded.png", fullPage: true });
  await tap(page, "PLUTO", true, "長崎尚志");
  const card = page.getByTestId(`claim-card-${claimId("長崎尚志", "PLUTO")}`);
  await expect(card).toContainText("プロデュース"); await expect(card).toContainText("全巻・全期間");
  await expect(card).toContainText("期間不明"); await expect(card.getByRole("link", { name: "出典のURLを開く" })).toHaveAttribute("href", data.sources[0].url!);
  await page.screenshot({ path: "docs/archive/phase-04-real-data-pilot/pilot-evidence.png", fullPage: true });
  await tap(page, "MASTERキートン", true, "勝鹿北星"); await expect(page.getByTestId(`claim-card-${claimId("勝鹿北星", "MASTERキートン")}`)).toContainText("脚本");
  await tap(page, "BILLY BAT", true, "長崎尚志"); await expect(page.getByTestId(`claim-card-${claimId("長崎尚志", "BILLY BAT")}`)).toContainText("ストーリー共同制作");
  await tap(page, "浦沢直樹");
  await page.getByRole("region", { name: "Entity詳細" }).getByRole("button", { name: "展開を閉じる", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
  await page.getByRole("region", { name: "Entity詳細" }).getByRole("button", { name: "展開を再開", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 8 / Claim 9");
  const nodes = await page.getByTestId("graph-canvas").evaluate((el) => (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy.nodes().map((n) => n.id()));
  expect(new Set(nodes).size).toBe(8);
  const response = await page.request.get("/api/entities?q=青葉ハル"); expect((await response.json()).items).toEqual([]);
});
test("影響と制作の条件・英語名検索・実際の引用詳細", async ({ page }) => {
  await root(page);
  await editConditions(page);
  await page.getByRole("button", { name: "選択を解除", exact: true }).click();
  await page.getByRole("checkbox", { name: "影響を受けた", exact: true }).check();
  await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  await tap(page, "手塚治虫", true, "浦沢直樹");
  await expect(page.getByTestId(`claim-card-${claimId("浦沢直樹", "手塚治虫")}`)).toContainText("絵のタッチ");
  await expect(page.getByTestId(`claim-card-${claimId("浦沢直樹", "手塚治虫")}`)).toContainText("本人回答");
  await editConditions(page);
  await page.getByRole("button", { name: "選択を解除", exact: true }).click();
  await page.getByRole("checkbox", { name: "アシスタントだった", exact: true }).check();
  await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
  await expect(page.getByText("この条件に一致する関係はありません。")).toBeVisible();
  await page.getByLabel("名前・別名").fill("Naoki Urasawa"); await page.getByRole("button", { name: "検索", exact: true }).click();
  await expect(page.getByRole("button", { name: /^浦沢直樹 —/ })).toBeVisible();
});

import { checkStartExamples } from "./start-examples";
checkStartExamples("pilot-urasawa-v1");
