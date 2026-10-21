import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../experiments/ai-lab/.runtime/observer/package.json',import.meta.url));
const {chromium}=require('@playwright/test');
const base=process.env.AI_LAB_ORIGIN||'http://127.0.0.1:3268',out='/tmp/plunode-motion-20261022';
await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true});
try{
 for(const lang of ['ja','en'])for(const width of [1440,390])for(const theme of ['light','dark-blue']){
  const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'no-preference'}),page=await ctx.newPage(),errors=[],writes=[],kev=[];
  await ctx.addInitScript(theme=>localStorage.setItem('graph-knowledge:appearance:v1',JSON.stringify({theme,palette:theme==='dark-blue'?'blue':'brown'})),theme);
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.url());if(/8009|kev/i.test(r.url()))kev.push(r.url());});
  await page.goto(base+(lang==='en'?'/en':'/'));await page.getByTestId('lab-entry').click();await page.getByTestId('entry-return').waitFor();
  assert.deepEqual(await page.locator('.lab-metrics strong').allTextContents(),['5','0','2','0']);assert.equal(await page.locator('.lab-history-row').count(),7);
  assert.ok(await page.locator('.official-ai-avatar').evaluateAll(els=>els.every(e=>e.getAnimations().length===0)));
  await page.getByTestId('motion-entry').click();
  const play=page.getByTestId('motion-play');await play.waitFor();await page.waitForFunction(()=>!document.querySelector('[data-testid="motion-play"]').disabled);
  await page.waitForFunction(()=>[...document.querySelectorAll('.apprentice-avatar')].every(i=>i.complete&&i.naturalWidth>0));
  const stage=page.locator('.motion-stage').first(),body=stage.locator('.motion-png').first();
  assert.equal(await stage.getAttribute('data-moving'),'false');assert.equal(await play.getAttribute('aria-pressed'),'false');
  // Keyboard activation and visible focus are native button behavior, not pointer-only controls.
  await page.locator('[data-pick="search"]').focus();await page.keyboard.press('Space');assert.equal(await page.locator('[data-pick="search"]').getAttribute('aria-pressed'),'true');
  await play.focus();await page.keyboard.press('Space');await stage.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('.motion-stage').dataset.moving==='true');
  for(const state of ['idle','search','found','hold','rest']){
   await page.locator('[data-pick="'+state+'"]').click();await stage.scrollIntoViewIfNeeded();
   assert.equal(await stage.getAttribute('data-state'),state);assert.match(await page.getByRole('status').textContent(),/DEMO/);
   const before=await body.evaluate(el=>getComputedStyle(el).transform);await page.waitForTimeout(100);const after=await body.evaluate(el=>getComputedStyle(el).transform);assert.notEqual(after,before,state+' floats');
   assert.ok(await stage.locator('.motion-antenna,.motion-upper,.motion-tip').evaluateAll(els=>els.every(e=>e.getAnimations().length===1)));
   assert.ok(await stage.locator('[data-fixed-eyes],.motion-tiny img').evaluateAll(els=>els.every(e=>e.getAnimations().length===0&&getComputedStyle(e).transform==='none')));
  }
  await page.locator('input[type="checkbox"]').check();assert.equal(await stage.getAttribute('data-quiet'),'true');
  assert.equal(await stage.evaluate(el=>getComputedStyle(el).getPropertyValue('--strength').trim()),'.4');
  await play.click();await stage.scrollIntoViewIfNeeded();const paused=await body.evaluate(el=>getComputedStyle(el).transform);await page.waitForTimeout(150);assert.equal(await body.evaluate(el=>getComputedStyle(el).transform),paused);
  await play.click();await stage.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('.motion-stage').dataset.moving==='true');
  // A deterministic visibilitychange simulation tests the hidden-document branch.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>[...document.querySelectorAll('.motion-stage')].every(e=>e.dataset.moving==='false'));
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  if(width===390){await page.locator('.motion-materials').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('.motion-stage').dataset.moving==='false');}
  await page.emulateMedia({reducedMotion:'reduce'});await stage.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('[data-testid="motion-play"]').disabled);
  assert.ok(await page.locator('.motion-body,.motion-antenna,.motion-upper,.motion-tip').evaluateAll(els=>els.every(e=>getComputedStyle(e).animationName==='none')));
  await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>!document.querySelector('[data-testid="motion-play"]').disabled);assert.equal(await play.getAttribute('aria-pressed'),'false');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:out+'/'+lang+'-'+width+'-'+theme+'.png',fullPage:true});
  await page.locator('a[href="/ai-lab#apprentice"]').click();await page.getByTestId('explorer-apprentice').waitFor();assert.equal(await page.locator('.lab-history-row').count(),7);
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(kev,[]);
  console.log('PASS',lang,width,theme,'5 states, keyboard, play/stop, quiet, reduced motion, visibility, fixed eyes/tiny, records and return');await ctx.close();
 }
}finally{await browser.close();}
