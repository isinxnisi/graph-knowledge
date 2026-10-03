import { test, expect, type Page } from "@playwright/test";
import fixture from "../../fixtures/demo.json" with { type: "json" };
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };
const root = examples.neighbors.nodes[0];
async function search(page: Page, name: string) {
  await page.getByLabel("人物名・別名").fill(name); await page.getByRole("button", { name: "検索", exact: true }).click();
}
async function choose(page: Page, name = "青葉ハル") {
  await search(page, name); await page.getByRole("button", { name: new RegExp(`^${name} —`) }).first().click();
}
async function canvasTap(page: Page, id: string, edge = false) {
  const point = await page.getByTestId("graph-canvas").evaluate(async (el, args) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    const target = args.edge ? cy.edges().filter((edge) => edge.data("claimIds").includes(args.id)).first() : cy.getElementById(args.id);
    cy.zoom(1); cy.center(target);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const p = args.edge ? (target as import("cytoscape").EdgeSingular).renderedMidpoint() : (target as import("cytoscape").NodeSingular).renderedPosition();
    return { x: p.x, y: p.y };
  }, { id, edge });
  await page.getByTestId("graph-canvas").click({ position: point });
}
test.beforeEach(async ({ page }) => { await page.goto("/"); await expect(page.getByText("架空のデモデータ", { exact: true })).toBeVisible(); });
test("実DB: 検索・Graph・Work展開・循環・出典比較", async ({ page }) => {
  await choose(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  const cyData = () => page.getByTestId("graph-canvas").evaluate((el) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return { positions: Object.fromEntries(cy.nodes().map((n) => [n.id(), n.position()])), denied: cy.edges('[polarity="mixed"]').map((e) => ({ label: e.data("label"), line: e.style("line-style"), arrow: e.style("target-arrow-shape") })) };
  });
  const before = await cyData(); expect(before.denied).toEqual([expect.objectContaining({ label: expect.stringContaining("異説あり"), line: "dotted", arrow: "triangle" })]);
  await canvasTap(page, fixture.entities[8].id);
  await expect(page.getByRole("heading", { name: "星の航路の隣接関係" })).toBeVisible();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 7 / Claim 9");
  const after = await cyData(); for (const [id, position] of Object.entries(before.positions)) expect(after.positions[id]).toEqual(position);
  await canvasTap(page, fixture.entities[3].id); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 8 / Claim 10");
  await canvasTap(page, root.id); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 8 / Claim 10");
  await canvasTap(page, fixture.claims[0].id, true);
  await expect(page.getByTestId(`claim-card-${fixture.claims[0].id}`)).toContainText("出典 2件");
  await expect(page.getByTestId(`claim-card-${fixture.claims[0].id}`)).toContainText("pp.12–13");
  await expect(page.getByTestId(`claim-card-${fixture.claims[1].id}`)).toContainText("2002年〜2004年");
  await expect(page.getByTestId(`claim-card-${fixture.claims[2].id}`)).toContainText("否定する主張");
  await expect(page.getByRole("link", { name: "出典のURLを開く" })).toHaveCount(0);
  await page.screenshot({ path: "/tmp/graph-knowledge-step4.png", fullPage: true });
});
test("実DB: 同名人物・出典未確認・孤立・検索結果なし・テキスト操作", async ({ page }) => {
  await search(page, "佐藤アキ"); const candidates = page.getByRole("button", { name: /^佐藤アキ —/ }); await expect(candidates).toHaveCount(2);
  expect(await candidates.nth(0).getAttribute("aria-label")).not.toBe(await candidates.nth(1).getAttribute("aria-label"));
  await page.getByRole("button", { name: `佐藤アキ — ${fixture.entities[5].description}` }).click();
  await page.getByTestId(`relation-${fixture.claims[12].id}`).getByRole("button", { name: "主張と出典を見る" }).click();
  await expect(page.getByTestId(`claim-card-${fixture.claims[12].id}`)).toContainText("出典未確認");
  await choose(page, "森ユウ"); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
  await expect(page.getByText("関係は登録されていません（孤立Entity）。")).toBeVisible();
  await choose(page); await page.getByTestId(`relation-${fixture.claims[6].id}`).getByRole("button", { name: "星の航路を選択・展開" }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 7 / Claim 9");
  await search(page, "存在しない人物XYZ"); await expect(page.getByText(/検索結果はありません/)).toBeVisible();
});
test("実DB: ページング・取得中・二重取得抑止", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/entities/*/neighbors*", async (route) => {
    requests++; const url = new URL(route.request().url()); url.searchParams.set("limit", "2");
    const response = await route.fetch({ url: url.toString() });
    if (url.searchParams.has("after")) await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({ response });
  });
  await choose(page); await expect(page.getByTestId("graph-counts")).toContainText("Claim 2");
  for (const count of [4, 6, 7]) {
    await page.getByRole("button", { name: "続きを表示", exact: true }).click();
    await expect(page.getByRole("button", { name: "続きを取得中…" })).toBeDisabled();
    await expect(page.getByTestId("graph-counts")).toContainText(`Claim ${count}`);
  }
  await expect(page.getByTestId("relation-counts")).toHaveText("Relation 5");
  expect(requests).toBe(4); await expect(page.getByRole("button", { name: "続きを表示", exact: true })).toHaveCount(0);
});
for (const kind of ["Entity", "Claim"] as const) {
  test(`${kind}上限: 超過ページを追加しない`, async ({ page }) => {
    let index = 0;
    await page.route("**/api/entities/*/neighbors*", async (route) => {
      const start = index++ * 20;
      const nodes = kind === "Entity" ? Array.from({ length: 20 }, (_, i) => ({ ...root, id: `00000000-0000-4000-8000-${String(start+i+1).padStart(12,"0")}`, name: `追加人物${start+i}` })) : [{ ...root, id: fixture.entities[1].id }];
      const claims = Array.from({ length: 20 }, (_, i) => ({ ...examples.neighbors.claims[0], id: `10000000-0000-4000-8000-${String(start+i+1).padStart(12,"0")}`, subjectId: root.id, objectId: nodes[kind === "Entity" ? i : 0].id }));
      await route.fulfill({ json: { centerId: root.id, nodes: [root,...nodes], claims, page: { nextCursor: claims[19].id, hasMore: true } } });
    });
    await choose(page); await expect(page.getByTestId("graph-counts")).toContainText("Claim 20");
    const pages = kind === "Entity" ? 4 : 10;
    for (let i = 1; i < pages; i++) {
      await page.getByRole("button", { name: "続きを表示", exact: true }).click();
      await expect(page.getByTestId("graph-counts")).toContainText(`Claim ${(i+1)*20}`);
    }
    const counts = await page.getByTestId("graph-counts").textContent();
    await page.getByRole("button", { name: "続きを表示", exact: true }).click();
    await expect(page.getByText(/表示上限に達したため/).first()).toBeVisible();
    await expect(page.getByTestId("graph-counts")).toHaveText(counts!);
    await expect(page.getByRole("button", { name: "続きを表示", exact: true })).toBeDisabled();
  });
}
test("API失敗・DB unavailable・Graph再試行", async ({ page }) => {
  await page.route("**/api/entities?*", (r) => r.fulfill({ status: 503, json: { error: { code: "SERVICE_UNAVAILABLE", message: "unavailable" } } }));
  await search(page, "青葉ハル"); await expect(page.getByRole("alert").filter({ hasText: "データベース" })).toContainText("データベース");
  await page.unroute("**/api/entities?*");
  await page.route("**/api/entities/*/neighbors*", (r) => r.fulfill({ status: 500, json: { error: { code: "INTERNAL_ERROR", message: "取得に失敗しました。" } } }));
  await choose(page); await expect(page.getByRole("alert").filter({ hasText: "取得に失敗しました。" })).toContainText("取得に失敗しました。");
  await page.unroute("**/api/entities/*/neighbors*"); await page.getByRole("button", { name: "Graph取得を再試行" }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
});

test("Step 5: 全体展開・同名補助・並行Claim・選択と一覧の同期", async ({ page }) => {
  await choose(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  await page.screenshot({ path: "/tmp/graph-knowledge-step5-initial.png", fullPage: true });
  const initialView = await page.getByTestId("graph-canvas").evaluate((el) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    const loops = cy.edges().filter((edge) => edge.data("claimIds").length === 1 && edge.data("distance") !== 0);
    return { zoom: cy.zoom(), curves: loops.map((edge) => Math.abs(edge.data("distance"))), points: loops.map((edge) => (edge as import("cytoscape").EdgeSingular).renderedMidpoint()) };
  });
  expect(initialView.zoom).toBeGreaterThanOrEqual(0.8);
  expect(initialView.curves).toHaveLength(2);
  expect(initialView.curves.every((distance) => distance >= 70 && distance <= 115)).toBe(true);
  expect(Math.hypot(initialView.points[0].x - initialView.points[1].x, initialView.points[0].y - initialView.points[1].y)).toBeGreaterThan(50);
  const positions = () => page.getByTestId("graph-canvas").evaluate((el) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return Object.fromEntries(cy.nodes().map((node) => [node.id(), node.position()]));
  });
  for (const index of [8, 3, 1, 2, 4, 9, 10, 11]) {
    const before = await positions();
    await canvasTap(page, fixture.entities[index].id);
    await expect(page.getByRole("region", { name: "Entity詳細" })).toContainText("近傍は取得済み");
    const after = await positions(); for (const [id, position] of Object.entries(before)) expect(after[id]).toEqual(position);
  }
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 11 / Claim 15");
  const labels = await page.getByTestId("graph-canvas").evaluate((el, ids) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return ids.map((id) => cy.getElementById(id).data("label"));
  }, [fixture.entities[5].id, fixture.entities[6].id, root.id]);
  expect(labels).toEqual(["佐藤アキ\n漫画家", "佐藤アキ\n編集者", "青葉ハル"]);
  await expect(page.getByTestId("relation-counts")).toHaveText("Relation 13");
  const spans = await page.getByTestId("graph-canvas").evaluate((el) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return cy.edges().map((edge) => {
      const a = edge.source().position(), b = edge.target().position();
      return Math.hypot(a.x - b.x, a.y - b.y);
    });
  });
  expect(Math.min(...spans)).toBeGreaterThan(190);
  expect(Math.max(...spans)).toBeLessThan(500);
  expect(Math.max(...spans) / Math.min(...spans)).toBeLessThan(2.3);
  await page.getByRole("button", { name: "全体を表示", exact: true }).click();
  await page.screenshot({ path: "/tmp/graph-knowledge-step5-expanded.png", fullPage: true });
  await canvasTap(page, fixture.entities[5].id);
  await expect(page.getByTestId("selection-status")).toContainText("佐藤アキ / 漫画家");
  await canvasTap(page, fixture.entities[6].id);
  await expect(page.getByTestId("selection-status")).toContainText("佐藤アキ / 編集者");
  await canvasTap(page, fixture.claims[0].id, true);
  await expect(page.getByTestId(`claim-card-${fixture.claims[0].id}`)).toContainText("出典 2件");
  await expect(page.getByTestId(`relation-${fixture.claims[0].id}`).getByRole("button", { name: "主張と出典を見る" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId(`claim-card-${fixture.claims[2].id}`)).toContainText("否定する主張");
  await page.screenshot({ path: "/tmp/graph-knowledge-step5-detail.png", fullPage: true });
  await page.getByTestId(`relation-${fixture.claims[0].id}`).getByRole("button", { name: "黒川レンを選択・展開" }).click();
  await expect(page.getByTestId("selection-status")).toContainText("黒川レン");
  const selected = await page.getByTestId("graph-canvas").evaluate((el) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return cy.elements(".chosen").map((element) => element.id());
  });
  expect(selected).toEqual([fixture.entities[1].id]);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.setViewportSize({ width: 1160, height: 650 });
  await page.getByRole("button", { name: "全体を表示", exact: true }).click();
  expect((await page.getByTestId("graph-canvas").boundingBox())!.height).toBeGreaterThan(260);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.screenshot({ path: "/tmp/graph-knowledge-step5-compact.png", fullPage: true });
  await choose(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  const shortView = await page.getByTestId("graph-canvas").evaluate(async (el) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return { width: cy.width(), height: cy.height(), nodes: cy.nodes().map((node) => node.renderedBoundingBox({ includeLabels: true })) };
  });
  for (const box of shortView.nodes) {
    expect(box.x1).toBeGreaterThanOrEqual(0); expect(box.x2).toBeLessThanOrEqual(shortView.width);
    expect(box.y1).toBeGreaterThanOrEqual(0); expect(box.y2).toBeLessThanOrEqual(shortView.height);
  }
  await page.screenshot({ path: "/tmp/graph-knowledge-balance-short-initial.png", fullPage: true });
});

