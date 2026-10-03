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
