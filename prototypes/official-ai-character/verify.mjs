import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../experiments/ai-lab/.runtime/observer/package.json',import.meta.url));
const {chromium}=require('@playwright/test');
const base=process.env.AI_LAB_ORIGIN||'http://127.0.0.1:3268',out='/tmp/plunode-character-v02-20261022';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 for(const width of [1440,390])for(const theme of ['light','dark-blue','dark-brown']){
  const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width<500});
  await context.addInitScript(value=>localStorage.setItem('graph-knowledge:appearance:v1',JSON.stringify({theme:value,palette:value==='dark-blue'?'blue':'brown'})),theme);
  const page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  const shot=async name=>{
   await page.waitForFunction(()=>[...document.querySelectorAll('.character-avatar')].every(i=>i.complete&&i.naturalWidth>0));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' overflow');
   await page.screenshot({path:`${out}/${width}-${theme}-${name}.png`,fullPage:true});
  };
  await page.goto(base+'/');assert.equal(await page.getByTestId('character-context').count(),0,'no opt-in, no mascot');
  await page.goto(base+'/ai-character-study');await page.locator('.character-card').last().waitFor();
  await page.waitForFunction(t=>document.documentElement.dataset.theme===t,theme);
  assert.equal(await page.locator('.character-card').count(),3);
  assert.equal(await page.locator('.character-scene').count(),6);
  assert.deepEqual(await page.locator('.character-scene').first().locator('img').evaluateAll(els=>els.map(el=>Math.round(el.getBoundingClientRect().width))),[128,64,48,20,18,16]);
  assert.equal(await page.locator('.character-avatar').first().evaluate(el=>getComputedStyle(el).animationName),'none');
  await shot('comparison');
  await page.getByRole('button',{name:'暗い背景',exact:true}).click();assert.equal(await page.locator('.character-scene.is-light').count(),0);
  await page.getByRole('button',{name:'明暗を並べる'}).click();
  await page.getByRole('link',{name:'Homeで確認 ↗'}).first().click();await page.getByTestId('character-context').waitFor();
  for(const id of ['translucent','soft-flat','symbolic-flat']){
   await page.getByLabel('比較する案').selectOption(id);
   assert.ok((await page.getByTestId('character-sample').locator('img').first().getAttribute('src')).includes(id));
   await shot('home-'+id);
  }
  await page.goto(base+'/explore/2b7c6289-d050-4dc0-93e3-9307681253cc');
  await page.getByTestId('graph-canvas').waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-testid="graph-canvas"]')?._cyreg?.cy.nodes().length>0);
  await page.getByTestId('character-context').waitFor();
  const ids=()=>page.getByTestId('graph-canvas').evaluate(el=>el._cyreg.cy.nodes().map(n=>n.id()).sort());
  const original=await ids();
  for(const id of ['translucent','soft-flat','symbolic-flat']){
   await page.getByLabel('比較する案').selectOption(id);await shot('graph-'+id);assert.deepEqual(await ids(),original,'candidate change preserves graph');
  }
  await page.getByRole('button',{name:'サンプルを畳む'}).click();assert.equal(await page.getByTestId('character-sample').count(),0);
  await page.getByRole('button',{name:'サンプルを表示'}).click();await page.getByTestId('character-sample').waitFor();
  await page.goto(base+'/ai-lab');assert.equal(await page.getByTestId('character-context').count(),0,'official character not applied to apprentice');
  await page.goto(base+'/member');await page.getByTestId('character-context').waitFor();
  await page.getByRole('button',{name:'比較を終了'}).click();assert.equal(await page.getByTestId('character-context').count(),0);
  await page.reload();assert.equal(await page.getByTestId('character-context').count(),0,'stop persists');
  await page.goto(base+'/?character-study=invalid');assert.equal(await page.getByTestId('character-context').count(),0,'only known candidates');
  assert.deepEqual(errors,[]);
  assert.equal(requests.some(r=>r.url.includes(':8009')||r.url.includes('/v1/systemone')),false);
  assert.equal(requests.some(r=>r.method!=='GET'&&r.method!=='HEAD'),false,'no writes or inference');
  console.log('PASS',width,theme,'comparison, 3 candidates on actual Home/Graph, opt-in, stop, lab isolation');
  await context.close();
 }
}finally{await browser.close();}
