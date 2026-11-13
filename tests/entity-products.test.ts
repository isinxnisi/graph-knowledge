import {afterEach,expect,it,vi} from "vitest";
import type {PoolClient} from "pg";
vi.mock("server-only",()=>({}));
const mocks=vi.hoisted(()=>({identity:vi.fn(),resolve:vi.fn(),context:vi.fn(),theme:vi.fn(),query:vi.fn(),provider:vi.fn()}));
vi.mock("../lib/server/knowledge-identity-resolution",()=>({identityGroup:mocks.identity}));
vi.mock("../lib/server/knowledge-foundation",async original=>({...await original<object>(),resolvePublicKnowledgeTheme:mocks.resolve}));
vi.mock("../lib/server/knowledge-read-runtime",()=>({knowledgeReadGuard:()=>{}}));
vi.mock("../lib/server/knowledge-publication-preview",()=>({knowledgePublicationPreview:async()=>({entityProductContext:mocks.context,theme:mocks.theme})}));
vi.mock("../lib/server/member/runtime",()=>({memberRuntime:()=>({pool:{query:mocks.query}})}));
vi.mock("../lib/server/theme-product-provider",async original=>({...await original<object>(),creatorsOffers:mocks.provider}));
import {GET} from "../app/api/knowledge/theme-products/route";
import {readEntityProductContext} from "../lib/server/knowledge-entity-products";
import {KnowledgeError} from "../lib/server/knowledge-foundation";
import {entityProducts,type ProductCatalogue} from "../lib/domain/theme-products";
afterEach(()=>vi.resetAllMocks());
const product={id:"pluto-set",workId:"pluto",title:"PLUTO 全8巻セット",language:"ja",metadataSource:"https://www.amazon.co.jp/dp/B00TEST123",imageId:"a".repeat(64)};
const offer={productId:product.id,marketplace:"JP",asin:"B00TEST123",affiliateUrl:"https://link.amazon/B0iJNnc7U",status:"ready",checkedAt:"2026-11-13T00:00:00Z"};
const theme={id:"pluto-theme",revision:3,content:{productPins:[{id:product.id,revision:2}]}};
const value={product,offers:[offer],reason:{ja:"第1巻から最終巻まで読む。",en:"Read the whole series."},appliesTo:[{kind:"entity",id:"theme-pluto"}]};
function setup(){
 mocks.provider.mockResolvedValue({offers:[]});
 mocks.context.mockResolvedValue({entityIds:["legacy-pluto","theme-pluto"],productPins:theme.content.productPins,themes:[{id:theme.id,revision:3,editorial:true}]});
 mocks.theme.mockResolvedValue({theme,snapshot:{entities:[{id:"theme-pluto",revision:4}],records:[]}});
 mocks.query.mockImplementation(async(sql:string,args:unknown[])=>sql.includes("product_image_asset")?{rows:[{role:"product-photo",alt:{ja:"PLUTOの表紙",en:"PLUTO cover"},width:745,height:1000,provenance:{kind:"provided",creditDisplay:"internal",credit:"Internal account"}}]}: {rows:args[0]===product.id&&args[1]===2?[{revision:2,content:value}]:[]});
}
it("normal graph and a pinned theme return the same registered edition, image and purchase destination",async()=>{
 setup();
 const ordinary=await GET(new Request("https://beta/api/knowledge/theme-products?kind=entity&id=legacy-pluto&alternatives=1"));
 const themed=await GET(new Request("https://beta/api/knowledge/theme-products?themeId=pluto-theme&revision=3&kind=entity&id=theme-pluto"));
 expect(ordinary.status).toBe(200);expect(themed.status).toBe(200);
 const a=(await ordinary.json()).products,b=(await themed.json()).products;
 expect(a).toHaveLength(1);expect(a[0].product).toEqual(b[0].product);expect(a[0].offer).toEqual(b[0].offer);
 expect(a[0].product.image).toMatchObject({url:"/api/knowledge/product-images/"+product.imageId,role:"product-photo"});expect(a[0].product.image.credit).toBeUndefined();
 expect(a[0].offer.affiliateUrl).toBe(offer.affiliateUrl);expect(mocks.query.mock.calls.filter(([sql])=>String(sql).includes("product_editorial_version")).every(([,args])=>args[1]===2)).toBe(true);
});
it("does not infer products from a shared theme or the original story, anime or neighboring people",async()=>{
 setup();mocks.context.mockResolvedValue({entityIds:["anime-pluto"],productPins:theme.content.productPins,themes:[{id:theme.id,revision:3,editorial:true}]});
 const response=await GET(new Request("https://beta/api/knowledge/theme-products?kind=entity&id=anime-pluto"));expect((await response.json()).products).toEqual([]);expect(mocks.provider).not.toHaveBeenCalled();
});
it("no public product pin means no draft products or fabricated card",async()=>{
 setup();mocks.context.mockResolvedValue({entityIds:["legacy-pluto"],productPins:[],themes:[]});
 const response=await GET(new Request("https://beta/api/knowledge/theme-products?kind=entity&id=legacy-pluto"));expect((await response.json()).products).toEqual([]);expect(mocks.query).not.toHaveBeenCalled();
});
it("only readable theme editions supply pins; duplicate pins choose the newest public edition",async()=>{
 mocks.identity.mockResolvedValue(["legacy-pluto","theme-pluto"]);
 mocks.resolve.mockImplementation(async(_c,id:string)=>{if(id==="hidden")throw new KnowledgeError("hidden",404,"NOT_FOUND");return {theme:{id,revision:1,content:{productPins:[{id:product.id,revision:id==="older"?1:2}]}}};});
 const query=vi.fn().mockResolvedValue({rows:[{id:"older",revision:1},{id:"newer",revision:1},{id:"hidden",revision:1}]});
 const context=await readEntityProductContext({query} as unknown as PoolClient,"legacy-pluto");
 expect(context.productPins).toEqual([{id:product.id,revision:2}]);expect(context.themes.map(t=>t.id)).toEqual(["older","newer"]);expect(query.mock.calls[0][1]).toEqual([["legacy-pluto","theme-pluto"]]);
});
it("explicit identity associations deduplicate products and preserve regional alternatives",()=>{
 const catalog={products:[product],offers:[offer],recommendations:["legacy-pluto","theme-pluto"].map((id,order)=>({id,target:{kind:"entity",id,revision:1},productId:product.id,reason:value.reason,order,state:"public"}))} as ProductCatalogue;
 const items=entityProducts(["legacy-pluto","theme-pluto"],"US",Date.now(),catalog);expect(items).toHaveLength(1);expect(items[0].offer).toBeNull();expect(items[0].alternatives[0].affiliateUrl).toBe(offer.affiliateUrl);
 expect(entityProducts(["unrelated"],"JP",Date.now(),catalog)).toEqual([]);
});
it("theme reads retain the requested version and reject entities outside that snapshot",async()=>{
 setup();const response=await GET(new Request("https://beta/api/knowledge/theme-products?themeId=pluto-theme&revision=3&kind=entity&id=legacy-pluto"));
 expect(response.status).toBe(404);expect(mocks.theme).toHaveBeenCalledWith({themeId:"pluto-theme",revision:3});
});
