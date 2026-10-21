import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
for(const origin of (process.env.COMMUNITY_TEST_ORIGINS||'http://127.0.0.1:3275').split(',')) for(const [lang,width] of [['ja',1440],['en',1440],['ja',390],['en',390]]) {
 const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const click=(action)=>page.locator(`[data-action="${action}"]`).first().click();
 await page.goto(origin);if(lang==='en')await click('language');await click('top');await click('enterCommunities');await click('community');await click('returnEntry');assert.equal(await page.locator('.study-top').count(),1);
 await click('demoGraph');await click('expand');assert.equal(await page.locator('.graph-stage g').count(),1);await click('enterCommunities');await click('community');await click('graph');await click('expand');await click('back');await click('returnEntry');assert.equal(await page.locator('.graph-stage g').count(),1,'original Graph remains collapsed');
 await click('account');await page.locator('[data-action="accountSection"][data-section="capsules"]').click();await click('enterCommunities');await click('community');await click('returnEntry');assert.equal(await page.locator('.account-capsules').count(),1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 await page.screenshot({path:`/tmp/community-navigation-${origin.startsWith('https')?'tunnel':'local'}-${width}.png`,fullPage:true});
 await click('top');await page.screenshot({path:`/tmp/community-top-${width}.png`,fullPage:true});await page.close();console.log('PASS',origin,lang,width,'entry/Graph state/account menu/return/assets');
}
} finally {await browser.close();}
