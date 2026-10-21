import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const base=process.env.CONNECTION_ORIGIN||'http://127.0.0.1:3275';
const out='/tmp/community-hierarchy';await mkdir(out,{recursive:true});
const b=await chromium.launch({headless:true});
try{for(const lang of ['ja','en'])for(const width of [320,390,1440]){
 const p=await b.newPage({viewport:{width,height:900}});
 await p.goto(base+(lang==='en'?'/en':'/'));await p.getByTestId('community-entry').click();
 const f=p.frameLocator('#community-frame');
 await f.locator('[data-action="community"][data-community="atelier"]').click();
 await f.getByRole('heading',{name:lang==='ja'?'おすすめのCapsule':'Recommended Capsules',exact:true}).waitFor();
 assert.equal(await f.getByText('ここから広がる、小さな発見。',{exact:true}).count(),0);
 const size=async selector=>f.locator(selector).first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize));
 assert.ok(await size('h1')>await size('.row-content h3'));
 assert.ok(await size('.row-content h3')>await size('.home-capsule-heading h2'));
 await p.screenshot({path:`${out}/${lang}-${width}-home.png`,fullPage:true});
 await p.locator('.community-sticky-tabs button').filter({hasText:lang==='ja'?'管理':'Manage'}).click();
 const nav=f.locator('.subnav');await nav.waitFor();
 if(width<680){const boxes=await nav.locator('button').evaluateAll(es=>es.map(e=>({y:e.getBoundingClientRect().y,h:e.getBoundingClientRect().height})));assert.ok(boxes.every(x=>Math.abs(x.y-boxes[0].y)<1));assert.ok((await nav.boundingBox()).height<55);}
 await nav.locator('[data-section="gallery"]').click();await f.locator('.settings-content').getByRole('heading').first().waitFor();
 assert.equal(await nav.locator('[data-section="gallery"]').getAttribute('aria-current'),'page');
 await nav.locator('[data-section="basics"]').click();
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await p.screenshot({path:`${out}/${lang}-${width}-manage.png`,fullPage:true});
 console.log('PASS',base,lang,width,'hierarchy / one-row menu / switching');await p.close();
}}finally{await b.close();}
