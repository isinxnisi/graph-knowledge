import {test,expect} from '@playwright/test';
import {resetCommunityTestAllowance} from '../support/community-quota';

test.beforeEach(resetCommunityTestAllowance);
for(const [language,width] of [['ja',1440],['en',390],['ja',390],['en',1440]] as const)test(`community C3 report and moderation ${language} ${width}`,async({page},info)=>{
 test.setTimeout(180000);const t=(ja:string,en:string)=>language==='en'?en:ja;
 await page.setViewportSize({width,height:900});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/member');await page.getByRole('button',{name:'検証用OIDCでログイン',exact:true}).click();await page.getByRole('link',{name:'検証ユーザーA',exact:true}).click();await page.waitForURL(u=>u.pathname==='/member');await expect(page.getByText('最新の状態に更新',{exact:true})).toBeEnabled();
 await page.evaluate(locale=>localStorage.setItem('graph-knowledge.ui-locale.v1',locale),language);
 const user=(await(await page.request.get('/api/member/profile')).json()).user;
 const headers={origin:'http://127.0.0.1:3221','x-member-user':user.id};
 const created=await page.request.post('/api/communities',{headers,data:{requestId:crypto.randomUUID(),title:`C3 ${language} ${width}`,description:'Community safety validation',visibility:'public'}});expect(created.status()).toBe(201);const c=(await created.json()).community;
 const thread=await page.request.post('/api/communities/'+c.id+'/threads',{headers,data:{requestId:crypto.randomUUID(),expectedRevision:c.revision,title:'A conversation to review',body:'A message for scoped review',audience:'public'}});expect(thread.status()).toBe(201);const tid=(await thread.json()).id;
 await page.goto('/communities#'+encodeURIComponent('/threads/'+tid));await expect(page.getByText('A message for scoped review',{exact:true})).toBeVisible();
 const post=page.locator('article').filter({hasText:'A message for scoped review'});
 await post.getByLabel(t('投稿の操作','Post actions'),{exact:true}).click();await post.getByRole('button',{name:t('通報 · 投稿','Report · post'),exact:true}).click();await page.getByLabel(t('通報の理由','Reason for reporting'),{exact:true}).fill('Please review only this post.');
 await expect(page.getByText(t('対象を限定して確認します。通報は、内容の誤りの認定や自動的な非表示ではありません。','Only the reported item is reviewed. A report does not establish that it is false or automatically hide it.'),{exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath('report-form.png'),fullPage:true});await page.getByRole('button',{name:t('通報を送る','Send report'),exact:true}).click();await expect(page.getByRole('status').filter({hasText:/Loading|確認中|Rechecking|再確認しています/})).toHaveCount(0);await expect(page.getByText('A message for scoped review',{exact:true})).toBeVisible();
 await page.getByRole('link',{name:t('自分の通報','My reports'),exact:true}).click();await expect(page.getByRole('heading',{name:t('自分の通報','My reports'),exact:true})).toBeVisible();await expect(page.getByText(t('確認待ち','Open'),{exact:true}).first()).toBeVisible();await expect(page.getByText('A message for scoped review',{exact:true})).toHaveCount(0);await page.screenshot({path:info.outputPath('report-receipts.png'),fullPage:true});
 await page.goBack();await expect(page.getByText('A message for scoped review',{exact:true})).toBeVisible();
 await post.getByLabel(t('投稿の操作','Post actions'),{exact:true}).click();await post.getByRole('button',{name:t('投稿を非表示','Hide post'),exact:true}).click();await page.getByLabel(t('管理操作の理由','Reason for moderation'),{exact:true}).fill('Community rules review');await page.getByRole('button',{name:t('理由を記録して適用','Apply & record reason'),exact:true}).click();
 await expect(page.getByText('A message for scoped review',{exact:true})).toHaveCount(0);const hidden=page.locator('article').filter({hasText:t('管理による非表示','Hidden by moderation')});await expect(hidden).toBeVisible();await page.screenshot({path:info.outputPath('hidden-post.png'),fullPage:true});
 await hidden.getByRole('button',{name:t('非表示を解除','Unhide post'),exact:true}).click();await page.getByLabel(t('管理操作の理由','Reason for moderation'),{exact:true}).fill('Review complete');await page.getByRole('button',{name:t('理由を記録して適用','Apply & record reason'),exact:true}).click();await expect(page.getByText('A message for scoped review',{exact:true})).toBeVisible();
 await page.getByRole('link',{name:t('← スレッド一覧','← Threads'),exact:true}).click();await expect(page.getByRole('button',{name:'Capsule · '+t('準備中','Coming soon'),exact:true})).toBeDisabled();
 await page.getByRole('button',{name:t('管理履歴','Moderation log'),exact:true}).click();await expect(page.getByText('Community rules review',{exact:true})).toBeVisible();await expect(page.getByText('Review complete',{exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('moderation-log.png'),fullPage:true});
 await page.getByRole('button',{name:t('管理','Manage'),exact:true}).click();await expect(page.getByRole('heading',{name:t('基本設定','Settings'),exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(errors).toEqual([]);
});
