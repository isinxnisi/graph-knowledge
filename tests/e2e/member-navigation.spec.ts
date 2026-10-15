import { test, expect } from '@playwright/test';
import type { Core } from 'cytoscape';
const snapshot = (page: import('@playwright/test').Page) => page.getByTestId('graph-canvas').evaluate(el => {
  const cy = (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy;
  return { points: Object.fromEntries(cy.nodes().map(n => [n.id(), n.position()])), edges: cy.edges().map(e => e.id()).sort(), zoom: cy.zoom() };
});
for (const width of [1440, 375]) test(`会員との同一タブ往復で枝・位置を復元し、本人表示を更新 ${width}px`, async ({ browser }, testInfo) => {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, httpCredentials: testInfo.project.use.httpCredentials, viewport: { width, height: 900 }, hasTouch: width < 800, isMobile: width < 800 });
  const page = await context.newPage();
  let user: { id: string; name: string; locale: string } | null = { id: '10000000-0000-4000-8000-000000000001', name: '探索する利用者', locale: 'ja' };
  await context.route('**/api/member/profile', async route => {
    if (route.request().method() === 'PUT' && user) user = { ...user, name: route.request().postDataJSON().name };
    await route.fulfill(user ? { json: { user } } : { status: 401, json: { error: { code: 'UNAUTHENTICATED' } } });
  });
  await context.route('**/api/member/status', route => route.fulfill({ json: { provider: 'google' } }));
  await context.route('**/api/member/capsules', route => route.fulfill({ json: { capsules: [] } }));
  await context.route('**/api/auth/sign-out', route => { user = null; return route.fulfill({ json: { success: true } }); });
  try {
    await page.goto('/');
    await expect(page.getByTestId('site-header').getByLabel('探索する利用者のアカウントメニュー')).toBeVisible();
    await page.getByTestId('discovery-featured').click();
    const canvas = page.getByTestId('graph-canvas');
    await expect.poll(() => canvas.evaluate(el => (el as unknown as { _cyreg?: { cy: Core } })._cyreg?.cy.nodes().length ?? 0)).toBe(4);
    const nav = page.getByRole('navigation', { name: '探索画面の切り替え' });
    if (width < 800) {
      const p = await canvas.evaluate(el => {
        const cy = (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy;
        const point = cy.edges().first().renderedMidpoint(), r = el.getBoundingClientRect();
        return { x: r.x + point.x, y: r.y + point.y };
      });
      await page.touchscreen.tap(p.x, p.y);
      await expect(nav.getByRole('button', { name: 'Graph', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('selection-status')).toContainText('→');
      await page.waitForTimeout(320);
      await page.touchscreen.tap(p.x, p.y); await page.touchscreen.tap(p.x, p.y);
      await expect(nav.getByRole('button', { name: '選択の詳細', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('region', { name: 'Claim詳細', exact: true })).toBeVisible();
      await nav.getByRole('button', { name: 'Graph', exact: true }).click();
    }
    await canvas.evaluate(el => {
      const cy = (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy;
      cy.nodes().filter(n => n.data('label') === '浦沢直樹').first().emit('tap');
    });
    await expect.poll(() => canvas.evaluate(el => (el as unknown as { _cyreg?: { cy: Core } })._cyreg?.cy.nodes().length ?? 0)).toBe(12);
    await canvas.evaluate(el => {
      const cy = (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy;
      const n = cy.nodes().first(); n.position({ x: n.position('x') + 73, y: n.position('y') - 29 }); cy.emit('dragfree');
    });
    const before = await snapshot(page);
    const header = page.getByTestId('site-header');
    await header.getByLabel('探索する利用者のアカウントメニュー', { exact: true }).click();
    await header.getByRole('link', { name: '保存したCapsule', exact: true }).click();
    await expect(page).toHaveURL(/\/member#my-capsules$/);
    expect(context.pages()).toHaveLength(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('保存したCapsule');
    await page.locator('main').getByRole('navigation', { name: 'アカウント内の移動' }).getByRole('link', { name: 'アカウント設定', exact: true }).click();
    const settings = page.getByRole('region', { name: 'アカウント設定', exact: true });
    await settings.getByLabel('表示名', { exact: true }).fill('更新した利用者');
    await settings.getByRole('button', { name: '表示名を保存', exact: true }).click();
    await expect(header.getByLabel('更新した利用者のアカウントメニュー', { exact: true })).toBeVisible();
    await header.getByRole('link', { name: '探索へ戻る', exact: true }).click();
    await expect.poll(() => canvas.evaluate(el => (el as unknown as { _cyreg?: { cy: Core } })._cyreg?.cy.nodes().length ?? 0)).toBe(Object.keys(before.points).length);
    await expect(header.getByLabel('更新した利用者のアカウントメニュー', { exact: true })).toBeVisible();
    const after = await snapshot(page);
    expect(after.edges).toEqual(before.edges);
    expect(Object.keys(after.points).sort()).toEqual(Object.keys(before.points).sort());
    for (const [id, point] of Object.entries(before.points)) { expect(after.points[id].x).toBeCloseTo(point.x, 0); expect(after.points[id].y).toBeCloseTo(point.y, 0); }
    expect(after.zoom).toBeCloseTo(before.zoom, 2);
    await page.screenshot({ path: testInfo.outputPath(`explore-identity-${width}.png`) });
    await header.getByLabel('更新した利用者のアカウントメニュー', { exact: true }).click();
    await header.getByRole('button', { name: 'ログアウト', exact: true }).click();
    await expect(header.getByRole('link', { name: 'ログイン', exact: true })).toBeVisible();
    expect(await snapshot(page)).toEqual(after);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});

test('320px: 会員ヘッダ・一段のナビ・本人メニューが収まる', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const name = '表示確認の利用者';
  await page.route('**/api/member/profile', r => r.fulfill({ json: { user: { id: '10000000-0000-4000-8000-000000000001', name, locale: 'ja' } } }));
  await page.route('**/api/member/status', r => r.fulfill({ json: { provider: 'google' } }));
  await page.route('**/api/member/capsules', r => r.fulfill({ json: { capsules: [] } }));
  await page.goto('/member');
  const header = page.getByTestId('site-header');
  const account = header.getByLabel(`${name}のアカウントメニュー`, { exact: true });
  await expect(account).toBeVisible();
  const brand = header.getByText('Plunode', { exact: true });
  expect((await brand.boundingBox())!.width).toBeGreaterThan(40);
  expect((await account.locator('span').last().boundingBox())!.height).toBeLessThan(25);
  expect((await header.boundingBox())!.height).toBeLessThanOrEqual(56);
  const nav = page.locator('main').getByRole('navigation', { name: 'アカウント内の移動', exact: true });
  expect((await nav.boundingBox())!.height).toBeLessThanOrEqual(60);
  const tops = await nav.locator('a').evaluateAll(els => els.map(e => e.getBoundingClientRect().top));
  expect(new Set(tops).size).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('account-320.png') });
  await account.click();
  const menu = header.getByRole('navigation', { name: '本人メニュー', exact: true }).locator('..');
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: testInfo.outputPath('account-menu-320.png') });
  await page.keyboard.press('Escape'); await expect(account).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