test("回帰: ASSISTANT_OFの3 Claimは1 Relation、全主張の詳細と線クリックが対応", async ({ page }) => {
  await choose(page); await expect(page.getByTestId("relation-counts")).toHaveText("Relation 5");
  const ids = fixture.claims.slice(0, 3).map((claim) => claim.id);
  const edge = await page.getByTestId("graph-canvas").evaluate((el, ids) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    const edges = cy.edges().filter((edge) => edge.data("claimIds").some((id: string) => ids.includes(id)));
    const e = edges.first() as import("cytoscape").EdgeSingular;
    return { count: edges.length, id: e.id(), claimIds: e.data("claimIds"), source: e.source().id(), target: e.target().id(),
      arrow: e.style("target-arrow-shape"), sourceArrow: e.style("source-arrow-shape"), label: e.data("label"), distance: e.data("distance") };
  }, ids);
  expect(edge.count).toBe(1); expect(edge.claimIds.sort()).toEqual(ids.sort());
  expect(edge.source).toBe(root.id); expect(edge.target).toBe(fixture.entities[1].id);
  expect(edge.arrow).toBe("triangle"); expect(edge.sourceArrow).toBe("none");
  expect(edge.label).toBe("アシスタントだった\n異説あり"); expect(edge.distance).toBe(0);
  await canvasTap(page, fixture.claims[0].id, true);
  for (const claim of fixture.claims.slice(0, 3)) {
    await expect(page.getByTestId(`claim-card-${claim.id}`)).toContainText(`${claim.period.from!.value}年〜${claim.period.to!.value}年`);
  }
  await expect(page.getByTestId(`claim-card-${fixture.claims[2].id}`)).toContainText("否定する主張");
  await expect(page.getByRole("heading", { name: "選択した主張", exact: true })).toHaveCount(0);
  const chosen = await page.getByTestId("graph-canvas").evaluate((el) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return cy.edges(".chosen").map((edge) => edge.id());
  });
  expect(chosen).toEqual([edge.id]);
  await page.screenshot({ path: "/tmp/graph-knowledge-relation-detail.png", fullPage: true });
});

