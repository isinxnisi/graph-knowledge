import {z} from "zod";
import catalogue from "../../data/theme-products.json";
import type {KnowledgeSnapshot,KnowledgeThemeVersion} from "./knowledge-foundation";
import {productCatalogueSchema,target,type ProductCatalogue} from "./product-contract";
export {productSchema,offerSchema,productCatalogueSchema,type ProductCatalogue} from "./product-contract";
export const productCatalogue=productCatalogueSchema.parse(catalogue);
const data=productCatalogue;
export function contextualProducts(theme:KnowledgeThemeVersion,snapshot:KnowledgeSnapshot,selection:{kind:"record"|"entity";id:string}|null,marketplace:"JP"|"US"|"UK",now=Date.now(),catalog:ProductCatalogue=data){
 const pins=selection?selection.kind==="record"?snapshot.records.filter(r=>r.id===selection.id):snapshot.entities.filter(e=>e.id===selection.id):[theme,...snapshot.records,...snapshot.entities];
 const match=(t:z.infer<typeof target>)=>selection?t.kind===selection.kind&&pins.some(p=>p.id===t.id&&p.revision===t.revision):t.kind==="theme"?t.id===theme.id&&t.revision===theme.revision:(t.kind==="record"?snapshot.records:snapshot.entities).some(p=>p.id===t.id&&p.revision===t.revision);
 const recs=catalog.recommendations.filter(r=>r.state==="public"&&match(r.target)).sort((a,b)=>a.order-b.order);
 return recommendedProducts(recs,marketplace,now,catalog);
}

/** Ordinary graph selection follows explicit Entity associations, never nearby nodes. */
export function entityProducts(entityIds:string[],marketplace:"JP"|"US"|"UK",now=Date.now(),catalog=data){
 const recs=catalog.recommendations.filter(r=>r.state==="public"&&r.target.kind==="entity"&&entityIds.includes(r.target.id)).sort((a,b)=>a.order-b.order);
 return recommendedProducts(recs,marketplace,now,catalog);
}
function recommendedProducts(recs:ProductCatalogue["recommendations"],marketplace:"JP"|"US"|"UK",now:number,catalog:ProductCatalogue){
 const seen=new Set<string>();return recs.flatMap(r=>{const p=catalog.products.find(p=>p.id===r.productId);if(!p||seen.has(p.id))return [];seen.add(p.id);const offers=[...new Map(catalog.offers.filter(o=>o.productId===p.id).map(o=>[o.marketplace,o])).values()],offer=offers.find(o=>o.marketplace===marketplace),image=offer?.image&&Date.parse(offer.image.expiresAt)>now?offer.image:undefined;return [{product:p,reason:r.reason,target:r.target,offer:offer?{...offer,image}:null,alternatives:offers.filter(o=>o.marketplace!==marketplace&&o.status==="ready").map(o=>({...o,image:o.image&&Date.parse(o.image.expiresAt)>now?o.image:undefined})),status:!offer?"unverified" as const:offer.status}];});
}
