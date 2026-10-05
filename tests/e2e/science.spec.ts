import { expect, test, type Page } from "@playwright/test";
import ledger from "../../datasets/pilot-science/v1/ledger.json" with { type: "json" };
import { editConditions, editRoles } from "./conditions";
const id = (ref: string) => ledger.entities.find((e) => e.ref === ref)!.entity.id;
const name = (ref: string) => ledger.entities.find((e) => e.ref === ref)!.entity.name;
const claimId = (ref: string) => ledger.candidates.find((c) => c.ref === ref)!.claim.id;
const canvas = (page: Page) => page.getByTestId("graph-canvas");
async function start(page: Page, ref = "O1") {
  await page.goto("/"); await expect(page.getByText("科学・研究機関パイロット v1", { exact: true })).toBeVisible();
  await page.getByLabel("名前・別名").fill(name(ref));
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(`^${name(ref)} —`) }).click();
  await expect(page.getByTestId("graph-counts")).not.toHaveText("Entity 1 / Claim 0");
}
async function tap(page: Page, ref: string, edge = false) {
  await expect.poll(() => canvas(page).evaluate((el, args) => {
    const cy = (el as unknown as { _cyreg?: { cy: import("cytoscape").Core } })._cyreg?.cy;
    return cy ? (args.edge ? cy.edges().some((e) => e.data("claimIds").includes(args.id)) : cy.getElementById(args.id).length > 0) : false;
  }, { edge, id: edge ? claimId(ref) : id(ref) })).toBe(true);
  const point = await canvas(page).evaluate(async (el, args) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    const target = args.edge ? cy.edges().filter((e) => e.data("claimIds").includes(args.id)).first() : cy.getElementById(args.id);
    cy.zoom(1); cy.center(target);
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    if (args.edge) { const e = target as import("cytoscape").EdgeSingular, a = e.renderedSourceEndpoint(), b = e.renderedTargetEndpoint(); return { x: a.x + (b.x - a.x) * .3, y: a.y + (b.y - a.y) * .3 }; }
    return (target as import("cytoscape").NodeSingular).renderedPosition();
  }, { edge, id: edge ? claimId(ref) : id(ref) });
  await canvas(page).click({ position: point });
}
const view = (page: Page) => canvas(page).evaluate((el) => {
  const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
  return { nodes: cy.nodes().map((n) => ({ id: n.id(), ...n.position() })).sort((a, b) => a.id.localeCompare(b.id)), edges: cy.edges().map((e) => e.id()).sort(), pan: cy.pan(), zoom: cy.zoom(), chosen: cy.elements(".chosen").map((e) => e.id()) };
});
test("組織入口・合流・異年代・原表記詳細・全展開と休止復元", async ({ page }) => {
  await start(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 3");
  await page.screenshot({ path: "docs/archive/phase-10-science-pilot/science-initial.png" });
  await tap(page, "C03", true);
  await expect(page.getByTestId(`claim-card-${claimId("C03")}`)).toContainText("winter term 1921-1922");
  await expect(page.getByTestId(`claim-card-${claimId("C03")}`)).toContainText("assistant of Max Born");
  await tap(page, "P4"); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 4");
  await tap(page, "O2"); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 7 / Claim 7");
  await tap(page, "P2"); await tap(page, "P5");
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 8 / Claim 8");
  await page.getByRole("button", { name: "全体を表示", exact: true }).click();
  const all = await view(page); expect(all.nodes).toHaveLength(8); expect(all.edges).toHaveLength(8);
  await page.screenshot({ path: "docs/archive/phase-10-science-pilot/science-expanded.png" });
  await tap(page, "C08", true); const dirac = page.getByTestId(`claim-card-${claimId("C08")}`);
  await expect(dirac).toContainText("1932"); await expect(dirac).toContainText("1969"); await expect(dirac).toContainText("Lucasian Professor of Mathematics");
  await expect(dirac.getByRole("link", { name: "出典のURLを開く" })).toHaveAttribute("href", /maths.cam.ac.uk/);
  await page.getByRole("button", { name: "詳細を広く読む", exact: true }).click();
  await page.screenshot({ path: "docs/archive/phase-10-science-pilot/science-detail.png" });
  await tap(page, "C04", true);
  await expect(page.getByTestId(`claim-card-${claimId("C04")}`)).toContainText("期間不明");
  await expect(page.getByTestId(`claim-card-${claimId("C04")}`).getByRole("link", { name: "出典のURLを開く" })).toHaveCount(2);
  await tap(page, "O1"); const entity = page.getByRole("region", { name: "Entity詳細" });
  const beforeClose = await view(page);
  await entity.getByRole("button", { name: "展開を閉じる", exact: true }).click(); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
  await entity.getByRole("button", { name: "展開を再開", exact: true }).click(); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 8 / Claim 8");
  expect((await view(page)).nodes).toEqual(beforeClose.nodes);
  await tap(page, "P4"); await entity.getByRole("button", { name: "展開を閉じる", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 8 / Claim 8"); // P2からO2へ到達可能
  await entity.getByRole("button", { name: "展開を再開", exact: true }).click();
});

test("関係概要の組織視点・条件外集計・起点切替と座標／選択／pan zoom復帰", async ({ page }) => {
  await start(page); await tap(page, "P4"); await tap(page, "O2");
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 7 / Claim 7");
  const before = await view(page);
  await page.getByRole("button", { name: "関係概要を見る", exact: true }).click();
  const dialog = page.getByRole("dialog"); await expect(dialog).toContainText("この組織との関わりについての主張");
  await expect(dialog).toContainText("肯定 4件 ／ 否定 0件"); await expect(dialog).toContainText("1965");
  expect(await view(page)).toEqual(before);
  await page.screenshot({ path: "docs/archive/phase-10-science-pilot/science-overview.png" });
  await page.keyboard.press("Escape");
  await editConditions(page); await page.getByRole("button", { name: "選択を解除", exact: true }).click();
  await page.getByRole("checkbox", { name: "関わりがあった", exact: true }).check(); await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 3");
  await tap(page, "P4"); await tap(page, "O2");
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 7 / Claim 7");
  await canvas(page).evaluate((el) => { const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy; cy.zoom(.85); cy.pan({ x: 70, y: 90 }); });
  const original = await view(page);
  await page.getByRole("button", { name: "同じ条件でこの対象から見る", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 4"); await expect(page.getByTestId("active-predicates")).toContainText("関わりがあった");
  await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 7 / Claim 7"); expect(await view(page)).toEqual(original);
  await page.getByRole("button", { name: "関係概要を見る", exact: true }).click();
  await dialog.getByRole("button", { name: "この対象から広く見る", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 4"); await expect(page.getByTestId("active-predicates")).toContainText("追加条件なし");
  await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click();
  await expect(page.getByTestId("active-predicates")).toContainText("関わりがあった"); expect(await view(page)).toEqual(original);
  await page.getByLabel("名前・別名").fill("University of Cambridge"); await page.getByRole("button", { name: "検索", exact: true }).click();
  await expect(page.getByRole("button", { name: /^ケンブリッジ大学 —/ })).toContainText("組織"); expect(await view(page)).toEqual(original);
});

test("Role条件は科学の関与を絞らない・空条件下の概要・原語検索と人物起点", async ({ page }) => {
  await start(page, "P5"); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 2");
  await editRoles(page); await page.getByRole("checkbox", { name: "監修", exact: true }).check();
  await page.getByRole("button", { name: "適用", exact: true }).click(); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 2");
  await expect(page.getByTestId("active-predicates")).toContainText("監修");
  await editConditions(page); await page.getByRole("button", { name: "選択を解除", exact: true }).click();
  await page.getByRole("checkbox", { name: "制作に関わった", exact: true }).check(); await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
  await page.getByRole("button", { name: "関係概要を見る", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("肯定 2件 ／ 否定 0件");
  await page.getByRole("dialog").getByRole("button", { name: "この対象から広く見る", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 2");
  await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click(); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
  await page.getByLabel("名前・別名").fill("University Institute of Theoretical Physics"); await page.getByRole("button", { name: "検索", exact: true }).click();
  await expect(page.getByRole("button", { name: /^ニールス・ボーア研究所 —/ })).toContainText("University Institute of Theoretical Physics");
});

test("実APIのlimit=1でページ受理・閉鎖復元・途中通信の世代分離を確認", async ({ page }) => {
  // HTTPのlimitだけを変更し、各ページは科学DBから取得。架空Claimは作らない。
  await page.route("**/neighbors*", async (route) => { const url = new URL(route.request().url()); url.searchParams.set("limit", "1"); await route.continue({ url: url.toString() }); });
  await start(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  await page.getByRole("region", { name: "Entity詳細" }).getByRole("button", { name: "続きを表示", exact: true }).click(); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 2");
  await page.getByRole("region", { name: "Entity詳細" }).getByRole("button", { name: "続きを表示", exact: true }).click(); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 3");
  await page.unroute("**/neighbors*");
  let started!: () => void, release!: () => void;
  const incoming = new Promise<void>((r) => { started = r; }); const gate = new Promise<void>((r) => { release = r; });
  await page.route(`**/entities/${id("P4")}/neighbors*`, async (route) => { const response = await route.fetch(); started(); await gate; try { await route.fulfill({ response }); } catch { /* 切替で取消済み */ } });
  await tap(page, "P4"); await incoming;
  await page.getByRole("button", { name: "この対象から広く見る", exact: true }).click();
  release();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 2");
  const current = await view(page); expect(current.nodes.map((n) => n.id)).not.toContain(id("P3"));
  await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 3");
});

import { checkStartExamples } from "./start-examples";
checkStartExamples("pilot-science-v1");
