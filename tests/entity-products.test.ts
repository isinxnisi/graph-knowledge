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
import {entityProducts,linkedThemeProducts,type ProductCatalogue} from "../lib/domain/theme-products";
afterEach(()=>vi.resetAllMocks());
const product={id:"pluto-set",workId:"pluto",title:"PLUTO 全8巻セット",author:"",edition:"",language:"ja",metadataSource:"https://www.amazon.co.jp/dp/B00TEST123",imageId:"a".repeat(64)};
const offer={productId:product.id,marketplace:"JP",asin:"B00TEST123",affiliateUrl:"https://link.amazon/B0iJNnc7U",status:"ready",checkedAt:"2026-11-13T00:00:00Z"};
const theme={id:"pluto-theme",revision:3,content:{productPins:[{id:product.id,revision:2}]}};
const value={product,offers:[offer],reason:{ja:"第1巻から最終巻まで読む。",en:"Read the whole series."},appliesTo:[{kind:"entity",id:"theme-pluto"}]};
function setup(){
 mocks.provider.mockResolvedValue({offers:[]});
 mocks.context.mockResolvedValue({entityIds:["legacy-pluto","theme-pluto"],productPins:theme.content.productPins,themes:[{id:theme.id,revision:3,editorial:true}]});
 mocks.theme.mockResolvedValue({theme,snapshot:{entities:[{id:"theme-pluto",revision:4}],records:[]}});
 mocks.query.mockImplementation(async(sql:string,args:unknown[])=>sql.includes("WITH current AS")?{rows:[{id:product.id,revision:2}]}:sql.includes("product_image_asset")?{rows:[{role:"product-photo",alt:{ja:"PLUTOの表紙",en:"PLUTO cover"},width:745,height:1000,provenance:{kind:"provided",creditDisplay:"internal",credit:"Internal account"}}]}: {rows:args[0]===product.id&&args[1]===2?[{revision:2,content:value}]:[]});
}
it("normal graph and a pinned theme return the same registered edition, image and purchase destination",async()=>{
 setup();
 const ordinary=await GET(new Request("https://beta/api/knowledge/theme-products?kind=entity&id=legacy-pluto&alternatives=1"));
 const themed=await GET(new Request("https://beta/api/knowledge/theme-products?themeId=pluto-theme&revision=3&kind=entity&id=theme-pluto"));
 expect(ordinary.status).toBe(200);expect(themed.status).toBe(200);
 const a=(await ordinary.json()).products,b=(await themed.json()).products;
 expect(a).toHaveLength(1);expect(a[0].product).toEqual(b[0].product);expect(a[0].offer).toEqual(b[0].offer);
 expect(a[0].product.image).toMatchObject({url:"/api/knowledge/product-images/"+product.imageId,role:"product-photo"});expect(a[0].product.image.credit).toBeUndefined();
 expect(a[0].offer.affiliateUrl).toBe(offer.affiliateUrl);expect(mocks.query.mock.calls.filter(([sql])=>String(sql).startsWith("SELECT revision,content FROM product_editorial_version")).every(([,args])=>args[1]===2)).toBe(true);
});
it("does not infer products from a shared theme or the original story, anime or neighboring people",async()=>{
 setup();mocks.context.mockResolvedValue({entityIds:["anime-pluto"],productPins:theme.content.productPins,themes:[{id:theme.id,revision:3,editorial:true}]});
 const response=await GET(new Request("https://beta/api/knowledge/theme-products?kind=entity&id=anime-pluto"));expect((await response.json()).products).toEqual([]);expect(mocks.provider).not.toHaveBeenCalled();
});
it("no associated registered product means no fabricated card",async()=>{
 setup();mocks.context.mockResolvedValue({entityIds:["legacy-pluto"],productPins:[],themes:[]});mocks.query.mockResolvedValue({rows:[]});
 const response=await GET(new Request("https://beta/api/knowledge/theme-products?kind=entity&id=legacy-pluto"));expect((await response.json()).products).toEqual([]);expect(mocks.provider).not.toHaveBeenCalled();
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

it("テーマ内のEntity・関係・出来事の各紐づきを保持し、テーマ外は混入しない",()=>{
 const cat={products:[product],offers:[],recommendations:[
  {id:"theme",productId:product.id,target:{kind:"theme",id:theme.id,revision:3},state:"public",order:0,reason:{ja:"テーマ",en:"Theme"}},
  ...["entity","relation","event","outside"].map((id,index)=>({id,productId:product.id,target:{kind:id==="entity"?"entity":"record",id,revision:1},state:"public",order:index+1,reason:{ja:id,en:id}}))
 ]} as ProductCatalogue;
 const snapshot={entities:[{id:"entity",revision:1}],records:[{id:"relation",revision:1},{id:"event",revision:1}]} as Parameters<typeof linkedThemeProducts>[1];
 const result=linkedThemeProducts(theme as Parameters<typeof linkedThemeProducts>[0],snapshot,"JP",Date.now(),cat);
 expect(result.map(i=>i.target.id)).toEqual(["entity","relation","event"]);
});

it("紐づき一覧APIと関係・出来事の詳細APIの双方から同じ商品を読める",async()=>{
 setup();mocks.theme.mockResolvedValue({theme,snapshot:{entities:[{id:"theme-pluto",revision:4}],records:[{id:"relation",revision:2},{id:"event",revision:3}]}});
 const content={...value,appliesTo:[...value.appliesTo,{kind:"record",id:"relation"},{kind:"record",id:"event"}]};
 const original=mocks.query.getMockImplementation()!;mocks.query.mockImplementation(async(sql:string,args:unknown[])=>String(sql).includes("product_editorial_version")?{rows:[{revision:2,content}]}:original(sql,args));
 const linked=await GET(new Request("https://beta/api/knowledge/theme-products?themeId=pluto-theme&revision=3&associations=1"));expect(linked.status).toBe(200);
 expect((await linked.json()).products.map((row:{target:{id:string}})=>row.target.id)).toEqual(["theme-pluto","relation","event"]);
 for(const id of ["relation","event"]){const response=await GET(new Request("https://beta/api/knowledge/theme-products?themeId=pluto-theme&revision=3&kind=record&id="+id));expect((await response.json()).products[0].product.id).toBe(product.id);}
});

it("テーマの紹介商品と全要素の関連商品を分離し、空のproductPinsでも関連商品を読める",async()=>{
 setup();
 mocks.theme.mockResolvedValue({theme:{...theme,content:{productPins:[]}},snapshot:{entities:[{id:"theme-pluto",revision:4}],records:[{id:"event",revision:3}]}});
 const content={...value,appliesTo:[...value.appliesTo,{kind:"record",id:"event"}]};
 const original=mocks.query.getMockImplementation()!;
 mocks.query.mockImplementation(async(sql:string,args:unknown[])=>sql.startsWith("SELECT revision,content FROM product_editorial_version")?{rows:[{revision:2,content}]}:original(sql,args));
 const fetchProducts=async(suffix:string)=>(await (await GET(new Request("https://beta/api/knowledge/theme-products?themeId=pluto-theme&revision=3"+suffix))).json()).products;
 expect(await fetchProducts("")).toEqual([]);
 expect((await fetchProducts("&associations=1")).map((p:{target:{id:string}})=>p.target.id)).toEqual(["theme-pluto","event"]);
 expect((await fetchProducts("&kind=entity&id=theme-pluto"))[0].product.id).toBe(product.id);
 expect((await fetchProducts("&kind=record&id=event"))[0].product.id).toBe(product.id);
});

it("関連商品の検索は商品最新版で明示された紐づきに限定し、kindも照合する",async()=>{
 setup();
 await GET(new Request("https://beta/api/knowledge/theme-products?themeId=pluto-theme&revision=3&associations=1"));
 const [sql,args]=mocks.query.mock.calls.find(([q])=>q.includes("WITH current AS"))!;
 expect(sql).toContain("SELECT DISTINCT ON(id)");expect(sql).toContain("ORDER BY id,revision DESC");
 expect(sql).toContain("association->>'kind'=target.kind");expect(sql).toContain("association->>'id'=target.id");
 expect(JSON.parse(args[0])).toEqual([{kind:"entity",id:"theme-pluto"}]);
});
