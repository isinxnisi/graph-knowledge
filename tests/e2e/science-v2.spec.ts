import { checkRelationFacets } from "./relation-facets";
import { checkRelationPresentation } from "./relation-presentation";
checkRelationPresentation("science");
import { expect, test, type Page } from "@playwright/test";
import ledger from "../../datasets/pilot-science/v2/ledger.json" with { type: "json" };
import { editConditions } from "./conditions";
import { checkStartExamples } from "./start-examples";
const heisenberg = "1530af15-129d-40bf-a1ca-ce8343dc7491", nbi = "8e322435-4318-4ad0-835b-3f71d2537421";
const visitor = ledger.candidates.find(c => c.positionId === "VISITOR")!, professor = ledger.candidates.find(c => c.positionId === "ASSOCIATE_PROFESSOR")!;
const canvas = (page: Page) => page.getByTestId("graph-canvas");
async function start(page: Page) {
  await page.goto("/"); await expect(page.getByText("科学・研究機関パイロット v2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /ヴェルナー・ハイゼンベルク/ }).first().click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 4");
  await expect(page.getByRole("region", { name: "Entity詳細" })).toContainText("別名：");
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
async function setPosition(page: Page, position: "Visitor" | "Associate professor" | null, onlyAffiliation = true) {
  await editConditions(page);
  if (onlyAffiliation) {
    await page.getByRole("button", { name: "選択を解除", exact: true }).click();
    await page.getByRole("checkbox", { name: "関わりがあった", exact: true }).check();
  }
  const toggle = page.getByRole("button", { name: "組織との関わりの立場を調整", exact: true });
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  if (position) {
    await page.getByRole("radio", { name: "立場を指定する", exact: true }).check();
    for (const name of ["Visitor", "Associate professor"]) await page.getByRole("checkbox", { name, exact: true }).uncheck();
    await page.getByRole("checkbox", { name: position, exact: true }).check();
  } else await page.getByRole("radio", { name: "立場で絞らない", exact: true }).check();
  if (position) await page.screenshot({ path: `test-results/phase14-science-v2-condition-${position === "Visitor" ? "visitor" : "professor"}.png` });
  await page.getByRole("button", { name: "適用", exact: true }).click();
}

test("2立場・2期間・広いClaimを独立表示し、1本のGraphと詳細へ戻れる", async ({ page }) => {
  await start(page);
  expect((await view(page)).edges).toHaveLength(2);
  await page.screenshot({ path: "test-results/phase14-science-v2-initial.png" });
  await tap(page, visitor.claimId, true);
  for (const candidate of ledger.candidates) {
    const card = page.getByTestId(`claim-card-${candidate.claimId}`);
    await expect(card).toContainText(candidate.evidence.originalText);
    await expect(card).toContainText(`${candidate.period.from.value}年〜${candidate.period.to.value}年`);
    await expect(card).toContainText("資料の原立場表記"); await expect(card).toContainText("en");
    await expect(card.getByRole("link", { name: "出典のURLを開く" })).toHaveAttribute("href", /nbi.ku.dk/);
  }
  await expect(page.getByTestId(`claim-card-${visitor.baseClaimId}`)).toContainText("立場の限定なし");
  await page.getByRole("button", { name: "詳細を広く読む", exact: true }).click();
  await page.screenshot({ path: "test-results/phase14-science-v2-detail.png" });
  const label = await canvas(page).evaluate((el, claimId) => (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy.edges().filter(e => e.data("claimIds").includes(claimId)).first().data("label"), visitor.claimId);
  expect(label).not.toContain("1924"); expect(label).not.toContain("異説"); expect(label).toBe("組織\nAssociate professor\nVisitor");
  await tap(page, heisenberg); const entity = page.getByRole("region", { name: "Entity詳細" });
  const before = await view(page);
  await entity.getByRole("button", { name: "展開を閉じる", exact: true }).click(); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
  await entity.getByRole("button", { name: "展開を再開", exact: true }).click(); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 4");
  expect((await view(page)).nodes).toEqual(before.nodes);
});

test("明示適用・Visitor / Associate professor・解除・条件外詳細・同条件起点切替と復帰", async ({ page }) => {
  await start(page);
  const initial = await view(page); await editConditions(page);
  await page.getByRole("button", { name: "組織との関わりの立場を調整", exact: true }).click();
  await page.getByRole("radio", { name: "立場を指定する", exact: true }).check();
  await page.getByRole("checkbox", { name: "Visitor", exact: true }).check();
  await expect(page.getByTestId("draft-conditions")).toContainText("Visitor"); expect(await view(page)).toEqual(initial);
  await page.getByRole("button", { name: "キャンセル", exact: true }).click(); expect(await view(page)).toEqual(initial);
  await setPosition(page, null); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 4");
  await setPosition(page, "Visitor"); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  await expect(page.getByTestId("active-predicates")).toContainText("Visitor");
  await page.screenshot({ path: "test-results/phase14-science-v2-visitor.png" });
  await tap(page, visitor.claimId, true); await expect(page.getByTestId(`claim-card-${professor.claimId}`)).toBeVisible();
  await expect(page.getByRole("region", { name: "Claim詳細" })).toContainText("現在の探索条件の対象外の主張");
  await tap(page, nbi); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  await expect(page.getByRole("region", { name: "Entity詳細" })).toContainText("このEntityの近傍は取得済みです。");
  const beforeSwitch = await view(page);
  await page.getByRole("button", { name: "同じ条件でこの対象から見る", exact: true }).click();
  await expect(page.getByTestId("exploration-root")).toBeVisible();
  await expect(page.getByTestId("active-predicates")).toContainText("Visitor");
  await page.screenshot({ path: "test-results/phase14-science-v2-visitor.png" });
  await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click();
  expect(await view(page)).toEqual(beforeSwitch);
  await page.getByRole("button", { name: "関係概要を見る", exact: true }).click();
  const dialog = page.getByRole("dialog"), relation = dialog.getByTestId("overview-AFFILIATED_WITH-object");
  await expect(relation.getByRole("heading", { name: "関係者", exact: true })).toBeVisible();
  await expect(relation.getByLabel("人物 → 関わりがあった → この組織", { exact: true })).toBeVisible();
  await expect(relation.getByText("組織立場の記録：Associate professor・Visitor")).toBeVisible();
  await expect(relation.getByText("登録された主張の内訳：肯定 6件 ／ 否定 0件", { exact: true })).not.toBeVisible();
  await relation.locator("summary").click();
  await expect(relation.getByText("立場を限定していない主張：肯定 4件 ／ 否定 0件", { exact: true })).toBeVisible();
  await relation.locator("summary").click();
  await page.screenshot({ path: "test-results/phase14-science-v2-overview.png" });
  await page.getByRole("dialog").getByRole("button", { name: "この対象から広く見る", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 6");
  await expect(page.getByTestId("active-predicates")).toContainText("追加条件なし");
  await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click(); expect(await view(page)).toEqual(beforeSwitch);
  await setPosition(page, "Associate professor"); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  await tap(page, professor.claimId, true); await expect(page.getByTestId(`claim-card-${professor.claimId}`)).toContainText("1926年〜1927年");
  await setPosition(page, null, false); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 4");
  await page.getByRole("button", { name: "全体を表示", exact: true }).click(); await page.screenshot({ path: "test-results/phase14-science-v2-unrestricted.png" });
});

test("実ページング・両限定の副作用なし・条件変更中の旧応答を破棄", async ({ page }) => {
  await page.route("**/neighbors*", route => { const url = new URL(route.request().url()); url.searchParams.set("limit", "1"); return route.continue({ url: url.toString() }); });
  await page.goto("/"); await page.getByRole("button", { name: /ヴェルナー・ハイゼンベルク/ }).first().click();
  const entity = page.getByRole("region", { name: "Entity詳細" });
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  for (let i = 0; i < 3; i++) await entity.getByRole("button", { name: "続きを表示", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 4");
  await page.unroute("**/neighbors*");
  let started!: () => void, release!: () => void;
  const incoming = new Promise<void>(r => { started = r; }), gate = new Promise<void>(r => { release = r; });
  await page.route(`**/entities/${nbi}/neighbors*`, async route => { const response = await route.fetch(); started(); await gate; try { await route.fulfill({ response }); } catch { /* 条件適用が旧世代を破棄する */ } });
  await tap(page, nbi); await incoming;
  await setPosition(page, "Visitor"); release();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  expect((await view(page)).nodes.map(n => n.id)).toEqual([heisenberg, nbi].sort());
  await page.unroute(`**/entities/${nbi}/neighbors*`);
  await editConditions(page); await page.getByRole("button", { name: "すべて選択", exact: true }).click();
  await page.getByRole("button", { name: "制作の役割を調整", exact: true }).click(); await page.getByRole("radio", { name: "役割を指定する", exact: true }).check();
  await page.getByRole("checkbox", { name: "監修", exact: true }).check();
  await page.getByRole("radio", { name: "立場で絞らない", exact: true }).check(); await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 4");
  await expect(page.getByRole("region", { name: "Entity詳細" })).toContainText("別名：");
});
checkStartExamples("pilot-science-v2");

test("条件モーダル: 区切り・固定操作・外側クリック取消と概要の閉じる", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  let requests = 0;
  page.on("request", request => { if (request.url().includes("/neighbors")) requests++; });
  await start(page);
  await expect.poll(async () => (await view(page)).edges.length).toBe(2);
  const before = await view(page), initialRequests = requests;
  const dialog = page.getByRole("dialog", { name: "見る関係の編集" });
  await editConditions(page);
  await page.getByRole("button", { name: "選択を解除", exact: true }).click();
  await page.getByRole("checkbox", { name: "関わりがあった", exact: true }).check();
  await page.getByRole("button", { name: "組織との関わりの立場を調整", exact: true }).click();
  await page.getByRole("radio", { name: "立場を指定する", exact: true }).check();
  await page.getByRole("checkbox", { name: "Visitor", exact: true }).check();
  await expect(page.getByTestId("draft-conditions")).toContainText("Visitor");
  await expect(page.getByTestId("active-predicates")).toContainText("追加条件なし");
  await page.getByTestId("draft-conditions").scrollIntoViewIfNeeded();
  await expect(dialog.getByRole("heading", { name: "見る関係の編集", exact: true })).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "適用", exact: true })).toBeInViewport();
  await page.getByRole("checkbox", { name: "Visitor", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/condition-modal-science.png" });
  // 内側の余白や、内側から背景へドラッグした操作では閉じない。
  const box = (await dialog.boundingBox())!;
  await page.mouse.click(box.x + 3, box.y + 50);
  await expect(dialog).toBeVisible();
  const heading = (await dialog.getByRole("heading", { name: "見る関係の編集", exact: true }).boundingBox())!;
  await page.mouse.move(heading.x + 8, heading.y + 8); await page.mouse.down();
  await page.mouse.move(8, 8); await page.mouse.up();
  await expect(dialog).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(dialog).toHaveCount(0);
  expect(await view(page)).toEqual(before); expect(requests).toBe(initialRequests);
  await expect(page.getByRole("button", { name: "見る関係を編集", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "見る関係を編集", exact: true }).click();
  await expect(page.getByRole("radio", { name: "すべての関係", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "条件編集を閉じる", exact: true }).click();
  await editConditions(page); await page.keyboard.press("Escape");
  expect(await view(page)).toEqual(before); expect(requests).toBe(initialRequests);
  // 狭い画面・ダーク配色でも、見出しと適用操作が本文スクロールに埋もれない。
  await page.getByTestId("site-header").locator("summary").click();
  await page.getByRole("button", { name: "ダークモード", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 600, height: 700 });
  await editConditions(page);
  await page.getByRole("button", { name: "組織との関わりの立場を調整", exact: true }).click();
  await page.getByRole("radio", { name: "立場を指定する", exact: true }).check();
  await page.getByRole("checkbox", { name: "Visitor", exact: true }).check();
  await page.getByRole("checkbox", { name: "Visitor", exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole("heading", { name: "見る関係の編集", exact: true })).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "適用", exact: true })).toBeInViewport();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/condition-modal-narrow-dark.png" });
  await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  expect(requests).toBe(initialRequests + 1);
  await page.setViewportSize({ width: 1280, height: 720 });
  const applied = await view(page);
  await page.getByRole("button", { name: "関係概要を見る", exact: true }).click();
  const overview = page.getByRole("dialog", { name: "このデータセットに登録された関係概要" });
  await expect(overview.getByTestId("overview-AFFILIATED_WITH-subject")).toBeVisible();
  await page.mouse.click(8, 8); await expect(overview).toHaveCount(0);
  expect(await view(page)).toEqual(applied); expect(requests).toBe(initialRequests + 1);
  await expect(page.getByRole("button", { name: "関係概要を見る", exact: true })).toBeFocused();
});

checkRelationFacets("pilot-science-v2", "ヴェルナー・ハイゼンベルク", ["人物と組織の関わり"], ["AFFILIATED_WITH"], { toggle: "組織との関わりの立場を調整", mode: "立場を指定する", label: "Visitor", parameter: "organizationPositions", value: "VISITOR" }, "Entity 2 / Claim 1");
