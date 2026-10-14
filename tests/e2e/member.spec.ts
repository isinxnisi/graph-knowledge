import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { checkMemberLocale } from "./member-locale";
import { spawnSync } from "node:child_process";
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
  await page.waitForURL(url => url.pathname === "/member");
  await expect(page.getByText(identity, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "アカウントと一覧を再確認", exact: true })).toBeEnabled();
}
checkMemberLocale(login, mockKnowledge);
async function clearPrivateTestData() {
  // Only the explicitly guarded disposable fixture DB used by this runner.
  const url = new URL(process.env.MEMBER_DATABASE_URL!);
  if (url.hostname !== "127.0.0.1" || url.port !== "55432" || url.pathname !== "/graph_member_test" || process.env.MEMBER_FIXTURE_ENABLED !== "1") throw new Error("Disposable DB required");
  const pool = new Pool({ connectionString: url.href });
  try { await pool.query("DELETE FROM member_capsule_request"); await pool.query("DELETE FROM member_capsule"); await pool.query("DELETE FROM session"); }
  finally { await pool.end(); }
}
test.beforeAll(async ({ request }) => {
  // Warm independent routes before interaction, with bounded concurrency. A
  // serial cold compile can exhaust the hook budget before the browser opens.
  const checks: [string, number][] = [
    ["/api/member/capsules/00000000-0000-4000-8000-000000000001/share", 401],
    ["/api/shared/capsule", 404], ["/shared", 200], ["/", 200],
    ["/api/member/status", 200], ["/api/member/posts", 401],
    ["/api/member/profile", 401], ["/api/member/capsules", 401],
    ["/api/member/capsules/00000000-0000-4000-8000-000000000001", 401],
    ["/api/auth/get-session", 200],
    ["/api/capsules/00000000-0000-4000-8000-000000000001/discussion?revision=1", 404],
  ];
  let cursor = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (cursor < checks.length) {
      const [path, status] = checks[cursor++];
      const response = await request.get(path, { timeout: 60_000 });
      expect(response.status()).toBe(status);
      if (path.startsWith("/api/")) expect(response.headers()["content-type"]).toContain("application/json");
    }
  }));
});
test.beforeEach(clearPrivateTestData);
for (const width of [390, 1440]) {
  test(`限定リンクで指定版を別ブラウザへ渡し、根拠・探索・再発行・停止へ進む ${width}px`, async ({ page, context, browser }, testInfo) => {
    // 二つのcontextと探索のcold compileを含む。個別の期待値は15秒のまま。
    test.setTimeout(180_000);
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
      await explorer.bringToFront();
      // Next devの初回Graph import／初期化だけ別枠で待つ。APIの待機上限は変えない。
      await expect.poll(() => explorer.getByTestId("graph-canvas").evaluate(el => !!(el as unknown as { _cyreg?: { cy?: unknown } })._cyreg?.cy), { timeout: 45_000 }).toBe(true);
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
    // This journey includes two authenticated contexts and a return to the
    // original graph. Keep individual expectations at 15s like other journeys.
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 900 }); await mockKnowledge(context);
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto("/");
    // Wait for the Explorer's client graph to initialize before clicking its
    // server-rendered entry; dev StrictMode replays mount cleanup on hydration.
    await expect.poll(() => page.getByTestId("graph-canvas").evaluate(el => !!(el as unknown as { _cyreg?: { cy?: unknown } })._cyreg?.cy)).toBe(true);
    await page.evaluate(({ key, saved }) => localStorage.setItem(key, JSON.stringify({ format: "local-capsules", version: 1, capsules: [saved] })), { key: localKey, saved });
    await page.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    if (width < 800) await page.getByRole("navigation", { name: "探索画面の切り替え" }).getByRole("button", { name: "検索", exact: true }).click();
    await page.locator("#explorer-search").getByRole("button", { name: "Capsuleを作る・読む", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "自分のCapsule" });
    await dialog.getByRole("button", { name: "読む", exact: true }).click();
    const popup = context.waitForEvent("page");
    await dialog.getByRole("link", { name: "この内容をアカウントへ保存（別タブ）", exact: true }).click();
    // The popup event precedes document loading. Match goto's navigation wait
    // before checking UI state, including when dev compiles this route cold.
    const member = await popup; await member.waitForLoadState("load"); await member.bringToFront(); await member.setViewportSize({ width, height: 900 });
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
      const graph = await exploration; await graph.waitForLoadState("load"); await graph.bringToFront();
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


for (const width of [390, 1440]) {
  test(`共有失効後も自分の投稿一覧から本文を撤回できる ${width}px`, async ({ page, context, browser }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 900 }); await mockKnowledge(context);
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto("/member"); await login(page);
    const headers = { Origin: "http://127.0.0.1:3221" };
    const content = { dataset: saved.dataset, title: "共有停止で読めなくなる題名", note: "一覧へ返さない作者の説明", language: saved.language, entityIds: saved.entityIds, claimIds: saved.claimIds };
    const created = await page.request.post("/api/member/capsules", { headers, data: { requestId: crypto.randomUUID(), content } });
    expect(created.status()).toBe(201); const { capsule } = await created.json();
    const path = `/api/member/capsules/${capsule.id}`, thread = `/api/capsules/${capsule.id}/discussion`;
    const { token, share } = await (await page.request.post(`${path}/share`, { headers, data: { expectedRevision: 1, expectedShareId: null } })).json();
    expect((await page.request.patch(thread, { headers, data: { closed: false, expectedClosed: true } })).status()).toBe(200);
    expect((await page.request.post(thread, { headers, data: { requestId: crypto.randomUUID(), revision: 1, body: "作者の会話は一覧へ出さない" } })).status()).toBe(201);
    const other = await browser.newContext({ baseURL: "http://127.0.0.1:3221", viewport: { width, height: 900 } });
    try {
      await mockKnowledge(other); const reader = await other.newPage(); reader.on("pageerror", error => errors.push(error.message));
      await reader.goto("/member"); await login(reader, "検証ユーザーB");
      await reader.goto(`/shared#${token}`);
      const comments = reader.getByRole("region", { name: "この版のコメント", exact: true });
      await comments.getByRole("button", { name: "この版のコメントを見る", exact: true }).click();
      await comments.getByRole("textbox", { name: "コメント本文", exact: true }).fill("共有停止後も自分で取り消すコメント");
      await comments.getByRole("button", { name: "この版へ投稿する", exact: true }).click();
      await expect(comments.getByText("共有停止後も自分で取り消すコメント", { exact: true })).toBeVisible();
      expect((await page.request.delete(`${path}/share`, { headers, data: { expectedShareId: share.id } })).status()).toBe(200);
      await reader.getByRole("button", { name: "リンクを再確認", exact: true }).click();
      await expect(reader.getByText(/このリンクでは閲覧できません/)).toBeVisible();
      await expect(reader.getByText(content.title, { exact: true })).toHaveCount(0);
      const popup = other.waitForEvent("page");
      await reader.getByRole("link", { name: "自分の投稿を確認・撤回（アカウント・別タブ）", exact: true }).click();
      const account = await popup; account.on("pageerror", error => errors.push(error.message)); await account.bringToFront();
      const posts = account.getByRole("region", { name: "自分の投稿", exact: true });
      await posts.getByRole("button", { name: "自分の投稿を見る", exact: true }).click();
      await expect(posts.getByText("共有停止後も自分で取り消すコメント", { exact: true })).toBeVisible();
      await expect(posts.getByText("内容版 1 への投稿", { exact: true })).toBeVisible();
      await expect(account.getByText(content.title, { exact: true })).toHaveCount(0);
      await expect(account.getByText(content.note, { exact: true })).toHaveCount(0);
      await expect(account.getByText("作者の会話は一覧へ出さない", { exact: true })).toHaveCount(0);
      await account.screenshot({ path: testInfo.outputPath(`own-posts-${width}.png`), fullPage: true });
      expect(await account.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await posts.getByRole("button", { name: "自分の投稿を撤回", exact: true }).click();
      await posts.getByRole("button", { name: "取り消す", exact: true }).click();
      await expect(posts.getByText("共有停止後も自分で取り消すコメント", { exact: true })).toBeVisible();
      await posts.getByRole("button", { name: "自分の投稿を撤回", exact: true }).click();
      await posts.getByRole("button", { name: "本文を削除して撤回する", exact: true }).click();
      await expect(posts.getByText("この投稿は撤回済みです。", { exact: true })).toBeVisible();
      await expect(posts.getByText("共有停止後も自分で取り消すコメント", { exact: true })).toHaveCount(0);
      await expect(posts.getByRole("button", { name: "自分の投稿を撤回", exact: true })).toHaveCount(0);
      await account.reload(); await posts.getByRole("button", { name: "自分の投稿を見る", exact: true }).click();
      await expect(posts.getByText("この投稿は撤回済みです。", { exact: true })).toBeVisible();
      const ownerRead = await page.request.get(`${thread}?revision=1`);
      expect(ownerRead.status()).toBe(200);
      const posted = (await ownerRead.json()).posts;
      expect(posted.find((post: { withdrawnAt: string | null }) => post.withdrawnAt !== null)).toMatchObject({ body: null, authorName: null });
      expect(posted.find((post: { body: string | null }) => post.body === "作者の会話は一覧へ出さない")).toBeTruthy();
      await account.getByRole("button", { name: "ログアウト", exact: true }).click();
      await expect(account.getByRole("region", { name: "自分の投稿", exact: true })).toHaveCount(0);
      expect(await account.evaluate(() => Object.values(localStorage).join(" ") + Object.values(sessionStorage).join(" "))).not.toContain("共有停止後も自分で取り消すコメント");
    } finally { await other.close(); }
    expect(errors).toEqual([]);
  });
}