test("表示用データ: 肯定のみの集約・別predicateの弱い曲線・単一Relation", async ({ page }) => {
  const claims = examples.neighbors.claims.filter((claim) => claim.predicate === "ASSISTANT_OF" && claim.polarity === "affirmed");
  claims.push({ ...claims[0], id: fixture.claims[4].id, predicate: "INFLUENCED_BY" });
  await page.route("**/api/entities/*/neighbors*", (route) => route.fulfill({ json: { centerId: root.id,
    nodes: examples.neighbors.nodes.filter((node) => node.id === root.id || node.id === fixture.entities[1].id), claims, page: { nextCursor: null, hasMore: false } } }));
  await page.route("**/api/claims/*", (route) => {
    const id = route.request().url().split("/").pop();
    const claim = claims.find((claim) => claim.id === id)!;
    return route.fulfill({ json: { claim: { ...examples.claim.claim, ...claim, citations: [], sourceCount: 0 },
      relatedClaimIds: claims.filter((other) => other.id !== id && other.predicate === claim.predicate).map((other) => other.id) } });
  });
  await choose(page); await expect(page.getByTestId("relation-counts")).toHaveText("Relation 2");
  const edges = await page.getByTestId("graph-canvas").evaluate((el) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return cy.edges().map((e) => ({ label: e.data("label"), distance: e.data("distance"), claimIds: e.data("claimIds"), point: e.renderedMidpoint() }));
  });
  expect(edges.map((e) => e.label).sort()).toEqual(["アシスタントだった", "影響を受けた"].sort());
  expect(edges.every((e) => Math.abs(e.distance) >= 70 && Math.abs(e.distance) <= 115)).toBe(true);
  expect(edges.map((e) => e.claimIds.length).sort()).toEqual([1, 2]);
  expect(Math.hypot(edges[0].point.x - edges[1].point.x, edges[0].point.y - edges[1].point.y)).toBeGreaterThan(0);
  for (const claim of [claims[0], claims[2]]) {
    await canvasTap(page, claim.id, true);
    await expect(page.getByTestId(`claim-card-${claim.id}`)).toBeVisible();
    await expect(page.getByRole("region", { name: "Claim詳細" }).getByTestId(/^claim-card-/)).toHaveCount(claim.predicate === "ASSISTANT_OF" ? 2 : 1);
  }
});

