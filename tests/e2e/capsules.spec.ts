import { test, expect } from "@playwright/test";
import { canvasState, openSavedCapsule, renameCapsule, selectContent, startCapsule, storedCapsules, studio } from "./capsule-fixture";

for (const width of [390, 1440]) {
  test(`表示中の図を直接編集し、独自要素・根拠・配置を明示保存して再訪する（${width}px）`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const original = await startCapsule(page);
    const canvas = studio(page).getByTestId("graph-canvas");
    const captured = await canvasState(canvas);
    expect(captured.nodes.map(n => n.id).sort()).toEqual(original.nodes.map(n => n.id).sort());
    expect(captured.claims).toEqual(original.claims);
    expect(captured.positions).toEqual(original.positions);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(studio(page)).toContainText("編集中");
    await expect(studio(page).getByRole("button", { name: "知識登録・準備中", exact: true })).toBeDisabled();
    expect(await storedCapsules(page)).toEqual([]);

    await renameCapsule(page, "人物と作品の調査");
    await selectContent(page, "青葉ハル");
    await studio(page).getByRole("button", { name: "独自Entity", exact: true }).click();
    let editor = page.getByRole("dialog").last();
    await expect(editor).toContainText("「青葉ハル」から「関係する」でつなぎます。");
    await editor.getByLabel("タイトル", { exact: true }).fill("調査中の人物");
    await editor.getByLabel("説明・メモ（任意）", { exact: true }).fill("資料を照合している途中。");
    await editor.getByLabel("見た目の分類バッジ（任意）", { exact: true }).fill("漫画家");
    await editor.getByRole("button", { name: "適用", exact: true }).click();
    await expect(studio(page).getByRole("heading", { name: "調査中の人物", exact: true })).toBeVisible();
    await studio(page).getByRole("button", { name: "根拠を追加", exact: true }).click();
    editor = page.getByRole("dialog").last();
    await editor.getByLabel("タイトル", { exact: true }).fill("調査ノート");
    await editor.getByLabel("URL （任意）", { exact: true }).fill("https://example.org/research");
    await editor.getByLabel("ページ・箇所", { exact: true }).fill("12ページ");
    await editor.getByRole("button", { name: "適用", exact: true }).click();
    await studio(page).getByRole("button", { name: "テキスト", exact: true }).click();
    editor = page.getByRole("dialog").last();
    await editor.getByLabel("テキスト", { exact: true }).fill("この関係は今後確認する");
    await editor.getByRole("combobox", { name: "スタイル", exact: true }).selectOption("heading");
    await editor.getByRole("button", { name: "適用", exact: true }).click();
    expect(await storedCapsules(page)).toEqual([]);
    await studio(page).screenshot({ path: testInfo.outputPath(`capsule-editing-${width}.png`) });
    await studio(page).getByRole("button", { name: "保存", exact: true }).click();
    await expect(studio(page).getByRole("button", { name: "編集", exact: true })).toBeVisible();
    const [saved] = await storedCapsules(page);
    expect(saved.title).toBe("人物と作品の調査");
    expect(saved.revision).toBe(1);
    expect(saved.document?.nodes).toHaveLength(6);
    expect(saved.document?.relations).toHaveLength(8);
    const local = saved.document!.nodes.find(n => n.origin.kind === "local")!;
    expect(local).toMatchObject({ title: "調査中の人物", description: "資料を照合している途中。", badge: "漫画家" });
    expect(saved.document!.relations.find(r => r.origin.kind === "local")).toMatchObject({ target: local.key, label: "関係する" });
    expect(saved.document!.evidence).toEqual([expect.objectContaining({ targetKey: local.key, title: "調査ノート", locator: "12ページ", url: "https://example.org/research" })]);
    expect(saved.document!.texts).toEqual([expect.objectContaining({ text: "この関係は今後確認する", style: "heading" })]);
    expect(Object.keys(saved.document!.layout.positions)).toHaveLength(7);
    expect([...saved.entityIds].sort()).toEqual(original.nodes.map(n => n.id).sort());

    // A Capsule remains readable from captured content while KG is offline.
    await page.route("**/api/entities/**", route => route.fulfill({ status: 503, json: { error: { message: "offline" } } }));
    await page.route("**/api/claims/**", route => route.fulfill({ status: 503, json: { error: { message: "offline" } } }));
    await page.reload();
    await openSavedCapsule(page, saved.title);
    expect((await canvasState(studio(page).getByTestId("graph-canvas"))).positions).toEqual(saved.document!.layout.positions);
    await selectContent(page, "調査中の人物");
    await expect(studio(page)).toContainText("調査ノート");
    await expect(studio(page)).toContainText("12ページ");
    await studio(page).screenshot({ path: testInfo.outputPath(`capsule-reopened-${width}.png`) });
    expect(await studio(page).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await storedCapsules(page)).toEqual([saved]);
    expect(errors).toEqual([]);
  });
}

