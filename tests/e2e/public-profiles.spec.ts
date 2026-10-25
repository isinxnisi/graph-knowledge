import {test,expect,type Page} from '@playwright/test';
const origin='http://127.0.0.1:3221';
async function login(page:Page,name='検証ユーザーA'){
 // Compile the dev-only account route before a UI request's bounded timeout.
 await page.request.get('/api/accounts/me',{timeout:90000});
 await page.goto('/member#profile');await page.getByRole('button',{name:/検証用OIDCでログイン|Log in with test OIDC/}).click();await page.getByRole('link',{name,exact:true}).click();await page.waitForURL(u=>u.pathname==='/member');
 await page.goto('/member#profile');await expect(page.locator('#public-profile-settings input[name=public-handle]')).toBeVisible();return (await(await page.request.get('/api/member/profile')).json()).user;
}
test('real OIDC, automatic profile, one name, author links, follow and unfollow round trip',async({page,browser},info)=>{
 test.setTimeout(240000);
 const user=await login(page);const editor=page.locator('#public-profile-settings');
 await expect(editor.locator('input[name=public-name]')).toHaveValue('検証ユーザーA');await expect(editor.locator('input[name=public-handle]')).toHaveValue(/^member-[a-f0-9]{16}$/);await expect(editor.locator('input[type=checkbox]')).toBeChecked();
 await editor.locator('input[name=public-handle]').fill('browser-alice');await editor.locator('input[name=public-name]').fill('公開の探索者');await editor.locator('textarea').fill('関係と根拠を辿っています。');await editor.getByRole('button',{name:'軌道',exact:true}).click();await editor.locator('input[type=checkbox]').check();await editor.getByRole('button',{name:'公開プロフィールを保存',exact:true}).click();await expect(editor.getByRole('status')).toHaveText('公開プロフィールを保存しました。');
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
 await page.goto('/member#profile');await expect(editor.locator('input[type=checkbox]')).not.toBeChecked();await page.screenshot({path:info.outputPath('profile-settings.png'),fullPage:true});
});

