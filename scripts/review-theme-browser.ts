import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { lstat, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import {themeStoryEntries} from '../lib/domain/theme-stories';
import {themeTimelineRecords} from '../lib/domain/knowledge-timeline';
import { uploadProductImageSchema } from '../lib/domain/product-authoring';

const origins = new Set(['https://plunode.net', 'https://graph-beta.isinxnisi.com', 'http://127.0.0.1:3200']);
export const viewports = [{ width: 1440, height: 1000 }, { width: 390, height: 844 }];
const privateState = join(homedir(), '.local/state/plunode-theme-review');

async function privateDirectory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o077)) {
    throw new Error('Use a private, owner-only directory for the browser profile and evidence.');
  }
}

function label(locale: string, ja: string, en: string) {
  return locale === 'en' ? en : ja;
}

export async function themeSnapshot(context: BrowserContext, origin: string, id: string, revision: number, locale: string, grant?: Record<string,string>) {
  const query = new URLSearchParams({ themeId: id, language: locale, revision: String(revision) });
  const response = await context.request.get(origin + '/api/site-operations/theme-preview?' + query, { maxRedirects: 0, headers: grant });
  const headers = response.headers();
  if (response.status() !== 200) throw new Error('Operator preview unavailable (HTTP ' + response.status() + ').');
  if (!headers['cache-control']?.includes('no-store') || !headers['x-robots-tag']?.includes('noindex')) {
    throw new Error('The operator preview did not return its private response headers.');
  }
  const data = await response.body();
  const preview = JSON.parse(data.toString('utf8'));
  if (preview.operatorPreview !== true || preview.theme?.id !== id || preview.theme?.revision !== revision) {
    throw new Error('The preview did not serve the requested private edition.');
  }
  const records=preview.snapshot?.records??[];
  return {
    digest:createHash('sha256').update(data).digest('hex'), hasImage:Boolean(preview.presentation?.image), build:headers['x-plunode-preview-build'],
    hasTimeline:themeTimelineRecords({records,timeline:preview.snapshot?.timeline}).some(record=>record.content.times.length>0),
    hasStory:themeStoryEntries(records,preview.theme.content?.stories,preview.presentation,locale==='en'?'en':'ja').length>0,
  };
}

