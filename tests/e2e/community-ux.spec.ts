import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {resetCommunityTestAllowance} from '../support/community-quota';
test.beforeEach(resetCommunityTestAllowance);
test('community login returns to the requested personal page',async({page})=>{
 await page.goto('/member?returnTo='+encodeURIComponent('/communities#%2Fmy-posts'));
 await page.getByRole('button',{name:'検証用OIDCでログイン',exact:true}).click();await page.getByRole('link',{name:'検証ユーザーB',exact:true}).click();await page.waitForURL(u=>u.pathname==='/communities');
 await expect(page.getByRole('heading',{name:'コミュニティの投稿',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'コミュニティの投稿',exact:true})).toHaveAttribute('aria-current','page');
 await expect(page.getByText('まだ投稿はありません。参加先の会話から始められます。',{exact:true})).toBeVisible();
 await page.getByRole('link',{name:'自分のCapsule',exact:true}).click();await expect(page.getByRole('heading',{name:'保存したCapsule',exact:true})).toBeVisible();await page.goBack();await expect(page.getByRole('heading',{name:'コミュニティの投稿',exact:true})).toBeVisible();
});
for(const [language,width] of [['ja',1440],['ja',390],['en',320]] as const)test(`community draft and report ${language} ${width}`,async({page},info)=>{
 test.setTimeout(90000);page.setDefaultTimeout(15000);const t=(ja:string,en:string)=>language==='en'?en:ja;
 await page.setViewportSize({width,height:900});await page.goto('/member');await page.getByRole('button',{name:'検証用OIDCでログイン',exact:true}).click();await page.getByRole('link',{name:'検証ユーザーA',exact:true}).click();await page.waitForURL(u=>u.pathname==='/member');
 await page.evaluate(locale=>localStorage.setItem('graph-knowledge.ui-locale.v1',locale),language);
 const user=(await(await page.request.get('/api/member/profile')).json()).user;
 const headers={origin:'http://127.0.0.1:3221','x-member-user':user.id};
 const response=await page.request.post('/api/communities',{headers,data:{requestId:crypto.randomUUID(),title:'操作確認のコミュニティ',description:'検証用の公開コミュニティ',visibility:'public'}});expect(response.status()).toBe(201);const c=(await response.json()).community;
 await page.goto('/communities#'+encodeURIComponent('/'+c.id));
 const title=page.getByLabel(t('題名','Title'),{exact:true});await title.fill('保持する下書き');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(title).toHaveValue('保持する下書き');
 const open=page.getByRole('button',{name:t('通報 · コミュニティ','Report · community'),exact:true});await open.click();const dialog=page.locator('dialog[open]'),reason=dialog.getByLabel(t('通報の理由','Reason for reporting'),{exact:true});await reason.fill('入力保持の検証');
 // A completed authorized refresh must retain the same editor node, focus and text.
 await page.evaluate(()=>document.querySelector('dialog textarea')!.setAttribute('data-retained','yes'));await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await expect(dialog).toBeVisible();await expect(reason).toHaveAttribute('data-retained','yes');await expect(reason).toHaveValue('入力保持の検証');
 const second=await page.context().newPage();await second.goto('about:blank');await page.bringToFront();await expect(reason).toHaveValue('入力保持の検証');await second.close();await reason.press('Escape');await dialog.getByRole('button',{name:t('入力に戻る','Keep editing'),exact:true}).click();await expect(reason).toHaveValue('入力保持の検証');
 await page.screenshot({path:info.outputPath(`report-${width}.png`),fullPage:true});
 let sent:unknown;let count=0;
 await page.route('**/api/communities/reports',async route=>{count++;if(count===1){sent=route.request().postDataJSON();await route.abort('failed');}else{expect(route.request().postDataJSON()).toEqual(sent);await route.continue();}});
 await dialog.getByRole('button',{name:t('通報を送る','Send report'),exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();await expect(reason).toHaveValue('入力保持の検証');await expect(reason).toHaveAttribute('readonly','');
 await dialog.getByRole('button',{name:t('同じ送信を再確認','Retry same submission'),exact:true}).click();await expect(dialog).toHaveCount(0);await expect(title).toHaveValue('保持する下書き');await expect(page.getByText(t('通報を受け付けました。自分の活動・履歴から受付状況を確認できます。','Report received. Track it under Your activity.'),{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.screenshot({path:info.outputPath('community.png'),fullPage:true});
 await page.getByText(t('参加中 · 参加設定','Joined · Membership settings'),{exact:true}).click();await page.getByRole('button',{name:t('退出する','Leave community'),exact:true}).click();await expect(page.locator('dialog[open]')).toContainText(t('アーカイブ','archive'));await page.locator('dialog[open]').getByRole('button',{name:t('キャンセル','Cancel'),exact:true}).click();await expect(title).toHaveValue('保持する下書き');
});
test('community focus baseline',async({page})=>{
 test.skip(process.env.COMMUNITY_UX_BASELINE!=='1');test.setTimeout(180000);
 await page.goto('/member');await page.getByRole('button',{name:'検証用OIDCでログイン',exact:true}).click();await page.getByRole('link',{name:'検証ユーザーA',exact:true}).click();await page.waitForURL(u=>u.pathname==='/member');
 const user=(await(await page.request.get('/api/member/profile')).json()).user;
 const r=await page.request.post('/api/communities',{headers:{origin:'http://127.0.0.1:3221','x-member-user':user.id},data:{requestId:crypto.randomUUID(),title:'操作確認のコミュニティ',description:'検証用の公開コミュニティ',visibility:'public'}});expect(r.status()).toBe(201);const c=(await r.json()).community;
 await page.goto('/communities#'+encodeURIComponent('/'+c.id));await page.getByRole('button',{name:'通報 · コミュニティ',exact:true}).click();await page.getByLabel('通報の理由',{exact:true}).fill('入力保持の検証（送信しません）');
 await mkdir('/tmp/community-ux-before',{recursive:true});
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.screenshot({path:`/tmp/community-ux-before/report-${width}.png`,fullPage:true});}
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByLabel('通報の理由',{exact:true})).toHaveCount(0);
});
