import {chromium,webkit} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.AI_LAB_ORIGIN||'http://127.0.0.1:3269',hostBase=process.env.AI_LAB_HOST_ORIGIN||base,engine=process.env.LAB_BROWSER||'chromium',out=process.env.AI_LAB_SCREENSHOTS||'/tmp/plunode-issue36-'+engine;
const expectedInference=Number(process.env.LAB_EXPECT_INFERENCE||0),expectedRuns=Number(process.env.LAB_EXPECT_RUNS||7),expectedTraining=Number(process.env.LAB_EXPECT_TRAINING||0),expectedKev=Number(process.env.LAB_EXPECT_KEV||expectedInference);
await mkdir(out,{recursive:true});
const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='webkit'&&process.env.LAB_WEBKIT_EXECUTABLE?{executablePath:process.env.LAB_WEBKIT_EXECUTABLE}:{})});
const root='2b7c6289-d050-4dc0-93e3-9307681253cc';
try{
 for(const lang of ['ja','en'])for(const width of [1440,390])for(const theme of ['light','dark-blue']){
  const cases=process.env.LAB_CASES||process.env.LAB_CASE;if(cases&&!cases.split(',').includes(`${lang}-${width}-${theme}`))continue;
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'no-preference',hasTouch:width<500}),page=await context.newPage(),errors=[],modelCalls=[],writes=[];
  await context.addInitScript(theme=>{if(window.top===window)localStorage.setItem('graph-knowledge:appearance:v1',JSON.stringify({theme,palette:theme==='dark-blue'?'blue':'brown'}));},theme);
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/8009|systemone|kev/i.test(r.url()))modelCalls.push(r.url());const url=new URL(r.url());if(!['GET','HEAD'].includes(r.method())&&!(url.origin===new URL(base).origin&&url.pathname==='/cdn-cgi/rum'))writes.push(r.url());});
  const local=url=>(lang==='en'?'/en':'')+url;
  const menuLink=async id=>{const link=page.getByTestId(id);if(!await link.isVisible())await page.getByLabel(lang==='en'?'Site menu':'サイトメニュー',{exact:true}).click();await link.click();};
  await page.goto(base+local(''));await menuLink('lab-entry');await page.getByRole('heading',{level:1,name:lang==='en'?'AI Lab':'AI育成ラボ',exact:true}).waitFor();assert.equal(await page.getByTestId('entry-return').count(),0);assert.equal(await page.getByTestId('lab-entry').locator('svg').count(),1);
  assert.equal(new URL(page.url()).pathname,local('/ai-lab'));
  await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);
  const avatar=page.getByTestId('lab-motion-avatar'),image=avatar.locator('img');
  const moving=value=>page.waitForFunction(value=>document.querySelector('[data-testid="lab-motion-avatar"]')?.dataset.moving===String(value),value);
  const frozen=async()=>{const transform=await image.evaluate(el=>getComputedStyle(el).transform);await page.waitForTimeout(150);assert.equal(await image.evaluate(el=>getComputedStyle(el).transform),transform);};
  const advances=async()=>{const before=await image.evaluate(el=>el.getAnimations()[0].currentTime);await page.waitForTimeout(150);assert.ok(await image.evaluate(el=>el.getAnimations()[0].currentTime)>before);};
  await moving(true);await page.waitForFunction(()=>document.querySelector('[data-testid="lab-motion-avatar"] img').naturalWidth>0);await page.evaluate(()=>document.fonts.ready);await advances();
  assert.equal(await page.getByTestId('inference-count').textContent(),String(expectedInference));assert.equal(await page.getByTestId('training-count').textContent(),String(expectedTraining));
  assert.equal(await page.getByTestId('lab-run').count(),expectedRuns);assert.equal(await avatar.getAttribute('data-strength'),'standard');
  assert.equal(await page.locator('[data-testid="motion-play"],[data-strength-pick],.official-ai-avatar').count(),0);
  assert.doesNotMatch(await page.locator('[data-ai-lab]').innerText(),/DEMO|仮配置|隔離確認|isolated preview/i);
  assert.match(await page.locator('[data-ai-lab]').innerText(),lang==='en'?/not monitored/:/未監視/);
  const before=await page.locator('[data-testid="inference-count"]').boundingBox();await advances();assert.deepEqual(await page.locator('[data-testid="inference-count"]').boundingBox(),before);
  await page.locator('[data-ai-lab] > footer').scrollIntoViewIfNeeded();await moving(false);await frozen();await avatar.scrollIntoViewIfNeeded();await moving(true);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await moving(false);await frozen();
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await moving(true);
  await page.emulateMedia({reducedMotion:'reduce'});await moving(false);assert.equal(await image.evaluate(el=>getComputedStyle(el).animationName),'none');await frozen();
  await page.reload();await moving(false);assert.equal(await image.evaluate(el=>getComputedStyle(el).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});await moving(true);await advances();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  // Freeze only for a repeatable screenshot, after exercising the live stop conditions.
  await image.evaluate(el=>{const animation=el.getAnimations()[0];animation.pause();animation.currentTime=1800;});
  await page.screenshot({path:`${out}/${lang}-${width}-${theme}.png`,fullPage:true});
  await page.locator('[data-ai-lab] select').selectOption('inference');assert.equal(await page.getByTestId('lab-run').count(),expectedKev);
  if(expectedInference){await page.getByTestId('lab-run').filter({has:page.locator('time')}).last().click();assert.match(await page.locator('#records article').innerText(),/74℃/);assert.match(await page.locator('#records article').innerText(),/71.31/);await page.screenshot({path:`${out}/${lang}-${width}-${theme}-inference.png`,fullPage:true});const actualRecord=page.url();await page.locator('#records article a[href*="read=claim"]').click();await page.getByRole('dialog').getByTestId('lab-record-return').click();assert.equal(page.url(),actualRecord);}
  if(expectedTraining){
   assert.equal(await page.getByTestId('education-cycle').count(),3);
   await page.getByTestId('education-cycle').first().click();
   const education=page.getByTestId('education-detail');await education.getByRole('heading',{name:lang==='en'?'Holdout comparison':'holdoutの比較',exact:true}).waitFor();
   assert.match(await education.innerText(),/STOP/);assert.match(await education.innerText(),/C0/);assert.match(await education.innerText(),/Carlo Rubbia/);
   const cycleUrl=page.url();await page.screenshot({path:`${out}/${lang}-${width}-${theme}-education.png`,fullPage:true});
   await education.locator('a[href*="read=claim"]').first().click();await page.getByRole('dialog').getByTestId('lab-record-return').click();assert.equal(page.url(),cycleUrl);
   await education.locator('a[href*="/explore/"]').first().click();await page.getByTestId('graph-canvas').waitFor();await menuLink('lab-record-return');assert.equal(page.url(),cycleUrl);
   await education.getByRole('heading',{name:lang==='en'?'Holdout comparison':'holdoutの比較',exact:true}).waitFor();assert.match(await education.innerText(),/STOP/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await page.getByRole('button',{name:/purpose-role-v1/}).click();assert.equal(await page.getByTestId('lab-run').count(),5);
  const record=page.url();await page.locator('#records article a[href*="read=claim"]').click();
  const dialog=page.getByRole('dialog');await dialog.getByTestId('lab-record-return').waitFor();await dialog.getByTestId('lab-record-return').click();assert.equal(page.url(),record);
  await page.locator('#records article a[href*="/explore/"]').click();await page.getByTestId('graph-canvas').waitFor();await menuLink('lab-record-return');assert.equal(page.url(),record);
  await page.getByRole('link',{name:lang==='en'?'Plunode Home':'Plunode ホーム',exact:true}).click();await page.waitForURL(url=>url.pathname===(local('')||'/'));
  if(theme==='light'){
   await page.goto(base+local('/explore/'+root));const graph=page.getByTestId('graph-canvas');await graph.waitFor();
   await page.waitForFunction(()=>document.querySelector('[data-testid="graph-canvas"]')?._cyreg?.cy.nodes().length>0);await page.waitForTimeout(700);
   const state=()=>graph.evaluate(el=>{const c=el._cyreg.cy;return {ids:c.nodes().map(n=>n.id()).sort(),positions:Object.fromEntries(c.nodes().map(n=>[n.id(),n.position()])),pan:c.pan(),zoom:c.zoom()};});
   await graph.evaluate(el=>{const c=el._cyreg.cy;c.nodes().first().shift({x:30,y:-20});c.zoom(.8);c.pan({x:45,y:60});c.emit('dragfree');});await page.waitForTimeout(700);
   const graphBefore=await state();await menuLink('lab-entry');await page.getByLabel(lang==='en'?'Site menu':'サイトメニュー',{exact:true}).click();await page.getByRole('link',{name:lang==='en'?'Back to your exploration':'元の探索へ戻る',exact:true}).click();await graph.waitFor();await page.waitForFunction(()=>document.querySelector('[data-testid="graph-canvas"]')?._cyreg?.cy.nodes().length>0);await page.waitForTimeout(700);
   const after=await state();assert.deepEqual(after.ids,graphBefore.ids);assert.deepEqual(after.positions,graphBefore.positions);assert.ok(Math.abs(after.zoom-graphBefore.zoom)<.01);assert.ok(Math.abs(after.pan.x-graphBefore.pan.x)<2&&Math.abs(after.pan.y-graphBefore.pan.y)<2);
   await page.goto(base+'/member');await menuLink('lab-entry');await page.getByLabel(lang==='en'?'Account menu':'アカウントメニュー',{exact:true}).click();await page.getByRole('link',{name:lang==='en'?'Sign in / Account':'ログイン・アカウント',exact:true}).click();await page.waitForURL(url=>url.pathname==='/member');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(modelCalls,[]);assert.deepEqual(writes,[]);
  console.log('PASS',engine,lang,width,theme,`inference${expectedInference}, autoplay/stop/resume, no demo/control UI, history/evidence/Graph/account return`);await context.close();
 }
 const page=await browser.newPage();const response=await page.goto(base+'/ai-lab#apprentice');const title=page.getByRole('heading',{level:1,name:'AI育成ラボ',exact:true});await title.waitFor();assert.ok((await title.boundingBox()).y>=0);assert.equal(response.status(),200);assert.match(response.headers()['content-security-policy'],/connect-src 'self'/);assert.match(response.headers()['x-robots-tag'],/noindex/);
 for(const route of ['/api/ai-lab/run','/api/ai-lab/train','/.env.public','/.runtime/runs','/data/ai-lab/initial.json','/ai-apprentice-motion-study','/ai-character-study','/ai-apprentice-study','/en/ai-apprentice-motion-study'])assert.equal((await page.request.get(base+route)).status(),404,route);
 assert.equal((await page.request.post(base+'/api/ai-lab',{data:{}})).status(),405);
 assert.equal((await page.request.get(base+'/api/ai-lab?file=private')).status(),400);
 for(const host of ['untrusted.example','plunode.net.invalid','ads.plunode.net'])assert.equal((await page.request.get(hostBase+'/ai-lab',{headers:{Host:host,'X-Forwarded-Host':'plunode.net'}})).status(),404);
 console.log('PASS',engine,'Host/CSP, read-only artifact, no private files or development routes');
}finally{await browser.close();}
