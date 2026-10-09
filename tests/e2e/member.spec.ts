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
test.beforeEach(clearPrivateTestData);
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