test("表示用データ: 単一の否定Relationと出典未確認の詳細", async ({ page }) => {
  const claim = { ...examples.neighbors.claims.find((claim) => claim.polarity === "denied")!, sourceCount: 0 };
  await page.route("**/api/entities/*/neighbors*", (route) => route.fulfill({ json: { centerId: root.id,
    nodes: examples.neighbors.nodes.filter((node) => node.id === claim.subjectId || node.id === claim.objectId), claims: [claim], page: { nextCursor: null, hasMore: false } } }));
  await page.route("**/api/claims/*", (route) => route.fulfill({ json: { claim: { ...examples.claim.claim, ...claim, citations: [] }, relatedClaimIds: [] } }));
  await choose(page); await expect(page.getByTestId("relation-counts")).toHaveText("Relation 1");
  const edge = await page.getByTestId("graph-canvas").evaluate((el) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    const edge = cy.edges().first(); return { label: edge.data("label"), line: edge.style("line-style"), distance: edge.data("distance") };
  });
  expect(edge.label).toBe("アシスタントだった\n（否定）"); expect(edge.line).toBe("dashed"); expect(edge.distance).toBe(0);
  await canvasTap(page, claim.id, true); await expect(page.getByTestId(`claim-card-${claim.id}`)).toContainText("出典未確認");
  await expect(page.getByTestId(`claim-card-${claim.id}`)).toContainText("否定する主張");
});

