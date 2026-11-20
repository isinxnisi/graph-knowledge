import { chromium } from '@playwright/test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { inspectThemePage } from '../scripts/review-theme-browser';

const fixture = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<nav aria-label="運営者プレビュー"><span>運営者プレビュー · 作業版 14</span></nav>
<section aria-label="テーマを読む">
<h2>検証テーマ</h2>
<button aria-label="テーマ画像を拡大" onclick="document.querySelector('dialog').showModal()">
<img style="width:80px;height:80px;object-fit:cover;object-position:center" src="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='120'%20height='60'/%3E">
</button>
<button onclick="area('story')">このテーマについて</button>
<div data-timeline-row-id="one"><button aria-pressed="false" onclick="area('timelineDetail')">出来事</button></div>
</section>
<div id="story" hidden><button onclick="area('reading')">閲覧に戻る</button>
<section><h3>エピソード・豆知識</h3><details><summary>Story</summary>
<button data-detail-record="s1" onclick="area('storyDetail')">出典・詳細</button></details></section></div>
<article id="timelineDetail" hidden><button data-detail-back onclick="area('reading')">年表・図に戻る</button>
<button data-evidence-toggle aria-expanded="false" onclick="this.setAttribute('aria-expanded','true')">引用</button></article>
<article id="storyDetail" hidden><button data-detail-back onclick="area('story')">一覧に戻る</button>
<button data-evidence-toggle aria-expanded="false" onclick="this.setAttribute('aria-expanded','true')">引用</button></article>
<dialog aria-label="テーマ画像"><img src="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='120'%20height='60'/%3E">
<button onclick="this.parentElement.close()">閉じる</button></dialog>
<script>function area(name) {
  for (const id of ['timelineDetail','story','storyDetail']) document.getElementById(id).hidden=id!==name;
  document.querySelector('section[aria-label]').hidden=name!=='reading';
}</script>`;

it('captures an exact private preview and exercises image, timeline, Story, sources and return at both viewport widths', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'plunode-review-test-'));
  const browser = await chromium.launch();
  const url = 'https://plunode.net/operations/themes/theme%3Afixture?locale=ja&revision=14';
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      page.setDefaultTimeout(2000);
      await page.route(url, route => route.fulfill({ contentType: 'text/html', body: fixture }));
      const evidence = await inspectThemePage(page, url, 14, 'ja', true, folder, width);
      expect(evidence.steps).toEqual({ imageDialog: 'observed', timelineSourceAndBack: 'observed', storySourceAndBack: 'observed' });
      expect(evidence.image).toMatchObject({ naturalWidth: 120, naturalHeight: 60, width: 80, height: 80, objectFit: 'cover' });
      expect(evidence.horizontalOverflow).toBe(false);
      await expect(inspectThemePage(page, url, 1, 'ja', true, folder, width)).rejects.toThrow();
      await page.close();
    }
    expect((await readdir(folder)).length).toBe(8);
  } finally {
    await browser.close();
    await rm(folder, { recursive: true, force: true });
  }
}, 30_000);
