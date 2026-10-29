import { test, expect, type Page } from "@playwright/test";
import { canvasState, dragNode, openSavedCapsule, renameCapsule, selectContent, storedCapsules, studio } from "./capsule-fixture";

async function visibility(page:Page,hidden:boolean) {
  await page.evaluate(value=>{
    if(value){Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});}
    else {Reflect.deleteProperty(document,'hidden');Reflect.deleteProperty(document,'visibilityState');}
    document.dispatchEvent(new Event('visibilitychange'));
  },hidden);
}

test.beforeAll(async ({request}) => {
  // Compile every real route before the browser connects to dev HMR. Compiling
  // a previously unseen shared/community route can otherwise fully reload an
  // unrelated open page, destroying an in-memory drawer during this journey.
  const absent="00000000-0000-4000-8000-000000000001";
  for (const [path,status] of [
    ["/",200],["/member",200],["/shared",200],["/communities",200],
    ["/api/auth/get-session",200],["/api/member/profile",401],
    ["/api/member/capsules",401],["/api/member/capsule-capabilities",401],
    [`/api/member/capsules/${absent}`,401],[`/api/member/capsules/${absent}/share`,401],
    ["/api/shared/capsule",404],[`/api/capsules/${absent}/discussion?revision=1`,404],["/api/communities",200]
  ] as const) {
    expect((await request.get(path,{timeout:60_000})).status()).toBe(status);
  }
});

