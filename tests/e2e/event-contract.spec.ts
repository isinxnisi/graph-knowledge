import { expect, test, type Page } from "@playwright/test";
import { EVENT_TEST_IDS as ids } from "../fixtures/event-contract";
import { editConditions } from "./conditions";
const canvas = (page: Page) => page.getByTestId("graph-canvas");
async function search(page: Page, name: string) {
  await page.getByLabel("名前・別名").fill(name); await page.getByRole("button", { name: "検索", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(name) }).last().click();
}
async function start(page: Page) {
  await page.goto("/"); await expect(page.getByText("架空のデモデータ", { exact: true })).toBeVisible();
  await search(page, "架空会議"); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 4");
}
async function tap(page: Page, id: string, edge = false) {
  const point = await canvas(page).evaluate(async (el, args) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    const target = args.edge ? cy.edges().filter(e => e.data("claimIds").includes(args.id)).first() : cy.getElementById(args.id);
    cy.zoom(1); cy.center(target); await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    if (args.edge) { const e = target as import("cytoscape").EdgeSingular, a = e.renderedSourceEndpoint(), b = e.renderedTargetEndpoint(); return { x: a.x + (b.x - a.x) * .3, y: a.y + (b.y - a.y) * .3 }; }
    return (target as import("cytoscape").NodeSingular).renderedPosition();
  }, { id, edge });
  await canvas(page).click({ position: point });
}
const view = (page: Page) => canvas(page).evaluate(el => {
  const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
  return { nodes: cy.nodes().map(n => ({ id: n.id(), ...n.position() })).sort((a,b) => a.id.localeCompare(b.id)), edges: cy.edges().map(e => e.id()).sort(), pan: cy.pan(), zoom: cy.zoom(), chosen: cy.elements(".chosen").map(e => e.id()) };
});
async function setChair(page: Page, enabled: boolean, onlyEvent = true) {
  await editConditions(page);
  if (onlyEvent) { await page.getByRole("button", { name: "選択を解除", exact: true }).click(); await page.getByRole("checkbox", { name: "参加した", exact: true }).check(); }
  const toggle = page.getByRole("button", { name: "参加上の立場を調整", exact: true });
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  if (enabled) { await page.getByRole("radio", { name: "参加上の立場を指定する", exact: true }).check(); await page.getByRole("checkbox", { name: "会議議長", exact: true }).check(); }
  else await page.getByRole("radio", { name: "参加上の立場で絞らない", exact: true }).check();
  await page.getByRole("button", { name: "適用", exact: true }).click();
}
test("人工データ: Event検索・期間分離・広い参加＋議長の1線・肯否・原語・詳細・概要件数", async ({ page }) => {
  await start(page);
  expect((await view(page)).edges).toHaveLength(2);
  await expect(page.getByRole("region", { name: "Entity詳細" })).toContainText("2020年1月1日〜2020年1月3日");
  await expect(page.getByRole("region", { name: "Entity詳細" })).toContainText("人物の全日程参加を示しません");
  await page.screenshot({ path: "test-results/phase15-synthetic-event.png" });
  await page.getByRole("button", { name: "関係概要を見る", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("肯定 3件 ／ 否定 1件");
  const overview = page.getByTestId("overview-PARTICIPATED_IN-object");
  await expect(overview.getByText("肯定・否定の主張あり", { exact: true })).toBeVisible();
  await expect(overview.getByText("参加立場の記録：会議議長（肯定・否定あり）", { exact: true })).toBeVisible(); // 2接続、Citation2でも4Claim
  await page.screenshot({ path: "test-results/phase15-synthetic-overview.png" });
  await page.keyboard.press("Escape");
  await tap(page, ids.chair, true);
  for (const id of [ids.broad, ids.chair, ids.deniedChair]) await expect(page.getByTestId(`claim-card-${id}`)).toBeVisible();
  await expect(page.getByTestId(`claim-card-${ids.broad}`)).toContainText("参加上の立場の限定なし");
  await expect(page.getByTestId(`claim-card-${ids.chair}`)).toContainText("資料の原参加立場表記：Chair");
  await expect(page.getByTestId(`claim-card-${ids.chair}`)).toContainText("期間不明");
  await expect(page.getByTestId(`claim-card-${ids.deniedChair}`)).toContainText("否定する主張");
  const label = await canvas(page).evaluate((el, id) => (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy.edges().filter(e => e.data("claimIds").includes(id)).first().data("label"), ids.chair);
  expect(label).toContain("会議議長"); expect(label).toContain("肯定・否定あり"); expect(label).not.toContain("異説");
  await page.getByRole("button", { name: "詳細を広く読む", exact: true }).click();
  await page.screenshot({ path: "test-results/phase15-synthetic-detail.png" });
});

test("人工データ: 第三型のdraft取消・適用・条件外詳細・同条件／広く見る・座標復帰・開閉", async ({ page }) => {
  await start(page); const initial = await view(page);
  await editConditions(page); await page.getByRole("button", { name: "参加上の立場を調整", exact: true }).click();
  await page.getByRole("radio", { name: "参加上の立場を指定する", exact: true }).check(); await page.getByRole("checkbox", { name: "会議議長", exact: true }).check();
  expect(await view(page)).toEqual(initial);
  await page.getByRole("button", { name: "キャンセル", exact: true }).click(); expect(await view(page)).toEqual(initial);
  await setChair(page, true); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 2");
  await expect(page.getByTestId("active-predicates")).toContainText("会議議長");
  await tap(page, ids.chair, true); await expect(page.getByTestId(`claim-card-${ids.broad}`)).toBeVisible();
  await expect(page.getByRole("region", { name: "Claim詳細" })).toContainText("現在の探索条件の対象外の主張");
  await tap(page, ids.person); const selected = page.getByRole("region", { name: "Entity詳細" });
  await expect(selected).toContainText("近傍は取得済み"); const beforeSwitch = await view(page);
  await selected.getByRole("button", { name: "同じ条件でこの対象から見る", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 2");
  await expect(page.getByTestId("exploration-root")).toContainText("架空参加者A");
  await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click(); expect(await view(page)).toEqual(beforeSwitch);
  await selected.getByRole("button", { name: "関係概要を見る", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("制作に関わった"); await expect(page.getByRole("dialog")).toContainText("関わりがあった");
  await page.getByRole("dialog").getByRole("button", { name: "この対象から広く見る", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
  await expect(page.getByTestId("active-predicates")).toContainText("追加条件なし");
  await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click(); expect(await view(page)).toEqual(beforeSwitch);
  await page.getByTestId(`relation-${ids.chair}`).getByRole("button", { name: "架空会議 第1回を選択・展開", exact: true }).click();
  await expect(selected).toContainText("架空会議 第1回"); const beforeClose = await view(page);
  await selected.getByRole("button", { name: "展開を閉じる", exact: true }).click(); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
  await selected.getByRole("button", { name: "展開を再開", exact: true }).click(); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 2");
  expect((await view(page)).nodes).toEqual(beforeClose.nodes);
});

test("人工データ: ページング・通信途中の条件変更・三型同時条件の副作用なし", async ({ page }) => {
  await page.route("**/neighbors*", route => { const url = new URL(route.request().url()); url.searchParams.set("limit", "1"); return route.continue({ url: url.toString() }); });
  await page.goto("/"); await search(page, "架空会議"); const detail = page.getByRole("region", { name: "Entity詳細" });
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  for (const count of [2, 3, 4]) {
    await detail.getByRole("button", { name: "続きを表示", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toContainText(`Claim ${count}`);
  }
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 4"); await page.unroute("**/neighbors*");
  let incoming!: () => void, release!: () => void;
  const received = new Promise<void>(r => { incoming = r; }), gate = new Promise<void>(r => { release = r; });
  await page.route(`**/entities/${ids.person}/neighbors*`, async route => { const response = await route.fetch(); incoming(); await gate; try { await route.fulfill({ response }); } catch { /* aborted old generation */ } });
  await tap(page, ids.person); await received; await setChair(page, true); release();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 2");
  await page.unroute(`**/entities/${ids.person}/neighbors*`);
  await tap(page, ids.person); await expect(detail).toContainText("近傍は取得済み");
  await detail.getByRole("button", { name: "同じ条件でこの対象から見る", exact: true }).click();
  await expect(page.getByTestId("exploration-root")).toContainText("架空参加者A");
  await editConditions(page); await page.getByRole("button", { name: "すべて選択", exact: true }).click();
  await page.getByRole("button", { name: "制作の役割を調整", exact: true }).click(); await page.getByRole("radio", { name: "役割を指定する", exact: true }).check(); await page.getByRole("checkbox", { name: "監修", exact: true }).check();
  await page.getByRole("button", { name: "組織との関わりの立場を調整", exact: true }).click(); await page.getByRole("radio", { name: "立場を指定する", exact: true }).check(); await page.getByRole("checkbox", { name: "Visitor", exact: true }).check();
  await page.screenshot({ path: "test-results/phase15-synthetic-three-conditions.png" });
  await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 4");
});