test("テーマ: 画面とGraphの色を共有し文字・操作境界のコントラストを確保", async ({ page }) => {
  await choose(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  const palette = await page.getByTestId("graph-canvas").evaluate((el) => {
    const style = getComputedStyle(el);
    const token = (name: string) => style.getPropertyValue(`--color-${name}`).trim();
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    const input = getComputedStyle(document.querySelector("input")!);
    const button = getComputedStyle(document.querySelector("form button")!);
    return { surface: style.backgroundColor, canvas: token("canvas"),
      controlPairs: [[input.color, input.backgroundColor], [button.color, button.backgroundColor]],
      controlBorder: [input.borderTopColor, input.backgroundColor],
      textPairs: ["panel", "canvas", "person", "work", "organization", "accent-soft"].map((name) => [token("text"), token(name)]),
      mutedPairs: ["panel", "canvas", "accent-soft"].map((name) => [token("muted"), token(name)]),
      otherPairs: [[token("on-accent"), token("accent")], [token("denied"), token("denied-soft")], [token("demo-text"), token("demo")]],
      boundaries: [[token("edge"), token("canvas")], [token("control-border"), token("panel")], ...["person", "work", "organization"].map((name) => [token("node-border"), token(name)])],
      nodes: cy.nodes().map((node) => ({ color: node.style("color"), fill: node.style("background-color"), shape: node.style("shape"), expanded: node.style("border-style") })),
      edges: cy.edges().map((edge) => ({ color: edge.style("color"), background: edge.style("text-background-color"), line: edge.style("line-color") })),
      expected: { text: token("text"), person: token("person"), work: token("work"), organization: token("organization"), edge: token("edge"), panel: token("panel") } };
  });
  const rgb = (color: string) => color.startsWith("#") ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) : color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
  const luminance = (color: string) => rgb(color).map((value) => { const v = value / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = ([a, b]: string[]) => { const values = [luminance(a), luminance(b)].sort((a, b) => b - a); return (values[0] + 0.05) / (values[1] + 0.05); };
  for (const pair of [...palette.textPairs, ...palette.mutedPairs, ...palette.otherPairs, ...palette.controlPairs]) expect(contrast(pair)).toBeGreaterThanOrEqual(4.5);
  expect(rgb(palette.surface)).toEqual(rgb(palette.canvas));
  for (const pair of [...palette.boundaries, palette.controlBorder]) expect(contrast(pair)).toBeGreaterThanOrEqual(3);
  for (const node of palette.nodes) expect(rgb(node.color)).toEqual(rgb(palette.expected.text));
  expect(palette.nodes.map((node) => node.shape)).toContain("ellipse");
  expect(palette.nodes.map((node) => node.shape)).toContain("round-rectangle");
  expect(palette.nodes.map((node) => node.shape)).toContain("hexagon");
  expect(palette.nodes.some((node) => node.expanded === "double")).toBe(true);
  for (const edge of palette.edges) {
    expect(rgb(edge.color)).toEqual(rgb(palette.expected.text));
    expect(rgb(edge.line)).toEqual(rgb(palette.expected.edge));
    expect(rgb(edge.background)).toEqual(rgb(palette.expected.panel));
  }
  await page.screenshot({ path: "/tmp/graph-knowledge-theme-initial.png", fullPage: true });
});

test("ダークモード: トグルでGraphも更新し探索・選択・表示範囲を維持", async ({ page }) => {
  await choose(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  await canvasTap(page, fixture.claims[0].id, true);
  await expect(page.getByTestId(`claim-card-${fixture.claims[2].id}`)).toBeVisible();
  const inspect = () => page.getByTestId("graph-canvas").evaluate((el) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    const css = getComputedStyle(el);
    return { positions: cy.nodes().map((node) => [node.id(), node.position()]), zoom: cy.zoom(), pan: cy.pan(), chosen: cy.elements(".chosen").map((e) => e.id()),
      text: cy.nodes().first().style("color"), token: css.getPropertyValue("--color-text").trim(),
      pairs: ["panel", "canvas", "person", "work", "organization", "accent-soft"].map((name) => [css.getPropertyValue("--color-text").trim(), css.getPropertyValue(`--color-${name}`).trim()]),
      muted: [css.getPropertyValue("--color-muted").trim(), css.getPropertyValue("--color-panel").trim()] };
  });
  const before = await inspect();
  await page.getByRole("button", { name: "ダークモード", exact: true }).click();
  await expect(page.getByRole("button", { name: "ダークモード", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await inspect()).text).not.toBe(before.text);
  const dark = await inspect();
  expect(dark.positions).toEqual(before.positions); expect(dark.zoom).toBe(before.zoom); expect(dark.pan).toEqual(before.pan); expect(dark.chosen).toEqual(before.chosen);
  const rgb = (color: string) => color.startsWith("#") ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) : color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
  const lum = (color: string) => rgb(color).map((n) => { const v = n / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, n, i) => s + n * [0.2126, 0.7152, 0.0722][i], 0);
  expect(rgb(dark.text)).toEqual(rgb(dark.token));
  for (const [a, b] of [...dark.pairs, dark.muted]) expect((Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)).toBeGreaterThanOrEqual(4.5);
  await expect(page.getByTestId(`claim-card-${fixture.claims[2].id}`)).toContainText("否定する主張");
  await page.screenshot({ path: "/tmp/graph-knowledge-theme-dark.png", fullPage: true });
  await page.getByRole("combobox", { name: "ダーク配色" }).selectOption("blue");
  await expect.poll(async () => (await inspect()).text).not.toBe(dark.text);
  const blue = await inspect();
  expect(blue.positions).toEqual(before.positions); expect(blue.zoom).toBe(before.zoom); expect(blue.pan).toEqual(before.pan); expect(blue.chosen).toEqual(before.chosen);
  expect(rgb(blue.text)).toEqual(rgb(blue.token));
  for (const [a, b] of [...blue.pairs, blue.muted]) expect((Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({ path: "/tmp/graph-knowledge-theme-dark-blue.png", fullPage: true });
  await page.getByRole("combobox", { name: "ダーク配色" }).selectOption("brown");
  await expect.poll(async () => (await inspect()).text).toBe(dark.text);
  await page.getByRole("button", { name: "ダークモード", exact: true }).click();
  await expect.poll(async () => (await inspect()).text).toBe(before.text);
  await expect(page.getByRole("button", { name: "ダークモード", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
});

const closeInDetail = (page: Page) => page.getByRole("region", { name: "Entity詳細" }).getByRole("button", { name: "展開を閉じる", exact: true }).click();
const reopenInDetail = (page: Page) => page.getByRole("region", { name: "Entity詳細" }).getByRole("button", { name: "展開を再開", exact: true }).click();
const viewState = (page: Page) => page.getByTestId("graph-canvas").evaluate((el) => {
  const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
  return { positions: Object.fromEntries(cy.nodes().map((node) => [node.id(), node.position()])), pan: cy.pan(), zoom: cy.zoom(),
    chosen: cy.elements(".chosen").map((element) => element.id()), claims: cy.edges().map((edge) => edge.data("claimIds") as string[]).flat() };
});
test("開閉 実DB: 休止子孫復元・明示閉鎖・座標と選択・共有EntityとClaim", async ({ page }) => {
  let requests = 0;
  page.on("request", (request) => { if (request.url().includes("/neighbors")) requests++; });
  await choose(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  await canvasTap(page, fixture.entities[8].id); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 7 / Claim 9");
  await canvasTap(page, fixture.entities[2].id); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 8 / Claim 11");
  // 作品と白石ミオは同じ制作Claimを共有する。
  await page.getByRole("region", { name: "選択Entityの隣接関係" }).getByRole("button", { name: "展開を閉じる", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 7 / Claim 9");
  expect((await viewState(page)).claims).toContain(fixture.claims[7].id);
  await reopenInDetail(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 8 / Claim 11");
  await canvasTap(page, fixture.entities[8].id);
  await page.getByRole("button", { name: "全体を表示", exact: true }).click();
  const before = await viewState(page); const requestCount = requests;
  await closeInDetail(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  const closed = await viewState(page);
  expect(closed.pan).toEqual(before.pan); expect(closed.zoom).toBe(before.zoom);
  for (const [id, point] of Object.entries(closed.positions)) expect(point).toEqual(before.positions[id]);
  expect(closed.chosen).toEqual([fixture.entities[8].id]);
  await page.screenshot({ path: "/tmp/graph-knowledge-close.png", fullPage: true });
  await reopenInDetail(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 8 / Claim 11");
  expect(requests).toBe(requestCount); const restored = await viewState(page);
  expect(restored.positions).toEqual(before.positions); expect(restored.pan).toEqual(before.pan); expect(restored.zoom).toBe(before.zoom);
  await page.screenshot({ path: "/tmp/graph-knowledge-reopen.png", fullPage: true });
  await canvasTap(page, fixture.entities[2].id); await closeInDetail(page);
  await canvasTap(page, fixture.entities[8].id); await closeInDetail(page); await reopenInDetail(page);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 7 / Claim 9");
  // 起点を閉じると孤立とは表示せず、再開で開いた子孫だけが戻る。
  await canvasTap(page, root.id); await closeInDetail(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
  await expect(page.getByText("関係は登録されていません（孤立Entity）。")).toHaveCount(0);
  await reopenInDetail(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 7 / Claim 9");
});

test("開閉 ブラウザ: 合流・共有Claim・切断循環・選択解除", async ({ page }) => {
  const [A, B, D, C, E] = [0, 1, 2, 3, 4].map((index) => fixture.entities[index]);
  const make = (i: number, subjectId: string, objectId: string) => ({ ...examples.neighbors.claims[0], id: fixture.claims[i].id, subjectId, objectId });
  const AB = make(0, A.id, B.id), AD = make(1, A.id, D.id), BC = make(2, B.id, C.id), DC = make(3, D.id, C.id), CE = make(4, C.id, E.id), EC = make(5, E.id, C.id);
  const sets: Record<string, typeof AB[]> = { [A.id]: [AB, AD], [B.id]: [BC], [D.id]: [DC, BC], [C.id]: [CE, EC], [E.id]: [EC, CE] };
  await page.route("**/api/entities/*/neighbors*", (route) => {
    const id = new URL(route.request().url()).pathname.split("/")[3]; const claims = sets[id];
    const ids = new Set([id, ...claims.flatMap((c) => [c.subjectId, c.objectId])]);
    return route.fulfill({ json: { centerId: id, nodes: [A,B,C,D,E].filter((node) => ids.has(node.id)), claims, page: { nextCursor: null, hasMore: false } } });
  });
  await choose(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 2");
  for (const node of [B, C, D]) { await canvasTap(page, node.id); await expect(page.getByRole("region", { name: "Entity詳細" })).toContainText("近傍は取得済み"); }
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 6");
  await canvasTap(page, B.id); await closeInDetail(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 6");
  expect((await viewState(page)).claims).toContain(BC.id);
  await canvasTap(page, D.id); await closeInDetail(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 2");
  expect((await viewState(page)).positions[C.id]).toBeUndefined(); expect((await viewState(page)).positions[E.id]).toBeUndefined();
  await reopenInDetail(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 6");
  // 子孫Claim選択中に祖先を一覧から閉じると選択は解除される。
  await canvasTap(page, DC.id, true); await page.getByRole("region", { name: "選択Entityの隣接関係" }).getByRole("button", { name: "展開を閉じる", exact: true }).click();
  await expect(page.getByTestId("selection-status")).toHaveText("選択中：未選択");
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 2");
});

test("開閉 ブラウザ: 通信途中で閉じる・再開後のcursor・旧応答破棄", async ({ page }) => {
  let first = true, release!: () => void, delayed = false, calls = 0;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/entities/*/neighbors*", async (route) => {
    calls++; const url = new URL(route.request().url()); url.searchParams.set("limit", "2");
    const response = await route.fetch({ url: url.toString() });
    if (!first) { delayed = true; await gate; } first = false;
    await route.fulfill({ response }).catch(() => {});
  });
  await choose(page); await expect(page.getByTestId("graph-counts")).toContainText("Claim 2");
  await page.getByRole("button", { name: "続きを表示", exact: true }).click();
  await expect.poll(() => delayed).toBe(true); await closeInDetail(page);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0"); release();
  await reopenInDetail(page); await expect(page.getByTestId("graph-counts")).toContainText("Claim 2");
  expect(calls).toBe(2);
  await page.getByRole("button", { name: "続きを表示", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toContainText("Claim 4"); expect(calls).toBe(3);
});

test("開閉 ブラウザ: 上限後に他の枝を閉じて再試行・復元全体の拒否", async ({ page }) => {
  const [A, B, D, C, E] = [0, 1, 2, 3, 4].map((index) => fixture.entities[index]);
  const make = (i: number, subjectId: string, objectId: string) => ({ ...examples.neighbors.claims[0], id: `30000000-0000-4000-8000-${String(i).padStart(12, "0")}`, subjectId, objectId });
  await page.route("**/api/entities/*/neighbors*", (route) => {
    const id = new URL(route.request().url()).pathname.split("/")[3];
    const claims = id === A.id ? [make(1,A.id,B.id), make(2,A.id,D.id)] : Array.from({ length: 190 }, (_, i) => make(i + (id === B.id ? 10 : 210), id, id === B.id ? C.id : E.id));
    const ids = new Set([id, ...claims.flatMap((c) => [c.subjectId,c.objectId])]);
    return route.fulfill({ json: { centerId: id, nodes: [A,B,C,D,E].filter((node) => ids.has(node.id)), claims, page: { nextCursor: null, hasMore: false } } });
  });
  await choose(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 2");
  await canvasTap(page, B.id); await expect(page.getByTestId("graph-counts")).toContainText("Claim 192");
  await canvasTap(page, D.id); await expect(page.getByRole("region", { name: "Entity詳細" })).toContainText("表示上限");
  await canvasTap(page, B.id); await closeInDetail(page); await canvasTap(page, D.id);
  await expect(page.getByTestId("graph-counts")).toContainText("Claim 192");
  await canvasTap(page, B.id); await expect(page.getByRole("region", { name: "Entity詳細" })).toContainText("表示上限");
  await expect(page.getByTestId("graph-counts")).toContainText("Claim 192");
  await canvasTap(page, D.id); await closeInDetail(page); await canvasTap(page, B.id);
  await expect(page.getByTestId("graph-counts")).toContainText("Claim 192");
  expect((await viewState(page)).positions[C.id]).toBeDefined(); expect((await viewState(page)).positions[E.id]).toBeUndefined();
});

test("Node再クリック: 300msで開閉、ダブルクリックは開閉を抑止", async ({ page }) => {
  await choose(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  await canvasTap(page, root.id); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
  await expect(page.getByTestId("selection-status")).toContainText("青葉ハル");
  await canvasTap(page, root.id); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  const point = await page.getByTestId("graph-canvas").evaluate((el, id) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return cy.getElementById(id).renderedPosition();
  }, root.id);
  await page.getByTestId("graph-canvas").dblclick({ position: point });
  await page.waitForTimeout(400);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  // 未選択Nodeの二度目の入力中はAPIを保留し、描画・通信とジェスチャーを分けて確認。
  await choose(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/entities/${fixture.entities[8].id}/neighbors*`, async (route) => {
    const response = await route.fetch(); await gate; await route.fulfill({ response }).catch(() => {});
  });
  const work = await page.getByTestId("graph-canvas").evaluate((el, id) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return cy.getElementById(id).renderedPosition();
  }, fixture.entities[8].id);
  await page.getByTestId("graph-canvas").dblclick({ position: work });
  await expect(page.getByTestId("selection-status")).toContainText("星の航路");
  await page.waitForTimeout(400); release();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 7 / Claim 9");
  // 判定待ち中に明示ボタンで閉じても、古いトグルが再開させない。
  await canvasTap(page, root.id);
  await page.waitForTimeout(320);
  await canvasTap(page, root.id);
  await closeInDetail(page);
  await page.waitForTimeout(400);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
});

async function applyPredicates(page: Page, names: string[]) {
  const filter = page.getByRole("group", { name: "辿る関係" });
  await filter.getByRole("button", { name: "選択を解除", exact: true }).click();
  for (const name of names) await filter.getByRole("checkbox", { name, exact: true }).check();
  await filter.getByRole("button", { name: "適用", exact: true }).click();
}

test("条件探索 実DB: 集約・出典・開閉・座標維持・空条件と孤立の区別", async ({ page }) => {
  await choose(page);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  const snapshot = () => page.getByTestId("graph-canvas").evaluate((el) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return { positions: Object.fromEntries(cy.nodes().map((node) => [node.id(), node.position()])), zoom: cy.zoom(), pan: cy.pan(), labels: cy.edges().map((edge) => edge.data("label")) };
  });
  const before = await snapshot();
  await applyPredicates(page, ["アシスタントだった"]);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 3");
  await expect(page.getByTestId("relation-counts")).toHaveText("Relation 1");
  const after = await snapshot();
  for (const [id, point] of Object.entries(after.positions)) expect(point).toEqual(before.positions[id]);
  expect(after.zoom).toBe(before.zoom); expect(after.pan).toEqual(before.pan);
  expect(after.labels[0]).toContain("異説あり");
  await canvasTap(page, fixture.claims[0].id, true);
  for (const claim of fixture.claims.slice(0, 3)) await expect(page.getByTestId("claim-card-" + claim.id)).toBeVisible();
  await expect(page.getByTestId("claim-card-" + fixture.claims[0].id)).toContainText("出典 2件");
  await expect(page.getByTestId("claim-card-" + fixture.claims[2].id)).toContainText("否定する主張");
  await page.screenshot({ path: "/tmp/graph-knowledge-conditional-claim.png", fullPage: true });
  await canvasTap(page, fixture.entities[1].id);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 4");
  await canvasTap(page, root.id);
  await page.getByRole("region", { name: "Entity詳細" }).getByRole("button", { name: "展開を閉じる", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
  await page.getByRole("button", { name: "展開を再開", exact: true }).first().click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 4");
  await applyPredicates(page, []);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
  await expect(page.getByText("この条件に一致する関係はありません。")).toBeVisible();
  await expect(page.getByText("関係は登録されていません（孤立Entity）。")).toHaveCount(0);
  const filter = page.getByRole("group", { name: "辿る関係" });
  await filter.getByRole("button", { name: "すべて選択", exact: true }).click();
  await filter.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  await page.screenshot({ path: "/tmp/graph-knowledge-conditional-all.png", fullPage: true });
  await choose(page, "森ユウ");
  await expect(page.getByText("関係は登録されていません（孤立Entity）。")).toBeVisible();
});

test("条件探索 実DB: 条件付きページング・編集待機・循環・未取得Claim比較", async ({ page }) => {
  await page.route("**/api/entities/*/neighbors*", async (route) => {
    const url = new URL(route.request().url()); url.searchParams.set("limit", "1");
    await route.fulfill({ response: await route.fetch({ url: url.toString() }) });
  });
  await applyPredicates(page, ["アシスタントだった"]);
  await choose(page); await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  await page.getByTestId("relation-" + fixture.claims[0].id).getByRole("button", { name: "主張と出典を見る" }).click();
  await expect(page.getByTestId("claim-card-" + fixture.claims[2].id)).toContainText("否定する主張");
  await canvasTap(page, root.id);
  for (const count of [2, 3]) {
    await page.getByRole("button", { name: "続きを表示", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim " + count);
  }
  await expect(page.getByTestId("relation-counts")).toHaveText("Relation 1");
  const filter = page.getByRole("group", { name: "辿る関係" });
  await filter.getByRole("checkbox", { name: "影響を受けた", exact: true }).check();
  await expect(page.getByTestId("active-predicates")).not.toContainText("影響を受けた");
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 3");
  await applyPredicates(page, ["影響を受けた"]);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
  await page.getByRole("button", { name: "続きを表示", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 2");
  await canvasTap(page, fixture.entities[3].id);
  const detail = page.getByRole("region", { name: "Entity詳細" });
  await detail.getByRole("button", { name: "続きを表示", exact: true }).click();
  await expect(detail.getByText("このEntityの近傍は取得済みです。")).toBeVisible();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 2");
  await canvasTap(page, root.id);
  await page.getByRole("region", { name: "Entity詳細" }).getByRole("button", { name: "展開を閉じる", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
  await page.getByRole("button", { name: "展開を再開", exact: true }).first().click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 2");
  await page.screenshot({ path: "/tmp/graph-knowledge-conditional-influence.png", fullPage: true });
});

test("条件探索: 条件変更中の旧応答とエラーからの復旧", async ({ page }) => {
  let delayed = false;
  await page.route("**/api/entities/*/neighbors*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("predicates") === "ASSISTANT_OF") {
      delayed = true;
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.fulfill({ json: { ...examples.neighbors, claims: examples.neighbors.claims.filter((c) => c.predicate === "ASSISTANT_OF") } }).catch(() => {});
    } else await route.continue();
  });
  await choose(page); await applyPredicates(page, ["アシスタントだった"]);
  await expect.poll(() => delayed).toBe(true);
  await applyPredicates(page, ["影響を受けた"]);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 2");
  await page.waitForTimeout(700);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 2");
  await page.unroute("**/api/entities/*/neighbors*");
  await page.route("**/api/entities/*/neighbors*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("predicates") === "CONTRIBUTED_TO") await route.fulfill({ status: 503, json: { error: {} } });
    else await route.continue();
  });
  await applyPredicates(page, ["制作に関わった"]);
  await expect(page.getByText("データベースを利用できません。時間をおいて再試行してください。").first()).toBeVisible();
  await page.unroute("**/api/entities/*/neighbors*");
  await page.getByRole("button", { name: "Graph取得を再試行" }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 1");
});
