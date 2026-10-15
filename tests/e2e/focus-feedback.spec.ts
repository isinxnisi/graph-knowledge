import { test, expect, type Page, type Locator } from "@playwright/test";
import type { Core } from "cytoscape";
const pluto = "2b7c6289-d050-4dc0-93e3-9307681253cc";
const outline = (el: Locator) => el.evaluate(el => ({ width: getComputedStyle(el).outlineWidth, style: getComputedStyle(el).outlineStyle }));
const view = (page: Page) => page.getByTestId("graph-canvas").evaluate(el => {
  const cy = (el as unknown as { _cyreg?: { cy: Core } })._cyreg?.cy;
  return cy ? { points: Object.fromEntries(cy.nodes().map(n=>[n.id(),n.position()])), edges:cy.edges().map(e=>e.id()).sort(), zoom:cy.zoom() } : {points:{},edges:[],zoom:0};
});
for (const [width, height] of [[320,568],[390,844]]) test(`${width}px タッチの検索・Graph・詳細・モーダル復帰とキーボードの可視フォーカス`, async ({ browser }, info) => {
  const context=await browser.newContext({ viewport:{width,height},isMobile:true,hasTouch:true });
  await context.addInitScript(()=>localStorage.setItem("plunode:privacy:v1",'{"analytics":false,"ads":false}'));
  const page=await context.newPage(); await page.goto(info.project.use.baseURL! + "/");
  const nav=page.getByRole("navigation",{name:"探索画面の切り替え"});
  await nav.getByRole("button",{name:"検索",exact:true}).tap();
  await page.getByLabel("名前・別名",{exact:true}).tap(); await page.keyboard.type("PLUTO");
  await nav.getByRole("button",{name:"Home",exact:true}).tap();
  await expect(page.locator("#explorer-graph")).toBeFocused(); expect((await outline(page.locator("#explorer-graph"))).style).toBe("none");
  await nav.getByRole("button",{name:"検索",exact:true}).tap();
  await expect(page.locator("#explorer-search")).toBeFocused(); expect((await outline(page.locator("#explorer-search"))).style).toBe("none");
  await page.getByRole("button",{name:"PLUTOから探索を開始",exact:true}).tap();
  await expect.poll(async()=>Object.keys((await view(page)).points).length).toBe(4);
  await nav.getByRole("button",{name:"選択の詳細",exact:true}).tap();
  await expect(page.locator("#explorer-detail")).toBeFocused(); expect((await outline(page.locator("#explorer-detail"))).style).toBe("none");
  const overview=page.getByRole("button",{name:"関係概要を見る",exact:true});
  const before=await view(page); await overview.tap(); const dialog=page.getByRole("dialog"); await expect(dialog).toBeVisible();
  await dialog.getByRole("button",{name:"閉じる",exact:true}).tap(); await expect(dialog).toHaveCount(0);
  await expect(overview).toBeFocused(); expect(await view(page)).toEqual(before);
  // Keyboard activation keeps focus inside the native modal and restores it visibly.
  await page.keyboard.press("Enter"); await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(overview).toBeFocused();
  expect(Number.parseFloat((await outline(overview)).width)).toBeGreaterThan(0);
  const search=nav.getByRole("button",{name:"検索",exact:true}); await search.focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#explorer-search")).toBeFocused(); expect(Number.parseFloat((await outline(page.locator("#explorer-search"))).width)).toBeGreaterThan(0);
  await page.keyboard.press("Tab"); await expect(page.getByLabel("名前・別名",{exact:true})).toBeFocused();
  expect(Number.parseFloat((await outline(page.getByLabel("名前・別名",{exact:true}))).width)).toBeGreaterThan(0);
  // Capsule modal explicitly focuses a reading heading; touch must not outline it.
  await page.getByRole("button",{name:"Capsuleを作る・読む",exact:true}).tap(); await expect(dialog).toBeVisible();
  const broad=dialog.locator('[data-focus-destination]:focus'); if(await broad.count()) expect((await outline(broad)).style).toBe("none");
  await dialog.getByRole("button",{name:"探索へ戻る",exact:true}).tap(); await expect(dialog).toHaveCount(0);
  await page.screenshot({path:info.outputPath(`focus-${width}.png`)}); await context.close();
});
for(const width of [1440,390,320]) test(`${width}px URL復元成功は下端の短い一時通知で、選択と配置を維持する`, async({browser},info)=>{
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<800,hasTouch:width<800});
  await context.addInitScript(()=>localStorage.setItem("plunode:privacy:v1",'{"analytics":false,"ads":false}'));
  const page=await context.newPage(); await page.goto(info.project.use.baseURL!+`/explore/${pluto}`);
  const notice=page.getByTestId("graph-notice"); await expect(notice).toHaveText("探索を復元しました。");
  await expect.poll(async()=>Object.keys((await view(page)).points).length).toBe(4);
  const canvas=await page.getByTestId("graph-canvas").boundingBox(), toast=await notice.boundingBox();
  expect(toast!.height).toBeLessThanOrEqual(32); expect(toast!.y).toBeGreaterThan(canvas!.y+canvas!.height/2);
  expect(toast!.y+toast!.height).toBeLessThanOrEqual(canvas!.y+canvas!.height);
  await expect(page.getByTestId("graph-overlay")).not.toContainText("探索を復元しました");
  const selection=await page.getByTestId("selection-status").textContent(), before=await view(page);
  await expect(notice).toHaveCount(0,{timeout:6000}); expect(await view(page)).toEqual(before); expect(await page.getByTestId("selection-status").textContent()).toBe(selection);
  await expect(page).toHaveURL(/\?s=/);
  if(width<800){
    const panes=page.getByRole("navigation",{name:"探索画面の切り替え"});
    await panes.getByRole("button",{name:"検索",exact:true}).tap(); await panes.getByRole("button",{name:"Graph",exact:true}).tap();
    await expect(page.locator("#explorer-graph")).toBeFocused(); expect((await outline(page.locator("#explorer-graph"))).style).toBe("none");
  }
  await page.reload(); await expect(page.getByTestId("graph-notice")).toHaveText("探索を復元しました。");
  await expect.poll(async()=>Object.keys((await view(page)).points).length).toBe(4);
  expect(await page.locator('[data-focus-destination]:focus').count()).toBe(0);
  await page.screenshot({path:info.outputPath(`notice-${width}.png`)});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width); await context.close();
});
test("不正な探索URLは復元失敗と再試行を残し、成功通知を出さない",async({page},info)=>{
  await page.setViewportSize({width:320,height:568}); await page.goto(info.project.use.baseURL!+`/explore/${pluto}?s=invalid`);
  const alert=page.getByRole("alert").filter({hasText:"探索URLの状態が無効"}); await expect(alert).toBeVisible();
  await expect(page.getByTestId("graph-notice")).toHaveCount(0); await page.waitForTimeout(4000);
  await expect(alert).toBeVisible(); await expect(page.getByRole("button",{name:"再試行",exact:true})).toBeVisible();
});
test("短い会員ページはフッターを下端へ、長い本文は自然な末尾へ置く",async({browser},info)=>{
  for(const width of [1440,390,320]){
    const context=await browser.newContext({viewport:{width,height:900},isMobile:width<800,hasTouch:width<800});
    await context.route("**/api/member/profile",r=>r.fulfill({json:{user:{id:"10000000-0000-4000-8000-000000000001",name:"表示確認",locale:"ja"}}}));
    await context.route("**/api/member/capsules",r=>r.fulfill({json:{capsules:[]}}));
    await context.route("**/api/member/status",r=>r.fulfill({json:{provider:"google"}}));
    const page=await context.newPage(); await page.goto(info.project.use.baseURL!+"/member");
    await expect(page.getByRole("heading",{name:"保存したCapsule",exact:true})).toBeVisible();
    expect((await outline(page.getByRole("heading",{level:1}))).style).toBe("none");
    expect((await page.locator("main").boundingBox())!.width).toBe(Math.min(width,1080));
    const footer=page.getByTestId("site-footer"); expect(await footer.evaluate(el=>Math.abs(el.getBoundingClientRect().bottom-innerHeight))).toBeLessThan(2);
    const settings=page.locator("main").getByRole("link",{name:"アカウント設定",exact:true});
    if(width<800)await settings.tap();else await settings.click();
    await expect(page.getByRole("heading",{level:1})).toBeFocused(); expect((await outline(page.getByRole("heading",{level:1}))).style).toBe("none");
    await page.screenshot({path:info.outputPath(`footer-member-${width}.png`),fullPage:true});
    await page.goto(info.project.use.baseURL!+"/privacy");
    expect((await footer.boundingBox())!.y).toBeGreaterThanOrEqual((await page.locator("main").boundingBox())!.y+(await page.locator("main").boundingBox())!.height-1);
    expect(await footer.evaluate(el=>getComputedStyle(el).position)).toBe("static");
    await context.close();
  }
});
