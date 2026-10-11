import { expect, test } from "@playwright/test";

test("同じ入口から漫画・科学・Eventを検索し、開始例・限定・根拠・概要・復帰へ進む", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("共通Knowledge Graph · 公開準備中", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "PLUTOから探索を開始", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
  const graphBefore = await page.getByTestId("graph-canvas").evaluate(el => (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy.nodes().map(node => node.id()).sort());
  await page.getByLabel("名前・別名").fill("Heisenberg");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await expect(page.getByRole("button", { name: /^ヴェルナー・ハイゼンベルク —/ })).toBeVisible();
  expect(await page.getByTestId("graph-canvas").evaluate(el => (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy.nodes().map(node => node.id()).sort())).toEqual(graphBefore);
  await page.getByRole("button", { name: /^ヴェルナー・ハイゼンベルク —/ }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 4");
  await page.getByRole("region", { name: "Entity詳細" }).getByRole("button", { name: "関係概要を見る", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("関わりがあった");
  await page.getByRole("dialog").getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "第5回ソルヴェイ物理会議（1927）から探索を開始", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 3");
  await expect(page.getByRole("region", { name: "Entity詳細" })).toContainText("1927年10月24日〜1927年10月29日");
  const response = await page.request.get("/api/entities?q=ローレンツ");
  const id = (await response.json()).items[0].id;
  await page.getByTestId("graph-canvas").evaluate((el, id) => {
    (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy.getElementById(id).emit("tap");
  }, id);
  const detail = page.getByRole("region", { name: "Entity詳細" });
  await expect(detail).toContainText("ヘンドリック・ローレンツ");
  await detail.getByRole("button", { name: "この対象から広く見る", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 2");
  await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 3");
  const edgeId = await page.getByTestId("graph-canvas").evaluate((el, id) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    const edge = cy.edges().filter(edge => edge.source().id() === id).first(); edge.emit("tap"); return edge.id();
  }, id);
  expect(edgeId).toBeTruthy();
  await expect(page.getByRole("region", { name: "Claim詳細" })).toContainText("会議議長");
  await expect(page.getByRole("region", { name: "Claim詳細" })).toContainText("Président");
  await expect(page.getByRole("region", { name: "Claim詳細" }).getByRole("link", { name: "出典のURLを開く" }).first()).toBeVisible();
});

test("単一APIで全kindを取得し、三限定とdataset境界を維持する", async ({ request }) => {
  for (const [query, kind] of [["PLUTO", "work"], ["University of Cambridge", "organization"], ["Dirac", "person"], ["ソルヴェイ", "event"]]) {
    const response = await request.get(`/api/entities?q=${encodeURIComponent(query)}&kind=${kind}`);
    expect(response.status()).toBe(200); const result = await response.json(); expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((entity: { kind: string }) => entity.kind === kind)).toBe(true);
    const overview = await request.get(`/api/entities/${result.items[0].id}/overview`);
    expect((await overview.json()).scope.dataset).toBe("public-kg");
  }
  for (const [id, condition, predicate] of [
    ["2b7c6289-d050-4dc0-93e3-9307681253cc", "contributionRoles=PRODUCING&organizationPositions=&eventRoles=", "CONTRIBUTED_TO"],
    ["1530af15-129d-40bf-a1ca-ce8343dc7491", "contributionRoles=&organizationPositions=VISITOR&eventRoles=", "AFFILIATED_WITH"],
    ["247d3efb-6172-4a3e-aa09-dad69914b47c", "contributionRoles=&organizationPositions=&eventRoles=CHAIR", "PARTICIPATED_IN"],
  ]) {
    const filtered = await request.get(`/api/entities/${id}/neighbors?${condition}`);
    expect(filtered.status()).toBe(200);
    const data = await filtered.json(); expect(data.claims).toHaveLength(1);
    expect(data.claims[0].predicate).toBe(predicate);
  }
  expect((await (await request.get("/api/entities?q=青葉ハル")).json()).items).toEqual([]);
});
