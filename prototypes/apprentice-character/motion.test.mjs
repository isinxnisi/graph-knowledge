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
  assert.equal(await page.locator('[data-strength-pick="strong"]').getAttribute('aria-pressed'),'true');
  // Keyboard activation and visible focus are native button behavior, not pointer-only controls.
  await page.locator('[data-pick="search"]').focus();await page.keyboard.press('Space');assert.equal(await page.locator('[data-pick="search"]').getAttribute('aria-pressed'),'true');
  await play.focus();await page.keyboard.press('Space');await stage.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('.motion-stage').dataset.moving==='true');
  for(const state of ['idle','search','found','hold','rest']){
   await page.locator('[data-pick="'+state+'"]').click();await stage.scrollIntoViewIfNeeded();
   assert.equal(await stage.getAttribute('data-state'),state);assert.match(await page.getByRole('status').textContent(),/DEMO/);
   const before=await body.evaluate(el=>el.getAnimations()[0].currentTime);await page.waitForTimeout(100);const after=await body.evaluate(el=>el.getAnimations()[0].currentTime);assert.ok(after>before,state+' advances');
   assert.ok(await stage.locator('.motion-antenna,.motion-upper,.motion-tip').evaluateAll(els=>els.every(e=>e.getAnimations().length===1)));
   assert.ok(await stage.locator('[data-fixed-eyes],.motion-tiny img').evaluateAll(els=>els.every(e=>e.getAnimations().length===0&&getComputedStyle(e).transform==='none')));
  }
  // Sample the actual rendered trajectories at known phases, independent of wall-clock timing.
  const trajectory=()=>body.evaluate(el=>{const a=el.getAnimations()[0],time=a.currentTime,running=a.playState==='running';a.pause();const duration=Number(a.effect.getTiming().duration);const rows=[0,.18,.32,.38,.46,.48,.5,.6,.65,.8].map(p=>{a.currentTime=duration*p;const m=new DOMMatrixReadOnly(getComputedStyle(el).transform);return {x:m.m41,y:m.m42,angle:Math.atan2(m.m12,m.m11)*180/Math.PI};});a.currentTime=time;if(running)a.play();return rows;});
  const range=(rows,key)=>Math.max(...rows.map(r=>r[key]))-Math.min(...rows.map(r=>r[key]));
  const patterns={};for(const state of ['idle','search','found','hold','rest']){await page.locator('[data-pick="'+state+'"]').click();patterns[state]=await trajectory();}
  assert.ok(range(patterns.idle,'y')>24);assert.ok(range(patterns.search,'x')>20);assert.ok(range(patterns.found,'y')>40);assert.ok(range(patterns.hold,'angle')>15);assert.ok(patterns.rest.every(r=>r.angle>10));
  await page.locator('[data-pick="idle"]').click();const amplitudes=[];
  for(const strength of ['weak','standard','strong']){await page.locator('[data-strength-pick="'+strength+'"]').click();assert.equal(await stage.getAttribute('data-strength'),strength);amplitudes.push(range(await trajectory(),'y'));}
  assert.ok(amplitudes[0]<amplitudes[1]&&amplitudes[1]<amplitudes[2],'intensity increases rendered displacement');
  await page.locator('input[type="checkbox"]').check();assert.equal(await stage.getAttribute('data-quiet'),'true');
  assert.ok(range(await trajectory(),'y')<amplitudes[2]*.5,'quiet mode further reduces strong motion');
  // WAAPI play()/pause() used for sampling override CSS play-state. Reload to test
  // native UI stopping with untouched animations, as a user actually sees them.
  await page.reload();await page.waitForFunction(()=>!document.querySelector('[data-testid="motion-play"]').disabled);
  await play.click();await page.locator('input[type="checkbox"]').check();await stage.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('.motion-stage').dataset.moving==='true');
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
  await page.locator('input[type="checkbox"]').uncheck();await page.locator('[data-pick="found"]').click();
  // Freeze the strongest response at its peak for visual bounds checks and screenshots.
  await page.locator('.motion-stage').evaluateAll(stages=>stages.forEach(stage=>stage.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=Number(a.effect.getTiming().duration)*.18;})));
  const bounds=await stage.evaluate(el=>{const outer=el.getBoundingClientRect();return [...el.querySelectorAll('.motion-frame .motion-png,.motion-rig .motion-body')].map(i=>{const r=i.getBoundingClientRect();return {left:r.left-outer.left,right:outer.right-r.right,top:r.top-outer.top};});});
  assert.ok(bounds.every(b=>b.left>=0&&b.right>=0&&b.top>35),'strong response remains inside comparison panel');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:out+'/'+lang+'-'+width+'-'+theme+'.png',fullPage:true});
  await page.locator('a[href="/ai-lab#apprentice"]').click();await page.getByTestId('explorer-apprentice').waitFor();assert.equal(await page.locator('.lab-history-row').count(),7);
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(kev,[]);
  console.log('PASS',lang,width,theme,'5 states, keyboard, play/stop, quiet, reduced motion, visibility, fixed eyes/tiny, records and return');await ctx.close();
 }
}finally{await browser.close();}
