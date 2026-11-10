import {it,expect,vi} from "vitest";
import sharp from "sharp";
vi.mock("server-only",()=>({}));
import {processProductImage} from "../lib/server/product-image-processing";
import {mergeProductOffers} from "../lib/server/theme-product-provider";
import {productAuthoringCommandSchema} from "../lib/domain/product-authoring";
import {knowledgeThemeContentSchema} from "../lib/domain/knowledge-foundation";
it.each([[1254,1254],[600,1600],[2400,800],[64,40]])("縦横比・透過・文字のある画素を維持する %ix%i",async(width,height)=>{
 const input=await sharp({create:{width,height,channels:4,background:{r:255,g:255,b:255,alpha:.2}}}).png().toBuffer();
 const result=await processProductImage(input),meta=await sharp(result.bytes).metadata();
 expect(Math.max(result.width,result.height)).toBeLessThanOrEqual(1600);expect(result.width/result.height).toBeCloseTo(width/height,2);expect(meta.hasAlpha).toBe(true);expect(meta.exif).toBeUndefined();expect(result.original.bytes).toBe(input.length);expect(result.processedBytes).toBeLessThan(3_000_000);expect(result.thumbnailBytes).toBeLessThan(1_500_000);expect(result.width).toBeLessThanOrEqual(width);expect(result.height).toBeLessThanOrEqual(height);
});
it("SVG・破損・容量/画素数超過は保存用データを作らず拒否する",async()=>{
 for(const input of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>bad()</script></svg>'),Buffer.from('not-image'),Buffer.alloc(8*1024*1024+1)])await expect(processProductImage(input)).rejects.toHaveProperty('code');
 const huge=await sharp({create:{width:5001,height:5001,channels:3,background:'white'}}).png().toBuffer();await expect(processProductImage(huge)).rejects.toHaveProperty('code','IMAGE_INVALID');
});
it("Creators障害でも確認済み販売先を保ち、正常時だけAPI画像を補う",()=>{
 const original={productId:'calendar',marketplace:'JP' as const,asin:'B0GMV4CK32',affiliateUrl:'https://link.amazon/B0cLIilgt',status:'ready' as const,checkedAt:'2026-11-10T00:00:00Z'};
 expect(mergeProductOffers([original],[{...original,status:'error',affiliateUrl:'https://www.amazon.co.jp/dp/B0GMV4CK32'}])).toEqual([original]);
 const image={url:'https://m.media-amazon.com/images/I/fixture.jpg',width:90,height:150,provider:'creators-api' as const,expiresAt:'2026-11-11T00:00:00Z'};
 expect(mergeProductOffers([original],[{...original,image}])[0]).toEqual({...original,image});
});
it("運営生成素材に架空の出典URLを求めず、URL画像取込は受け付けない",()=>{
 const input={action:'upload-product-image',requestId:'00000000-0000-4000-8000-000000000001',provenance:{id:'plunode:generated',kind:'generated',terms:'Plunode運営制作'},alt:{ja:'紹介用イメージ',en:'Illustration'},base64:'aGVsbG8='};
 expect(productAuthoringCommandSchema.safeParse(input).success).toBe(true);expect(productAuthoringCommandSchema.safeParse({...input,base64:undefined,url:'https://m.media-amazon.com/cover.jpg'}).success).toBe(false);
});
it("旧テーマの構造を変換せず、商品ピンは任意で保持する",()=>{
 const input={title:'Theme',description:'',recordPins:[{id:'r',revision:1}],entityPins:[],sourcePins:[],mappingPins:[],initialView:'graph'};
 const old=knowledgeThemeContentSchema.parse(input);expect(old).not.toHaveProperty('productPins');expect(knowledgeThemeContentSchema.parse({...input,productPins:[{id:'calendar:one',revision:2}]}).productPins).toEqual([{id:'calendar:one',revision:2}]);
});
