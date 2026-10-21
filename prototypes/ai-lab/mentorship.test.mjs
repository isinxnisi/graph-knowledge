import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../experiments/ai-lab/.runtime/observer/package.json',import.meta.url));
const {chromium}=require('@playwright/test');
const base=process.env.AI_LAB_ORIGIN||'http://127.0.0.1:3268',out='/tmp/plunode-mentorship-20261022';
await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true});
try{
 for(const [lang,width,theme] of [['ja',1440,'light'],['ja',1440,'dark-blue'],['ja',1440,'dark-brown'],['ja',390,'light'],['ja',390,'dark-blue'],['ja',390,'dark-brown'],['en',390,'dark-blue']]){
  const ctx=await browser.newContext({viewport:{width,height:1000}}),page=await ctx.newPage(),errors=[],writes=[];
  await ctx.addInitScript(({theme})=>localStorage.setItem('graph-knowledge:appearance:v1',JSON.stringify({theme,palette:theme==='dark-blue'?'blue':'brown'})),{theme});
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.url());});
  // Enter through the real localized Home to preserve the established locale contract.
  await page.goto(base+(lang==='en'?'/en':'/'));await page.getByTestId('lab-entry').click();
  await page.getByTestId('official-ai-profile').waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('.official-ai-avatar')].every(i=>i.complete&&i.naturalWidth>0));
  assert.deepEqual(await page.locator('.lab-metrics strong').allTextContents(),['5','0','2','0']);
  assert.equal(await page.locator('.lab-history-row').count(),7);
  const avatars=await page.locator('.official-ai-avatar').evaluateAll(els=>els.map(el=>({size:el.getBoundingClientRect().width,variant:el.dataset.avatarVariant,key:el.dataset.identityRef,animation:getComputedStyle(el).animationName})));
  assert.deepEqual(avatars.map(a=>[a.size,a.variant]),[[128,'translucent'],[48,'soft-flat'],[20,'symbolic-flat'],[20,'symbolic-flat'],[20,'symbolic-flat']]);
  assert.equal(new Set(avatars.map(a=>a.key)).size,1);assert.ok(avatars.every(a=>a.animation==='none'));
  assert.equal(await page.locator('.lab-mentor-comment[data-comment-kind="display-demo"]').count(),3);
  assert.equal(await page.locator('.lab-mentor-comment .lab-demo-label').count(),3);
  assert.equal(await page.getByTestId('explorer-apprentice').locator('.official-ai-avatar').count(),0);
  assert.equal(await page.getByTestId('explorer-apprentice').locator('.apprentice-avatar').count(),1);
  await page.waitForFunction(()=>document.querySelector('.apprentice-avatar')?.naturalWidth>0);
  assert.equal(await page.getByTestId('explorer-apprentice').getAttribute('data-ai-id'),'fe93a431-85cf-4fae-8b84-127e8bf866a7');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const alignment=await page.locator('.lab-mentor-comment').evaluateAll(rows=>rows.map(row=>{
   const icon=row.querySelector('img').getBoundingClientRect(),byline=row.querySelector('.lab-mentor-comment-byline').getBoundingClientRect(),copy=row.querySelector('.lab-mentor-comment-copy p');
   return {offset:Math.abs(icon.y+icon.height/2-(byline.y+byline.height/2)),gap:byline.x-icon.right,lineHeight:parseFloat(getComputedStyle(copy).lineHeight)};
  }));
  assert.ok(alignment.every(a=>a.offset<2&&a.gap>=9&&a.lineHeight>=24));
  await page.locator('#mentorship').screenshot({path:`${out}/${lang}-${width}-${theme}-mentorship.png`});
  await page.getByRole('button',{name:lang==='en'?'Run history':'実行履歴',exact:true}).click();assert.equal(await page.locator('.lab-mentor-comment').count(),0);
  assert.equal(await page.locator('.lab-run').count(),7);
  await page.getByRole('button',{name:lang==='en'?'Overview':'観察ノート',exact:true}).click();
  await page.locator('.lab-mentor-profile a').click();await page.locator('.character-card').last().waitFor();assert.equal(await page.locator('.character-card').count(),3);
  await page.goBack();await page.getByTestId('official-ai-profile').waitFor();
  await page.locator('.lab-apprentice a').click();
  await page.locator('.apprentice-scenes').waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('.apprentice-avatar')].every(i=>i.complete&&i.naturalWidth>0));
  assert.equal(await page.locator('.apprentice-avatar').count(),15);
  assert.equal(await page.locator('.apprentice-pair .official-ai-avatar').count(),1);
  const apprentice=await page.locator('.apprentice-avatar').evaluateAll(els=>els.map(el=>({id:el.dataset.aiId,size:el.width,animation:getComputedStyle(el).animationName})));
  assert.ok(apprentice.every(a=>a.id==='fe93a431-85cf-4fae-8b84-127e8bf866a7'&&a.animation==='none'));
  assert.deepEqual([...new Set(apprentice.map(a=>a.size))].sort((a,b)=>a-b),[16,20,24,48,64,96,128]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:out+'/'+lang+'-'+width+'-'+theme+'-apprentice.png',fullPage:true});
  await page.locator('a[href="/ai-lab#mentorship"]').click();
  await page.getByTestId('explorer-apprentice').waitFor();
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  console.log('PASS',lang,width,theme,'same official identity, A/B/C, demo separation, apprentice, 20px alignment, comparison return');
  await ctx.close();
 }
}finally{await browser.close();}