for (const width of [390, 1440]) {
  test(`閲覧リンクから会員Capsuleへ独立主張と対象を追加する ${width}px`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height: 900 }); await mockKnowledge(context);
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto("/member"); await login(page);
    const headers = { Origin: "http://127.0.0.1:3221" };
    const content = { dataset: "demo", title: "探索の発見を追記する関係図", note: "最初は人物だけを保存", language: "ja", entityIds: [claim.subjectId], claimIds: [] };
    const created = await page.request.post("/api/member/capsules", { headers, data: { requestId: crypto.randomUUID(), content } });
    expect(created.status()).toBe(201); const { capsule } = await created.json();
    const path = `/api/member/capsules/${capsule.id}`;
    expect((await page.request.post(`${path}/share`, { headers, data: { expectedRevision: 1, expectedShareId: null } })).status()).toBe(201);
    await page.goto(`/member?capsule=${capsule.id}`);
    await page.getByRole("button", { name: "このCapsuleを編集", exact: true }).click();
    await page.getByRole("textbox", { name: "自分の説明", exact: true }).fill("根拠を読んで主張を追記した");
    let link = `http://127.0.0.1:3221/?read=claim&dataset=demo&id=${claim.id}`;
    // The narrow-screen journey covers crossing tabs and copying the actual
    // Explorer URL. Desktop focuses on the addition/preview/save layout.
    if (width === 390) {
      const explorer = await context.newPage(); await explorer.bringToFront();
      await explorer.goto(link);
      await expect(explorer.getByRole("heading", { name: "青葉ハルへのインタビュー", exact: true })).toBeVisible();
      await explorer.locator("summary").filter({ hasText: /^閲覧URL$/ }).click();
      link = await explorer.getByLabel("閲覧URL", { exact: true }).inputValue();
      await explorer.close(); await page.bringToFront();
    }
    await expect(page.getByRole("textbox", { name: "自分の説明", exact: true })).toHaveValue("根拠を読んで主張を追記した");
    const picker = page.getByRole("region", { name: "探索で見つけた対象・主張を追加", exact: true });
    await picker.getByLabel("対象・主張の閲覧リンク", { exact: true }).fill(link.replace("dataset=demo", "dataset=pilot-science-v1"));
    await picker.getByRole("button", { name: "リンクの内容を確認", exact: true }).click();
    await expect(picker.getByRole("alert")).toContainText("この環境・データセット");
    await picker.getByLabel("対象・主張の閲覧リンク", { exact: true }).fill(link);
    await picker.getByRole("button", { name: "リンクの内容を確認", exact: true }).click();
    await expect(picker.getByRole("heading", { name: "青葉ハルへのインタビュー", exact: true })).toBeVisible();
    await expect(picker.getByText("参照箇所：pp.12–13", { exact: true })).toBeVisible();
    expect((await (await page.request.get(path)).json()).capsule.revision).toBe(1);
    await page.screenshot({ path: testInfo.outputPath(`reference-preview-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await picker.getByRole("button", { name: "確認した参照を編集中の構成へ追加", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: /青葉ハル · 人物/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /黒川レン · 人物/ })).toBeDisabled();
    await expect(page.getByRole("checkbox", { name: /青葉ハル → アシスタントだった → 黒川レン/ })).toBeChecked();
    // A standalone entity adds no inferred relationship.
    const isolated = examples.neighbors.nodes.find(entity => entity.id !== claim.subjectId && entity.id !== claim.objectId)!;
    await picker.getByLabel("対象・主張の閲覧リンク", { exact: true }).fill(`http://127.0.0.1:3221/?read=entity&dataset=demo&id=${isolated.id}`);
    await picker.getByRole("button", { name: "リンクの内容を確認", exact: true }).click();
    await picker.getByRole("button", { name: "確認した参照を編集中の構成へ追加", exact: true }).click();
    // Confirmed additions survive reauthorization without persisting private drafts.
    if (width === 390) await page.getByRole("button", { name: "アカウントと一覧を再確認", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: /青葉ハル → アシスタントだった → 黒川レン/ })).toBeChecked();
    await page.getByRole("button", { name: "アカウントの変更を保存", exact: true }).click();
    await expect(page.getByText("アカウントのCapsuleを更新しました。", { exact: true })).toBeVisible();
    const updated = (await (await page.request.get(path)).json()).capsule;
    expect(updated.revision).toBe(2); expect(updated.content.claimIds).toEqual([claim.id]);
    expect(updated.content.entityIds).toEqual([claim.subjectId, claim.objectId, isolated.id]);
    const historical = (await (await page.request.get(`${path}/revisions?revision=1`)).json()).capsule;
    expect(historical.content).toEqual(content);
    await page.reload();
    await expect(page.getByText("現在のGraph：対象 3件 / 主張 1件", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /青葉ハル → アシスタントだった → 黒川レン.*2001年〜2003年/ }).click();
    await expect(page.getByRole("heading", { name: "青葉ハルへのインタビュー", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`reference-saved-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => Object.values(localStorage).join(" ") + Object.values(sessionStorage).join(" "))).not.toContain("根拠を読んで主張を追記した");
    expect(errors).toEqual([]);
  });
}

for (const width of [390, 1440]) {
  test(`共有版と現在版の説明・構成を比較し外した主張の根拠へ進む ${width}px`, async ({ page, context }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 900 }); await mockKnowledge(context);
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    const alternate = { ...claim, id: "30000000-0000-4000-8000-000000000001", polarity: "denied" };
    await context.route("**/api/claims/**", route => route.fulfill({ json: { ...examples.claim, claim: route.request().url().endsWith(alternate.id) ? alternate : claim } }));
    const isolated = examples.neighbors.nodes.filter(node => !saved.entityIds.includes(node.id));
    await page.goto("/member"); await login(page);
    const headers = { Origin: "http://127.0.0.1:3221" };
    const content = { dataset: saved.dataset, title: saved.title, note: "最初の共有時に残した説明", language: saved.language, entityIds: [...saved.entityIds, isolated[0].id], claimIds: saved.claimIds };
    const created = await page.request.post("/api/member/capsules", { headers, data: { requestId: crypto.randomUUID(), content } });
    expect(created.status()).toBe(201);
    const { capsule } = await created.json(), path = `/api/member/capsules/${capsule.id}`;
    const shareResponse = await page.request.post(`${path}/share`, { headers, data: { expectedRevision: 1, expectedShareId: null } });
    expect(shareResponse.status()).toBe(201);
    const share = await shareResponse.json();
    const changed = { ...content, title: "根拠を追加確認した関係図", note: "確認後に書き直した説明\n対象と主張の構成も見直した。", entityIds: [...saved.entityIds, isolated[1].id], claimIds: [alternate.id] };
    expect((await page.request.put(path, { headers, data: { expectedRevision: 1, content: changed } })).status()).toBe(200);
    expect((await page.request.get(`${path}/revisions`, { timeout: 60_000 })).status()).toBe(200);
    await page.goto(`/member?capsule=${capsule.id}`);
    await page.getByRole("button", { name: "共有した版を選ぶ", exact: true }).click();
    await page.getByRole("button", { name: "内容版 1 を読む", exact: true }).click();
    await page.getByRole("button", { name: "現在の保存内容と比較", exact: true }).click();
    const comparison = page.getByRole("region", { name: "共有時からの変更", exact: true });
    await expect(comparison.getByRole("heading", { name: "共有時の内容版 1 → 取得時の現在版 2" })).toBeVisible();
    await expect(comparison.getByText(changed.title, { exact: true })).toBeVisible();
    await expect(comparison.getByText(content.note, { exact: true })).toBeVisible();
    const entities = comparison.getByRole("region", { name: "対象の構成", exact: true });
    await expect(entities.getByText("追加 1件 · 除外 1件 · 共通 2件", { exact: true })).toBeVisible();
    await expect(entities.getByText(isolated[0].name, { exact: true })).toBeVisible();
    await expect(entities.getByText(isolated[1].name, { exact: true })).toBeVisible();
    const claims = comparison.getByRole("region", { name: "主張の構成", exact: true });
    await expect(claims.getByText("追加 1件 · 除外 1件 · 共通 0件", { exact: true })).toBeVisible();
    await expect(claims.getByText("否定 / 2001年〜2003年", { exact: true })).toBeVisible();
    await comparison.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`capsule-comparison-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const popupPromise = context.waitForEvent("page");
    await claims.locator(`a[href$="id=${claim.id}"]`).click();
    const popup = await popupPromise;
    popup.on("pageerror", error => errors.push(error.message));
    try {
      await popup.waitForLoadState("load"); await popup.bringToFront();
      await expect(popup.getByRole("heading", { name: "青葉ハルへのインタビュー", exact: true })).toBeVisible();
      await expect(popup.getByText("参照箇所：pp.12–13", { exact: true })).toBeVisible();
    } finally { await popup.close(); }
    await page.bringToFront();
    // Comparison is intentionally not persisted across a private-tab recheck.
    await page.reload();
    await expect(page.getByRole("heading", { name: "共有時の内容版 1 を閲覧中", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "現在の保存内容と比較", exact: true })).toBeVisible();
    // Even a revoked link leaves the owner able to compare; no reissue occurs.
    expect((await page.request.delete(`${path}/share`, { headers, data: { expectedShareId: share.share.id } })).status()).toBe(200);
    await page.getByRole("button", { name: "現在の保存内容と比較", exact: true }).click();
    await expect(comparison.getByText(changed.title, { exact: true })).toBeVisible();
    expect((await (await page.request.get(`${path}/share`)).json()).share).toBeNull();
    expect((await (await page.request.get(`${path}/revisions?revision=1`)).json()).capsule.content).toEqual(content);
    expect((await (await page.request.get(path)).json()).capsule.revision).toBe(2);
    await page.getByRole("button", { name: "現在の保存内容へ戻る", exact: true }).click();
    await expect(page.getByRole("button", { name: "このCapsuleを編集", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "共有時からの変更", exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test.describe("スマホの会員・共有と探索の往復", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 320, height: 844 } });
  test("320px: 未保存編集・未送信コメントと、関係図・根拠を保って探索を往復する", async ({ page, context }, testInfo) => {
    test.setTimeout(180_000);
    await mockKnowledge(context);
    const capsule = await createForEditing(page);
    const editor = page.getByRole("region", { name: "アカウントのCapsuleを編集", exact: true });
    const title = editor.getByLabel("Capsuleの題名", { exact: true });
    const note = editor.getByRole("textbox", { name: "自分の説明", exact: true });
    await title.fill("まだ保存していない長い題名・出典を確かめながら読む関係図");
    await note.fill("この入力は探索を開いても保存・破棄しない。\n別タブから戻って続きを書く。");
    for (const input of [title, note]) expect(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    let writes = 0;
    context.on("request", request => { if (request.method() === "PUT" && new URL(request.url()).pathname === `/api/member/capsules/${capsule.id}`) writes++; });
    await page.screenshot({ path: testInfo.outputPath("member-draft-320.png") });
    const exploring = context.waitForEvent("page");
    await page.getByRole("link", { name: "探索を開く（別タブ）", exact: true }).tap();
    const graph = await exploring;
    await graph.waitForLoadState("load"); await graph.bringToFront();
    await expect.poll(() => graph.getByTestId("graph-canvas").evaluate(el => !!(el as unknown as { _cyreg?: { cy?: unknown } })._cyreg?.cy)).toBe(true);
    await graph.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).tap();
    await expect(graph.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    await graph.close(); await page.bringToFront();
    await expect(title).toHaveValue("まだ保存していない長い題名・出典を確かめながら読む関係図");
    await expect(note).toHaveValue("この入力は探索を開いても保存・破棄しない。\n別タブから戻って続きを書く。");
    expect(writes).toBe(0);
    expect((await (await page.request.get(`/api/member/capsules/${capsule.id}`)).json()).capsule.revision).toBe(1);
    await editor.getByRole("button", { name: "編集を取り消す", exact: true }).tap();
    await editor.getByRole("button", { name: "保存せず戻る", exact: true }).tap();
    await expect(page.getByText("現在のGraph：対象 2件 / 主張 1件", { exact: true })).toBeVisible();
    const canvas = page.getByTestId("graph-canvas");
    const view = () => canvas.evaluate(el => {
      const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
      return { positions: cy.nodes().map(node => [node.id(), node.position()]), pan: cy.pan(), zoom: cy.zoom() };
    });
    const before = await view();
    const choice = page.getByRole("button", { name: /青葉ハル → アシスタントだった → 黒川レン.*2001年〜2003年/ });
    await choice.tap();
    await expect(page.getByText("参照箇所：pp.12–13", { exact: true })).toBeVisible();
    await expect(page.getByText("デモURL（リンク無効）：https://example.invalid/demo/source-2", { exact: true })).toBeVisible();
    const source = page.locator("summary").filter({ hasText: "資料の書誌情報" }).first();
    await expect(source).toBeVisible();
    expect((await source.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.getByRole("button", { name: "関係図・一覧へ戻る", exact: true }).tap();
    await expect(page.getByRole("region", { name: "関係図と一覧", exact: true })).toBeFocused();
    await expect(choice).toHaveAttribute("aria-pressed", "true");
    expect(await view()).toEqual(before);
    const sharing = page.getByRole("region", { name: "限定リンク共有", exact: true });
    await sharing.getByRole("button", { name: "この版の共有リンクを作る", exact: true }).tap();
    await sharing.getByRole("button", { name: "この版をリンクで閲覧可能にする", exact: true }).tap();
    await expect(sharing.getByRole("link", { name: "共有内容を別タブで確認", exact: true })).toBeVisible();
    const thread = page.getByRole("region", { name: "この版のコメント", exact: true });
    await thread.getByRole("button", { name: "この版のコメントを見る", exact: true }).tap();
    await thread.getByRole("button", { name: "投稿を受け付ける", exact: true }).tap();
    await expect(thread.getByRole("textbox", { name: "コメント本文", exact: true })).toBeVisible();
    const sharedOpening = context.waitForEvent("page");
    await sharing.getByRole("link", { name: "共有内容を別タブで確認", exact: true }).tap();
    const shared = await sharedOpening; await shared.bringToFront();
    await expect(shared.getByText("現在のGraph：対象 2件 / 主張 1件", { exact: true })).toBeVisible();
    await shared.getByRole("button", { name: /青葉ハル → アシスタントだった → 黒川レン.*2001年〜2003年/ }).tap();
    await expect(shared.getByText("参照箇所：pp.12–13", { exact: true })).toBeVisible();
    await shared.getByRole("button", { name: "関係図・一覧へ戻る", exact: true }).tap();
    await expect(shared.getByRole("region", { name: "関係図と一覧", exact: true })).toBeFocused();
    await shared.getByRole("button", { name: "この版のコメントを見る", exact: true }).tap();
    const comment = shared.getByRole("textbox", { name: "コメント本文", exact: true });
    await comment.fill("出典の範囲を確認中。これは未送信の入力です。");
    let posts = 0;
    context.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/discussion")) posts++; });
    const another = context.waitForEvent("page");
    await shared.getByRole("link", { name: "探索を開く（別タブ）", exact: true }).tap();
    const explorer = await another; await explorer.waitForLoadState("load"); await explorer.bringToFront();
    await expect.poll(() => explorer.getByTestId("graph-canvas").evaluate(el => !!(el as unknown as { _cyreg?: { cy?: unknown } })._cyreg?.cy)).toBe(true);
    await explorer.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).tap();
    await expect(explorer.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    await explorer.close(); await shared.bringToFront();
    await expect(shared.getByRole("heading", { name: saved.title, exact: true })).toBeVisible();
    if (await shared.getByRole("button", { name: "この版のコメントを見る", exact: true }).isVisible()) await shared.getByRole("button", { name: "この版のコメントを見る", exact: true }).tap();
    await expect(comment).toHaveValue("出典の範囲を確認中。これは未送信の入力です。");
    expect(posts).toBe(0);
    expect(await shared.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await shared.screenshot({ path: testInfo.outputPath("shared-draft-320.png") });
    await shared.close();
  });
});

for (const width of [320, 1440]) {
  test(`アカウント設定: 表示名を保存・再訪し、Capsule入力と所有者を維持する ${width}px`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height: 900 }); await mockKnowledge(context);
    const capsule = await createForEditing(page);
    const original = (await (await page.request.get("/api/member/profile")).json()).user;
    const editor = page.getByRole("region", { name: "アカウントのCapsuleを編集", exact: true });
    const settings = page.getByRole("region", { name: "アカウント設定", exact: true });
    await editor.getByRole("textbox", { name: "自分の説明", exact: true }).fill("設定中も残すCapsuleの入力");
    try {
      await page.getByTestId("site-header").locator("summary").click();
      await page.getByRole("link", { name: "アカウント設定", exact: true }).click();
      expect(new URL(page.url()).searchParams.get("capsule")).toBe(capsule.id);
      await settings.getByLabel("表示名", { exact: true }).fill("調査する人");
      await page.route("**/api/member/profile", async route => {
        if (route.request().method() === "PUT") return route.fulfill({ status: 503, json: { error: { code: "MEMBER_UNAVAILABLE" } } });
        return route.continue();
      }, { times: 1 });
      await settings.getByRole("button", { name: "表示名を保存", exact: true }).click();
      await expect(settings.getByRole("alert")).toContainText("会員保存を現在利用できません");
      await expect(settings.getByLabel("表示名", { exact: true })).toHaveValue("調査する人");
      await settings.getByRole("button", { name: "表示名を保存", exact: true }).click();
      await expect(settings.getByRole("status")).toHaveText("表示名を保存しました。");
      await expect(editor.getByRole("textbox", { name: "自分の説明", exact: true })).toHaveValue("設定中も残すCapsuleの入力");
      const current = (await (await page.request.get("/api/member/profile")).json()).user;
      expect(current).toEqual({ ...original, name: "調査する人" });
      expect((await (await page.request.get(`/api/member/capsules/${capsule.id}`)).json()).capsule).toEqual(capsule);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await settings.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`account-settings-${width}.png`) });
      await editor.getByRole("button", { name: "編集を取り消す", exact: true }).click();
      await editor.getByRole("button", { name: "保存せず戻る", exact: true }).click();
      await page.reload();
      await expect(settings.getByLabel("表示名", { exact: true })).toHaveValue("調査する人");
      await expect(page.getByText("設定中も残すCapsuleの入力", { exact: true })).toHaveCount(0);
    } finally {
      await page.request.put("/api/member/profile", { headers: { Origin: "http://127.0.0.1:3221", "X-Member-User": original.id }, data: { name: original.name } });
    }
  });
}


for (const width of [390, 1440]) {
  test(`本人退会: 確認・取消・削除・リンク失効とブラウザ保存維持 ${width}px`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height: 900 }); await mockKnowledge(context);
    await page.goto("/member");
    await page.evaluate(({ key, capsule }) => localStorage.setItem(key, JSON.stringify({ schemaVersion: 2, dataset: "demo", capsules: [capsule] })), { key: localKey, capsule: saved });
    const before = await page.evaluate(key => localStorage.getItem(key), localKey);
    await login(page);
    const content = { dataset: saved.dataset, title: saved.title, note: saved.note, language: saved.language, entityIds: saved.entityIds, claimIds: saved.claimIds };
    const { capsule } = await (await page.request.post("/api/member/capsules", { headers: { Origin: "http://127.0.0.1:3221" }, data: { requestId: crypto.randomUUID(), content } })).json();
    const share = await (await page.request.post(`/api/member/capsules/${capsule.id}/share`, { headers: { Origin: "http://127.0.0.1:3221" }, data: { expectedRevision: 1, expectedShareId: null } })).json();
    await page.goto(`/member?capsule=${capsule.id}`);
    const region = page.getByRole("region", { name: "退会・アカウント削除", exact: true });
    await region.getByRole("button", { name: "削除する内容を確認", exact: true }).click();
    await expect(region.getByRole("button", { name: "退会してアカウントを削除する", exact: true })).toBeDisabled();
    await region.getByRole("button", { name: "取り消す", exact: true }).click();
    expect((await page.request.get("/api/member/profile")).status()).toBe(200);
    await region.getByRole("button", { name: "削除する内容を確認", exact: true }).click();
    await region.getByRole("checkbox").check();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await region.screenshot({ path: testInfo.outputPath(`account-delete-${width}.png`) });
    await region.getByRole("button", { name: "退会してアカウントを削除する", exact: true }).click();
    await expect(page.getByText("アカウントと会員保存を削除しました。ブラウザ内の保存と探索は引き続き利用できます。", { exact: true })).toBeVisible();
    expect((await page.request.get("/api/member/profile")).status()).toBe(401);
    expect((await page.request.get("/api/shared/capsule", { headers: { "X-Capsule-Token": share.token } })).status()).toBe(404);
    expect(await page.evaluate(key => localStorage.getItem(key), localKey)).toBe(before);
    await page.reload();
    await expect(page.getByRole("button", { name: "検証用OIDCでログイン", exact: true })).toBeVisible();
  });
}

