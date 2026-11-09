import {z} from "zod";
import catalogue from "../../data/theme-products.json";
import type {KnowledgeSnapshot,KnowledgeThemeVersion} from "./knowledge-foundation";
const target=z.object({kind:z.enum(["theme","entity","record"]),id:z.string(),revision:z.number().int().positive()});
export const productSchema=z.object({id:z.string(),workId:z.string(),title:z.string(),author:z.string(),edition:z.string(),language:z.string(),isbn:z.string().optional(),metadataSource:z.url()});
export const offerSchema=z.object({productId:z.string(),marketplace:z.enum(["JP","US","UK"]),asin:z.string().regex(/^[A-Z0-9]{10}$/),affiliateUrl:z.url().refine(v=>{const u=new URL(v);return u.protocol==="https:"&&["www.amazon.co.jp","www.amazon.com","www.amazon.co.uk","amzn.to","link.amazon"].includes(u.hostname);}),status:z.enum(["ready","unavailable","error"]),checkedAt:z.iso.datetime(),image:z.object({url:z.url().refine(v=>{const u=new URL(v);return u.protocol==="https:"&&["m.media-amazon.com","images-na.ssl-images-amazon.com","images-eu.ssl-images-amazon.com"].includes(u.hostname);}),width:z.number().positive(),height:z.number().positive(),provider:z.literal("creators-api"),expiresAt:z.iso.datetime()}).optional()});
export const productCatalogueSchema=z.object({products:z.array(productSchema),recommendations:z.array(z.object({id:z.string(),target,productId:z.string(),reason:z.object({ja:z.string(),en:z.string()}),order:z.number(),state:z.enum(["public","draft"])})),offers:z.array(offerSchema)});
export type ProductCatalogue=z.infer<typeof productCatalogueSchema>;
export const productCatalogue=productCatalogueSchema.parse(catalogue);
const data=productCatalogue;
export function contextualProducts(theme:KnowledgeThemeVersion,snapshot:KnowledgeSnapshot,selection:{kind:"record"|"entity";id:string}|null,marketplace:"JP"|"US"|"UK",now=Date.now(),catalog:ProductCatalogue=data){
 const pins=selection?selection.kind==="record"?snapshot.records.filter(r=>r.id===selection.id):snapshot.entities.filter(e=>e.id===selection.id):[theme,...snapshot.records,...snapshot.entities];
 const match=(t:z.infer<typeof target>)=>selection?t.kind===selection.kind&&pins.some(p=>p.id===t.id&&p.revision===t.revision):t.kind==="theme"?t.id===theme.id&&t.revision===theme.revision:(t.kind==="record"?snapshot.records:snapshot.entities).some(p=>p.id===t.id&&p.revision===t.revision);
 const recs=catalog.recommendations.filter(r=>r.state==="public"&&match(r.target)).sort((a,b)=>a.order-b.order);
 const seen=new Set<string>();return recs.flatMap(r=>{const p=catalog.products.find(p=>p.id===r.productId);if(!p||seen.has(p.id))return [];seen.add(p.id);const offers=[...new Map(catalog.offers.filter(o=>o.productId===p.id).map(o=>[o.marketplace,o])).values()],offer=offers.find(o=>o.marketplace===marketplace),image=offer?.image&&Date.parse(offer.image.expiresAt)>now?offer.image:undefined;return [{product:p,reason:r.reason,target:r.target,offer:offer?{...offer,image}:null,alternatives:offers.filter(o=>o.marketplace!==marketplace&&o.status==="ready").map(o=>({...o,image:o.image&&Date.parse(o.image.expiresAt)>now?o.image:undefined})),status:!offer?"unverified" as const:offer.status}];});
}
