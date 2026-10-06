import { checkRelationFacets } from "./relation-facets";
import { checkRelationPresentation } from "./relation-presentation";
checkRelationPresentation("manga");
import { editConditions, editRoles } from "./conditions";
import { test, expect, type Page } from "@playwright/test";
import rawData from "../../datasets/pilot-urasawa/v2/data.json" with { type: "json" };
import type { Fixture } from "../../lib/domain/fixture";
const data = rawData as Fixture;
import ledger from "../../datasets/pilot-urasawa/v2/ledger.json" with { type: "json" };
const id = (name: string) => data.entities.find((e) => e.name === name)!.id;
async function root(page: Page) {
  await page.goto("/"); await expect(page.getByText("少数実データパイロット v2", { exact: true })).toBeVisible();
  await page.getByLabel("名前・別名").fill("長崎尚志"); await page.getByRole("button", { name: "検索", exact: true }).click();
  await page.getByRole("button", { name: /^長崎尚志 —/ }).click();
}
async function selectRelation(page: Page, object: string, subject = "長崎尚志") {
  await expect.poll(() => page.getByTestId("graph-canvas").evaluate((el, args) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return cy.edges().some((edge) => edge.data("source") === args.subject && edge.data("target") === args.object);
  }, { subject: id(subject), object: id(object) })).toBe(true);
  const point = await page.getByTestId("graph-canvas").evaluate(async (el, args) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    const edge = cy.edges().filter((e) => e.data("source") === args.subject && e.data("target") === args.object).first() as import("cytoscape").EdgeSingular;
    cy.zoom(1); cy.center(edge);
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const a = edge.renderedSourceEndpoint(), b = edge.renderedTargetEndpoint();
    return { x: a.x + (b.x - a.x) * 0.3, y: a.y + (b.y - a.y) * 0.3 };
  }, { subject: id(subject), object: id(object) });
  await page.getByTestId("graph-canvas").click({ position: point });
}
test("v2実DBの取得範囲・広い主張・Role条件・出典", async ({ page }) => {
  await root(page);
  const count = data.claims.filter((c) => c.subjectId === id("長崎尚志")).length;
  await expect(page.getByTestId("graph-counts")).toHaveText(`Entity 4 / Claim ${count}`);
  const edges = await page.getByTestId("graph-canvas").evaluate((el) => (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy.edges().length);
  expect(edges).toBe(3);
  await selectRelation(page, "PLUTO");
  const region = page.getByRole("region", { name: "Claim詳細" });
  await expect(region).toContainText("役割の限定なし"); await expect(region).toContainText("適用範囲が未構造化");
  await expect(region.getByRole("link", { name: "出典のURLを開く" }).first()).toHaveAttribute("href", /isbn=9784091874313/);
  const accepted = ledger.candidates.filter((c) => c.acceptance.decision === "accepted");
  for (const candidate of accepted.filter((c) => c.roleId === "PRODUCING")) {
    const card = page.getByTestId(`claim-card-${candidate.claimId}`);
    await expect(card).toContainText("プロデュース"); await expect(card).toContainText("9784091874313"); await expect(card).toContainText("資料の原役割表記");
  }
  await page.screenshot({ path: "test-results/pilot-v2-real-detail.png", fullPage: true });
  await editConditions(page);
  await page.getByRole("button", { name: "選択を解除", exact: true }).click();
  await page.getByRole("checkbox", { name: "制作に関わった", exact: true }).check();
  await editRoles(page);
  await page.getByRole("checkbox", { name: "プロデュース", exact: true }).check();
  await page.getByRole("button", { name: "適用", exact: true }).click();
  const producing = data.claims.filter((c) => c.subjectId === id("長崎尚志") && c.contribution?.roleId === "PRODUCING");
  await expect(page.getByTestId("graph-counts")).toHaveText(`Entity ${producing.length ? 2 : 1} / Claim ${producing.length}`);
});

test("専用レスポンスでRole概要・別Roleの否定・scope比較・条件外・復元を確認", async ({ page }) => {
  // Fictional test claims are HTTP mocks only; never persisted in pilot data or DB.
  const subject = id("長崎尚志"), object = id("PLUTO");
  const broad = data.claims.find((c) => c.subjectId === subject && c.objectId === object)!;
  const base = await page.request.get(`/api/claims/${broad.id}`); const existing = await base.json();
  const candidate = ledger.candidates.find((c) => c.originClaimId === broad.id)!;
  const supervisionId = "9f091f15-d7a6-4c89-8071-dd0cd38f245e";
  const producing = { ...existing.claim, id: candidate.claimId, contribution: { roleId: "PRODUCING", scope: candidate.scope }, citations: existing.claim.citations.map((c: object) => ({ ...c, roleEvidence: candidate.roleEvidence })) };
  const denied = { ...producing, id: supervisionId, polarity: "denied", contribution: { roleId: "SUPERVISION", scope: { ...candidate.scope, isbn13: "9784091841612", editionLabel: "完全版" } },
    citations: [{ ...existing.claim.citations[0], note: "専用テストの架空根拠。実在資料の主張ではありません。", roleEvidence: { originalText: "監修していない（テスト）", language: "ja" },
      source: { ...existing.claim.citations[0].source, title: "専用テスト資料（実在情報の根拠ではない）", isDemo: true, url: "https://example.invalid/role-test", note: "HTTP mockのみ。pilotへ保存しない。" } }] };
  const details = [existing.claim, producing, denied];
  await page.route("**/api/claims/*", async (route) => {
    const selected = details.find((c) => c.id === new URL(route.request().url()).pathname.split("/").at(-1));
    if (!selected) return route.continue();
    await route.fulfill({ json: { claim: selected, relatedClaimIds: details.filter((c) => c.id !== selected.id).map((c) => c.id) } });
  });
  await page.route("**/neighbors*", async (route) => {
    const url = new URL(route.request().url()); const roles = url.searchParams.get("contributionRoles");
    const claims = details.filter((c) => roles === null || roles.split(",").includes(c.contribution?.roleId));
    const nodes = data.entities.filter((e) => e.id === subject || (claims.length && e.id === object));
    await route.fulfill({ json: { centerId: subject, nodes, claims, page: { nextCursor: null, hasMore: false } } });
  });
  await root(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 3");
  const labels = await page.getByTestId("graph-canvas").evaluate((el) => (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy.edges().map((e) => e.data("label")));
  expect(labels).toHaveLength(1); expect(labels[0]).toContain("肯定・否定あり"); expect(labels[0]).not.toContain("異説");
  await selectRelation(page, "PLUTO");
  await expect(page.getByTestId(`claim-card-${supervisionId}`)).toContainText("否定する主張");
  await expect(page.getByTestId(`claim-card-${supervisionId}`)).toContainText("完全版");
  await page.screenshot({ path: "test-results/pilot-v2-synthetic-multiple-roles.png", fullPage: true });
  await editConditions(page);
  await page.getByRole("button", { name: "選択を解除", exact: true }).click();
  await page.getByRole("checkbox", { name: "制作に関わった", exact: true }).check();
  await editRoles(page);
  await page.getByRole("checkbox", { name: "プロデュース", exact: true }).check();
  await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  await selectRelation(page, "PLUTO");
  await expect(page.getByTestId(`claim-card-${supervisionId}`)).toBeVisible();
  await expect(page.getByRole("region", { name: "Claim詳細" })).toContainText("現在の探索条件の対象外の主張");
  const nodePoint = await page.getByTestId("graph-canvas").evaluate((el, subject) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return (cy.getElementById(subject) as import("cytoscape").NodeSingular).renderedPosition();
  }, subject);
  await page.getByTestId("graph-canvas").click({ position: nodePoint });
  const entity = page.getByRole("region", { name: "Entity詳細" });
  await entity.getByRole("button", { name: "展開を閉じる", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
  await entity.getByRole("button", { name: "展開を再開", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
});

test("受入済み実Roleの全探索・共有枝・座標復元・刊行物限定", async ({ page }) => {
  await root(page);
  async function node(name: string) {
    // 受理済みGraphの描画を待ち、Canvasの現行サイズで座標を読む。
    await expect(page.getByTestId("selection-status").locator("..")).not.toContainText("Graphを取得中");
    await expect.poll(() => page.getByTestId("graph-canvas").evaluate((el, targetId) => (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy.getElementById(targetId).length, id(name))).toBe(1);
    const position = await page.getByTestId("graph-canvas").evaluate(async (el, targetId) => {
      const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
      const target = cy.getElementById(targetId) as import("cytoscape").NodeSingular;
      cy.resize(); cy.zoom(1); cy.center(target);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      return target.renderedPosition();
    }, id(name));
    await page.getByTestId("graph-canvas").click({ position });
    await expect(page.getByRole("region", { name: "Entity詳細" })).toContainText(name);
  }
  for (const name of ["PLUTO", "MASTERキートン", "BILLY BAT", "浦沢直樹"]) {
    await node(name);
    await expect(page.getByRole("region", { name: "Entity詳細" })).toContainText("取得済み");
  }
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 8 / Claim 14");
  await page.getByRole("button", { name: "全体を表示", exact: true }).click();
  const snapshot = () => page.getByTestId("graph-canvas").evaluate((el) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return { positions: cy.nodes().map((n) => ({ id: n.id(), ...n.position() })).sort((a, b) => a.id.localeCompare(b.id)), labels: cy.edges().map((e) => e.data("label") as string) };
  });
  const before = await snapshot(); expect(before.labels).toHaveLength(9);
  expect(before.labels.join(" ")).toContain("ストーリー共同制作");
  await page.screenshot({ path: "test-results/pilot-v2-real-expanded.png", fullPage: true });
  for (const work of ["PLUTO", "MASTERキートン", "BILLY BAT"]) {
    await selectRelation(page, work);
    const candidates = ledger.candidates.filter((c) => c.originClaimId === data.claims.find((claim) => claim.subjectId === id("長崎尚志") && claim.objectId === id(work) && !claim.contribution?.roleId)!.id);
    for (const candidate of candidates) {
      const card = page.getByTestId(`claim-card-${candidate.claimId}`);
      await expect(card).toContainText(candidate.scope.isbn13);
      await expect(card).toContainText("商品情報で確認されたクレジット");
      await expect(card).toContainText("この巻だけの担当や、全巻・全版・全期間の担当を示しません");
      await expect(card).toContainText(candidate.roleEvidence.originalText);
    }
  }
  await node("長崎尚志");
  const entity = page.getByRole("region", { name: "Entity詳細" });
  await entity.getByRole("button", { name: "展開を閉じる", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
  await entity.getByRole("button", { name: "展開を再開", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 8 / Claim 14");
  expect((await snapshot()).positions).toEqual(before.positions);
  await page.setViewportSize({ width: 1160, height: 650 });
  await page.getByRole("button", { name: "全体を表示", exact: true }).click();
  await page.screenshot({ path: "test-results/pilot-v2-real-compact.png", fullPage: true });
});


test("全5件の実クレジットとRole条件を人物起点で確認", async ({ page }) => {
  await page.goto("/");
  for (const candidate of ledger.candidates) {
    const claim = data.claims.find((c) => c.id === candidate.claimId)!;
    const subject = data.entities.find((e) => e.id === claim.subjectId)!.name;
    const object = data.entities.find((e) => e.id === claim.objectId)!.name;
    await page.getByLabel("名前・別名").fill(subject);
    await page.getByRole("button", { name: "検索", exact: true }).click();
    await page.getByRole("button", { name: new RegExp(`^${subject} —`) }).click();
    await selectRelation(page, object, subject);
    const card = page.getByTestId(`claim-card-${candidate.claimId}`);
    await expect(card).toContainText(candidate.roleEvidence.originalText);
    await expect(card).toContainText(candidate.scope.isbn13);
  }
  await editConditions(page);
  await page.getByRole("button", { name: "選択を解除", exact: true }).click();
  await page.getByRole("checkbox", { name: "制作に関わった", exact: true }).check();
  await editRoles(page);
  await page.getByRole("checkbox", { name: "脚本", exact: true }).check();
  await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  await page.getByLabel("名前・別名").fill("手塚眞");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await page.getByRole("button", { name: /^手塚眞 —/ }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
  await editRoles(page);
  await page.getByRole("checkbox", { name: "脚本", exact: true }).uncheck();
  await editRoles(page);
  await page.getByRole("checkbox", { name: "監修", exact: true }).check();
  await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
});

test("Phase 07: 入口・draft取消・全Roleと無指定・詳細幅とGraphの維持", async ({ page }) => {
  let requests = 0;
  page.on("request", (request) => { if (request.url().includes("/neighbors")) requests++; });
  await page.goto("/");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "見る関係を編集", exact: true })).toBeVisible();
  await expect(page.getByText("対象から、つながりを辿ってみる", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/phase07-initial.png", fullPage: true });
  await root(page);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 6");
  const graphSnapshot = () => page.getByTestId("graph-canvas").evaluate((el) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return { nodes: cy.nodes().map((n) => ({ id: n.id(), ...n.position() })), edges: cy.edges().map((e) => e.id()), pan: cy.pan(), zoom: cy.zoom(), selected: cy.elements(".chosen").map((e) => e.id()) };
  });
  const before = await graphSnapshot(), requestCount = requests;
  await editRoles(page);
  await page.getByRole("checkbox", { name: "プロデュース", exact: true }).check();
  await expect(page.getByTestId("draft-conditions")).toContainText("プロデュース");
  await expect(page.getByTestId("active-predicates")).toContainText("追加条件なし");
  await page.screenshot({ path: "test-results/phase07-editor.png", fullPage: true });
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  expect(await graphSnapshot()).toEqual(before); expect(requests).toBe(requestCount);
  await expect(page.getByRole("button", { name: "見る関係を編集", exact: true })).toBeFocused();
  await editConditions(page);
  await page.getByRole("button", { name: "制作の役割を調整", exact: true }).click();
  await expect(page.getByRole("radio", { name: "役割で絞らない", exact: true })).toBeChecked();
  await page.keyboard.press("Escape");
  expect(await graphSnapshot()).toEqual(before); expect(requests).toBe(requestCount);
  await editRoles(page);
  for (const role of ["脚本", "監修", "プロデュース", "ストーリー共同制作"]) await page.getByRole("checkbox", { name: role, exact: true }).check();
  await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 3");
  expect(requests).toBe(requestCount + 1);
  await expect(page.getByTestId("active-predicates")).toContainText("制作に関わった（");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await editConditions(page);
  await page.getByRole("radio", { name: "役割で絞らない", exact: true }).check();
  await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 6");
  await selectRelation(page, "PLUTO");
  await expect(page.getByRole("region", { name: "Claim詳細" })).toContainText("商品情報で確認されたクレジット");
  const selected = await graphSnapshot();
  const detail = page.getByRole("complementary"); const width = (await detail.boundingBox())!.width;
  await page.getByRole("button", { name: "詳細を広く読む", exact: true }).click();
  expect((await detail.boundingBox())!.width).toBeGreaterThan(width);
  expect(await graphSnapshot()).toEqual(selected);
  await page.screenshot({ path: "test-results/phase07-detail-wide.png", fullPage: true });
  await page.getByRole("button", { name: "詳細の幅を戻す", exact: true }).click();
  expect(await graphSnapshot()).toEqual(selected);
  await page.setViewportSize({ width: 1160, height: 650 });
  await page.screenshot({ path: "test-results/phase07-compact.png", fullPage: true });
});
test("Graphオーバーレイ: 選択状態・一時復元通知・操作の透過", async ({ page }) => {
  await page.goto("/");
  let requests = 0;
  page.on("request", request => { if (request.url().includes("/neighbors")) requests++; });
  await page.getByRole("button", { name: "PLUTOから探索を開始", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
  const canvas = page.getByTestId("graph-canvas"), overlay = page.getByTestId("graph-overlay");
  await expect(overlay.getByTestId("selection-status")).toContainText("PLUTO");
  expect(await overlay.evaluate(el => getComputedStyle(el).pointerEvents)).toBe("none");
  const snapshot = () => canvas.evaluate(el => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return { nodes: cy.nodes().map(n => ({ id: n.id(), ...n.position() })).sort((a,b) => a.id.localeCompare(b.id)), pan: cy.pan(), zoom: cy.zoom(), selected: cy.elements(".chosen").map(e => e.id()) };
  });
  const before = await snapshot(), initialRequests = requests;
  const detail = page.getByRole("region", { name: "Entity詳細" });
  await detail.getByRole("button", { name: "展開を閉じる", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
  await detail.getByRole("button", { name: "展開を再開", exact: true }).click();
  const notice = overlay.getByRole("status");
  await expect(notice).toHaveText("取得済みの枝を復元しました。");
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
  await expect.poll(snapshot).toEqual(before);
  const box = (await canvas.boundingBox())!;
  await page.screenshot({ path: "test-results/graph-feedback-overlay.png" });
  await expect(notice).toHaveCount(0, { timeout: 6000 });
  expect(await snapshot()).toEqual(before); expect(requests).toBe(initialRequests);
  expect((await canvas.boundingBox())!.y).toBe(box.y);
  // 同じ枝の再復元でも通知を出し直す。
  await detail.getByRole("button", { name: "展開を閉じる", exact: true }).click();
  await detail.getByRole("button", { name: "展開を再開", exact: true }).click();
  await expect(notice).toHaveText("取得済みの枝を復元しました。");
  // 選択表示の下へNodeをpanし、文字の上からでもそのNodeを選択・展開できる。
  const status = (await overlay.getByTestId("selection-status").boundingBox())!;
  const point = { x: status.x + status.width / 2, y: status.y + status.height / 2 };
  await canvas.evaluate((el, args) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    const node = cy.getElementById(args.id), current = (node as import("cytoscape").NodeSingular).renderedPosition();
    const bounds = el.getBoundingClientRect();
    cy.panBy({ x: args.x - bounds.left - current.x, y: args.y - bounds.top - current.y });
  }, { ...point, id: id("長崎尚志") });
  await page.mouse.click(point.x, point.y);
  await expect(overlay.getByTestId("selection-status")).toContainText("長崎尚志");
  await expect(detail).toContainText("長崎尚志");
});

test("中央ペイン: 単一スクロール・左右独立・Graph縦リサイズ", async ({ page }) => {
  await page.goto("/");
  const canvas = page.getByTestId("graph-canvas"), viewport = canvas.locator("..");
  const card = page.getByRole("region", { name: "Graph", exact: true }), panel = card.locator("..");
  const adjacent = page.getByRole("region", { name: "選択Entityの隣接関係" });
  await expect.poll(() => canvas.evaluate(el => !!(el as unknown as { _cyreg?: { cy?: unknown } })._cyreg?.cy)).toBe(true);
  await page.getByRole("button", { name: "PLUTOから探索を開始", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
  await expect(adjacent.locator("li")).toHaveCount(5);
  const dimensions = () => adjacent.evaluate(el => ({ height: el.clientHeight, content: el.scrollHeight }));
  const many = await dimensions();
  expect(many.content).toBe(many.height);
  const sides = async () => ({
    left: { box: await page.locator("main > div").first().boundingBox(), scroll: await page.locator("main > div").first().evaluate(el => el.scrollTop) },
    right: { box: await page.getByRole("complementary").boundingBox(), scroll: await page.getByRole("complementary").evaluate(el => el.scrollTop) },
    pageScroll: await page.evaluate(() => window.scrollY),
  });
  const initialSides = await sides();
  const cardTop = (await card.boundingBox())!.y;
  expect(await panel.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await canvas.evaluate(el => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    cy.panBy({ x: 12, y: 8 });
  });
  const view = () => canvas.evaluate(el => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return { nodes: cy.nodes().map(n => ({ id: n.id(), ...n.position() })), edges: cy.edges().map(e => e.id()), selected: cy.elements(".chosen").map(e => e.id()), pan: cy.pan(), zoom: cy.zoom() };
  });
  const before = await view();
  await page.getByTestId("graph-counts").hover(); await page.mouse.wheel(0, 60);
  await expect.poll(() => panel.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  expect((await card.boundingBox())!.y).toBeLessThan(cardTop);
  expect(await card.evaluate(el => el.scrollTop)).toBe(0);
  expect(await sides()).toEqual(initialSides);
  expect(await view()).toEqual(before);
  await adjacent.locator("li").first().scrollIntoViewIfNeeded();
  const scrolled = await panel.evaluate(el => el.scrollTop);
  await adjacent.locator("li").first().hover(); await page.mouse.wheel(0, 60);
  await expect.poll(() => panel.evaluate(el => el.scrollTop)).toBeGreaterThan(scrolled);
  expect(await adjacent.evaluate(el => el.scrollTop)).toBe(0);
  expect(await sides()).toEqual(initialSides);
  expect(await view()).toEqual(before);
  await panel.evaluate(el => { el.scrollTop = 0; });
  const original = (await viewport.boundingBox())!;
  expect(original.height).toBeGreaterThan(500);
  expect(original.height).toBeLessThan(680);
  await page.mouse.move(original.x + original.width - 3, original.y + original.height - 3);
  await page.mouse.down(); await page.mouse.move(original.x + original.width - 3, original.y + original.height - 103, { steps: 10 }); await page.mouse.up();
  await expect.poll(async () => (await viewport.boundingBox())!.height).toBeLessThan(original.height - 80);
  const resized = (await viewport.boundingBox())!;
  expect(resized.width).toBe(original.width);
  await expect.poll(() => canvas.evaluate(el => (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy.height())).toBeCloseTo(resized.height - 2, 0);
  expect(await view()).toEqual(before);
  await page.getByRole("button", { name: "詳細を広く読む", exact: true }).click();
  expect(await view()).toEqual(before);
  expect((await viewport.boundingBox())!.height).toBe(resized.height);
  await page.getByRole("button", { name: "詳細の幅を戻す", exact: true }).click();
  await editConditions(page); await editRoles(page);
  await page.getByRole("checkbox", { name: "プロデュース", exact: true }).check();
  await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  await expect(adjacent.locator("li")).toHaveCount(1);
  const few = await dimensions();
  expect(few.height).toBeLessThan(many.height);
  expect(few.content).toBe(few.height);
  expect((await viewport.boundingBox())!.height).toBe(resized.height);
  await page.setViewportSize({ width: 900, height: 650 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(900);
  expect((await viewport.boundingBox())!.height).toBeGreaterThanOrEqual(400);
  await adjacent.scrollIntoViewIfNeeded();
  await adjacent.getByRole("button", { name: "主張と出典を見る", exact: true }).click();
  await expect(page.getByRole("region", { name: "Claim詳細" })).toContainText("プロデュース");
  await page.locator("main > div").first().evaluate(el => { el.scrollTop = 20; });
  await page.getByRole("complementary").evaluate(el => { el.scrollTop = 30; });
  const movedSides = await sides();
  expect(movedSides.left.scroll).toBeGreaterThan(0); expect(movedSides.right.scroll).toBeGreaterThan(0);
  const centerBefore = await panel.evaluate(el => el.scrollTop);
  await adjacent.locator("li").first().hover(); await page.mouse.wheel(0, -60);
  await expect.poll(() => panel.evaluate(el => el.scrollTop)).toBeLessThan(centerBefore);
  expect(await sides()).toEqual(movedSides);
});

test("Phase08: 実Role概要・作品起点・Role条件解除・直前探索復帰", async ({ page }) => {
  await root(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 6");
  await editConditions(page); await editRoles(page);
  await page.getByRole("checkbox", { name: "プロデュース", exact: true }).check();
  await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  await page.getByRole("button", { name: "関係概要を見る", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("肯定 6件 ／ 否定 0件");
  const overviewRow = dialog.getByTestId("overview-CONTRIBUTED_TO-subject");
  await expect(overviewRow.getByText("制作役割の記録：プロデュース・脚本・ほか1種類")).toBeVisible();
  await expect(dialog.getByText("役割を限定していない主張：肯定 3件 ／ 否定 0件", { exact: true })).not.toBeVisible();
  await overviewRow.locator("summary").click();
  await expect(dialog).toContainText("プロデュース：肯定 1件");
  await expect(dialog).toContainText("脚本：肯定 1件");
  await expect(dialog).toContainText("ストーリー共同制作：肯定 1件");
  await expect(dialog).toContainText("役割を限定していない主張：肯定 3件");
  await expect(dialog).toContainText("全巻・全版・全期間の担当を示すものではありません");
  await page.screenshot({ path: "/tmp/phase08-pilot-role-overview.png", fullPage: true });
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  const workId = id("PLUTO");
  await page.getByTestId("graph-canvas").evaluate((el, id) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    cy.getElementById(id).emit("tap");
  }, workId);
  await expect(page.getByRole("region", { name: "Entity詳細" })).toContainText("PLUTO");
  await page.getByRole("button", { name: "関係概要を見る", exact: true }).click();
  await expect(dialog).toContainText("肯定 5件 ／ 否定 0件");
  await dialog.getByRole("button", { name: "この対象から広く見る", exact: true }).click();
  await expect(page.getByTestId("exploration-root")).toContainText("PLUTO");
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
  await selectRelation(page, "PLUTO");
  await expect(page.getByRole("region", { name: "Claim詳細" })).toContainText("Claimの適用刊行物");
  await page.getByRole("button", { name: "全体を表示", exact: true }).click();
  await page.screenshot({ path: "/tmp/phase08-pilot-new-root.png", fullPage: true });
  await page.getByRole("button", { name: "直前の探索へ戻る" }).click();
  await expect(page.getByTestId("exploration-root")).toContainText("長崎尚志");
  await expect(page.getByTestId("active-predicates")).toContainText("プロデュース");
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
});

test("Phase09: 作品・原語別名から開始し、Role条件を起点種別と分離する", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("名前・別名").fill("Master Keaton");
  await page.getByLabel("検索対象", { exact: true }).selectOption("work");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await expect(page.getByRole("button", { name: /^MASTERキートン —/ })).toContainText("別名：Master Keaton");
  await page.getByLabel("名前・別名").fill("PLUTO");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await page.getByRole("button", { name: /^PLUTO —/ }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
  await page.getByRole("button", { name: "関係概要を見る", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("制作関係者");
  await page.keyboard.press("Escape");
  await editConditions(page); await editRoles(page);
  await page.getByRole("checkbox", { name: "プロデュース", exact: true }).check();
  await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  await page.getByRole("button", { name: "長崎尚志を選択・展開", exact: true }).click();
  await page.getByRole("button", { name: "同じ条件でこの対象から見る", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  await page.getByRole("button", { name: "直前の探索へ戻る" }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  await page.screenshot({ path: "test-results/phase09-pilot-work.png" });
  await page.getByLabel("検索対象", { exact: true }).selectOption("person");
  await page.getByLabel("名前・別名").fill("浦沢直樹");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  await page.getByRole("button", { name: /^浦沢直樹 —/ }).click();
  await expect(page.getByTestId("active-predicates")).toContainText("プロデュース");
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  await expect(page.getByRole("button", { name: "手塚治虫を選択・展開", exact: true })).toBeVisible();
});

import { checkStartExamples } from "./start-examples";
checkStartExamples("pilot-urasawa-v2");

checkRelationFacets("pilot-urasawa-v2", "長崎尚志", ["作品制作への関与"], ["CONTRIBUTED_TO"], { toggle: "制作の役割を調整", mode: "役割を指定する", label: "プロデュース", parameter: "contributionRoles", value: "PRODUCING" }, "Entity 2 / Claim 1");
