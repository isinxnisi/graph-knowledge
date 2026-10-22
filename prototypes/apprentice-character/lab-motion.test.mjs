import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../experiments/ai-lab/.runtime/observer/package.json',import.meta.url));
const {chromium}=require('@playwright/test');
const base=process.env.AI_LAB_ORIGIN||'http://127.0.0.1:3268',out='/tmp/plunode-lab-ambient-20261022';
await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true});
try{
 for(const lang of ['ja','en'])for(const width of [1440,390])for(const theme of ['light','dark-blue']){
  if(process.env.AI_LAB_MOTION_CASE&&!process.env.AI_LAB_MOTION_CASE.split(',').includes(lang+'-'+width+'-'+theme))continue;
  const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'no-preference'}),page=await ctx.newPage(),errors=[],writes=[];
  await ctx.addInitScript(theme=>localStorage.setItem('graph-knowledge:appearance:v1',JSON.stringify({theme,palette:theme==='dark-blue'?'blue':'brown'})),theme);
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method())||/8009|kev/i.test(r.url()))writes.push(r.url());});
  await page.goto(base+(lang==='en'?'/en':'/'));await page.getByTestId('lab-entry').click();await page.getByTestId('entry-return').waitFor();
  const stage=page.getByTestId('lab-motion-avatar'),body=stage.locator('.motion-body');
  const moving=async value=>page.waitForFunction(value=>document.querySelector('[data-testid="lab-motion-avatar"]')?.dataset.moving===String(value),value);
  const advances=async()=>{const before=await body.evaluate(el=>el.getAnimations()[0].currentTime);await page.waitForTimeout(150);assert.ok(await body.evaluate(el=>el.getAnimations()[0].currentTime)>before);};
  const frozen=async()=>{const before=await body.evaluate(el=>getComputedStyle(el).transform);await page.waitForTimeout(150);assert.equal(await body.evaluate(el=>getComputedStyle(el).transform),before);};
  await moving(true);await page.waitForFunction(()=>document.querySelector('[data-testid="lab-motion-avatar"] img').naturalWidth>0);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.motion-body').count(),1);
  assert.equal(await page.locator('[data-testid="motion-play"],[data-strength-pick],[data-pick],.lab-motion-controls,.lab-motion-details').count(),0,'lab has no motion controls');
  assert.equal(await stage.getAttribute('data-strength'),'standard');assert.equal(await stage.getAttribute('data-state'),'idle');
  assert.equal(await stage.locator('img').getAttribute('data-artwork'),'profile');assert.equal(await body.evaluate(el=>getComputedStyle(el).animationName),'lab-demo-idle');
  if(lang==='ja'&&width===390)assert.ok(await page.locator('.lab-apprentice-intro h1').evaluate(el=>el.getBoundingClientRect().height<parseFloat(getComputedStyle(el).lineHeight)*1.5));
  assert.match(await page.locator('.lab-stage').textContent(),lang==='en'?/not monitored/:/未監視/);
  assert.ok(await page.locator('.official-ai-avatar').evaluateAll(els=>els.every(e=>!e.closest('.motion-stage')&&e.getAnimations().length===0)));
  assert.deepEqual(await page.locator('.lab-metrics strong').allTextContents(),['5','0','2','0']);assert.equal(await page.locator('.lab-history-row').count(),7);
  const layout=await page.locator('.lab-metrics').boundingBox();await advances();assert.deepEqual(await page.locator('.lab-metrics').boundingBox(),layout);
  await page.locator('.lab-history').scrollIntoViewIfNeeded();await moving(false);await frozen();
  await stage.scrollIntoViewIfNeeded();await moving(true);await advances();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await moving(false);await frozen();
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await moving(true);await advances();
  await page.emulateMedia({reducedMotion:'reduce'});await moving(false);assert.equal(await body.evaluate(el=>getComputedStyle(el).animationName),'none');await frozen();
  if(lang==='ja'&&theme==='light'){await page.reload();await stage.waitFor();await moving(false);assert.equal(await body.evaluate(el=>getComputedStyle(el).animationName),'none');}
  await page.emulateMedia({reducedMotion:'no-preference'});await moving(true);await advances();
  // After live autoplay/stop checks, sample the neutral float's extremes for text clearance.
  const fits=await body.evaluate(el=>{const a=el.getAnimations()[0];a.pause();return [0,.5].every(phase=>{a.currentTime=Number(a.effect.getTiming().duration)*phase;const r=el.getBoundingClientRect(),hero=document.querySelector('#apprentice').getBoundingClientRect(),copy=document.querySelector('.lab-apprentice-intro').getBoundingClientRect();return r.left>=0&&r.right<=copy.left&&r.top>=hero.top&&r.bottom<=hero.bottom;});});
  assert.ok(fits);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByTestId('explorer-apprentice').screenshot({path:out+'/'+lang+'-'+width+'-'+theme+'-hero.png'});
  await page.screenshot({path:out+'/'+lang+'-'+width+'-'+theme+'-page.png',fullPage:true});
  await page.getByRole('button',{name:lang==='en'?'Run history':'実行履歴',exact:true}).click();assert.equal(await page.locator('.lab-run').count(),7);
  await page.getByTestId('motion-entry').click();await page.locator('.motion-scenes').waitFor();await page.waitForFunction(()=>!document.querySelector('[data-testid="motion-play"]').disabled);
  assert.equal(await page.locator('[data-strength-pick]').count(),2);assert.equal(await page.locator('[data-strength-pick="strong"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-pick]').count(),5);assert.equal(await page.getByTestId('motion-play').getAttribute('aria-pressed'),'false');
  assert.ok(await page.locator('.motion-tiny img').evaluateAll(els=>els.every(e=>e.getAnimations().length===0)));
  await page.locator('a[href="/ai-lab#apprentice"]').click();await moving(true);assert.equal(await page.locator('.lab-history-row').count(),7);
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log('PASS',lang,width,theme,'no controls, automatic neutral float, standard, no layout shift, OS/offscreen/hidden stop and auto-resume, static official/tiny, history/comparison');await ctx.close();
 }
}finally{await browser.close();}
