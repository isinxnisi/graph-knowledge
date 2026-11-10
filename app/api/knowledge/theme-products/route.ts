import {knowledgeReadGuard} from "../../../../lib/server/knowledge-read-runtime";
import {knowledgePublicationPreview} from "../../../../lib/server/knowledge-publication-preview";
import {creatorsOffers,mergeProductOffers} from "../../../../lib/server/theme-product-provider";
import {contextualProducts,productCatalogue} from "../../../../lib/domain/theme-products";
import {editorialCatalogue} from "../../../../lib/server/member/product-editorial";
import {memberRuntime} from "../../../../lib/server/member/runtime";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{
 knowledgeReadGuard(request);const q=new URL(request.url).searchParams,id=q.get("themeId"),revision=Number(q.get("revision")),market=q.get("marketplace")??"JP";
 if(!id||!Number.isSafeInteger(revision)||revision<1||!["JP","US","UK"].includes(market))return Response.json({error:"Invalid context"},{status:400});
 const v=await(await knowledgePublicationPreview()).theme({themeId:id,revision});const kind=q.get("kind"),selected=q.get("id");
 if(selected&&(!["record","entity"].includes(kind??"")||!(kind==="record"?v.snapshot.records:v.snapshot.entities).some(r=>r.id===selected)))return new Response(null,{status:404});
 const selection=selected?{kind:kind as "record"|"entity",id:selected}:null;
 const catalog=v.theme.content.productPins?await editorialCatalogue(memberRuntime().pool,v.theme.content.productPins,v.theme,{products:[],offers:[],recommendations:[]}):productCatalogue;
 // Product associations pin actual entity/record revisions from this theme snapshot.
 for(const rec of catalog.recommendations){if(rec.id.startsWith('product:')&&rec.target.kind!=='theme'){const pin=(rec.target.kind==='record'?v.snapshot.records:v.snapshot.entities).find(p=>p.id===rec.target.id);if(pin)rec.target.revision=pin.revision;}}
 const initial=contextualProducts(v.theme,v.snapshot,selection,market as "JP"|"US"|"UK",Date.now(),catalog),ids=initial.map(i=>i.product.id),provider=await creatorsOffers(ids,market as "JP"|"US"|"UK");
 const alternatives=q.get("alternatives")==="1"?await Promise.all((["JP","US","UK"] as const).filter(m=>m!==market).map(m=>creatorsOffers(ids,m))):[];
 return Response.json({products:contextualProducts(v.theme,v.snapshot,selection,market as "JP"|"US"|"UK",Date.now(),{...catalog,offers:mergeProductOffers(catalog.offers,[...provider.offers,...alternatives.flatMap(p=>p.offers)])})},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return Response.json({error:"Products unavailable"},{status:e&&typeof e==="object"&&"status" in e&&[403,404].includes(Number(e.status))?404:503,headers:{"Cache-Control":"no-store"}});}}
