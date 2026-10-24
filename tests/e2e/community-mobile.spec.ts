import {followPersonal,personalSidebar} from '../support/personal-navigation';
import {test,expect} from '@playwright/test';
import {resetCommunityTestAllowance} from '../support/community-quota';
test.beforeEach(resetCommunityTestAllowance);
test('mobile navigation matrix',async({page},info)=>{
 test.setTimeout(240000);
 await page.goto('/member');await page.getByRole('button',{name:'検証用OIDCでログイン',exact:true}).click();await page.getByRole('link',{name:'検証ユーザーA',exact:true}).click();await page.waitForURL(u=>u.pathname==='/member');await expect(page.getByText('最新の状態に更新',{exact:true})).toBeEnabled();
 const uid=(await(await page.request.get('/api/member/profile')).json()).user.id,headers={origin:'http://127.0.0.1:3221','x-member-user':uid};
 const c=(await(await page.request.post('/api/communities',{headers,data:{requestId:crypto.randomUUID(),title:'物語と科学の読書室 / Reading connections',description:'読んで気づいた小さな接点を、気軽に持ち寄る場所です。',visibility:'public'}})).json()).community;
 await (await page.request.post('/api/communities/'+c.id+'/threads',{headers,data:{requestId:crypto.randomUUID(),expectedRevision:c.revision,title:'読み返した作品から見つけた、小さなつながり',body:'同じ作品でも、読むたびに気づくことがあります。',audience:'public'}})).json();
 const before=process.env.COMMUNITY_MOBILE_STAGE==='before';
 for(const width of [320,375,390,430])for(const lang of ['ja','en'])for(const theme of ['light','dark-brown']){
  const t=(ja:string,en:string)=>lang==='en'?en:ja;
  await page.setViewportSize({width,height:844});await page.evaluate(({lang,theme})=>{localStorage.setItem('graph-knowledge.ui-locale.v1',lang);localStorage.setItem('graph-knowledge:appearance:v1',JSON.stringify({theme,palette:'brown'}));},{lang,theme});
  await page.goto('/communities#'+encodeURIComponent('/'+c.id));await page.reload();await expect(page.getByRole('heading',{name:c.title,exact:true})).toBeVisible();await expect(page.locator('main [inert]')).toHaveCount(0);
  await page.screenshot({path:info.outputPath(`${width}-${lang}-${theme}-community.png`),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByLabel(t('コミュニティの操作','Community actions'),{exact:true}).click();const popup=page.locator('main details[open] > div');await expect(popup).toBeVisible();const box=await popup.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width);await page.keyboard.press('Escape');
  await page.goto('/member#account-settings');await expect(page.getByRole('heading',{name:t('アカウント設定','Account settings'),exact:true})).toBeVisible();await page.screenshot({path:info.outputPath(`${width}-${lang}-${theme}-account.png`),fullPage:true});
  if(before)continue;
  const nav=personalSidebar(page);
  await expect(nav.getByRole('link',{name:t('アカウント設定','Account settings'),exact:true,includeHidden:true})).toHaveAttribute('aria-current','page');
  await followPersonal(page,t('届いた招待','Received invitations'));await expect(page.getByRole('heading',{name:t('届いた招待','Your invitations'),exact:true})).toBeVisible();
  await followPersonal(page,t('コミュニティの投稿','Community posts'));await expect(page.getByRole('heading',{name:t('コミュニティの投稿','Community posts'),exact:true})).toBeVisible();
  await page.getByRole('link',{name:t('会話で読む','Read in conversation'),exact:true}).first().click();await expect(page.locator('article[data-focused=true]')).toBeInViewport();await page.getByRole('link',{name:t('← 投稿一覧へ戻る','← Back to my posts'),exact:true}).click();
  await page.getByTestId('site-header').getByLabel(t('サイトメニュー','Site menu'),{exact:true}).click();const panel=page.getByTestId('site-header').locator('details[open]');await expect(panel.getByRole('link',{name:t('コミュニティを見つける','Discover communities'),exact:true})).toBeVisible();await page.screenshot({path:info.outputPath(`${width}-${lang}-${theme}-menu.png`)});await page.keyboard.press('Escape');
 }
 if(before)return;
 await page.setViewportSize({width:390,height:844});await page.goto('/communities#'+encodeURIComponent('/'+c.id+'?tab=manage'));await expect(page.locator('main [inert]')).toHaveCount(0);await expect(page.getByRole('heading',{name:/Settings|基本設定/}).first()).toBeVisible();await page.goBack();await page.goForward();await expect(page).toHaveURL(/tab/);await expect(page.getByRole('navigation',{name:'In this community',exact:true}).getByRole('button',{name:'Manage',exact:true})).toBeInViewport();
 await page.addStyleTag({content:'body {font-size: 20px} main h1 {font-size: 30px!important} nav a {font-size: 17px!important}'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('390-large-text.png'),fullPage:true});
});
