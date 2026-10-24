import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };
const claim = examples.claim.claim;
const saved = { dataset: "demo", note: "出典を読んで確認する。", language: "ja", entityIds: [claim.subjectId, claim.objectId], claimIds: [claim.id] };
async function mockKnowledge(context: BrowserContext) {
  await context.route("**/api/entities/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/neighbors")) return route.fulfill({ json: examples.neighbors });
    const entity = examples.neighbors.nodes.find(node => node.id === url.pathname.split("/")[3]);
    await route.fulfill({ json: { entity: { ...entity, aliases: [], event: null } } });
  });
  await context.route("**/api/claims/**", route => route.fulfill({ json: examples.claim }));
}
async function login(page: Page) {
  await page.getByRole("button", { name: "検証用OIDCでログイン", exact: true }).click();
  await page.getByRole("link", { name: "検証ユーザーA", exact: true }).click();
  await page.waitForURL(url => url.pathname === "/member");
  await expect(page.getByTestId("site-header").getByLabel("アカウントメニュー", { exact: true })).toContainText("検証ユーザーA");
  await expect(page.getByRole("button", { name: "最新の状態に更新", exact: true })).toBeEnabled();
}

// Precompile only the routes this journey uses; no data or login is created here.
test.beforeAll(async ({ request }) => {
  for (const [path, status] of [["/api/member/status", 200], ["/api/member/profile", 401], ["/api/auth/get-session", 200], ["/api/member/capsules", 401], ["/api/member/capsules/00000000-0000-4000-8000-000000000001", 401], ["/api/member/capsules/00000000-0000-4000-8000-000000000001/share", 401]] as const) {
    const response = await request.get(path, { timeout: 60000 });
    expect(response.status()).toBe(status);
  }
});

for (const width of [1440, 375]) test(`会員UX: 本人表示・保存一覧・共有管理・設定・ログアウト ${width}px`, async ({ page, context, browser }, testInfo) => {
  await page.setViewportSize({ width, height: 900 }); await mockKnowledge(context);
  await page.goto('/member'); await login(page);
  const savedTitle = `会員UXの保存 ${width}`;
  const header = page.getByTestId('site-header');
  const profile = (await (await page.request.get('/api/member/profile')).json()).user;
  const content = { dataset: saved.dataset, title: savedTitle, note: saved.note, language: saved.language, entityIds: saved.entityIds, claimIds: saved.claimIds };
  const response = await page.request.post('/api/member/capsules', { headers: { Origin: 'http://127.0.0.1:3221', 'X-Member-User': profile.id }, data: { requestId: crypto.randomUUID(), content } });
  expect(response.status()).toBe(201);
  const capsule = (await response.json()).capsule;
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('保存したCapsule');
  await expect(page.getByRole('region', { name: 'アカウント設定', exact: true })).toBeHidden();
  const identity = header.getByLabel("アカウントメニュー", { exact: true });
  await expect(identity).toBeVisible();
  const name = identity.locator('span').last();
  expect((await name.boundingBox())!.width).toBeGreaterThan(20);
  const row = page.getByRole('listitem').filter({ hasText: savedTitle });
  await expect(row.getByRole('button', { name: '内容と根拠を読む', exact: true })).toBeVisible();
  await row.getByRole('button', { name: '共有を管理', exact: true }).click();
  const sharing = page.getByRole('region', { name: '限定リンク共有', exact: true });
  await expect(sharing).toBeVisible();
  await sharing.getByRole('button', { name: 'この版の共有リンクを作る', exact: true }).click();
  await sharing.getByRole('button', { name: 'この版をリンクで閲覧可能にする', exact: true }).click();
  const url = await sharing.getByRole('textbox', { name: '共有リンク', exact: true }).inputValue();
  await sharing.getByRole('button', { name: '共有を停止する', exact: true }).click();
  await sharing.getByRole('button', { name: 'リンクを失効する', exact: true }).click();
  await expect(sharing).toContainText('有効な共有リンクはありません');
  const anonymous = await browser.newContext();
  try {
    const denied = await anonymous.request.get(`http://127.0.0.1:3221/api/member/capsules/${capsule.id}`); expect(denied.status()).toBe(401);
    const revoked = await anonymous.request.get('http://127.0.0.1:3221/api/shared/capsule', { headers: { 'X-Capsule-Token': new URL(url).hash.slice(1) } }); expect(revoked.status()).toBe(404);
  } finally { await anonymous.close(); }
  await page.getByRole('button', { name: '内容', exact: true }).click();
  await expect(page.getByRole('heading', { name: savedTitle, exact: true })).toBeVisible();
  const nav = page.locator('main').getByRole('navigation', { name: 'アカウント内の移動', exact: true });
  await nav.getByRole('link', { name: 'アカウント設定', exact: true }).click();
  const settings = page.getByRole('region', { name: 'アカウント設定', exact: true });
  await settings.getByLabel('表示名', { exact: true }).fill('探索する人');
  await settings.getByRole('button', { name: '表示名を保存', exact: true }).click();
  await expect(header.getByLabel('アカウントメニュー', { exact: true })).toContainText('探索する人');
  await page.screenshot({ path: testInfo.outputPath(`account-settings-${width}.png`) });
  await settings.getByLabel('表示名', { exact: true }).fill(profile.name);
  await settings.getByRole('button', { name: '表示名を保存', exact: true }).click();
  await expect(identity).toBeVisible();
  await nav.getByRole('link', { name: '保存したCapsule', exact: true }).click();
  await page.getByRole('button', { name: 'アカウントの一覧へ', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`account-library-${width}.png`) });
  await identity.click();
  await header.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await expect(identity).toHaveAttribute('data-signed-in','false');
  await expect(page.getByRole('heading', { name: savedTitle, exact: true })).toHaveCount(0);
  await login(page);
  await expect(row).toBeVisible();
});