for(const locale of ['ja','en'] as const)for(const width of [1440,390])for(const theme of ['light','dark-blue'])test(`AI profiles ${locale} ${width} ${theme}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.addInitScript(({locale,theme})=>{localStorage.setItem('graph-knowledge.ui-locale.v1',locale);localStorage.setItem('graph-knowledge:appearance:v1',JSON.stringify({theme,palette:theme==='dark-blue'?'blue':'brown'}));},{locale,theme});
 await page.goto((locale==='en'?'/en':'')+'/people/plunode-official-ai');await expect(page.getByRole('heading',{name:locale==='en'?'Plunode official AI':'Plunode公式AI',exact:true})).toBeVisible();
 await expect(page.locator('main img')).toHaveAttribute('alt','');expect(await page.locator('main img').first().evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
 await expect(page.getByText(locale==='en'?'No public activity to display.':'表示できる公開活動はありません。',{exact:false})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 await page.screenshot({path:info.outputPath('official.png'),fullPage:true});
 await page.goto((locale==='en'?'/en':'')+'/people/explorer-apprentice');await expect(page.getByRole('heading',{name:locale==='en'?'Apprentice exploration AI':'探索者見習いAI',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.screenshot({path:info.outputPath('apprentice.png'),fullPage:true});
});

for(const locale of ['ja','en'] as const)for(const width of [1440,390])for(const theme of ['light','dark-blue'])test(`People and account UI ${locale} ${width} ${theme}`,async({page},info)=>{
 test.setTimeout(180000);const en=locale==='en';
 await page.setViewportSize({width,height:900});await page.addInitScript(({locale,theme})=>{localStorage.setItem('graph-knowledge.ui-locale.v1',locale);localStorage.setItem('graph-knowledge:appearance:v1',JSON.stringify({theme,palette:theme==='dark-blue'?'blue':'brown'}));},{locale,theme});
 const user=await login(page),headers={origin,'x-member-user':user.id};
 const title=en?'Community and moderation testing':'コミュニティと管理のテスト状況',threadTitle=en?'Testing reports together':'通報のテストを行う';
 // Reuse the same real sources across visual variants, respecting production quotas.
 const directory=await(await page.request.get('/api/communities?mine=1',{headers})).json();
 let c=directory.communities.find((r:{title:string})=>r.title===title);
 if(!c){const result=await page.request.post('/api/communities',{headers,data:{requestId:crypto.randomUUID(),title,description:'',visibility:'public'}});expect(result.status()).toBe(201);c=(await result.json()).community;}
 const current=await(await page.request.get('/api/communities/'+c.id,{headers})).json();
 if(!current.threads.some((r:{title:string})=>r.title===threadTitle)){const result=await page.request.post('/api/communities/'+c.id+'/threads',{headers,data:{requestId:crypto.randomUUID(),expectedRevision:current.community.revision,title:threadTitle,body:en?'Let us check the conversation.':'会話の表示を確認します。',audience:'public'}});expect(result.status()).toBe(201);}
 await page.goto('/communities#'+encodeURIComponent('/'+c.id));await expect(page.getByRole('heading',{name:c.title,exact:true})).toBeVisible();
 const people=page.locator('main a[href$="/people/'+user.profile.handle+'"]');await expect(people).toHaveCount(2);
 for(const chip of await people.all()){await expect(chip.locator('[data-profile-icon]')).toHaveCount(1);await expect(chip).toHaveText(user.name);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.screenshot({path:info.outputPath('community.png'),fullPage:true});
 await page.getByRole('link',{name:en?'Testing reports together':'通報のテストを行う',exact:true}).click();await expect(page.getByRole('heading',{name:en?'Testing reports together':'通報のテストを行う',exact:true})).toBeVisible();
 const authors=page.locator('main a[href$="/people/'+user.profile.handle+'"]');await expect(authors).toHaveCount(2);await expect(authors.last().locator('[data-profile-icon]')).toHaveCount(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.screenshot({path:info.outputPath('thread.png'),fullPage:true});
 await authors.first().click();await expect(page.getByRole('heading',{name:user.name,exact:true})).toBeVisible();
 await page.getByRole('link',{name:en?'Edit profile':'プロフィールを編集',exact:true}).click();const editor=page.locator('#public-profile-settings');await expect(editor.locator('input[name=public-name]')).toHaveValue(user.name);await expect(page.locator('#member-display-name')).toHaveCount(0);
 await page.screenshot({path:info.outputPath('edit.png'),fullPage:true});
 await page.goto('/member#account-settings');await expect(page.getByRole('heading',{name:en?'Account settings':'アカウント設定',exact:true})).toBeVisible();await expect(page.locator('input[name=public-name],#member-display-name')).toHaveCount(0);
 await page.screenshot({path:info.outputPath('settings.png'),fullPage:true});
 const menu=page.getByLabel(en?'Account menu':'アカウントメニュー');await menu.click();const panel=menu.locator('..');
 const first=panel.getByRole('navigation').getByRole('link').first();await expect(first).toHaveText(en?'My page':'マイページ');await expect(menu.locator('[data-profile-icon]')).toHaveAttribute('data-profile-icon',user.profile.icon);
 await first.click();await expect(page.getByRole('heading',{name:user.name,exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('mypage.png'),fullPage:true});
});

test('editor conflicts keep input, wrong origin and identity are rejected by real HTTP API',async({page})=>{
 const user=await login(page),headers={origin,'x-member-user':user.id},own=await(await page.request.get('/api/accounts/me',{headers})).json();const editor=page.locator('#public-profile-settings');
 await editor.locator('textarea').fill('My unsaved profile');const current=own.profile;
 await page.request.put('/api/accounts/me',{headers,data:{handle:current.handle,displayName:current.displayName,bio:'Changed in another tab',icon:current.icon,timelinePublic:false,expectedRevision:own.revision}});
 await editor.getByRole('button',{name:'公開プロフィールを保存',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('別の画面でプロフィールが変更されました');await expect(editor.locator('textarea')).toHaveValue('My unsaved profile');
 expect((await page.request.put('/api/accounts/me',{headers:{...headers,origin:'https://evil.example'},data:{}})).status()).toBe(403);
 expect((await page.request.get('/api/accounts/me',{headers:{'x-member-user':'501350be-a89f-4bde-9a06-d94631b47be5'}})).status()).toBe(401);
});

test('profile drafts survive cancelled links and browser history navigation',async({page})=>{
 await login(page);const editor=page.locator('#public-profile-settings');
 await editor.locator('textarea').fill('Draft retained while moving through my account');
 page.once('dialog',d=>d.dismiss());await editor.getByRole('link',{name:/公開プロフィールを見る/}).click();await expect(editor.locator('textarea')).toHaveValue('Draft retained while moving through my account');
 page.once('dialog',d=>d.dismiss());await page.evaluate(()=>{location.hash='account-settings';});
 await expect(page).toHaveURL(/member#profile$/);await expect(editor.locator('textarea')).toHaveValue('Draft retained while moving through my account');
 await page.getByRole('button',{name:'キャンセル',exact:true}).click();
 await page.evaluate(()=>{location.hash='account-settings';});await expect(page.getByRole('heading',{name:'アカウント設定',exact:true})).toBeVisible();
 await page.evaluate(()=>{location.hash='profile';});await expect(editor.locator('textarea')).toBeVisible();await editor.locator('textarea').fill('Back must keep this draft');
 page.once('dialog',d=>d.dismiss());await page.evaluate(()=>history.back());
 await expect(page).toHaveURL(/member#profile$/);await expect(editor.locator('textarea')).toHaveValue('Back must keep this draft');
 await page.getByRole('button',{name:'キャンセル',exact:true}).click();
});
