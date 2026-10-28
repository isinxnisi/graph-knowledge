import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.AI_LAB_ORIGIN||'http://127.0.0.1:3269',out=process.env.AI_LAB_SCREENSHOTS||'/tmp/plunode-education-policy';
await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true});
try{
 for(const lang of ['ja','en'])for(const width of [1440,390])for(const theme of ['light','dark-blue']){
  if(process.env.LAB_CASES&&!process.env.LAB_CASES.split(',').includes(`${lang}-${width}-${theme}`))continue;
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'no-preference'}),page=await context.newPage(),errors=[],writes=[],models=[];
  await context.addInitScript(theme=>localStorage.setItem('graph-knowledge:appearance:v1',JSON.stringify({theme,palette:theme==='dark-blue'?'blue':'brown'})),theme);
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const u=new URL(r.url());if(!['GET','HEAD'].includes(r.method())&&u.pathname!=='/cdn-cgi/rum')writes.push(r.url());if(/8009|systemone|kev/i.test(r.url()))models.push(r.url());});
  const local=path=>(lang==='en'?'/en':'')+path;
  await page.goto(base+local('/ai-lab')+'#mentorship');const mentor=page.getByTestId('mentor-review');await mentor.waitFor();
  assert.equal(await page.getByTestId('inference-count').innerText(),process.env.LAB_EXPECT_INFERENCE||'6');assert.equal(await page.getByTestId('training-count').innerText(),process.env.LAB_EXPECT_TRAINING||'1');
  assert.equal(await page.locator('[data-official-ai-id]').getAttribute('data-official-ai-id'),'501350be-a89f-4bde-9a06-d94631b47be5');
  assert.match(await mentor.innerText(),lang==='en'?/Official AI · review and teaching policy/:/公式AI・見習いの評価と教育方針/);assert.match(await page.getByTestId('mentor-selection').innerText(),lang==='en'?/Polarity → Evidence/:/肯定・否定 → 根拠不足/);
  assert.doesNotMatch(await mentor.innerText(),/Codex|ChatGPT/);
  assert.match(await page.locator('#mentorship').innerText(),lang==='en'?/Daily cloud evaluation settings have not been inspected/:/クラウドの日次評価設定は、このWorkerからは未確認/);
  const avatar=page.locator('#mentorship [data-profile-icon="official-ai"] img');assert.equal(await avatar.count(),1);assert.equal(await avatar.evaluate(e=>e.getAnimations().length),0);
  await mentor.locator('details summary').click();const report=mentor.getByRole('link',{name:lang==='en'?'GitHub report ↗':'GitHubの実レポート ↗'});await report.waitFor();
  assert.match(await mentor.innerText(),lang==='en'?/interactive Codex/:/対話内Codex/);
  assert.equal(await report.getAttribute('href'),'https://github.com/isinxnisi/graph-knowledge/issues/36#issuecomment-6470180242');
  assert.match(await mentor.innerText(),/6bf70ea27be2782c/);assert.match(await mentor.innerText(),/cffd5360856cb495/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#mentorship').screenshot({path:`${out}/${lang}-${width}-${theme}-mentor.png`});
  const cycle=mentor.locator('a[href*="?cycle=891edfc6"]');await cycle.click();
  await page.getByTestId('education-detail').getByRole('heading',{name:lang==='en'?'Holdout comparison':'holdoutの比較',exact:true}).waitFor();
  await page.getByTestId('education-detail').locator('a[href*="read=claim"]').first().click();
  await page.getByRole('dialog').getByTestId('lab-record-return').click();
  await page.getByTestId('education-detail').getByRole('heading',{name:lang==='en'?'Holdout comparison':'holdoutの比較',exact:true}).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('cycle'),'891edfc6-9e0a-472a-8b59-dc3795df1273');
  const response=await page.request.get(base+'/api/ai-lab');const artifact=await response.json();assert.equal(artifact.payload.schemaVersion,4);assert.equal(artifact.payload.mentorship.records.length,1);assert.equal(artifact.payload.runs.length,11);
  for(const route of ['/api/ai-lab/plan','/api/ai-lab/review','/api/ai-lab/train','/ai-character-study'])assert.equal((await page.request.get(base+route)).status(),404);
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(models,[]);
  console.log('PASS mentorship',lang,width,theme,'actual AI/machine decision separated; SHA/source/GitHub/Claim return; no new model calls or writes');await context.close();
 }
}finally{await browser.close();}
