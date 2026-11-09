import "server-only";
import {readFile,lstat} from "node:fs/promises";
import {z} from "zod";
import {offerSchema} from "../domain/theme-products";
const configSchema=z.strictObject({credentialVersion:z.enum(["3.1","3.2","3.3"]),clientId:z.string().min(1),clientSecret:z.string().min(1),partners:z.partialRecord(z.enum(["JP","US","UK"]),z.string()).optional(),items:z.array(z.object({productId:z.string(),asin:z.string().regex(/^[A-Z0-9]{10}$/),marketplace:z.enum(["JP","US","UK"])})).max(1000)});
const markets={JP:"www.amazon.co.jp",US:"www.amazon.com",UK:"www.amazon.co.uk"},auth={"3.1":"https://api.amazon.com/auth/o2/token","3.2":"https://api.amazon.co.uk/auth/o2/token","3.3":"https://api.amazon.co.jp/auth/o2/token"};
let token:{key:string;value:string;expires:number}|undefined;
const cache=new Map<string,{expires:number;value:z.infer<typeof offerSchema>[]}>(),pending=new Map<string,Promise<z.infer<typeof offerSchema>[]>>();
/** Optional external enrichment only: public graph/record reads never wait for Amazon. Secrets never enter the DTO. */
export async function creatorsOffers(ids:string[],marketplace:keyof typeof markets,fetcher:typeof fetch=fetch){
 const file=process.env.PRODUCTS_CREATORS_CONFIG;if(!file)return {provider:"unconfigured" as const,offers:[]};
 const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid?.()||(info.mode&0o777)!==0o600)throw Error("Product provider configuration unavailable");
 const config=configSchema.parse(JSON.parse(await readFile(file,"utf8"))),partner=config.partners?.[marketplace];if(!partner)return {provider:"unsupported" as const,offers:[]};
 const items=config.items.filter(i=>i.marketplace===marketplace&&ids.includes(i.productId)).slice(0,10);if(!items.length)return {provider:"unverified" as const,offers:[]};
 const key=JSON.stringify([file,marketplace,items]),hit=cache.get(key);if(hit&&hit.expires>Date.now())return {provider:"creators-api" as const,offers:hit.value};
 const load=async()=>{
  const checkedAt=new Date().toISOString();
  try{
   if(!token||token.key!==file||token.expires<Date.now()){
    const r=await fetcher(auth[config.credentialVersion],{method:"POST",redirect:"error",signal:AbortSignal.timeout(8000),headers:{"Content-Type":"application/json"},body:JSON.stringify({grant_type:"client_credentials",client_id:config.clientId,client_secret:config.clientSecret,scope:"creatorsapi::default"})});if(!r.ok)throw Error();const v=z.object({access_token:z.string(),expires_in:z.number().positive()}).parse(await r.json());token={key:file,value:v.access_token,expires:Date.now()+Math.max(0,v.expires_in-60)*1000};
   }
   const r=await fetcher("https://creatorsapi.amazon/catalog/v1/getItems",{method:"POST",redirect:"error",signal:AbortSignal.timeout(8000),headers:{Authorization:"Bearer "+token.value,"Content-Type":"application/json","x-marketplace":markets[marketplace]},body:JSON.stringify({itemIds:items.map(i=>i.asin),itemIdType:"ASIN",marketplace:markets[marketplace],partnerTag:partner,resources:["images.primary.medium","itemInfo.title"]})});if(!r.ok)throw Error();
   const v=await r.json() as {itemsResult?:{items?:{asin:string;detailPageURL:string;images?:{primary?:{medium?:{url:string;width:number;height:number}}}}[]}};
   const values=items.map(i=>{const item=v.itemsResult?.items?.find(v=>v.asin===i.asin),image=item?.images?.primary?.medium;return offerSchema.parse({productId:i.productId,marketplace,asin:i.asin,affiliateUrl:item?.detailPageURL??"https://"+markets[marketplace]+"/dp/"+i.asin,status:item?"ready":"unavailable",checkedAt,...(image?{image:{...image,provider:"creators-api",expiresAt:new Date(Date.now()+3600000).toISOString()}}:{})});});
   cache.set(key,{expires:Date.now()+900000,value:values});return values;
  }catch{const values=items.map(i=>offerSchema.parse({...i,affiliateUrl:"https://"+markets[marketplace]+"/dp/"+i.asin,status:"error",checkedAt}));cache.set(key,{expires:Date.now()+60000,value:values});return values;}
 };
 let work=pending.get(key);if(!work){work=load().finally(()=>pending.delete(key));pending.set(key,work);}return {provider:"creators-api" as const,offers:await work};
}
