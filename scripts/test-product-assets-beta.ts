/** Explicit beta acceptance: a short-lived internal test session passes the real HTTP
 * session checks. It is removed in finally; no Google credentials or cookies are printed.
 * MCP tools are exercised through their transport handler; real ChatGPT refresh is separate. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {serializeSignedCookie} from 'better-call';
import {captureKnowledgeCapsule} from '../lib/client/capsule-knowledge';
import {collectUnusedProductImages} from '../lib/server/member/product-editorial';
import {deleteMember} from '../lib/server/member/operations';
import {memberRuntime} from '../lib/server/member/runtime';
import {dispatchThemeRegistration} from '../lib/server/member/knowledge-theme-registration';
import {createMissionMcpHandler} from '../lib/server/knowledge-mission-mcp';
import {knowledgePublicationPreview} from '../lib/server/knowledge-publication-preview';
import {PROTOCOL_VERSION_META_KEY,CLIENT_INFO_META_KEY,CLIENT_CAPABILITIES_META_KEY} from '@modelcontextprotocol/server';
if(process.argv[2]!=='--confirm-beta'||process.env.KNOWLEDGE_RUNTIME!=='beta')throw Error('Explicit local beta required');
process.loadEnvFile('.env.public');
const runtime=memberRuntime(),{auth,pool,config}=runtime;
if(config.origin!=='https://graph-beta.isinxnisi.com'||new URL(config.databaseUrl).port!=='55433'||new URL(process.env.KNOWLEDGE_DATABASE_URL!).port!=='55476')throw Error('Dedicated beta boundaries required');
if(process.env.PRODUCTS_CREATORS_CONFIG)throw Error('This acceptance requires unconfigured Creators API');
const owner=(process.env.SITE_OPERATOR_USER_IDS??'').split(',')[0],ctx=await auth.$context;
const user=(await pool.query('SELECT id FROM "user" WHERE id=$1 AND active',[owner])).rows[0];assert(user);
const session=await ctx.internalAdapter.createSession(owner,false);
await pool.query('UPDATE session SET "expiresAt"=clock_timestamp()+interval \'10 minutes\' WHERE id=$1',[session.id]);
const cookie=(await serializeSignedCookie(ctx.authCookies.sessionToken.name,session.token,config.secret)).split(';')[0];
const base='http://127.0.0.1:3200',origin=config.origin,headers={cookie,origin,host:'graph-beta.isinxnisi.com','x-member-user':owner};
const handler=createMissionMcpHandler(async()=>{throw Error('No collection plan is used');},{call:command=>dispatchThemeRegistration(owner,command)});
let rpcId=1;let temporaryCapsuleUser:{id:string;email:string}|undefined;
async function tool(name:string,args:Record<string,unknown>){
 const response=await handler.fetch(new Request(origin+'/api/knowledge-collection/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2026-07-28','mcp-method':'tools/call','mcp-name':name},body:JSON.stringify({jsonrpc:'2.0',id:rpcId++,method:'tools/call',params:{name,arguments:args,_meta:{[PROTOCOL_VERSION_META_KEY]:'2026-07-28',[CLIENT_INFO_META_KEY]:{name:'product-beta-acceptance',version:'1'},[CLIENT_CAPABILITIES_META_KEY]:{}}}})}));
 const wire=await response.json();assert(!wire.error,JSON.stringify(wire.error));const v=JSON.parse(wire.result.content[0].text);assert(!wire.result.isError,JSON.stringify(v));return v;
}
async function http(input:Record<string,unknown>){const response=await fetch(base+'/api/site-operations/products',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(input)});const v=await response.json();assert.equal(response.status,200,JSON.stringify(v));return v;}
const reports:Record<string,unknown>={creatorsConfigured:false,httpAuthenticated:true,mcpHandler:true,realChatGptSessionTested:false,images:[],checks:[]};
const directory=path.resolve('.local/product-assets-20261110');await mkdir(directory,{recursive:true});
try{
 const anonymous=await fetch(base+'/api/site-operations/products',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'});assert.equal(anonymous.status,401);
 const cross=await fetch(base+'/api/site-operations/products',{method:'POST',headers:{...headers,origin:'https://evil.invalid','content-type':'application/json'},body:'{}'});assert.equal(cross.status,403);
 const photo=await readFile(process.env.PRODUCT_ACCEPTANCE_IMAGE!);
 const profile={id:'plunode:generated:product-art-v1',kind:'generated',credit:'Plunode',terms:'Plunode運営が用意した紹介用イメージ。実商品の表紙・商品写真ではありません。'};
 const metadata={requestId:randomUUID(),provenance:profile,role:'illustration',alt:{ja:'ジェームズ・ウェッブ宇宙望遠鏡 2027カレンダーの紹介用イメージ',en:'Illustrative image for a James Webb Space Telescope 2027 calendar'}};
 const form=new FormData();form.set('metadata',JSON.stringify(metadata));form.set('image',new Blob([photo]),'calendar.png');
 const response=await fetch(base+'/api/site-operations/products',{method:'POST',headers,body:form}),asset=await response.json();assert.equal(response.status,200,JSON.stringify(asset));(reports.images as unknown[]).push({name:'attached-calendar',...asset});
 const replayForm=new FormData();replayForm.set('metadata',JSON.stringify(metadata));replayForm.set('image',new Blob([photo]),'calendar.png');const replay=await(await fetch(base+'/api/site-operations/products',{method:'POST',headers,body:replayForm})).json();assert.equal(replay.imageId,asset.imageId);assert.equal(replay.replayed,true);
 const product={id:'calendar:B0GMV4CK32',workId:'calendar:red-ember-webb',title:'RED EMBER James Webb Space Telescope 2027 Wall Calendar',displayName:{ja:'ジェームズ・ウェッブ宇宙望遠鏡 2027カレンダー',en:'James Webb Space Telescope 2027 Calendar'},author:'Red Ember',edition:'Wall calendar · 2027',language:'en',category:'calendar',year:2027,metadataSource:'https://www.amazon.co.jp/dp/B0GMV4CK32',imageId:asset.imageId};
 const old=(await pool.query('SELECT coalesce(max(revision),0) AS revision FROM product_editorial_version WHERE id=$1',[product.id])).rows[0].revision;
 const saved=await tool('save_product',{requestId:randomUUID(),expectedRevision:Number(old),product,reason:{ja:'宇宙への好奇心を、毎日の暮らしへ。',en:'Make room for a little cosmic curiosity in everyday life.'},offers:[{productId:product.id,marketplace:'JP',asin:'B0GMV4CK32',affiliateUrl:'https://link.amazon/B0cLIilgt',status:'ready',checkedAt:'2026-11-10T00:00:00Z'}]});
 const oldTheme=await(await knowledgePublicationPreview()).theme({themeId:'reading-20261110:webb:theme',revision:3});
 const latest=await tool('read_theme',{theme:oldTheme.theme.id});
 const target=latest.theme?{id:latest.theme.id,revision:latest.theme.revision}:latest.target;
 assert(target,JSON.stringify(latest).slice(0,300));
 const request=await tool('update_theme',{requestId:randomUUID(),target,changes:{productPins:[{id:saved.id,revision:saved.revision}]},reason:'商品紹介用イメージと確認済み購入先を掲載。知識の記録・出典・旧版を保持'});
 reports.registration=request;reports.product=saved;
 assert.deepEqual(oldTheme.snapshot,(await(await knowledgePublicationPreview()).theme({themeId:oldTheme.theme.id,revision:3})).snapshot);
 // Prepare true aspect-ratio fixtures through the identical authenticated upload and product operations.
 for(const [name,width,height,alpha] of [['portrait',600,1600,false],['landscape',2400,800,false],['white',900,900,false],['transparent',800,600,true]] as const){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="2" y="2" width="${width-4}" height="${height-4}" fill="${alpha?'none':'white'}" stroke="#2c668c" stroke-width="2"/><path d="M20 20L${width-20} ${height-20}M${width-20} 20L20 ${height-20}" stroke="#c98a32" stroke-width="2"/><text x="24" y="65" font-family="sans-serif" font-size="32" fill="#163448">QA ${name}</text><text x="24" y="108" font-size="24" fill="#163448">${width} x ${height}</text></svg>`;
  const binary=await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile(path.join(directory,`${name}-original.png`),binary);
  const uploaded=await (name==='portrait'?((value:Record<string,unknown>)=>tool('upload_product_image',Object.fromEntries(Object.entries(value).filter(([k])=>k!=='action')))):http)({action:'upload-product-image',requestId:randomUUID(),provenanceId:profile.id,role:'illustration',alt:{ja:'表示試験：'+name,en:'Layout test: '+name},base64:binary.toString('base64')});
  (reports.images as unknown[]).push({name,...uploaded});
  const id='qa:product-card:'+name,current=Number((await pool.query('SELECT coalesce(max(revision),0) revision FROM product_editorial_version WHERE id=$1',[id])).rows[0].revision);
  await tool('save_product',{requestId:randomUUID(),expectedRevision:current,product:{...product,id,workId:id,imageId:uploaded.imageId,displayName:{ja:'【表示試験】'+name+'：長い商品名でも画像と紹介文・購入ボタンが押し潰されないことを確認します',en:'[Layout test] '+name+' with a long product title and short introduction'}},reason:{ja:'縦横比・細い線・背景・文字を同じカードで確認する試験素材です。実商品の画像ではありません。',en:'A test of aspect ratio, thin lines, backgrounds and text. This is not a real product image.'},offers:[]});
 }
 async function completed(requestId:string){for(let i=0;i<20;i++){const v=await tool('get_theme_registration',{requestId});if(v.state==='published')return v.theme;assert(!['needs-changes','cancelled'].includes(v.state),JSON.stringify(v));await new Promise(resolve=>setTimeout(resolve,1500));}throw Error('Theme still processing');}
 const accepted=await completed(request.requestId);reports.publishedTheme=accepted;
 const finalTheme=await(await knowledgePublicationPreview()).theme({themeId:oldTheme.theme.id,revision:accepted.revision});assert.equal(finalTheme.theme.content.readingBaseRevision,3);
 const portrait=(reports.images as {name:string;imageId:string}[]).find(v=>v.name==='portrait')!,landscape=(reports.images as {name:string;imageId:string}[]).find(v=>v.name==='landscape')!;
 const replacementId='qa:product-card:replacement',replacementHead=Number((await pool.query('SELECT coalesce(max(revision),0) revision FROM product_editorial_version WHERE id=$1',[replacementId])).rows[0].revision);
 const saveReplacement=(imageId:string,expectedRevision:number)=>tool('save_product',{requestId:randomUUID(),expectedRevision,product:{...product,id:replacementId,workId:replacementId,displayName:{ja:'【表示試験】差し替えと過去版の保持',en:'[Test] Image replacement and saved editions'},imageId},reason:{ja:'画像の差し替え前後を比較するための試験素材です。',en:'A fixture for comparing image editions.'},offers:[]});
 const v1=await saveReplacement(portrait.imageId,replacementHead),previousQa=(await pool.query("SELECT result FROM knowledge_missions.theme_registrations WHERE owner_id=$1 AND input->>'title'='【表示確認】商品画像の差し替え・固定版' AND state='published' ORDER BY created_at DESC LIMIT 1",[owner])).rows[0]?.result,composition=previousQa?{requestId:null}:await tool('submit_theme',{requestId:randomUUID(),title:'【表示確認】商品画像の差し替え・固定版',description:'運営用の比較テーマです。実商品の画像・仕様として公開するものではありません。',recordPins:oldTheme.theme.content.recordPins,initialView:'split',productPins:[{id:v1.id,revision:v1.revision}]});
 const qa1=previousQa??await completed(composition.requestId),resolved1=await(await knowledgePublicationPreview()).theme({themeId:qa1.id,revision:qa1.revision});
 // Real save/share APIs retain the selected immutable product edition inside the snapshot.
 const fixtureEmail=randomUUID()+'@product-card-fixture.invalid';
 temporaryCapsuleUser=await ctx.internalAdapter.createUser({name:'商品カード検証',email:fixtureEmail,emailVerified:true,active:true,locale:'ja'},{method:'oauth',oauth:{providerId:'google',profile:{}}});
 const temporarySession=await ctx.internalAdapter.createSession(temporaryCapsuleUser.id,false);
 const capsuleHeaders={...headers,'x-member-user':temporaryCapsuleUser.id,cookie:(await serializeSignedCookie(ctx.authCookies.sessionToken.name,temporarySession.token,config.secret)).split(';')[0]};
 const captured=captureKnowledgeCapsule({snapshot:resolved1.snapshot,theme:resolved1.theme,title:'【表示確認】商品画像の固定版',view:'split'});
 const created=await fetch(base+'/api/member/capsules',{method:'POST',headers:{...capsuleHeaders,'content-type':'application/json'},body:JSON.stringify({requestId:randomUUID(),content:{dataset:captured.dataset,title:captured.title,note:captured.note,language:captured.language,entityIds:[],claimIds:[],document:captured.document}})}),createdBody=await created.json();assert.equal(created.status,201,JSON.stringify(createdBody));const capsule=createdBody.capsule;
 const v2=await saveReplacement(landscape.imageId,v1.revision),latestQa=await tool('read_theme',{theme:qa1.id}),updated=await tool('update_theme',{requestId:randomUUID(),target:latestQa.target,changes:{productPins:[{id:v2.id,revision:v2.revision}]},reason:'画像の版保持を比較する運営用試験'}),qa2=await completed(updated.requestId);
 const card=(pin:{id:string;revision:number})=>fetch(base+'/api/knowledge/theme-products?'+new URLSearchParams({themeId:pin.id,revision:String(pin.revision),marketplace:'JP'}),{headers:{host:'graph-beta.isinxnisi.com'}}).then(v=>v.json());
 const oldCard=await card(qa1),newCard=await card(qa2);assert(oldCard.products[0].product.image.url.endsWith(portrait.imageId));assert(newCard.products[0].product.image.url.endsWith(landscape.imageId));
 assert.equal((await fetch(base+oldCard.products[0].product.image.url)).status,200);assert.equal((await fetch(base+newCard.products[0].product.image.url)).status,200);
 const savedCapsule=await(await fetch(base+'/api/member/capsules/'+capsule.id,{headers:capsuleHeaders})).json();assert.equal(savedCapsule.capsule.content.document.knowledge.snapshot.theme.content.productPins[0].revision,resolved1.theme.content.productPins![0].revision);
 const shareResponse=await fetch(base+'/api/member/capsules/'+capsule.id+'/share',{method:'POST',headers:{...capsuleHeaders,'content-type':'application/json'},body:JSON.stringify({expectedRevision:1,expectedShareId:null})}),shared=await shareResponse.json();assert.equal(shareResponse.status,201,JSON.stringify(shared));
 const sharedRead=await fetch(base+'/api/shared/capsule',{headers:{'x-capsule-token':shared.token}});assert.equal(sharedRead.status,200);
 const revoke=await fetch(base+'/api/member/capsules/'+capsule.id+'/share',{method:'DELETE',headers:{...capsuleHeaders,'content-type':'application/json'},body:JSON.stringify({expectedShareId:shared.share.id})});assert.equal(revoke.status,200);
 assert.equal((await fetch(base+'/api/shared/capsule',{headers:{'x-capsule-token':shared.token}})).status,404);
 reports.preservation={previousTheme:3,previousKnowledgeUnchanged:true,readingPresentationRetained:true,qaTheme:{id:qa1.id,before:qa1.revision,after:qa2.revision},oldImageStillAvailable:true,newImageAvailable:true,capsuleSaved:true,capsuleImagePinRetained:true,limitedShareRead:true,shareRevoked:true};
 // Only this never-linked fixture is aged. Real media and all historical product-version FKs remain untouched.
 const unusedBytes=await sharp({create:{width:64,height:64,channels:4,background:{r:30,g:90,b:120,alpha:.5}}}).png().toBuffer();
 const unusedInput={action:'upload-product-image',requestId:randomUUID(),provenanceId:profile.id,role:'illustration',alt:{ja:'未参照素材の整理試験',en:'Unused asset cleanup fixture'},base64:unusedBytes.toString('base64')};
 const unused=await http(unusedInput);await pool.query("UPDATE product_image_asset SET created_at=clock_timestamp()-interval '8 days' WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM product_editorial_version p WHERE p.image_id=$1)",[unused.imageId]);await pool.query("UPDATE product_asset_maintenance SET last_run=clock_timestamp()-interval '2 days'");await collectUnusedProductImages(pool);
 assert.equal((await pool.query('SELECT 1 FROM product_image_asset WHERE id=$1',[unused.imageId])).rowCount,0);assert.equal((await pool.query('SELECT 1 FROM product_image_asset WHERE id=$1',[asset.imageId])).rowCount,1);const reuploaded=await http(unusedInput);assert.equal(reuploaded.imageId,unused.imageId);reports.garbageCollection={graceDays:7,unusedRemoved:true,referencedPreserved:true,reuploadAfterExpiry:true};
 const forbidden=await fetch(base+'/api/site-operations/products',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({action:'upload-product-image',...metadata,requestId:randomUUID(),base64:Buffer.from('<svg/>').toString('base64')})});assert.equal(forbidden.status,400);
 (reports.checks as string[]).push('anonymous 401','cross-origin 403','SVG 400','multipart file upload','same request replay unchanged','MCP save_product + update_theme handler','same provenance reused for all image types','Creators API unconfigured');
 await writeFile(path.join(directory,'acceptance.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
 }finally{try{if(temporaryCapsuleUser){const cleanup=await ctx.internalAdapter.createSession(temporaryCapsuleUser.id,false);await deleteMember(pool,temporaryCapsuleUser.id,cleanup.id);}}finally{await ctx.internalAdapter.deleteSession(session.token);await pool.end();}}
process.exit(0);