// Uses the fixture OIDC, PostgreSQL and seeded Neo4j demo APIs end to end. No
// identity, persistence, KG, shared-reader or community request is mocked.
test("実会員がGraphの文書を直接保存し、固定共有とコミュニティの会話を往復する", async ({ page, browser }, info) => {
  test.setTimeout(300_000);
  page.setDefaultTimeout(30_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const title = "会員の調査Capsule", updatedTitle = "非公開で更新したCapsule";
  await page.goto("/member");
  await page.getByRole("button", { name: "検証用OIDCでログイン", exact: true }).click();
  await page.getByRole("link", { name: "検証ユーザーA", exact: true }).click();
  await page.waitForURL(url => url.pathname === "/member");
  await expect(page.getByRole("button", { name: "最新の状態に更新", exact: true })).toBeEnabled();
  const profile = await (await page.request.get("/api/member/profile")).json();
  console.info("Capsule member phase: authenticated fixture account");
  const headers = { origin: "http://127.0.0.1:3221", "x-member-user": profile.user.id };

  await page.goto("/");
  await page.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  const original = await canvasState(page.locator("#explorer-graph").getByTestId("graph-canvas"));
  await page.getByRole("button", { name: "Capsule作成", exact: true }).click();
  await expect(studio(page)).toContainText("アカウントに保存");
  await renameCapsule(page, title);
  await studio(page).getByRole("button", { name: "独自Entity", exact: true }).click();
  let editor = page.getByRole("dialog").last();
  await editor.getByLabel("タイトル", { exact: true }).fill("会員だけの独自対象");
  await editor.getByLabel("説明・メモ（任意）", { exact: true }).fill("固定版に取り込む調査メモ。");
  await editor.getByRole("button", { name: "適用", exact: true }).click();
  await studio(page).getByRole("button", { name: "テキスト", exact: true }).click();
  editor = page.getByRole("dialog").last();
  await editor.getByLabel("テキスト", { exact: true }).fill("独立した説明も会員保存する");
  await editor.getByRole("button", { name: "適用", exact: true }).click();
  const createdResponse = page.waitForResponse(response => response.url().endsWith("/api/member/capsules") && response.request().method() === "POST");
  await studio(page).getByRole("button", { name: "保存", exact: true }).click();
  const created = await createdResponse; expect(created.status()).toBe(201);
  const saved = (await created.json()).capsule;
  expect(saved.schemaVersion).toBe(2); expect(saved.revision).toBe(1);
  expect(saved.content.document.nodes).toHaveLength(original.nodes.length + 1);
  expect(saved.content.document.relations).toHaveLength(7);
  expect(saved.content.document.texts).toEqual([expect.objectContaining({ text: "独立した説明も会員保存する" })]);
  expect(saved.content.document.nodes).toContainEqual(expect.objectContaining({ title: "会員だけの独自対象", origin: { kind: "local" } }));
  expect(await storedCapsules(page)).toEqual([]);
  await expect(studio(page).getByRole("button", { name: "編集", exact: true })).toBeVisible();
  await page.reload();
  await openSavedCapsule(page, title);
  await selectContent(page,"青葉ハル");
  const restoredCanvas=studio(page).getByTestId("graph-canvas");
  const root=saved.content.document.nodes.find((node:{title:string})=>node.title==='青葉ハル');
  await dragNode(page,restoredCanvas,root.key,54,36);
  const temporaryView=await canvasState(restoredCanvas);
  expect(temporaryView.positions).not.toEqual(saved.content.document.layout.positions);
  await visibility(page,true);
  await expect(page.getByRole('heading',{name:title,exact:true})).toHaveCount(0);
  await visibility(page,false);
  await expect(studio(page).getByRole('heading',{name:title,exact:true})).toBeVisible();
  await expect.poll(async()=>{
    const current=await canvasState(restoredCanvas);return {positions:current.positions,pan:current.pan,zoom:current.zoom};
  }).toEqual({positions:temporaryView.positions,pan:temporaryView.pan,zoom:temporaryView.zoom});
  await selectContent(page, "会員だけの独自対象");
  await expect(studio(page)).toContainText("固定版に取り込む調査メモ。");
  await selectContent(page, "独立した説明も会員保存する");
  await expect(studio(page)).toContainText("独立した説明も会員保存する");
  const detail = await page.request.get(`/api/member/capsules/${saved.id}`, { headers });
  expect((await detail.json()).capsule.content.document).toEqual(saved.content.document);
  await studio(page).screenshot({ path: info.outputPath("member-saved-document.png") });
  console.info("Capsule member phase: direct account save and reload verified");

  await studio(page).getByRole("button", { name: "固定版を共有", exact: true }).click();
  const controls = page.getByRole("region", { name: "限定リンク共有", exact: true });
  await controls.getByRole("button", { name: "この版の共有リンクを作る", exact: true }).click();
  await controls.getByRole("button", { name: "この版をリンクで閲覧可能にする", exact: true }).click();
  const link = await controls.getByLabel("共有リンク", { exact: true }).inputValue();
  const anonymous = await browser.newContext({ baseURL: "http://127.0.0.1:3221", viewport: { width: 1440, height: 1000 } });
  try {
    const reader = await anonymous.newPage(); reader.on("pageerror", error => errors.push(error.message));
    await reader.goto(link);
    await expect(studio(reader).getByRole("heading", { name: title, exact: true })).toBeVisible();
    await selectContent(reader, "会員だけの独自対象");
    await expect(studio(reader)).toContainText("固定版に取り込む調査メモ。");
    expect((await canvasState(studio(reader).getByTestId("graph-canvas"))).positions).toEqual(saved.content.document.layout.positions);
    expect((await reader.request.get(`/api/member/capsules/${saved.id}`)).status()).toBe(401);
    await reader.screenshot({ path: info.outputPath("anonymous-fixed-document.png"), fullPage: true });

    await page.bringToFront();
    await studio(page).getByRole("button", { name: "編集", exact: true }).click();
    await studio(page).getByRole("button", { name: "タイトル・説明", exact: true }).click();
    editor=page.getByRole('dialog').last();
    await editor.getByLabel('タイトル',{exact:true}).fill(updatedTitle);
    await visibility(page,true);
    await expect(page.getByLabel('タイトル',{exact:true})).toHaveCount(0);
    await visibility(page,false);
    editor=page.getByRole('dialog').last();
    await expect(editor.getByLabel('タイトル',{exact:true})).toHaveValue(updatedTitle);
    await editor.getByRole('button',{name:'適用',exact:true}).click();
    await expect(studio(page).getByRole('heading',{name:updatedTitle,exact:true})).toBeVisible();
    const updatedResponse = page.waitForResponse(response => response.url().endsWith(`/api/member/capsules/${saved.id}`) && response.request().method() === "PUT");
    await studio(page).getByRole("button", { name: "保存", exact: true }).click();
    const updated = await updatedResponse; expect(updated.status()).toBe(200); expect((await updated.json()).capsule.revision).toBe(2);
    await reader.bringToFront(); await reader.reload();
    await expect(studio(reader).getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(reader.getByRole("heading", { name: updatedTitle, exact: true })).toHaveCount(0);
    expect((await (await reader.request.get("/api/shared/capsule", { headers: { "x-capsule-token": new URL(link).hash.slice(1) } })).json()).capsule).toEqual(saved);
  } finally { await anonymous.close(); }
  console.info("Capsule member phase: anonymous fixed revision verified after private update");

  // Create the independent conversation through its real authorized API, then
  // publish and traverse the relationship through the user-facing C2 flow.
  await page.bringToFront();
  const communityResponse = await page.request.post("/api/communities", { headers, data: { requestId: crypto.randomUUID(), title: "図を話し合う場所", description: "実ブラウザ結合", visibility: "public" } });
  expect(communityResponse.status()).toBe(201); const community = (await communityResponse.json()).community;
  const threadResponse = await page.request.post(`/api/communities/${community.id}/threads`, { headers, data: { requestId: crypto.randomUUID(), expectedRevision: community.revision, title: "この図を検討する", body: "固定した版の内容を話し合います。", audience: "public" } });
  expect(threadResponse.status()).toBe(201); const threadId = (await threadResponse.json()).id;
  await page.goto("/communities#" + encodeURIComponent(`/${community.id}?tab=capsules`));
  const communityCapsules = page.getByRole("region", { name: "コミュニティのCapsule", exact: true });
  await communityCapsules.getByRole("button", { name: "自分のCapsuleを掲載", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "掲載するCapsuleを選ぶ", exact: true });
  await dialog.getByRole("radio", { name: new RegExp(updatedTitle) }).check();
  await dialog.getByRole("button", { name: "掲載内容を確認", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Capsuleの掲載を確認", exact: true });
  await dialog.getByRole("radio", { name: "誰でも（一般公開）", exact: true }).check();
  await dialog.getByLabel("この場所での紹介", { exact: true }).fill("会話の対象はこの保存版です。");
  await dialog.getByRole("combobox", { name: "関連する会話（任意）", exact: true }).selectOption(threadId);
  await dialog.getByRole("checkbox", { name: "内容版と閲覧範囲を確認しました", exact: true }).check();
  await dialog.getByRole("button", { name: "確認した版を掲載", exact: true }).click();
  await communityCapsules.getByRole("link", { name: /Capsuleを読む/ }).click();
  await expect(communityCapsules.getByText("掲載された固定版", { exact: false })).toContainText("2");
  await communityCapsules.getByRole("link", { name: /関連する会話へ/ }).click();
  await expect(page.getByRole("heading", { name: "この図を検討する", exact: true })).toBeVisible();
  const references = page.getByRole("region", { name: "この会話に関連するCapsule", exact: true });
  await references.getByRole("link", { name: updatedTitle, exact: true }).click();
  await expect(communityCapsules.getByRole("heading", { name: updatedTitle, exact: true }).first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("community-capsule-conversation-return.png"), fullPage: true });
  console.info("Capsule member phase: community publication and conversation return verified");
  expect(await storedCapsules(page)).toEqual([]);
  expect(errors).toEqual([]);
});
