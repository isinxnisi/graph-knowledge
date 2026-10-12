import { expect, test } from "@playwright/test";
import { checkSiteHeader } from "./site-header";
import { checkPhoneExplorer } from "./phone-explorer";
import { checkPhoneReading } from "./phone-reading";

checkSiteHeader("PLUTO", "Entity 4 / Claim 5");
checkPhoneExplorer();
checkPhoneReading();

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

test("更新失効では旧Graphへ混ぜず、同じ起点・条件を明示読み直しできる", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "PLUTOから探索を開始", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
  let rejected = false;
  await page.route("**/api/entities/*/neighbors*", async route => {
    if (rejected) return route.continue();
    rejected = true;
    await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: { code: "DATASET_CHANGED", message: "登録データが更新されました。" } }) });
  });
  await page.getByTestId("graph-canvas").evaluate(el => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    cy.nodes().filter(node => node.data("kind") === "person").first().emit("tap");
  });
  const reload = page.getByRole("button", { name: "更新データで探索を読み直す", exact: true });
  await expect(reload).toBeVisible();
  await expect(page.getByText("登録データが更新されました。古い探索へ混ぜず、同じ起点と条件で読み直してください。", { exact: true })).toHaveCount(1);
  await page.screenshot({ path: "test-results/public-data-changed.png" });
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
  await reload.click();
  await expect(reload).toHaveCount(0);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
  await expect(page.getByTestId("exploration-root")).toContainText("PLUTO");
});

test("旧Claimリンクでは撤回理由・元の出典・明示差替え先を読める", async ({ page, request }) => {
  const search = await (await request.get("/api/entities?q=PLUTO")).json();
  const neighbors = await (await request.get(`/api/entities/${search.items[0].id}/neighbors`)).json();
  const old = await (await request.get(`/api/claims/${neighbors.claims[0].id}`)).json();
  const replacement = neighbors.claims[1].id;
  await page.route(`**/api/claims/${old.claim.id}`, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...old,
    claim: { ...old.claim, withdrawal: { reason: "ブラウザ表示だけの撤回試験", release: "browser-test-only", replacementClaimId: replacement } },
  }) }));
  await page.goto(`/?read=claim&dataset=public-kg&id=${old.claim.id}`);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("撤回された主張");
  await expect(dialog).toContainText("ブラウザ表示だけの撤回試験");
  await expect(dialog.getByRole("link", { name: "出典のURLを開く" }).first()).toBeVisible();
  await expect(dialog.getByRole("link", { name: "差替え先の主張を読む" })).toHaveAttribute("href", `/?read=claim&dataset=public-kg&id=${replacement}`);
  await page.screenshot({ path: "test-results/public-withdrawn-reference.png" });
});
