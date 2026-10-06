import { checkRelationFacets } from "./relation-facets";
import { expect, test, type Page } from "@playwright/test";
import ledger from "../../datasets/pilot-event/v1/ledger.json" with { type: "json" };
import { editConditions } from "./conditions";
import { checkStartExamples } from "./start-examples";
test.skip(ledger.humanAcceptance.decision !== "accepted", "E01/E03と開催回の人間受入後に実資料検証を実行する");
const event = ledger.entities.find(e => e.kind === "event")!, chair = ledger.candidates.find(c => c.eventParticipation)!, broad = ledger.candidates.find(c => c.ref === "E01" && !c.eventParticipation)!;
const lorentz = ledger.entities.find(e => e.kind === "person")!, dirac = ledger.candidates.find(c => c.ref === "E03")!.subjectId;
async function tap(page: Page, id: string) {
  const point = await page.getByTestId("graph-canvas").evaluate(async (el, id) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    const node = cy.getElementById(id); cy.zoom(1); cy.center(node);
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    return node.renderedPosition();
  }, id);
  const box = (await page.getByTestId("graph-canvas").boundingBox())!;
  await page.mouse.click(box.x + point.x, box.y + point.y);
  await expect.poll(() => page.getByTestId("graph-canvas").evaluate((el, id) =>
    (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy.getElementById(id).hasClass("chosen"), id)).toBe(true);
}
const view = (page: Page) => page.getByTestId("graph-canvas").evaluate(el => {
  const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
  return { nodes: cy.nodes().map(n => ({ id: n.id(), ...n.position() })).sort((a,b) => a.id.localeCompare(b.id)), pan: cy.pan(), zoom: cy.zoom(), chosen: cy.elements(".chosen").map(e => e.id()) };
});
test("実資料: 特定開催回から参加者、広い参加と議長Claim、開催期間／Claim期間、Source、概要へ", async ({ page }) => {
  await page.goto("/"); await page.getByRole("button", { name: `${event.name}から探索を開始`, exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 3");
  const detail = page.getByRole("region", { name: "Entity詳細" });
  await expect(detail).toContainText("1927年10月24日〜1927年10月29日");
  await expect(detail).toContainText("人物の全日程参加を示しません");
  const cy = page.getByTestId("graph-canvas");
  expect(await cy.evaluate(el => (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy.edges().length)).toBe(2);
  const labelOverhang = await cy.evaluate((el, id) => {
    const node = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy.getElementById(id);
    const common = { includeOverlays: false, includeUnderlays: false };
    return node.boundingBox({ ...common, includeLabels: true }).w - node.boundingBox({ ...common, includeLabels: false }).w;
  }, event.id);
  expect(labelOverhang).toBeLessThanOrEqual(24);
  await page.screenshot({ path: "test-results/phase15-real-event-initial.png" });
  await detail.getByRole("button", { name: "関係概要を見る", exact: true }).click();
  const dialog = page.getByRole("dialog"), relation = dialog.getByTestId("overview-PARTICIPATED_IN-object");
  await expect(relation.getByRole("heading", { name: "参加者", exact: true })).toBeVisible();
  await expect(relation.getByLabel("人物 → 参加した → この出来事", { exact: true })).toBeVisible();
  await expect(relation.getByText("参加立場の記録：会議議長")).toBeVisible();
  await expect(relation.getByText("登録された主張の内訳：肯定 3件 ／ 否定 0件", { exact: true })).not.toBeVisible();
  await relation.locator("summary").click();
  await expect(relation.getByText("参加上の立場を限定していない主張：肯定 2件 ／ 否定 0件", { exact: true })).toBeVisible();
  await expect(relation).toContainText("人数・Graphの線・独立した出典");
  await relation.locator("summary").click();
  await page.screenshot({ path: "test-results/phase15-real-event-overview.png" });
  await page.keyboard.press("Escape");
  const list = page.getByRole("region", { name: /隣接関係/ });
  await list.getByTestId(`relation-${chair.claimId}`).getByRole("button", { name: "主張と出典を見る", exact: true }).click();
  for (const id of [broad.claimId, chair.claimId]) await expect(page.getByTestId(`claim-card-${id}`)).toBeVisible();
  await expect(page.getByTestId(`claim-card-${broad.claimId}`)).toContainText("参加上の立場の限定なし");
  await expect(page.getByTestId(`claim-card-${chair.claimId}`)).toContainText("Président");
  await expect(page.getByTestId(`claim-card-${chair.claimId}`)).toContainText("Chair");
  await expect(page.getByTestId(`claim-card-${chair.claimId}`)).toContainText("期間不明");
  await expect(page.getByTestId(`claim-card-${chair.claimId}`).getByRole("link", { name: "出典のURLを開く" })).toHaveCount(2);
  await page.getByRole("button", { name: "詳細を広く読む", exact: true }).click();
  await page.screenshot({ path: "test-results/phase15-real-event-detail.png" });
  await page.getByTestId(`claim-card-${chair.claimId}`).getByText("資料の原参加立場表記：Président", { exact: false }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/phase15-real-event-french-source.png" });
});
test("実資料: 会議議長条件、条件外主張、Dirac起点切替と直前復帰、組織側へ展開", async ({ page }) => {
  await page.goto("/"); await page.getByRole("button", { name: `${event.name}から探索を開始`, exact: true }).click();
  await editConditions(page); await page.getByRole("button", { name: "参加上の立場を調整", exact: true }).click();
  await page.getByRole("radio", { name: "参加上の立場を指定する", exact: true }).check(); await page.getByRole("checkbox", { name: "会議議長", exact: true }).check();
  await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  await page.getByRole("region", { name: /隣接関係/ }).getByRole("button", { name: "主張と出典を見る", exact: true }).click();
  await expect(page.getByTestId(`claim-card-${broad.claimId}`)).toBeVisible();
  await expect(page.getByRole("region", { name: "Claim詳細" })).toContainText("現在の探索条件の対象外の主張");
  await page.getByRole("button", { name: `${lorentz.name}から探索を開始`, exact: true }).click();
  await expect(page.getByTestId("active-predicates")).toContainText("追加条件なし");
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 2");
  await page.getByRole("button", { name: /ポール・ディラックから探索を開始/ }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 3");
  const detail = page.getByRole("region", { name: "Entity詳細" }); await detail.getByRole("button", { name: "関係概要を見る", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("参加した"); await expect(page.getByRole("dialog")).toContainText("関わりがあった"); await page.keyboard.press("Escape");
  await tap(page, event.id);
  await expect(detail).toContainText(event.name);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 5");
  const beforeSwitch = await view(page);
  await detail.getByRole("button", { name: "この対象から広く見る", exact: true }).click();
  await expect(page.getByTestId("exploration-root")).toContainText(event.name);
  await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click();
  await expect(page.getByTestId("exploration-root")).toContainText("ポール・ディラック");
  expect(await view(page)).toEqual(beforeSwitch);
  expect(dirac).toBe("5cda395a-4927-4cae-92fe-839b29d05095");
});
test("実資料: Eventから科学の共有枝へ展開・三限定条件・同条件復帰・休止子孫の復元", async ({ page }) => {
  await page.goto("/"); await page.getByRole("button", { name: `${event.name}から探索を開始`, exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 3");
  const detail = page.getByRole("region", { name: "Entity詳細" });
  await tap(page, dirac); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 5");
  await page.getByTestId(`relation-${ledger.candidates.find(c => c.ref === "E03")!.claimId}`).getByRole("button", { name: "主張と出典を見る", exact: true }).click();
  const diracCard = page.getByTestId(`claim-card-${ledger.candidates.find(c => c.ref === "E03")!.claimId}`);
  await expect(diracCard).toContainText("参加上の立場の限定なし"); await expect(diracCard).toContainText("Dirac de Cambridge");
  await page.screenshot({ path: "test-results/phase15-real-dirac-detail.png" });
  const nbi = "8e322435-4318-4ad0-835b-3f71d2537421", heisenberg = "1530af15-129d-40bf-a1ca-ce8343dc7491";
  await tap(page, nbi); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 8 / Claim 10");
  await tap(page, heisenberg); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 9 / Claim 11");
  const gottingen = "a1af9abb-843a-4611-853c-50f630b817ae";
  await tap(page, gottingen); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 10 / Claim 13");
  await page.getByRole("button", { name: "全体を表示", exact: true }).click();
  await page.screenshot({ path: "test-results/phase15-real-expanded.png" });
  const beforeConditions = await view(page);
  await editConditions(page);
  for (const [button, radio, value] of [
    ["制作の役割を調整", "役割を指定する", "監修"],
    ["組織との関わりの立場を調整", "立場を指定する", "Visitor"],
    ["参加上の立場を調整", "参加上の立場を指定する", "会議議長"],
  ]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await page.getByRole("radio", { name: radio, exact: true }).check();
    await page.getByRole("checkbox", { name: value, exact: true }).check();
  }
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  expect(await view(page)).toEqual(beforeConditions);
  await tap(page, event.id); const beforeClose = await view(page);
  await detail.getByRole("button", { name: "展開を閉じる", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
  await detail.getByRole("button", { name: "展開を再開", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 10 / Claim 13");
  expect((await view(page)).nodes).toEqual(beforeClose.nodes);
  await editConditions(page);
  for (const [button, radio, value] of [
    ["制作の役割を調整", "役割を指定する", "監修"],
    ["組織との関わりの立場を調整", "立場を指定する", "Visitor"],
    ["参加上の立場を調整", "参加上の立場を指定する", "会議議長"],
  ]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await page.getByRole("radio", { name: radio, exact: true }).check();
    await page.getByRole("checkbox", { name: value, exact: true }).check();
  }
  await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  await expect(page.getByTestId("active-predicates")).toContainText("監修");
  await expect(page.getByTestId("active-predicates")).toContainText("Visitor");
  await expect(page.getByTestId("active-predicates")).toContainText("会議議長");
  await page.screenshot({ path: "test-results/phase15-real-three-conditions.png" });
  await tap(page, lorentz.id); const filtered = await view(page);
  await detail.getByRole("button", { name: "同じ条件でこの対象から見る", exact: true }).click();
  await expect(page.getByTestId("exploration-root")).toContainText(lorentz.name);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click();
  expect(await view(page)).toEqual(filtered);
  await detail.getByRole("button", { name: "この対象から広く見る", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 2");
  await expect(page.getByTestId("active-predicates")).toContainText("追加条件なし");
});
checkStartExamples("pilot-event-v1");

checkRelationFacets("pilot-event-v1", "第5回ソルヴェイ物理会議（1927）", ["特定開催回への参加"], ["PARTICIPATED_IN"], { toggle: "参加上の立場を調整", mode: "参加上の立場を指定する", label: "会議議長", parameter: "eventRoles", value: "CHAIR" }, "Entity 2 / Claim 1");