export async function inspectThemePage(page: Page, url: string, revision: number, locale: string, hasImage: boolean, folder: string, width: number, save?: (file:string, bytes:Buffer)=>Promise<void>, expected?: {timeline:boolean;story:boolean}) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (!response?.ok() || new URL(page.url()).href !== new URL(url).href) {
    throw new Error('Authenticated preview page unavailable.');
  }
  const editionLabel = '運営者プレビュー · 作業版 ' + revision;
  await page.getByRole('navigation', { name: '運営者プレビュー' }).getByText(editionLabel, { exact: true }).waitFor();
  const screenshots: string[] = [];
  async function capture(step: string) {
    const file = width + '-' + step + '.png';
    const bytes=await page.screenshot({ animations: 'disabled' });
    if(save)await save(file,bytes);
    else await writeFile(join(folder, file), bytes, { mode: 0o600, flag: 'wx' });
    screenshots.push(file);
  }

  const reading = page.getByRole('region', { name: label(locale, 'テーマを読む', 'Theme reading'), exact: true });
  await reading.getByRole('heading', { level: 2 }).first().waitFor();
  const image = page.getByRole('button', { name: label(locale, 'テーマ画像を拡大', 'Enlarge theme image') });
  const imageMetrics = hasImage ? await image.locator('img').evaluate(async (img: HTMLImageElement) => {
    if (!img.complete) await Promise.race([img.decode(), new Promise((_, reject) => setTimeout(reject, 5000))]);
    if (!img.naturalWidth) throw new Error('Image unavailable.');
    const box = img.getBoundingClientRect(), style = getComputedStyle(img);
    return {
      naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
      width: box.width, height: box.height, objectFit: style.objectFit, objectPosition: style.objectPosition,
    };
  }).catch(() => null) : null;
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await capture('overview');

  const pane = page.locator('#explorer-detail');
  const detail = await pane.count() ? pane : page.locator('body');
  const evidence = detail.locator('[data-evidence-toggle]:visible').first();
  const timeline = reading.locator('[data-timeline-row-id]:visible button[aria-pressed]').first();
  let timelineReturn:'back-button'|'desktop-inline'|null=null;
  async function revealEvidence(){
    await evidence.waitFor();
    if(await evidence.getAttribute('aria-expanded')!=='true')await evidence.click();
    return await evidence.getAttribute('aria-expanded')==='true';
  }
  const steps: Record<string, string> = {};
  async function check(name: string, action: () => Promise<boolean>) {
    try {
      steps[name] = await action() ? 'observed' : 'missing';
    } catch {
      steps[name] = 'unverified';
    }
  }
  await check('imageDialog', async () => {
    if (!imageMetrics) return false;
    await image.click();
    const dialog = page.getByRole('dialog', { name: label(locale, 'テーマ画像', 'Theme image') });
    await dialog.waitFor();
    await dialog.locator('img').evaluate((img: HTMLImageElement) => img.decode());
    await capture('image');
    await dialog.getByRole('button', { name: label(locale, '閉じる', 'Close') }).click();
    await dialog.waitFor({ state: 'hidden' });
    return true;
  });
  await check('timelineSourceAndBack', async () => {
    if(expected?.timeline===false)return false;
    if(!expected&&!await timeline.count())return false;
    await timeline.click();
    if(!await revealEvidence())return false;
    await capture('timeline-source');
    const back=detail.locator('[data-detail-back]:visible').first();
    if(await back.isVisible()){
      await back.click();
      await timeline.waitFor();
      timelineReturn='back-button';
    }else if(width>=1200){
      // On desktop the timeline and detail are adjacent. Confirm the timeline
      // stays actionable while an open source is visible in its own pane.
      await timeline.click({trial:true});
      timelineReturn='desktop-inline';
    }else return false;
    return true;
  });
  await check('storySourceAndBack', async () => {
    if(expected?.story===false)return false;
    const about = reading.getByRole('button', { name: label(locale, 'このテーマについて', 'About this theme'), exact: true });
    await (await about.count() ? about : reading.getByRole('button', {
      name: label(locale, 'テーマについて', 'About this theme'), exact: true,
    })).first().click();
    const stories = detail.getByRole('heading', { name: label(locale, 'エピソード・豆知識', 'Stories & background'), exact: true })
      .locator('xpath=ancestor::section[1]');
    if(!expected&&!await stories.count())return false;
    const summary = stories.locator('details > summary').first();
    await summary.waitFor();
    await summary.click();
    await stories.locator('button[data-detail-record]:visible').first().click();
    if(!await revealEvidence())return false;
    await capture('story-source');
    await detail.getByRole('button', { name: label(locale, '一覧に戻る', 'Back to the list'), exact: true }).click();
    await summary.waitFor();
    const selected = detail.getByRole('button', {
      name: label(locale, '選んだ記録に戻る', 'Back to selected record'), exact: true,
    });
    if (await selected.isVisible()) {
      await selected.click();
      await detail.locator('[data-detail-back]').first().waitFor({state:width>=1200?'attached':'visible'});
    } else {
      await detail.getByRole('button', { name: label(locale, '閲覧に戻る', 'Back to reading'), exact: true }).click();
      await reading.waitFor();
    }
    return true;
  });
  return { width, image: imageMetrics, horizontalOverflow, steps, screenshots, timelineReturn };
}

