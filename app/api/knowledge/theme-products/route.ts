import {knowledgeReadGuard} from "../../../../lib/server/knowledge-read-runtime";
import {knowledgePublicationPreview} from "../../../../lib/server/knowledge-publication-preview";
import {creatorsOffers,mergeProductOffers} from "../../../../lib/server/theme-product-provider";
import {contextualProducts,linkedThemeProducts,entityProducts,productCatalogue} from "../../../../lib/domain/theme-products";
import {editorialCatalogue} from "../../../../lib/server/member/product-editorial";
import {memberRuntime} from "../../../../lib/server/member/runtime";
export const dynamic="force-dynamic";
type Market="JP"|"US"|"UK";
const headers={"Cache-Control":"no-store"};
export async function GET(request:Request){try{
 knowledgeReadGuard(request);
 const q=new URL(request.url).searchParams,id=q.get("themeId"),revision=Number(q.get("revision")),market=q.get("marketplace")??"JP";
 if(!["JP","US","UK"].includes(market))return Response.json({error:"Invalid context"},{status:400,headers});
 const service=await knowledgePublicationPreview();
 if(!id&&q.get("kind")==="entity"&&q.get("id")){
  const context=await service.entityProductContext(q.get("id")!);
  // The legacy catalogue is visible only through its still-readable theme edition.
  const fallbackIds=new Set(productCatalogue.recommendations.filter(r=>r.target.kind==="theme"&&context.themes.some(t=>!t.editorial&&t.id===r.target.id&&t.revision===r.target.revision)).map(r=>r.productId));
  const catalog=await editorialCatalogue(memberRuntime().pool,context.productPins,null,{...productCatalogue,recommendations:productCatalogue.recommendations.filter(r=>fallbackIds.has(r.productId))});
  const rows=()=>entityProducts(context.entityIds,market as Market,Date.now(),catalog);
  catalog.offers=mergeProductOffers(catalog.offers,await productOffers(rows().map(i=>i.product.id),market as Market,q.get("alternatives")==="1"));
  return Response.json({products:rows()},{headers});
 }
 if(!id||!Number.isSafeInteger(revision)||revision<1)return Response.json({error:"Invalid context"},{status:400,headers});
 const v=await service.theme({themeId:id,revision}),kind=q.get("kind"),selected=q.get("id");
 if(selected&&(!["record","entity"].includes(kind??"")||!(kind==="record"?v.snapshot.records:v.snapshot.entities).some(r=>r.id===selected)))return new Response(null,{status:404,headers});
 const selection=selected?{kind:kind as "record"|"entity",id:selected}:null;
 const catalog=v.theme.content.productPins?await editorialCatalogue(memberRuntime().pool,v.theme.content.productPins,v.theme,{products:[],offers:[],recommendations:[]}):productCatalogue;
 // Product associations pin actual entity/record revisions from this theme snapshot.
 for(const rec of catalog.recommendations){if(rec.id.startsWith('product:')&&rec.target.kind!=='theme'){const pin=(rec.target.kind==='record'?v.snapshot.records:v.snapshot.entities).find(p=>p.id===rec.target.id);if(pin)rec.target.revision=pin.revision;}}
 const rows=(catalogue:typeof catalog)=>q.get("associations")==="1"&&!selection?linkedThemeProducts(v.theme,v.snapshot,market as Market,Date.now(),catalogue):contextualProducts(v.theme,v.snapshot,selection,market as Market,Date.now(),catalogue);
 const initial=rows(catalog);
 const offers=await productOffers([...new Set(initial.map(i=>i.product.id))],market as Market,q.get("alternatives")==="1");
 return Response.json({products:rows({...catalog,offers:mergeProductOffers(catalog.offers,offers)})},{headers});
 }catch(e){return Response.json({error:"Products unavailable"},{status:e&&typeof e==="object"&&"status" in e&&[403,404].includes(Number(e.status))?404:e instanceof Error&&e.name==="ZodError"?400:503,headers});}}

async function productOffers(ids:string[],market:Market,alternatives:boolean){
 if(!ids.length)return [];
 const markets=alternatives?(["JP","US","UK"] as const):[market];
 return (await Promise.all(markets.map(m=>creatorsOffers(ids,m)))).flatMap(p=>p.offers);
}
