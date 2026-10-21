import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const out=process.env.COMMUNITY_SCREENSHOT_DIR||'/tmp/plunode-community-preview';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
let checks=0;
try{
for(const [locale,width] of [['ja',1440],['en',1440],['ja',390],['en',390]]){
 const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),p=await ctx.newPage();
 const errors=[],requests=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push(r.url()));
 const click=async(a,attrs='')=>{if(a==='home'){await p.locator('[data-action="enterCommunities"]').first().click();await p.locator('[data-action="community"][data-community="atelier"]').click();return;}await p.locator(`[data-action="${a}"]${attrs}`).first().click();};
 await p.goto('http://127.0.0.1:3275');if(locale==='en')await click('language');
 await p.locator('h1').waitFor();await p.screenshot({path:`${out}/${locale}-${width}-home.png`,fullPage:true});
 const overflow=async()=>assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${locale}/${width} overflow`);
 await overflow();await p.evaluate(()=>scrollTo(0,350));const originalScroll=await p.evaluate(()=>scrollY);await click('graph');assert.equal(await p.locator('.graph-stage').count(),1);await click('expand');await click('expand');await click('back');await p.locator('.home-layout').waitFor();await p.evaluate(()=>new Promise(requestAnimationFrame));assert.ok(Math.abs(await p.evaluate(()=>scrollY)-originalScroll)<3,'Graph return restores scroll');checks++;
 // Complete create -> list a pinned revision -> Graph -> return.
 await click('create');await p.locator('[name="name"]').fill('Weekend room');await p.locator('[name="visibility"][value="public"]').check();await p.locator('#create-form [type="submit"]').click();await p.getByRole('heading',{name:'Weekend room',exact:true}).waitFor();
 await click('list');await click('confirmList','[data-capsule="c1"]');await click('graph');await click('back');await p.locator('.home-layout').waitFor();checks++;
 // Return to original community, inspect settings, and test late AI response after revoke.
 await click('home');await click('tab','[data-tab="manage"]');await click('section','[data-section="ai"]');await click('inviteAI');await click('queueAI');await p.locator('[name="policy"][value="none"]').check();await p.locator('#ai-form [type="submit"]').click();await click('finishAI');assert.match(await p.locator('.job').innerText(),locale==='ja'?/取消済み/:/Cancelled/);await p.screenshot({path:`${out}/${locale}-${width}-management.png`,fullPage:true});await overflow();checks++;
 // Private outcome publication: no private text copied, old conversation stays private.
 await click('account');await p.locator('[data-action="community"][data-community="studio"]').click();await click('thread');assert.match(await p.locator('h1').innerText(),locale==='ja'?/公開する説明/:/Finding the words/);
 await click('account');await click('publish','[data-capsule="c3"]');assert.equal(await p.locator('[name="title"]').inputValue(),'');await p.locator('[name="title"]').fill('Public outcome');await p.locator('[name="note"]').fill('Only the confirmed outcome.');await p.locator('[name="confirmed"]').check();await p.locator('#publish-form [type="submit"]').click();
 await click('home');await click('list');await click('confirmList','[data-capsule="c3"][data-revision="3"]');await click('identity','[data-user="guest"]');assert.match(await p.locator('main').innerText(),/Public outcome/);assert.doesNotMatch(await p.locator('main').innerText(),/非公開の検討ノート|Private research notes/);await click('tab','[data-tab="members"]');assert.equal(await p.locator('.person-row').count(),0);checks++;
 // Membership is not edit permission; public reference never exposes private revision.
 await click('identity','[data-user="ren"]');await click('tab','[data-tab="threads"]');await click('thread');await p.locator('[name="body"]').fill('See attached reference');await p.locator('[name="privateRef"]').check();await p.locator('#post-form [type="submit"]').click();await click('identity','[data-user="guest"]');assert.equal(await p.locator('.reference.unavailable').count(),1);assert.doesNotMatch(await p.locator('.posts').innerText(),/非公開の検討ノート|Private research notes/);checks++;
 // The owner's deletion does not delete independent conversation.
 await click('identity','[data-user="aya"]');await click('account');await click('deleteCapsule','[data-capsule="c3"]');await click('confirm');await click('community','[data-community="studio"]');await click('thread');assert.equal(await p.locator('.post').count(),1);assert.equal(await p.locator('.reference.unavailable').count(),1);checks++;
 // No history state writes from scrolling and no cross-tab state coupling.
 await p.evaluate(()=>{window.__writes=0;for(const k of ['pushState','replaceState']){const orig=history[k].bind(history);history[k]=(...a)=>{window.__writes++;return orig(...a);};}});
 for(let i=0;i<12;i++)await p.evaluate(i=>scrollTo(0,i%2?0:document.body.scrollHeight),i);
 assert.equal(await p.evaluate(()=>window.__writes),0);const p2=await ctx.newPage();await p2.goto('http://127.0.0.1:3275');await p2.bringToFront();await p.bringToFront();assert.equal(await p2.getByRole('heading',{name:'Weekend room',exact:true}).count(),0);await p2.close();checks++;
 await overflow();assert.deepEqual(errors,[]);assert.equal(requests.every(u=>u.startsWith('http://127.0.0.1:3275/')),true);assert.equal(requests.some(u=>u.includes('/api/')),false);
 await ctx.close();console.log(`PASS ${locale} ${width}: 7 scenario groups; no overflow, page errors, or external/API requests`);
}
// Owner, explicit revision update, private sharing, last-admin departure and visibility round trips.
{
const ctx=await browser.newContext({viewport:{width:390,height:844}}),p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
const click=async(a,attrs='')=>{if(a==='home'){await p.locator('[data-action="enterCommunities"]').first().click();await p.locator('[data-action="community"][data-community="atelier"]').click();return;}await p.locator(`[data-action="${a}"]${attrs}`).first().click();};
await p.goto('http://127.0.0.1:3275');await click('identity','[data-user="mio"]');await click('account');assert.equal(await p.locator('[data-action="deleteCapsule"][data-capsule="c1"]').count(),1);assert.equal(await p.locator('[data-action="deleteCapsule"][data-capsule="c2"]').count(),0);
await click('publish','[data-capsule="c1"]');await p.locator('[name="title"]').fill('新版を確認');await p.locator('[name="note"]').fill('新しい公開用の説明');await p.locator('[name="confirmed"]').check();await p.locator('#publish-form [type="submit"]').click();
await click('identity','[data-user="aya"]');await click('home');await click('tab','[data-tab="manage"]');await click('section','[data-section="gallery"]');await click('updateListing');await click('confirm');assert.match(await p.locator('.capsule-row').first().innerText(),/新版を確認/);await click('tab','[data-tab="threads"]');await click('thread');assert.match(await p.locator('.reference').innerText(),/v1/);
await click('account');await click('community','[data-community="studio"]');await click('tab','[data-tab="manage"]');await click('visibility');await click('confirm');await click('identity','[data-user="guest"]');await click('account');await click('community','[data-community="studio"]');assert.equal(await p.locator('.capsule-row').count(),0);assert.equal(await p.locator('[data-action="thread"]').count(),0);
await click('identity','[data-user="aya"]');await click('tab','[data-tab="manage"]');await click('visibility');await click('confirm');await click('account');await click('grant','[data-capsule="c2"]');await click('confirmGrant','[data-community="studio"]');await click('community','[data-community="studio"]');
await click('leave');await click('confirm');await click('identity','[data-user="ren"]');await click('community','[data-community="studio"]');assert.match(await p.locator('.community-hero').innerText(),/アーカイブ/);assert.equal(await p.locator('[data-action="newThread"]').count(),0);await click('thread');assert.equal(await p.locator('#post-form').count(),0);
assert.deepEqual(errors,[]);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await ctx.close();console.log('PASS owner/revision/grant/visibility/archive mobile UI');
}
// Server exposes only explicit static files and rejects writes; no repository/env access.
const c=await browser.newContext(),p=await c.newPage();const response=await p.goto('http://127.0.0.1:3275');assert.match(response.headers()['content-security-policy'],/connect-src 'none'/);
for(const path of ['/api/member/profile','/.env','/model.test.mjs','/..%2F..%2F.env'])assert.equal((await c.request.get('http://127.0.0.1:3275'+path)).status(),404);
assert.equal((await c.request.post('http://127.0.0.1:3275/')).status(),404);await c.close();
console.log(`${checks} scenario groups + static-server isolation PASS. Screenshots: ${out}`);
}finally{await browser.close();}
