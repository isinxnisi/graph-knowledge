import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../experiments/ai-lab/.runtime/observer/package.json',import.meta.url));
const {chromium}=require('@playwright/test');
const base=process.env.AI_LAB_ORIGIN||'http://127.0.0.1:3268',out='/tmp/plunode-lab-motion-20261022';
await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true});
try{
 for(const lang of ['ja','en'])for(const width of [1440,390])for(const theme of ['light','dark-blue']){
  if(process.env.AI_LAB_MOTION_CASE&&!process.env.AI_LAB_MOTION_CASE.split(',').includes(lang+'-'+width+'-'+theme))continue;
  const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'no-preference'}),page=await ctx.newPage(),errors=[],writes=[];
  await ctx.addInitScript(theme=>localStorage.setItem('graph-knowledge:appearance:v1',JSON.stringify({theme,palette:theme==='dark-blue'?'blue':'brown'})),theme);
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method())||/8009|kev/i.test(r.url()))writes.push(r.url());});
  await page.goto(base+(lang==='en'?'/en':'/'));await page.getByTestId('lab-entry').click();await page.getByTestId('entry-return').waitFor();
  const stage=page.getByTestId('lab-motion-avatar'),body=stage.locator('.motion-body'),play=page.getByTestId('motion-play');
  await page.waitForFunction(()=>!document.querySelector('[data-testid="motion-play"]').disabled);
  await page.waitForFunction(()=>document.querySelector('[data-testid="lab-motion-avatar"] img').naturalWidth>0);
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.motion-body').count(),1,'only apprentice hero moves');
  assert.equal(await stage.getAttribute('data-strength'),'standard');assert.equal(await stage.getAttribute('data-moving'),'false');
  assert.equal(await page.locator('[data-strength-pick]').count(),2);assert.equal(await page.locator('[data-strength-pick="weak"]').count(),0);
  assert.equal(await stage.locator('img').getAttribute('data-artwork'),'profile');
  if(lang==='ja'&&width===390)assert.ok(await page.locator('.lab-apprentice-intro h1').evaluate(el=>el.getBoundingClientRect().height<parseFloat(getComputedStyle(el).lineHeight)*1.5),'Japanese title stays together');
  assert.ok(await page.locator('.official-ai-avatar').evaluateAll(els=>els.every(e=>!e.closest('.motion-stage')&&e.getAnimations().length===0)));
  assert.deepEqual(await page.locator('.lab-metrics strong').allTextContents(),['5','0','2','0']);assert.equal(await page.locator('.lab-history-row').count(),7);
  await play.focus();await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('[data-testid="lab-motion-avatar"]').dataset.moving==='true');
  const start=await body.evaluate(el=>el.getAnimations()[0].currentTime),layout=await page.locator('.lab-metrics').boundingBox();await page.waitForTimeout(150);
  assert.ok(await body.evaluate(el=>el.getAnimations()[0].currentTime)>start);assert.deepEqual(await page.locator('.lab-metrics').boundingBox(),layout,'motion does not shift content');
  await play.click();const paused=await body.evaluate(el=>getComputedStyle(el).transform);await page.waitForTimeout(150);assert.equal(await body.evaluate(el=>getComputedStyle(el).transform),paused);
  await play.click();await page.locator('.lab-history').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('[data-testid="lab-motion-avatar"]').dataset.moving==='false');
  await stage.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('[data-testid="lab-motion-avatar"]').dataset.moving==='true');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>document.querySelector('[data-testid="lab-motion-avatar"]').dataset.moving==='false');
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('[data-testid="motion-play"]').disabled);assert.equal(await body.evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>!document.querySelector('[data-testid="motion-play"]').disabled);assert.equal(await play.getAttribute('aria-pressed'),'false');
  await page.locator('.lab-motion-details summary').click();assert.match(await page.getByRole('status').textContent(),/DEMO/);
  const sample=()=>body.evaluate(el=>{const a=el.getAnimations()[0];a.pause();const duration=Number(a.effect.getTiming().duration);return [0,.18,.38,.5,.6,.8].map(phase=>{a.currentTime=duration*phase;const m=new DOMMatrixReadOnly(getComputedStyle(el).transform),image=el.getBoundingClientRect(),hero=document.querySelector('#apprentice').getBoundingClientRect(),copy=document.querySelector('.lab-apprentice-intro').getBoundingClientRect(),controls=document.querySelector('.lab-motion-controls').getBoundingClientRect();return {y:m.m42,fits:image.left>=0&&image.right<=copy.left&&image.top>=hero.top&&image.bottom<controls.top};});});
  const amplitudes=[];
  for(const strength of ['standard','strong']){
   await page.locator('[data-strength-pick="'+strength+'"]').click();
   for(const state of ['idle','search','found','hold','rest']){await page.locator('[data-pick="'+state+'"]').click();assert.equal(await stage.getAttribute('data-state'),state);assert.ok((await sample()).every(s=>s.fits),strength+' '+state+' stays clear of text');}
   await page.locator('[data-pick="idle"]').click();const rows=await sample();amplitudes.push(Math.max(...rows.map(r=>r.y))-Math.min(...rows.map(r=>r.y)));
  }
  assert.ok(amplitudes[1]>amplitudes[0]);
  await page.locator('input[type="checkbox"]').check();const rows=await sample();assert.ok(Math.max(...rows.map(r=>r.y))-Math.min(...rows.map(r=>r.y))<amplitudes[0]);
  await page.locator('input[type="checkbox"]').uncheck();
  for(const strength of ['standard','strong']){
   await page.locator('[data-strength-pick="'+strength+'"]').click();await page.locator('[data-pick="found"]').click();await body.evaluate(el=>{const a=el.getAnimations()[0];a.pause();a.currentTime=Number(a.effect.getTiming().duration)*.18;});
   await page.locator('.lab-motion-details summary').click();await page.getByTestId('explorer-apprentice').screenshot({path:out+'/'+lang+'-'+width+'-'+theme+'-'+strength+'.png'});await page.locator('.lab-motion-details summary').click();
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('.lab-motion-details summary').click();await page.screenshot({path:out+'/'+lang+'-'+width+'-'+theme+'-page.png',fullPage:true});
  await page.getByRole('button',{name:lang==='en'?'Run history':'実行履歴',exact:true}).click();assert.equal(await page.locator('.lab-run').count(),7);
  await page.getByTestId('motion-entry').click();await page.locator('.motion-scenes').waitFor();await page.waitForFunction(()=>!document.querySelector('[data-testid="motion-play"]').disabled);
  assert.equal(await page.locator('[data-strength-pick]').count(),2);assert.equal(await page.locator('[data-strength-pick="strong"]').getAttribute('aria-pressed'),'true');
  assert.ok(await page.locator('.motion-tiny img').evaluateAll(els=>els.every(e=>e.getAnimations().length===0)));
  await page.locator('a[href="/ai-lab#apprentice"]').click();await page.getByTestId('entry-return').waitFor();assert.equal(await page.locator('.lab-history-row').count(),7);
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log('PASS',lang,width,theme,'hero only, 2 strengths, 5 DEMO states, text clearance, no layout shift, stop/reduce/offscreen, static official/tiny, history and comparison');await ctx.close();
 }
}finally{await browser.close();}