test("現在KGの変更と取得失敗を区別し、保存した断面を自動で変更しない", async ({ page }) => {
  await startCapsule(page);
  await studio(page).getByRole("button", { name: "保存", exact: true }).click();
  await expect(studio(page).getByRole("button", { name: "編集", exact: true })).toBeVisible();
  const [saved] = await storedCapsules(page);
  const root = saved.document!.nodes.find(n => n.title === "青葉ハル")!;
  const response = await page.request.get(`/api/entities/${root.key}`);
  expect(response.ok()).toBe(true);
  const current = await response.json();
  let failed = false;
  await page.route(new RegExp(`/api/entities/${root.key}(?:\\?.*)?$`), route => route.fulfill(failed
    ? { status: 503, json: { error: { message: "unavailable" } } }
    : { json: { ...current, entity: { ...current.entity, description: "KGの新しい説明" } } }));
  await selectContent(page, "青葉ハル");
  await studio(page).getByText("元のKG・現在と比較", { exact: true }).click();
  await studio(page).getByRole("button", { name: "現在のKGを確認", exact: true }).click();
  await expect(studio(page)).toContainText("現在のKGに異なる内容があります");
  await expect(studio(page)).toContainText("KGの新しい説明");
  expect(await storedCapsules(page)).toEqual([saved]);
  expect((await canvasState(studio(page).getByTestId("graph-canvas"))).nodes.find(n => n.id === root.key)?.label).toContain("青葉ハル");
  failed = true;
  await studio(page).getByRole("button", { name: "現在のKGを確認", exact: true }).click();
  await expect(studio(page)).toContainText("比較できませんでした");
  expect(await storedCapsules(page)).toEqual([saved]);
});

test("Entity本文が変わらなくても、記録した範囲の関係の増加を検知する", async ({ page }) => {
  await startCapsule(page);
  await studio(page).getByRole("button", { name: "保存", exact: true }).click();
  await expect(studio(page).getByRole("button", { name: "編集", exact: true })).toBeVisible();
  const [saved] = await storedCapsules(page);
  const root = saved.document!.nodes.find(n => n.title === "青葉ハル")!;
  expect(root.origin.kind === "kg" && root.origin.neighbors.state).toBe("complete");
  await page.route(new RegExp(`/api/entities/${root.key}/neighbors(?:\\?.*)?$`), async route => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ json: { ...body, claims: [...body.claims, { ...body.claims[0], id: "3e218a5b-2635-42fe-bf28-fd5994fba480" }] } });
  });
  await selectContent(page, "青葉ハル");
  await studio(page).getByText("元のKG・現在と比較", { exact: true }).click();
  await studio(page).getByRole("button", { name: "現在のKGを確認", exact: true }).click();
  await expect(studio(page)).toContainText("同じ確認範囲の関係が変わりました：追加 1 件");
  expect(await storedCapsules(page)).toEqual([saved]);
  expect((await canvasState(studio(page).getByTestId("graph-canvas"))).claims).toEqual([...saved.claimIds].sort());
});
