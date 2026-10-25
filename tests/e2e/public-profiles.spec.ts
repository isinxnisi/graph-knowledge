import {test,expect,type Page} from '@playwright/test';
const origin='http://127.0.0.1:3221';
async function login(page:Page,name='検証ユーザーA'){
 await page.goto('/member#account-settings');await page.getByRole('button',{name:'検証用OIDCでログイン',exact:true}).click();await page.getByRole('link',{name,exact:true}).click();await page.waitForURL(u=>u.pathname==='/member');
 await page.goto('/member#account-settings');await expect(page.locator('#public-profile-settings input[name=public-handle]')).toBeVisible();return (await(await page.request.get('/api/member/profile')).json()).user;
}
test('real OIDC, opt-in edit, public post author, follow and unfollow round trip',async({page,browser},info)=>{
 test.setTimeout(240000);
 const user=await login(page);const editor=page.locator('#public-profile-settings');
 await expect(editor.locator('input[name=public-name]')).toHaveValue('');await expect(editor.locator('input[name=public-handle]')).toHaveValue('');
 await editor.locator('input[name=public-handle]').fill('browser-alice');await editor.locator('input[name=public-name]').fill('公開の探索者');await editor.locator('textarea').fill('関係と根拠を辿っています。');await editor.getByRole('button',{name:'orbit',exact:true}).click();await editor.locator('input[type=checkbox]').check();await editor.getByRole('button',{name:'公開プロフィールを保存',exact:true}).click();await expect(editor.getByRole('status')).toHaveText('公開プロフィールを保存しました。');
 const headers={origin,'x-member-user':user.id},c=(await(await page.request.post('/api/communities',{headers,data:{requestId:crypto.randomUUID(),title:'Profile browser public',description:'Isolated verification',visibility:'public'}})).json()).community;
 const thread=(await(await page.request.post('/api/communities/'+c.id+'/threads',{headers,data:{requestId:crypto.randomUUID(),expectedRevision:c.revision,title:'記録された公開活動',body:'実際の公開投稿です。',audience:'public'}})).json()).id;
 const secret=(await(await page.request.post('/api/communities/'+c.id+'/threads',{headers,data:{requestId:crypto.randomUUID(),expectedRevision:c.revision,title:'SECRET-LIMITED-TITLE',body:'SECRET-LIMITED-BODY',audience:'cohort'}})).json()).id;
 await page.goto('/communities#'+encodeURIComponent('/threads/'+thread));await expect(page.locator('article a').filter({hasText:'公開の探索者'})).toBeVisible();await page.locator('article a').filter({hasText:'公開の探索者'}).click();await expect(page).toHaveURL(/people\/browser-alice/);await expect(page.getByRole('heading',{name:'公開の探索者',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'記録された公開活動',exact:true})).toBeVisible();
 expect(await page.locator('main').innerText()).not.toContain('SECRET');expect(await page.locator('main').innerText()).not.toContain(user.id);
 const context=await browser.newContext(),other=await context.newPage();try{
  const second=await login(other,'検証ユーザーB');await other.goto('/people/browser-alice');await other.getByRole('button',{name:'フォローする',exact:true}).click();await expect(other.getByRole('button',{name:'フォロー解除',exact:true})).toBeVisible();
  expect((await other.request.get('/api/communities/threads/'+secret)).status()).toBe(404);await other.getByRole('link',{name:'フォロー中',exact:true}).click();await expect(other.getByRole('link',{name:'公開の探索者',exact:true})).toBeVisible();await other.getByRole('link',{name:/^公開活動/}).click();await other.getByRole('button',{name:'フォロー解除',exact:true}).click();await expect(other.getByRole('button',{name:'フォローする',exact:true})).toBeVisible();
  // Pause an older authorized response, change privacy, then make focus revalidate.
  let release!:()=>void;const gate=new Promise<void>(r=>release=r);let first=true;
  await other.route('**/api/accounts/profiles/browser-alice',async r=>{if(first){first=false;const response=await r.fetch();await gate;await r.fulfill({response}).catch(()=>{/* The old request may already be aborted by revalidation. */});}else await r.continue();});
  await other.reload({waitUntil:'domcontentloaded'});await expect.poll(()=>first).toBe(false);
  const own=await(await page.request.get('/api/accounts/me',{headers})).json();expect((await page.request.put('/api/accounts/me',{headers,data:{handle:'browser-alice',displayName:'公開の探索者',bio:'関係と根拠を辿っています。',icon:'orbit',timelinePublic:false,expectedRevision:own.revision}})).status()).toBe(200);
  await other.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(other.getByText('このタイムラインは非公開です。',{exact:true})).toBeVisible();release();await expect(other.getByRole('link',{name:'記録された公開活動',exact:true})).toHaveCount(0);
  await other.screenshot({path:info.outputPath('private-timeline.png'),fullPage:true});expect((await other.request.get('/api/accounts/following',{headers:{'x-member-user':second.id}})).status()).toBe(200);
 }finally{await context.close();}
 await page.goto('/member#account-settings');await expect(editor.locator('input[type=checkbox]')).not.toBeChecked();await page.screenshot({path:info.outputPath('profile-settings.png'),fullPage:true});
});

for(const locale of ['ja','en'] as const)for(const width of [1440,390])for(const theme of ['light','dark-blue'])test(`AI profiles ${locale} ${width} ${theme}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.addInitScript(({locale,theme})=>{localStorage.setItem('graph-knowledge.ui-locale.v1',locale);localStorage.setItem('graph-knowledge:appearance:v1',JSON.stringify({theme,palette:theme==='dark-blue'?'blue':'brown'}));},{locale,theme});
 await page.goto((locale==='en'?'/en':'')+'/people/plunode-official-ai');await expect(page.getByRole('heading',{name:locale==='en'?'Plunode official AI':'Plunode公式AI',exact:true})).toBeVisible();
 await expect(page.locator('main img')).toHaveAttribute('alt','');expect(await page.locator('main img').first().evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
 await expect(page.getByText(locale==='en'?'No public activity to display.':'表示できる公開活動はありません。',{exact:false})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 await page.screenshot({path:info.outputPath('official.png'),fullPage:true});
 await page.goto((locale==='en'?'/en':'')+'/people/explorer-apprentice');await expect(page.getByRole('heading',{name:locale==='en'?'Apprentice exploration AI':'探索者見習いAI',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.screenshot({path:info.outputPath('apprentice.png'),fullPage:true});
});

test('editor conflicts keep input, wrong origin and identity are rejected by real HTTP API',async({page})=>{
 const user=await login(page),headers={origin,'x-member-user':user.id},own=await(await page.request.get('/api/accounts/me',{headers})).json();const editor=page.locator('#public-profile-settings');
 await editor.locator('textarea').fill('My unsaved profile');const current=own.profile;
 await page.request.put('/api/accounts/me',{headers,data:{handle:current.handle,displayName:current.displayName,bio:'Changed in another tab',icon:current.icon,timelinePublic:false,expectedRevision:own.revision}});
 await editor.getByRole('button',{name:'公開プロフィールを保存',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('別の画面でプロフィールが変更されました');await expect(editor.locator('textarea')).toHaveValue('My unsaved profile');
 expect((await page.request.put('/api/accounts/me',{headers:{...headers,origin:'https://evil.example'},data:{}})).status()).toBe(403);
 expect((await page.request.get('/api/accounts/me',{headers:{'x-member-user':'501350be-a89f-4bde-9a06-d94631b47be5'}})).status()).toBe(401);
});
