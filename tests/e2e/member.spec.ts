import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { Pool } from "pg";
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };

const localKey = "graph-knowledge:capsules:demo";
const claim = examples.claim.claim;
const saved = { id: "8cb38bde-9c26-44f4-a9a3-0a437f03d3b4", dataset: "demo", revision: 1, title: "別のブラウザでも読む関係図", note: "アシスタントの期間を確認した。出典を読んでから考える。", language: "ja", createdAt: "2026-10-09T00:00:00Z", entityIds: [claim.subjectId, claim.objectId], claimIds: [claim.id] };
async function mockKnowledge(context: BrowserContext) {
  await context.route("**/api/entities/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/neighbors")) return route.fulfill({ json: examples.neighbors });
    const entity = examples.neighbors.nodes.find(node => node.id === url.pathname.split("/")[3]);
    await route.fulfill({ json: { entity: { ...entity, aliases: [], event: null } } });
  });
  await context.route("**/api/claims/**", route => route.fulfill({ json: examples.claim }));
}
async function login(page: Page, identity = "検証ユーザーA") {
  await page.getByRole("button", { name: "検証用OIDCでログイン", exact: true }).click();
  await page.getByRole("link", { name: identity, exact: true }).click();
  await expect(page.getByText(identity, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "アカウントと一覧を再確認", exact: true })).toBeEnabled();
}
async function clearPrivateTestData() {
  // Only the explicitly guarded disposable fixture DB used by this runner.
  const url = new URL(process.env.MEMBER_DATABASE_URL!);
  if (url.hostname !== "127.0.0.1" || url.port !== "55432" || url.pathname !== "/graph_member_test" || process.env.MEMBER_FIXTURE_ENABLED !== "1") throw new Error("Disposable DB required");
  const pool = new Pool({ connectionString: url.href });
  try { await pool.query("DELETE FROM member_capsule_request"); await pool.query("DELETE FROM member_capsule"); await pool.query("DELETE FROM session"); }
  finally { await pool.end(); }
}
test.beforeAll(async ({ request }) => {
  // Verify real HTTP routing before interaction. Next dev compiles these
  // routes on first access; API availability must not be inferred from a label.
  const share = await request.get("/api/member/capsules/00000000-0000-4000-8000-000000000001/share", { timeout: 60_000 });
  expect(share.status()).toBe(401);
  expect(share.headers()["content-type"]).toContain("application/json");
  const anonymous = await request.get("/api/shared/capsule", { timeout: 60_000 });
  expect(anonymous.status()).toBe(404);
  expect((await request.get("/shared", { timeout: 60_000 })).status()).toBe(200);
  expect((await request.get("/", { timeout: 60_000 })).status()).toBe(200);
  // Cold route compilation belongs to setup, rather than consuming the
  // interaction budget of the first narrow-screen, multi-tab journey.
  for (const path of ["/api/member/profile", "/api/member/capsules", "/api/member/capsules/00000000-0000-4000-8000-000000000001"]) {
    expect((await request.get(path, { timeout: 60_000 })).status()).toBe(401);
  }
  expect((await request.get("/api/auth/get-session", { timeout: 60_000 })).status()).toBe(200);
  expect((await request.get("/api/capsules/00000000-0000-4000-8000-000000000001/discussion?revision=1", { timeout: 60_000 })).status()).toBe(404);
});
test.beforeEach(clearPrivateTestData);
for (const width of [390, 1440]) {
  test(`限定リンクで指定版を別ブラウザへ渡し、根拠・探索・再発行・停止へ進む ${width}px`, async ({ page, context, browser }, testInfo) => {
    await page.setViewportSize({ width, height: 900 }); await mockKnowledge(context);
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto("/member"); await login(page);
    const content = { dataset: saved.dataset, title: saved.title, note: saved.note, language: saved.language, entityIds: saved.entityIds, claimIds: saved.claimIds };
    const { capsule } = await (await page.request.post("/api/member/capsules", { headers: { Origin: "http://127.0.0.1:3221" }, data: { requestId: crypto.randomUUID(), content } })).json();
    await page.goto(`/member?capsule=${capsule.id}`);
    const controls = page.getByRole("region", { name: "限定リンク共有", exact: true });
    await expect(controls.getByText("有効な共有リンクはありません。本人だけが読めます。", { exact: true })).toBeVisible();
    await controls.getByRole("button", { name: "この版の共有リンクを作る", exact: true }).click();
    await controls.getByRole("button", { name: "この版をリンクで閲覧可能にする", exact: true }).click();
    await expect(controls.getByLabel("共有リンク", { exact: true })).toBeVisible();
    const link = await controls.getByLabel("共有リンク", { exact: true }).inputValue();
    const token = new URL(link).hash.slice(1);
    expect(token).toHaveLength(43);
    await page.screenshot({ path: testInfo.outputPath(`share-owner-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const other = await browser.newContext({ baseURL: "http://127.0.0.1:3221", viewport: { width, height: 900 } });
    try {
      await mockKnowledge(other); const reader = await other.newPage();
      reader.on("pageerror", error => errors.push(error.message));
      const requests: { url: string; referer?: string }[] = [];
      reader.on("request", request => requests.push({ url: request.url(), referer: request.headers().referer }));
      const response = await reader.goto(link);
      expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
      expect(response?.headers()["x-robots-tag"]).toContain("noindex");
      // Next dev supplies no-cache for the content-free shell; production is
      // checked separately. The content-bearing API must always be no-store.
      expect(response?.headers()["cache-control"]).toMatch(/no-(store|cache)/);
      const sharedResponse = await reader.request.get("/api/shared/capsule", { headers: { "X-Capsule-Token": token } });
      expect(sharedResponse.headers()["cache-control"]).toBe("private, no-store");
      await expect(reader.getByText("現在のGraph：対象 2件 / 主張 1件", { exact: true })).toBeVisible();
      await expect(reader.getByRole("heading", { name: "作成者の説明", exact: true })).toBeVisible();
      expect((await reader.request.get(`/api/member/capsules/${capsule.id}`)).status()).toBe(401);
      expect(await other.cookies()).toHaveLength(0);
      await reader.getByRole("button", { name: /青葉ハル → アシスタントだった → 黒川レン.*2001年〜2003年/ }).click();
      await expect(reader.getByRole("heading", { name: "青葉ハルへのインタビュー", exact: true })).toBeVisible();
      await expect(reader.getByText("参照箇所：pp.12–13", { exact: true })).toBeVisible();
      await reader.screenshot({ path: testInfo.outputPath(`share-reader-${width}.png`), fullPage: true });
      expect(await reader.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await reader.getByRole("button", { name: "青葉ハル · 人物", exact: true }).click();
      const popup = other.waitForEvent("page");
      await reader.getByRole("link", { name: "この対象を開いて探索する（別タブ）", exact: true }).click();
      const explorer = await popup;
      await expect.poll(() => explorer.getByTestId("graph-canvas").evaluate(el => !!(el as unknown as { _cyreg?: { cy?: unknown } })._cyreg?.cy)).toBe(true);
      await explorer.getByRole("button", { name: "この対象から関係を探索する", exact: true }).click();
      await expect(explorer.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
      await explorer.close(); await reader.bringToFront();
      // Editing the private current version cannot silently alter the shared one.
      const update = await page.request.put(`/api/member/capsules/${capsule.id}`, { headers: { Origin: "http://127.0.0.1:3221" }, data: { expectedRevision: 1, content: { ...content, note: "次の版だけの説明" } } });
      expect(update.status()).toBe(200);
      await reader.reload();
      await expect(reader.getByText(saved.note, { exact: true })).toBeVisible();
      await expect(reader.getByText("次の版だけの説明", { exact: true })).toHaveCount(0);
      await page.bringToFront(); await page.reload();
      await expect(controls.getByText("内容版 1 の限定リンクが有効です。", { exact: true })).toBeVisible();
      await expect(page.getByText("次の版だけの説明", { exact: true })).toBeVisible();
      // Token plaintext is not retrievable after returning/reloading the owner UI.
      await expect(controls.getByLabel("共有リンク", { exact: true })).toHaveCount(0);
      await controls.getByRole("button", { name: "この版でリンクを作り直す", exact: true }).click();
      await expect(controls.getByText("今表示している内容版 2 を共有します。", { exact: true })).toBeVisible();
      await controls.getByRole("button", { name: "この版をリンクで閲覧可能にする", exact: true }).click();
      await expect(controls.getByLabel("共有リンク", { exact: true })).toBeVisible();
      const newLink = await controls.getByLabel("共有リンク", { exact: true }).inputValue();
      // Navigating to an identical fragment URL can be a same-document no-op.
      // Recheck explicitly, as the UI promises (or wait for the 30s poll).
      await reader.bringToFront(); await reader.goto(link); await reader.reload();
      await expect(reader.getByRole("main").getByRole("alert")).toContainText("このリンクでは閲覧できません");
      await expect(reader.getByRole("heading", { name: saved.title, exact: true })).toHaveCount(0);
      await reader.goto(newLink);
      await expect(reader.getByText("次の版だけの説明", { exact: true })).toBeVisible();
      await page.bringToFront();
      await controls.getByRole("button", { name: "共有を停止する", exact: true }).click();
      await controls.getByRole("button", { name: "リンクを失効する", exact: true }).click();
      await expect(controls.getByText("共有を停止しました。", { exact: true })).toBeVisible();
      await reader.bringToFront();
      await reader.getByRole("button", { name: "リンクを再確認", exact: true }).click();
      await expect(reader.getByRole("main").getByRole("alert")).toContainText("このリンクでは閲覧できません");
      await expect(reader.getByRole("heading", { name: saved.title, exact: true })).toHaveCount(0);
      expect(requests.every(request => !request.url.includes(token) && !request.referer?.includes(token))).toBe(true);
    } finally { await other.close(); }
    expect(errors).toEqual([]);
  });
}

for (const width of [390, 1440]) {
  test(`探索を保持し、実認証から明示保存・別ブラウザ再訪・根拠へ進む ${width}px`, async ({ page, context, browser }, testInfo) => {
    await page.setViewportSize({ width, height: 900 }); await mockKnowledge(context);
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto("/");
    // Wait for the Explorer's client graph to initialize before clicking its
    // server-rendered entry; dev StrictMode replays mount cleanup on hydration.
    await expect.poll(() => page.getByTestId("graph-canvas").evaluate(el => !!(el as unknown as { _cyreg?: { cy?: unknown } })._cyreg?.cy)).toBe(true);
    await page.evaluate(({ key, saved }) => localStorage.setItem(key, JSON.stringify({ format: "local-capsules", version: 1, capsules: [saved] })), { key: localKey, saved });
    await page.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    await page.locator("#explorer-graph").getByRole("button", { name: "Capsuleを作る・読む", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "自分のCapsule" });
    await dialog.getByRole("button", { name: "読む", exact: true }).click();
    const popup = context.waitForEvent("page");
    await dialog.getByRole("link", { name: "この内容をアカウントへ保存（別タブ）", exact: true }).click();
    const member = await popup; await member.setViewportSize({ width, height: 900 });
    member.on("pageerror", error => errors.push(error.message));
    await expect(member.getByRole("button", { name: "この内容をアカウントへ保存", exact: true })).toBeDisabled();
    await login(member);
    await expect(member.getByText("このアカウントにはCapsuleがまだありません。", { exact: true })).toBeVisible();
    // No implicit import on login. The original remains byte-for-byte unchanged.
    const raw = await member.evaluate(key => localStorage.getItem(key), localKey);
    await member.getByRole("button", { name: "この内容をアカウントへ保存", exact: true }).click();
    await expect(member.getByText("アカウントへ保存しました。元のブラウザ保存も残っています。", { exact: true })).toBeVisible();
    await expect(member.getByText("現在のGraph：対象 2件 / 主張 1件", { exact: true })).toBeVisible();
    const privateUrl = member.url();
    await member.screenshot({ path: testInfo.outputPath(`member-reading-${width}.png`), fullPage: true });
    await member.getByRole("button", { name: /青葉ハル → アシスタントだった → 黒川レン.*2001年〜2003年/ }).click();
    await expect(member.getByRole("heading", { name: "青葉ハルへのインタビュー", exact: true })).toBeVisible();
    await expect(member.getByText("参照箇所：pp.12–13", { exact: true })).toBeVisible();
    await member.reload();
    await expect(member.getByText("現在のGraph：対象 2件 / 主張 1件", { exact: true })).toBeVisible();
    // Repeated explicit save across reload uses the same receipt, not another copy.
    await member.getByRole("button", { name: "この内容をアカウントへ保存", exact: true }).click();
    await expect(member.getByText("この保存操作は処理済みです。重複を作らず、現在のアカウント内容を表示しています。", { exact: true })).toBeVisible();
    const list = await member.request.get("/api/member/capsules"); expect((await list.json()).capsules).toHaveLength(1);
    expect(await member.evaluate(key => localStorage.getItem(key), localKey)).toBe(raw);
    expect(await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const other = await browser.newContext({ baseURL: "http://127.0.0.1:3221", viewport: { width, height: 900 } });
    try {
      await mockKnowledge(other); const revisit = await other.newPage();
      await revisit.goto(privateUrl); await login(revisit);
      await expect(revisit.getByText("現在のGraph：対象 2件 / 主張 1件", { exact: true })).toBeVisible();
      expect(await revisit.evaluate(key => localStorage.getItem(key), localKey)).toBeNull();
      await revisit.getByRole("button", { name: "青葉ハル · 人物", exact: true }).click();
      const exploration = other.waitForEvent("page");
      await revisit.getByRole("link", { name: "この対象を開いて探索する（別タブ）", exact: true }).click();
      const graph = await exploration;
      await expect.poll(() => graph.getByTestId("graph-canvas").evaluate(el => !!(el as unknown as { _cyreg?: { cy?: unknown } })._cyreg?.cy)).toBe(true);
      await graph.getByRole("button", { name: "この対象から関係を探索する", exact: true }).click();
      await expect(graph.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
      await graph.close(); await revisit.bringToFront();
      await expect(revisit.getByRole("button", { name: "ログアウト", exact: true })).toBeEnabled();
      await revisit.getByRole("button", { name: "ログアウト", exact: true }).click();
      await expect(revisit.getByRole("heading", { name: saved.title, exact: true })).toHaveCount(0);
      await login(revisit, "検証ユーザーB");
      await expect(revisit.getByText("このアカウントにはCapsuleがまだありません。", { exact: true })).toBeVisible();
      await revisit.goto(privateUrl);
      await expect(revisit.getByRole("main").getByRole("alert")).toContainText("このCapsuleを閲覧できません");
      await expect(revisit.getByRole("heading", { name: saved.title, exact: true })).toHaveCount(0);
    } finally { await other.close(); }
    await member.close(); await page.bringToFront();
    await dialog.getByRole("button", { name: "探索へ戻る", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    expect(errors).toEqual([]);
  });
}

test("保存中の失効・応答消失・他端末更新・全端末ログアウトでも元の内容を残す", async ({ page, context, browser }) => {
  await mockKnowledge(context); await page.goto("/member");
  await page.evaluate(({ key, saved }) => localStorage.setItem(key, JSON.stringify({ format: "local-capsules", version: 1, capsules: [saved] })), { key: localKey, saved });
  await page.reload(); await login(page);
  await page.getByLabel("保存するブラウザ内Capsule", { exact: true }).selectOption(saved.id);
  const raw = await page.evaluate(key => localStorage.getItem(key), localKey);
  // Revoke the real session immediately before the authenticated save.
  await page.route("**/api/member/capsules", async route => {
    if (route.request().method() !== "POST") return route.continue();
    await context.request.post("/api/auth/revoke-sessions", { headers: { Origin: "http://127.0.0.1:3221" }, data: {} });
    await route.continue();
  }, { times: 1 });
  await page.getByRole("button", { name: "この内容をアカウントへ保存", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("ログインが失効したか");
  expect(await page.evaluate(key => localStorage.getItem(key), localKey)).toBe(raw);
  await login(page);
  // Commit succeeds, but the browser loses the response. A retry must reuse ID.
  await page.route("**/api/member/capsules", async route => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch(); expect(response.status()).toBe(201); await route.abort("failed");
  }, { times: 1 });
  await page.getByRole("button", { name: "この内容をアカウントへ保存", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("処理を完了できませんでした");
  await page.reload(); await page.getByRole("button", { name: "この内容をアカウントへ保存", exact: true }).click();
  await expect(page.getByText("この保存操作は処理済みです。重複を作らず、現在のアカウント内容を表示しています。", { exact: true })).toBeVisible();
  const { capsules } = await (await page.request.get("/api/member/capsules")).json(); expect(capsules).toHaveLength(1);
  const value = capsules[0];
  await page.request.put(`/api/member/capsules/${value.id}`, { headers: { Origin: "http://127.0.0.1:3221" }, data: { expectedRevision: value.revision, content: { ...value.content, note: "別端末の更新" } } });
  await page.getByRole("button", { name: "アカウントから削除", exact: true }).click();
  await page.getByRole("button", { name: "このCapsuleをアカウントから削除する", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("保存内容が更新・削除されています");
  await page.getByRole("button", { name: "アカウントと一覧を再確認", exact: true }).click();
  await expect(page.getByText("別端末の更新", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "アカウントから削除", exact: true }).click();
  await page.getByRole("button", { name: "このCapsuleをアカウントから削除する", exact: true }).click();
  await expect(page.getByText("アカウントから削除しました。", { exact: true })).toBeVisible();
  // A deleted receipt must not resurrect the item on delayed retry.
  await page.getByRole("button", { name: "この内容をアカウントへ保存", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("保存内容が更新・削除されています");
  const other = await browser.newContext({ baseURL: "http://127.0.0.1:3221" });
  try {
    const another = await other.newPage(); await another.goto("/member"); await login(another);
    await page.getByRole("button", { name: "全端末からログアウト", exact: true }).click();
    await page.getByRole("button", { name: "全端末のログインを解除する", exact: true }).click();
    await expect(page.getByRole("button", { name: "検証用OIDCでログイン", exact: true })).toBeVisible();
    expect((await another.request.get("/api/member/profile")).status()).toBe(401);
  } finally { await other.close(); }
  expect(await page.evaluate(key => localStorage.getItem(key), localKey)).toBe(raw);
});


test("会員保存が無効でもブラウザ内の内容は残し、ログインを提供しない", async ({ page }) => {
  await page.route("**/api/member/status", route => route.fulfill({ status: 503, json: { error: { code: "MEMBER_UNAVAILABLE" } } }));
  await page.goto("/member");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("会員保存を現在利用できません");
  await expect(page.getByRole("button", { name: /ログイン/ })).toHaveCount(0);
  await expect(page.getByText("架空のデモデータ", { exact: true })).toBeVisible();
});

test("認証失敗は元のCapsule選択を保ち、再ログインできる", async ({ page }) => {
  await page.goto(`/member?import=${saved.id}`);
  await page.route("http://127.0.0.1:3222/authorize**", async route => {
    const url = new URL(route.request().url());
    url.searchParams.set("fixture_identity", "alice"); url.searchParams.set("fixture_mode", "nonce");
    await route.continue({ url: url.href });
  });
  await page.getByRole("button", { name: "検証用OIDCでログイン", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("ログインを完了できませんでした");
  expect(new URL(page.url()).searchParams.get("import")).toBe(saved.id);
  await expect(page.getByRole("button", { name: "検証用OIDCでログイン", exact: true })).toBeVisible();
});

async function createForEditing(page: Page, content = { dataset: saved.dataset, title: saved.title, note: saved.note, language: saved.language, entityIds: saved.entityIds, claimIds: saved.claimIds }) {
  await page.goto("/member"); await login(page);
  const response = await page.request.post("/api/member/capsules", { headers: { Origin: "http://127.0.0.1:3221" }, data: { requestId: crypto.randomUUID(), content } });
  expect(response.status()).toBe(201);
  const { capsule } = await response.json();
  await page.goto(`/member?capsule=${capsule.id}`);
  await page.getByRole("button", { name: "このCapsuleを編集", exact: true }).click();
  return capsule;
}

for (const width of [390, 1440]) {
  test(`会員の説明と構成を次版へ編集し、取消・reload・根拠閲覧へ戻る ${width}px`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height: 900 }); await mockKnowledge(context);
    const isolated = examples.neighbors.nodes.find(node => !saved.entityIds.includes(node.id))!;
    const capsule = await createForEditing(page, { dataset: saved.dataset, title: saved.title, note: saved.note, language: saved.language, entityIds: [...saved.entityIds, isolated.id], claimIds: saved.claimIds });
    const editor = page.getByRole("region", { name: "アカウントのCapsuleを編集", exact: true });
    await expect(editor.getByRole("button", { name: "アカウントの変更を保存", exact: true })).toBeDisabled();
    await expect(editor.getByRole("checkbox", { name: /青葉ハル/ }).first()).toBeDisabled();
    await editor.getByLabel("Capsuleの題名", { exact: true }).fill("訂正して育てる関係図");
    await editor.getByRole("textbox", { name: "自分の説明", exact: true }).fill("出典の対象期間を追記した。\n同じ場所に置いた対象の関係は推定しない。");
    await editor.getByRole("checkbox", { name: new RegExp(isolated.name) }).uncheck();
    await page.screenshot({ path: testInfo.outputPath(`member-edit-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await editor.getByRole("button", { name: "アカウントの変更を保存", exact: true }).click();
    await expect(page.getByText("アカウントのCapsuleを更新しました。", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "訂正して育てる関係図", exact: true })).toBeVisible();
    await expect(page.getByText("現在のGraph：対象 2件 / 主張 1件", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /青葉ハル → アシスタントだった → 黒川レン.*2001年〜2003年/ }).click();
    await expect(page.getByRole("heading", { name: "青葉ハルへのインタビュー", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "このCapsuleを編集", exact: true }).click();
    await editor.getByRole("textbox", { name: "自分の説明", exact: true }).fill("取り消す説明");
    await editor.getByRole("button", { name: "編集を取り消す", exact: true }).click();
    await editor.getByRole("button", { name: "編集を続ける", exact: true }).click();
    await expect(editor.getByRole("textbox", { name: "自分の説明", exact: true })).toHaveValue("取り消す説明");
    await editor.getByRole("button", { name: "編集を取り消す", exact: true }).click();
    await editor.getByRole("button", { name: "保存せず戻る", exact: true }).click();
    await expect(page.getByText("取り消す説明", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "このCapsuleを編集", exact: true }).click();
    await editor.getByRole("group", { name: "含める主張", exact: true }).getByRole("checkbox").uncheck();
    await editor.getByRole("group", { name: "含める対象", exact: true }).getByRole("checkbox", { name: /黒川レン/ }).uncheck();
    await editor.getByRole("button", { name: "アカウントの変更を保存", exact: true }).click();
    await expect(page.getByText("現在のGraph：対象 1件 / 主張 0件", { exact: true })).toBeVisible();
    const updated = (await (await page.request.get(`/api/member/capsules/${capsule.id}`)).json()).capsule;
    expect(updated.revision).toBe(3); expect(updated.createdAt).toBe(capsule.createdAt);
    expect(updated.content.entityIds).toEqual([claim.subjectId]); expect(updated.content.claimIds).toEqual([]);
    expect(await page.evaluate(() => Object.values(localStorage).join(" ") + Object.values(sessionStorage).join(" "))).not.toContain("訂正して育てる関係図");
  });
}

test("更新競合は入力と最新版を比較し、応答消失後も二重更新しない", async ({ page, context }) => {
  await mockKnowledge(context); const capsule = await createForEditing(page);
  const editor = page.getByRole("region", { name: "アカウントのCapsuleを編集", exact: true });
  await editor.getByRole("textbox", { name: "自分の説明", exact: true }).fill("こちらで加えた説明");
  const competitor = { ...capsule.content, note: "別端末で訂正した説明", claimIds: [] };
  expect((await page.request.put(`/api/member/capsules/${capsule.id}`, { headers: { Origin: "http://127.0.0.1:3221" }, data: { expectedRevision: 1, content: competitor } })).status()).toBe(200);
  await editor.getByRole("button", { name: "アカウントの変更を保存", exact: true }).click();
  await expect(editor.getByRole("button", { name: "入力を保って最新版を確認", exact: true })).toBeVisible();
  await expect(editor.getByRole("textbox", { name: "自分の説明", exact: true })).toHaveValue("こちらで加えた説明");
  await editor.getByRole("button", { name: "入力を保って最新版を確認", exact: true }).click();
  await expect(editor.getByRole("button", { name: "アカウントの変更を保存", exact: true })).toBeDisabled();
  await editor.getByText("サーバーの最新版・構成・根拠を読む", { exact: true }).click();
  await expect(editor.getByText("別端末で訂正した説明", { exact: true })).toBeVisible();
  await expect(editor.getByText("現在のGraph：対象 2件 / 主張 0件", { exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "最新版を確認したので、この入力で編集を続ける", exact: true }).click();
  await page.route(`**/api/member/capsules/${capsule.id}`, async route => {
    if (route.request().method() !== "PUT") return route.continue();
    const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort("failed");
  }, { times: 1 });
  await editor.getByRole("button", { name: "アカウントの変更を保存", exact: true }).click();
  await editor.getByRole("button", { name: "入力を保って最新版を確認", exact: true }).click();
  await expect(editor.getByRole("textbox", { name: "自分の説明", exact: true })).toHaveValue("こちらで加えた説明");
  await editor.getByRole("button", { name: "一致する最新版へ戻る", exact: true }).click();
  await expect(page.getByText("こちらで加えた説明", { exact: true })).toBeVisible();
  const current = (await (await page.request.get(`/api/member/capsules/${capsule.id}`)).json()).capsule;
  expect(current.revision).toBe(3); expect(current.content.claimIds).toEqual(saved.claimIds);
});

test("編集の失効・別アカウント・非表示を越えて、本人にだけ入力を戻す", async ({ page, context }) => {
  await mockKnowledge(context); const capsule = await createForEditing(page);
  const editor = page.getByRole("region", { name: "アカウントのCapsuleを編集", exact: true });
  await editor.getByRole("textbox", { name: "自分の説明", exact: true }).fill("本人にだけ戻す未保存の入力");
  await page.route(`**/api/member/capsules/${capsule.id}`, async route => {
    if (route.request().method() !== "PUT") return route.continue();
    await context.request.post("/api/auth/revoke-sessions", { headers: { Origin: "http://127.0.0.1:3221" }, data: {} });
    await route.continue();
  }, { times: 1 });
  await editor.getByRole("button", { name: "アカウントの変更を保存", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("ログインが失効したか");
  await expect(page.getByRole("textbox", { name: "自分の説明", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => Object.values(localStorage).join(" ") + Object.values(sessionStorage).join(" "))).not.toContain("本人にだけ戻す");
  const popup = context.waitForEvent("page");
  await page.getByRole("link", { name: "別タブでログインし直す", exact: true }).click();
  const auth = await popup;
  await login(auth, "検証ユーザーB"); await page.bringToFront();
  await page.getByRole("button", { name: "アカウントと一覧を再確認", exact: true }).click();
  await expect(page.getByText("検証ユーザーB", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "自分の説明", exact: true })).toHaveCount(0);
  await auth.bringToFront();
  await auth.getByRole("button", { name: "ログアウト", exact: true }).click();
  await login(auth); await auth.close(); await page.bringToFront();
  await page.getByRole("button", { name: "アカウントと一覧を再確認", exact: true }).click();
  await expect(editor.getByRole("textbox", { name: "自分の説明", exact: true })).toHaveValue("本人にだけ戻す未保存の入力");
  // Simulate the document lifecycle directly so headless visibility is deterministic.
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(page.getByRole("textbox", { name: "自分の説明", exact: true })).toHaveCount(0);
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(editor.getByRole("textbox", { name: "自分の説明", exact: true })).toHaveValue("本人にだけ戻す未保存の入力");
  await editor.getByRole("button", { name: "アカウントの変更を保存", exact: true }).click();
  await expect(page.getByText("アカウントのCapsuleを更新しました。", { exact: true })).toBeVisible();
  expect((await (await page.request.get(`/api/member/capsules/${capsule.id}`)).json()).capsule.revision).toBe(2);
});

test("未解決参照の説明訂正と他端末削除でも入力を保持し、復活させない", async ({ page, context }) => {
  await mockKnowledge(context);
  await context.route("**/api/claims/**", route => route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND" } } }));
  const capsule = await createForEditing(page);
  const editor = page.getByRole("region", { name: "アカウントのCapsuleを編集", exact: true });
  await expect(editor.getByText(/確認できない主張も選択したまま保持/)).toBeVisible();
  for (const input of await editor.getByRole("group", { name: "含める対象", exact: true }).getByRole("checkbox").all()) await expect(input).toBeDisabled();
  await editor.getByRole("textbox", { name: "自分の説明", exact: true }).fill("未確認の参照はそのまま残す");
  await editor.getByRole("button", { name: "アカウントの変更を保存", exact: true }).click();
  await expect(page.getByText("アカウントのCapsuleを更新しました。", { exact: true })).toBeVisible();
  let current = (await (await page.request.get(`/api/member/capsules/${capsule.id}`)).json()).capsule;
  expect(current.content.entityIds).toEqual(saved.entityIds); expect(current.content.claimIds).toEqual(saved.claimIds);
  await page.getByRole("button", { name: "このCapsuleを編集", exact: true }).click();
  await editor.getByRole("textbox", { name: "自分の説明", exact: true }).fill("削除されても残す入力");
  expect((await page.request.delete(`/api/member/capsules/${capsule.id}`, { headers: { Origin: "http://127.0.0.1:3221" }, data: { expectedRevision: 2 } })).status()).toBe(200);
  await editor.getByRole("button", { name: "アカウントの変更を保存", exact: true }).click();
  await editor.getByRole("button", { name: "入力を保って最新版を確認", exact: true }).click();
  await expect(editor.getByRole("textbox", { name: "自分の説明", exact: true })).toHaveValue("削除されても残す入力");
  await expect(editor.getByRole("button", { name: "アカウントの変更を保存", exact: true })).toBeDisabled();
  current = await page.request.get(`/api/member/capsules/${capsule.id}`); expect(current.status()).toBe(404);
  await editor.getByRole("button", { name: "編集を取り消す", exact: true }).click();
  await editor.getByRole("button", { name: "保存せず戻る", exact: true }).click();
  await expect(page.getByText("このアカウントにはCapsuleがまだありません。", { exact: true })).toBeVisible();
});

for (const width of [390, 1440]) {
  test(`共有版のコメントを2 Userで投稿し、根拠・撤回・受付停止へ進む ${width}px`, async ({ page, context, browser }, testInfo) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height: 900 }); await mockKnowledge(context);
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto("/member"); await login(page);
    const content = { dataset: saved.dataset, title: saved.title, note: saved.note, language: saved.language, entityIds: saved.entityIds, claimIds: saved.claimIds };
    const { capsule } = await (await page.request.post("/api/member/capsules", { headers: { Origin: "http://127.0.0.1:3221" }, data: { requestId: crypto.randomUUID(), content } })).json();
    const { token } = await (await page.request.post(`/api/member/capsules/${capsule.id}/share`, { headers: { Origin: "http://127.0.0.1:3221" }, data: { expectedRevision: 1, expectedShareId: null } })).json();
    const link = `/shared#${token}`;
    await page.goto(`/member?capsule=${capsule.id}`);
    const ownerThread = page.getByRole("region", { name: "この版のコメント", exact: true });
    await ownerThread.getByRole("button", { name: "この版のコメントを見る", exact: true }).click();
    await expect(ownerThread.getByRole("button", { name: "投稿を受け付ける", exact: true })).toBeVisible();
    await expect(ownerThread.getByLabel("コメント本文", { exact: true })).toHaveCount(0);
    await ownerThread.getByRole("button", { name: "投稿を受け付ける", exact: true }).click();
    await expect(ownerThread.getByLabel("コメント本文", { exact: true })).toBeVisible();
    const other = await browser.newContext({ baseURL: "http://127.0.0.1:3221", viewport: { width, height: 900 } });
    try {
      await mockKnowledge(other); const reader = await other.newPage(); reader.on("pageerror", error => errors.push(error.message));
      await reader.goto(link);
      const thread = reader.getByRole("region", { name: "この版のコメント", exact: true });
      await thread.getByRole("button", { name: "この版のコメントを見る", exact: true }).click();
      await expect(thread.getByRole("link", { name: /投稿するにはアカウントへログイン/ })).toBeVisible();
      await expect(thread.getByLabel("コメント本文", { exact: true })).toHaveCount(0);
      const popup = other.waitForEvent("page");
      await thread.getByRole("link", { name: /投稿するにはアカウントへログイン/ }).click();
      const account = await popup; await account.bringToFront();
      await account.getByRole("button", { name: "検証用OIDCでログイン", exact: true }).click();
      await account.getByRole("link", { name: "検証ユーザーB", exact: true }).click();
      await account.waitForURL(url => url.pathname === "/member");
      await account.bringToFront();
      await expect(account.getByText("検証ユーザーB", { exact: true })).toBeVisible();
      await expect(account.getByRole("button", { name: "アカウントと一覧を再確認", exact: true })).toBeEnabled();
      await account.close(); await reader.bringToFront(); await reader.getByRole("button", { name: "リンクを再確認", exact: true }).click();
      await thread.getByRole("button", { name: "この版のコメントを見る", exact: true }).click();
      await thread.getByLabel("コメント本文", { exact: true }).fill("本文の期間は、どの資料から確認できますか？");
      await thread.getByRole("button", { name: "この版へ投稿する", exact: true }).click();
      await expect(thread.getByText("本文の期間は、どの資料から確認できますか？", { exact: true })).toBeVisible();
      await expect(thread.getByLabel("コメント本文", { exact: true })).toHaveValue("");
      await page.bringToFront(); await page.getByRole("button", { name: "アカウントと一覧を再確認", exact: true }).click();
      await ownerThread.getByRole("button", { name: "この版のコメントを見る", exact: true }).click();
      await expect(ownerThread.getByText("本文の期間は、どの資料から確認できますか？", { exact: true })).toBeVisible();
      await expect(ownerThread.getByRole("button", { name: "自分の投稿を撤回", exact: true })).toHaveCount(0);
      await ownerThread.getByLabel("コメント本文", { exact: true }).fill("個別の主張を開くと、インタビューの参照箇所を読めます。");
      await ownerThread.getByRole("button", { name: "この版へ投稿する", exact: true }).click();
      await expect(ownerThread.getByText("個別の主張を開くと、インタビューの参照箇所を読めます。", { exact: true })).toBeVisible();
      await expect(ownerThread.getByLabel("コメント本文", { exact: true })).toHaveValue("");
      await reader.bringToFront(); await reader.getByRole("button", { name: "リンクを再確認", exact: true }).click();
      await thread.getByRole("button", { name: "この版のコメントを見る", exact: true }).click();
      await expect(thread.getByText("個別の主張を開くと、インタビューの参照箇所を読めます。", { exact: true })).toBeVisible();
      await reader.getByRole("button", { name: /青葉ハル → アシスタントだった → 黒川レン.*2001年〜2003年/ }).click();
      await expect(reader.getByRole("heading", { name: "青葉ハルへのインタビュー", exact: true })).toBeVisible();
      await expect(reader.getByText("参照箇所：pp.12–13", { exact: true })).toBeVisible();
      await reader.screenshot({ path: testInfo.outputPath(`discussion-${width}.png`), fullPage: true });
      expect(await reader.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await thread.getByRole("button", { name: "自分の投稿を撤回", exact: true }).click();
      await thread.getByRole("button", { name: "本文を削除して撤回する", exact: true }).click();
      await expect(thread.getByText("投稿者が撤回しました。", { exact: true })).toBeVisible();
      await expect(thread.getByText("本文の期間は、どの資料から確認できますか？", { exact: true })).toHaveCount(0);
      await page.bringToFront(); await page.getByRole("button", { name: "アカウントと一覧を再確認", exact: true }).click();
      await ownerThread.getByRole("button", { name: "この版のコメントを見る", exact: true }).click();
      await ownerThread.getByRole("button", { name: "新しい投稿を停止する", exact: true }).click();
      await expect(ownerThread.getByRole("button", { name: "投稿を受け付ける", exact: true })).toBeVisible();
      await reader.bringToFront(); await reader.getByRole("button", { name: "リンクを再確認", exact: true }).click();
      await thread.getByRole("button", { name: "この版のコメントを見る", exact: true }).click();
      await expect(thread.getByText(/新しい投稿は受け付けていません/)).toBeVisible();
      await expect(thread.getByLabel("コメント本文", { exact: true })).toHaveCount(0);
      await expect(thread.getByText("個別の主張を開くと、インタビューの参照箇所を読めます。", { exact: true })).toBeVisible();
    } finally { await other.close(); }
    expect(errors).toEqual([]);
  });
}

for (const width of [390, 1440]) {
  test(`共有済み旧版の説明とコメントを選び直し現在版へ戻る ${width}px`, async ({ page, context }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 900 }); await mockKnowledge(context);
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto("/member"); await login(page);
    const content = { dataset: saved.dataset, title: saved.title, note: "最初に共有した説明", language: saved.language, entityIds: saved.entityIds, claimIds: saved.claimIds };
    const headers = { Origin: "http://127.0.0.1:3221" };
    const created = await page.request.post("/api/member/capsules", { headers, data: { requestId: crypto.randomUUID(), content } });
    expect(created.status()).toBe(201);
    const { capsule } = await created.json();
    const path = `/api/member/capsules/${capsule.id}`;
    const thread = `/api/capsules/${capsule.id}/discussion`;
    const share = await (await page.request.post(`${path}/share`, { headers, data: { expectedRevision: 1, expectedShareId: null } })).json();
    expect((await page.request.patch(thread, { headers, data: { closed: false, expectedClosed: true } })).status()).toBe(200);
    expect((await page.request.post(thread, { headers, data: { requestId: crypto.randomUUID(), revision: 1, body: "初版で確認した根拠について" } })).status()).toBe(201);
    expect((await page.request.put(path, { headers, data: { expectedRevision: 1, content: { ...content, note: "共有しない中間版" } } })).status()).toBe(200);
    expect((await page.request.put(path, { headers, data: { expectedRevision: 2, content: { ...content, note: "三版で訂正した説明" } } })).status()).toBe(200);
    const third = await (await page.request.post(`${path}/share`, { headers, data: { expectedRevision: 3, expectedShareId: share.share.id } })).json();
    expect((await page.request.post(thread, { headers, data: { requestId: crypto.randomUUID(), revision: 3, body: "三版だけについてのコメント" } })).status()).toBe(201);
    expect((await page.request.put(path, { headers, data: { expectedRevision: 3, content: { ...content, note: "現在の非共有の説明" } } })).status()).toBe(200);
    // Compile the added route outside the UI's per-request 15 second bound.
    expect((await page.request.get(`${path}/revisions`, { timeout: 60_000 })).status()).toBe(200);
    await page.goto(`/member?capsule=${capsule.id}`);
    await expect(page.getByText("現在の非共有の説明", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "共有した版を選ぶ", exact: true }).click();
    await expect(page.getByRole("button", { name: "内容版 3 を読む", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "内容版 2 を読む", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "内容版 4 を読む", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "内容版 1 を読む", exact: true }).click();
    await expect(page.getByRole("heading", { name: "共有時の内容版 1 を閲覧中", exact: true })).toBeVisible();
    await expect(page.getByText("最初に共有した説明", { exact: true })).toBeVisible();
    await expect(page.getByText("現在の非共有の説明", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "このCapsuleを編集", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "アカウントから削除", exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "限定リンク共有", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "この版のコメントを見る", exact: true }).click();
    await expect(page.getByText("初版で確認した根拠について", { exact: true })).toBeVisible();
    await expect(page.getByText("三版だけについてのコメント", { exact: true })).toHaveCount(0);
    await page.getByRole("textbox", { name: "コメント本文", exact: true }).fill("初版へ残す未送信のメモ");
    await page.getByRole("button", { name: "共有した版を選ぶ", exact: true }).click();
    await page.getByRole("button", { name: "内容版 3 を読む", exact: true }).click();
    await expect(page.getByText("三版で訂正した説明", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "この版のコメントを見る", exact: true }).click();
    await expect(page.getByText("三版だけについてのコメント", { exact: true })).toBeVisible();
    await expect(page.getByText("初版で確認した根拠について", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "コメント本文", exact: true })).toHaveValue("");
    await page.getByRole("button", { name: "共有した版を選ぶ", exact: true }).click();
    await page.getByRole("button", { name: "内容版 1 を読む", exact: true }).click();
    await page.getByRole("button", { name: "この版のコメントを見る", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "コメント本文", exact: true })).toHaveValue("初版へ残す未送信のメモ");
    await page.getByRole("textbox", { name: "コメント本文", exact: true }).fill("");
    // Revocation changes visitors' access, not the owner's preserved snapshot.
    expect((await page.request.delete(`${path}/share`, { headers, data: { expectedShareId: third.share.id } })).status()).toBe(200);
    await page.reload();
    await expect(page.getByRole("heading", { name: "共有時の内容版 1 を閲覧中", exact: true })).toBeVisible();
    await expect(page.getByText("最初に共有した説明", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /青葉ハル → アシスタントだった → 黒川レン.*2001年〜2003年/ }).click();
    await expect(page.getByRole("heading", { name: "青葉ハルへのインタビュー", exact: true })).toBeVisible();
    await expect(page.getByText("参照箇所：pp.12–13", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`revision-reader-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "現在の保存内容へ戻る", exact: true }).click();
    await expect(page.getByText("現在の非共有の説明", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "このCapsuleを編集", exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.has("revision")).toBe(false);
    expect(errors).toEqual([]);
  });
}
