import {chromium} from '@playwright/test';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import type {AutomationTarget} from '../lib/domain/theme-automation';
import {automationFailure,PREVIEW_HEADER} from '../lib/server/theme-automation';
import {inspectThemePage,themeSnapshot,viewports} from './review-theme-browser';

export async function captureAutomationPreview(origin:string,target:AutomationTarget,token:string){
  const browser=await chromium.launch({timeout:20_000});
  const grant={[PREVIEW_HEADER]:token};
  const prefix='/operations/themes/'+encodeURIComponent(target.theme.id);
  const evidence=new Map<string,Buffer>();
  const screens=[];
  let build:string|undefined;
  let complete=true;
  try{
    const context=await browser.newContext({acceptDownloads:false,serviceWorkers:'block',reducedMotion:'reduce'});
    context.setDefaultTimeout(7500);
    context.setDefaultNavigationTimeout(20_000);
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin!==origin||request.method()!=='GET')return route.abort();
      if(url.pathname===prefix||url.pathname==='/api/site-operations/theme-products'||
          url.pathname.startsWith('/api/knowledge/product-images/')){
        try{
          const response=await route.fetch({maxRedirects:0,timeout:20_000,headers:{...request.headers(),...grant}});
          if(response.status()>=300&&response.status()<400)return await route.abort();
          return await route.fulfill({response});
        }catch{
          // Playwright errors may include the private grant in the request log.
          await route.abort().catch(()=>{});
          return;
        }
      }
      if(url.pathname.startsWith('/_next/static/')||url.pathname.startsWith('/theme-assets/')||url.pathname==='/favicon.ico')return route.continue();
      return route.abort();
    });
    try{
      for(const locale of target.locales){
        const before=await themeSnapshot(context,origin,target.theme.id,target.theme.revision,locale,grant);
        if(!before.build||build&&before.build!==build)throw automationFailure('PREVIEW_BUILD_CHANGED','画面の配備版が変わりました。');
        build=before.build;
        const url=origin+prefix+'?'+new URLSearchParams({locale,revision:String(target.theme.revision)});
        for(const viewport of viewports){
          const page=await context.newPage();
          await page.setViewportSize(viewport);
          try{
            const screen=await inspectThemePage(page,url,target.theme.revision,locale,before.hasImage,'',viewport.width,async(name,bytes)=>{
              const png=await sharp(bytes).png({palette:true,compressionLevel:9}).toBuffer();
              if(png.length>900_000)throw automationFailure('PREVIEW_IMAGE_TOO_LARGE','画面証拠が大きすぎます。');
              evidence.set(locale+'-'+name,png);
            },{timeline:before.hasTimeline,story:before.hasStory});
            screens.push({locale,...screen});
            if(screen.horizontalOverflow||before.hasImage&&screen.steps.imageDialog!=='observed'||
              before.hasTimeline&&screen.steps.timelineSourceAndBack!=='observed'||before.hasStory&&screen.steps.storySourceAndBack!=='observed'||
              (screen.steps.timelineImageDialog!==undefined&&screen.steps.timelineImageDialog!=='observed')||
              Object.values(screen.steps).includes('unverified'))complete=false;
          }catch{
            screens.push({locale,width:viewport.width,status:'preview-unverified'});
            complete=false;
          }finally{await page.close();}
        }
        const after=await themeSnapshot(context,origin,target.theme.id,target.theme.revision,locale,grant);
        if(before.digest!==after.digest||before.build!==after.build)throw automationFailure('PREVIEW_TARGET_CHANGED','採取中に対象画面が更新されました。');
      }
    }finally{await context.unrouteAll({behavior:'ignoreErrors'});await context.close();}
  }finally{await browser.close();}
  if(!evidence.size)throw automationFailure('PREVIEW_NO_EVIDENCE','画面証拠を採取できませんでした。');
  const names=[...evidence.keys()];
  return {evidence,result:{build,complete,screens,names,visualReviewRequired:true,observedAt:new Date().toISOString(),
    hashes:Object.fromEntries([...evidence].map(([name,bytes])=>[name,createHash('sha256').update(bytes).digest('hex')]))}};
}