async function main() {
  const [operation, origin, ...args] = process.argv.slice(2);
  const [id, rawRevision, locale = 'ja', evaluationDigest] = args;
  const revision = Number(rawRevision);
  if (!origins.has(origin)) throw new Error('Specify the exact Plunode, beta, or localhost:3200 origin.');
  if (operation === 'review' && (!id || !Number.isSafeInteger(revision) || revision < 1 ||
      !['ja', 'en'].includes(locale) || !evaluationDigest?.match(/^[0-9a-f]{64}$/))) {
    throw new Error('review requires origin, theme ID, revision, locale, and the current evaluation digest.');
  }
  if (operation === 'login' && !process.stdin.isTTY) throw new Error('Open login from an interactive terminal.');
  if (!['login', 'review', 'upload-image'].includes(operation)) throw new Error('Use login, review or upload-image.');
  await privateDirectory(privateState);
  const profile = join(privateState, new URL(origin).host.replace(':', '-'));
  await privateDirectory(profile);
  const browser = await chromium.launchPersistentContext(profile, { headless: operation !== 'login', acceptDownloads: false });
  browser.setDefaultTimeout(8000);
  browser.setDefaultNavigationTimeout(25000);

  try {
    if (operation === 'login') {
      const page = browser.pages()[0];
      await page.goto(origin + '/operations', { waitUntil: 'domcontentloaded' });
      const terminal = createInterface({ input: process.stdin, output: process.stdout });
      try {
        await terminal.question('Finish signing in as a Plunode operator, then press Enter. ');
      } finally {
        terminal.close();
      }
      return;
    }

    if (operation === 'upload-image') {
      const [path, metadataPath] = args;
      if (!path || !metadataPath) throw new Error('upload-image requires a local image and its metadata JSON.');
      const source = await lstat(path);
      if (!source.isFile() || source.size > 8 * 1024 * 1024) throw new Error('Choose a regular image file up to 8 MiB.');
      const input = JSON.parse(await readFile(metadataPath, 'utf8'));
      const checked = uploadProductImageSchema.safeParse({ ...input, role: 'illustration', base64: 'cGxhY2U=' });
      if (!checked.success) throw new Error('Invalid image metadata. Check requestId, provenance, and both alt texts.');
      const { base64: _base64, ...metadata } = checked.data;
      void _base64;
      const result = await browser.request.post(origin + '/api/site-operations/products', {
        headers: { Origin: origin }, maxRedirects: 0,
        multipart: { metadata: JSON.stringify(metadata), image: {
          name: basename(path), mimeType: 'application/octet-stream', buffer: await readFile(path),
        } },
      });
      const value = await result.json().catch(() => null);
      if (!result.ok() || typeof value?.imageId !== 'string') {
        const code = /^[A-Z_]+$/.test(value?.error?.code ?? '') ? value!.error.code : 'UNAVAILABLE';
        throw new Error('Image intake failed (HTTP ' + result.status() + ', ' + code + ').');
      }
      console.log(JSON.stringify({ requestId: metadata.requestId, imageId: value.imageId, replayed: value.replayed === true }));
      return;
    }
    const before = await themeSnapshot(browser, origin, id, revision, locale);
    const folder = await mkdtemp(join(privateState, 'evidence-'));
    const url = origin + '/operations/themes/' + encodeURIComponent(id) + '?' + new URLSearchParams({ locale, revision: String(revision) });
    const screens = [];
    for (const viewport of viewports) {
      const page = await browser.newPage();
      await page.setViewportSize(viewport);
      try {
        screens.push(await inspectThemePage(page, url, revision, locale, before.hasImage, folder, viewport.width));
      } catch {
        screens.push({ width: viewport.width, status: 'preview-unverified' });
      } finally {
        await page.close();
      }
    }
    const after = await themeSnapshot(browser, origin, id, revision, locale).catch(() => null);
    const report = {
      origin, themeId: id, revision, locale, requestedEvaluationDigest: evaluationDigest,
      previewDigest: before.digest, snapshotStable: after?.digest === before.digest,
      observedAt: new Date().toISOString(), screens,
      visualReviewRequired: true,
    };
    await writeFile(join(folder, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    console.log(folder);
    if (!report.snapshotStable || screens.some(screen => !('steps' in screen) ||
        screen.horizontalOverflow || Object.values(screen.steps).some(step => step !== 'observed'))) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message.split('\n')[0] : 'Review action failed.');
    process.exitCode = 1;
  });
}
