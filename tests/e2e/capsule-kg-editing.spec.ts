import { test, expect } from "@playwright/test";
import fixture from "../../fixtures/demo.json" with { type: "json" };
import { canvasState, openSavedCapsule, renameCapsule, selectContent, startCapsule, storedCapsules, studio } from "./capsule-fixture";

test("本線の関係先から個別Claimを戻し、KG検索で加えた対象との独自関係を編集・保存する", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const source = fixture.entities.find(entity => entity.name === "青葉ハル")!;
  const removed = fixture.entities.find(entity => entity.name === "橘ソラ")!;
  const searched = fixture.entities.find(entity => entity.name === "白石ミオ")!;
  const restoredClaim = fixture.claims.find(claim => claim.subjectId === source.id && claim.objectId === removed.id && claim.predicate === "INFLUENCED_BY")!;
  const omittedClaim = fixture.claims.find(claim => claim.subjectId === removed.id && claim.objectId === source.id && claim.predicate === "INFLUENCED_BY")!;
  const original = await startCapsule(page);
  const canvas = studio(page).getByTestId("graph-canvas");
  expect(original.nodes.map(node => node.id)).toContain(removed.id);
  expect(original.nodes.map(node => node.id)).not.toContain(searched.id);
  const kgEntityBefore = await (await page.request.get(`/api/entities/${searched.id}`)).json();
  const kgClaimBefore = await (await page.request.get(`/api/claims/${restoredClaim.id}`)).json();

  await selectContent(page, removed.name);
  await studio(page).getByRole("button", { name: "Capsuleから外す", exact: true }).click();
  await expect.poll(async () => (await canvasState(canvas)).nodes.map(node => node.id)).not.toContain(removed.id);
  const without = await canvasState(canvas);
  expect(without.claims).not.toContain(restoredClaim.id);
  expect(without.claims).not.toContain(omittedClaim.id);

  await selectContent(page, source.name);
  const neighborsResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/entities/${source.id}/neighbors` && response.request().method() === "GET");
  await studio(page).getByRole("button", { name: "関係先から追加", exact: true }).click();
  const neighbors = await neighborsResponse;
  expect(neighbors.ok()).toBe(true);
  expect((await neighbors.json()).claims.some((claim: { id: string }) => claim.id === restoredClaim.id)).toBe(true);
  const tray = page.getByRole("dialog", { name: "KGの関係先", exact: true });
  await expect(tray.getByRole("heading", { name: source.name, exact: true })).toBeVisible();
  const addClaim = tray.getByRole("button").filter({ hasText: `${source.name} → 影響を受けた → ${removed.name}` });
  await expect(addClaim).toHaveCount(1);
  await expect(addClaim).toBeEnabled();
  await addClaim.click();
  await expect.poll(async () => (await canvasState(canvas)).claims).toContain(restoredClaim.id);
  const restored = await canvasState(canvas);
  expect(restored.nodes.map(node => node.id)).toContain(removed.id);
  expect(restored.claims).not.toContain(omittedClaim.id);
  expect(restored.claims).toEqual([...without.claims, restoredClaim.id].sort());
  await tray.getByRole("button", { name: "関係先を閉じる", exact: true }).click();

  await selectContent(page, source.name);
  await studio(page).getByRole("button", { name: "KGから検索して追加", exact: true }).click();
  const search = page.getByRole("dialog", { name: "KGから追加", exact: true });
  await expect(search).toContainText(`「${source.name}」とつなぐ`);
  await search.getByLabel("名前・別名", { exact: true }).fill(searched.name);
  const searchResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/entities" && new URL(response.url()).searchParams.get("q") === searched.name);
  await search.getByRole("button", { name: "検索", exact: true }).click();
  const result = await searchResponse;
  expect(result.ok()).toBe(true);
  expect((await result.json()).items.some((entity: { id: string }) => entity.id === searched.id)).toBe(true);
  const addEntity = search.getByRole("button").filter({ has: page.locator("strong", { hasText: searched.name }) });
  await expect(addEntity).toHaveCount(1);
  await addEntity.click();
  await expect.poll(async () => (await canvasState(canvas)).nodes.map(node => node.id)).toContain(searched.id);
  // Search retains KG identity for the node, while its new connecting edge is local.
  expect((await canvasState(canvas)).claims).toEqual(restored.claims);
  await selectContent(page, `${source.name} → 関係する → ${searched.name}`);
  await expect(studio(page)).toContainText("Capsule独自の関係");
  await studio(page).getByRole("button", { name: "… 編集", exact: true }).click();
  const editor = page.getByRole("dialog").last();
  await editor.getByLabel("Graphに表示するラベル", { exact: true }).fill("共同制作を調べる");
  await editor.getByLabel("説明", { exact: true }).fill("本線の関係としては未確認の調査メモ");
  await editor.getByRole("button", { name: "適用", exact: true }).click();
  await expect(studio(page).getByRole("heading", { name: "共同制作を調べる", exact: true })).toBeVisible();
  expect(await storedCapsules(page)).toEqual([]);
  await renameCapsule(page, "KG参照と独自関係の区別");
  await studio(page).getByRole("button", { name: "保存", exact: true }).click();
  await expect(studio(page).getByRole("button", { name: "編集", exact: true })).toBeVisible();

  const [saved] = await storedCapsules(page);
  expect(saved.title).toBe("KG参照と独自関係の区別");
  const document = saved.document!;
  for (const entity of [source, removed, searched]) {
    expect(document.nodes.find(node => node.key === entity.id)).toMatchObject({ title: entity.name, origin: { kind: "kg", id: entity.id, snapshot: { id: entity.id, name: entity.name } } });
  }
  const restoredRelation = document.relations.find(relation => relation.origin.kind === "kg" && relation.origin.id === restoredClaim.id)!;
  expect(restoredRelation).toMatchObject({ source: source.id, target: removed.id, origin: { kind: "kg", id: restoredClaim.id, snapshot: { id: restoredClaim.id, subjectId: source.id, objectId: removed.id, predicate: "INFLUENCED_BY" } } });
  const local = document.relations.find(relation => relation.source === source.id && relation.target === searched.id)!;
  expect(local).toMatchObject({ label: "共同制作を調べる", note: "本線の関係としては未確認の調査メモ", origin: { kind: "local" } });
  expect(local.origin).toEqual({ kind: "local" });
  expect([...saved.entityIds].sort()).toEqual([...original.nodes.map(node => node.id), searched.id].sort());
  expect([...saved.claimIds].sort()).toEqual(restored.claims);
  expect(saved.claimIds).not.toContain(local.key);
  expect(await (await page.request.get(`/api/entities/${searched.id}`)).json()).toEqual(kgEntityBefore);
  expect(await (await page.request.get(`/api/claims/${restoredClaim.id}`)).json()).toEqual(kgClaimBefore);
  await studio(page).screenshot({ path: testInfo.outputPath("capsule-kg-editing-saved.png") });
  await page.reload();
  await openSavedCapsule(page, saved.title);
  await selectContent(page, `${source.name} → 共同制作を調べる → ${searched.name}`);
  await expect(studio(page)).toContainText("Capsule独自の関係");
  await expect(studio(page)).toContainText("本線の関係としては未確認の調査メモ");
  expect(await storedCapsules(page)).toEqual([saved]);
  expect(errors).toEqual([]);
});