test("運営CLI: 投稿非表示・共有停止・User停止と再開を画面へ反映する", async ({ page, context, browser }) => {
  // 四つの独立CLI起動と二回のOIDC往復を含む。APIの待機上限は変えない。
  test.setTimeout(180_000);
  await mockKnowledge(context); await page.goto("/member"); await login(page);
  const headers = { Origin: "http://127.0.0.1:3221" };
  const content = { dataset: saved.dataset, title: saved.title, note: saved.note, language: saved.language, entityIds: saved.entityIds, claimIds: saved.claimIds };
  const { capsule } = await (await page.request.post("/api/member/capsules", { headers, data: { requestId: crypto.randomUUID(), content } })).json();
  const { token } = await (await page.request.post(`/api/member/capsules/${capsule.id}/share`, { headers, data: { expectedRevision: 1, expectedShareId: null } })).json();
  await page.request.patch(`/api/capsules/${capsule.id}/discussion`, { headers, data: { closed: false, expectedClosed: true } });
  const other = await browser.newContext({ baseURL: "http://127.0.0.1:3221" });
  const operate = (action: string, target: string) => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/member-ops.ts", action, target,
      "--actor", "browser-test", "--reason", "security", "--origin", headers.Origin, "--apply", "--confirm", target], { encoding: "utf8", timeout: 20_000 });
    expect(result.status, result.stderr).toBe(0);
  };
  try {
    await mockKnowledge(other); const reader = await other.newPage();
    await reader.goto("/member"); await login(reader, "検証ユーザーB");
    const user = (await (await reader.request.get("/api/member/profile")).json()).user;
    const posted = await reader.request.post(`/api/capsules/${capsule.id}/discussion`, { headers: { ...headers, "X-Capsule-Token": token }, data: { requestId: crypto.randomUUID(), revision: 1, body: "非表示確認の本文" } });
    expect(posted.status()).toBe(201); const { postId } = await posted.json();
    await reader.getByRole("button", { name: "自分の投稿を見る", exact: true }).click();
    await expect(reader.getByText("非表示確認の本文", { exact: true })).toBeVisible();
    operate("hide-post", postId);
    await reader.getByRole("button", { name: "この一覧を再確認", exact: true }).click();
    await expect(reader.getByText("この投稿は表示できません。本文を削除して撤回することはできます。", { exact: true })).toBeVisible();
    await expect(reader.getByText("非表示確認の本文", { exact: true })).toHaveCount(0);
    operate("suspend-user", user.id);
    await reader.getByRole("button", { name: "アカウントと一覧を再確認", exact: true }).click();
    await expect(reader.getByRole("button", { name: "検証用OIDCでログイン", exact: true })).toBeVisible();
    expect((await reader.request.get("/api/member/profile")).status()).toBe(401);
    operate("resume-user", user.id);
    expect((await reader.request.get("/api/member/profile")).status()).toBe(401);
    await login(reader, "検証ユーザーB");
    operate("block-sharing", capsule.id);
    expect((await reader.request.get("/api/shared/capsule", { headers: { "X-Capsule-Token": token } })).status()).toBe(404);
    await page.bringToFront(); await page.goto(`/member?capsule=${capsule.id}`);
    const controls = page.getByRole("region", { name: "限定リンク共有", exact: true });
    await expect(controls.getByText("運営によりこのCapsuleの共有を停止しています。新しいリンクは作れません。本人の保存内容は閲覧できます。", { exact: true })).toBeVisible();
    await expect(controls.getByRole("button", { name: "この版の共有リンクを作る", exact: true })).toBeDisabled();
    await expect(page.getByText(saved.note, { exact: true })).toBeVisible();
  } finally { await other.close(); }
});
