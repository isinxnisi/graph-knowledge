import {memberRuntime} from "../../../../../lib/server/member/runtime";
import {knowledgeReadGuard} from "../../../../../lib/server/knowledge-read-runtime";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 try{knowledgeReadGuard(request);const {id}=await params;if(!/^[a-f0-9]{64}$/.test(id))return new Response(null,{status:404});
  // Operator assets are public editorial media, never user uploads. A product-version FK
  // is required before public serving; never-linked uploads are not public and expire.
  const row=(await memberRuntime().pool.query('SELECT a.bytes,a.thumbnail FROM product_image_asset a WHERE a.id=$1 AND EXISTS(SELECT 1 FROM product_editorial_version p WHERE p.image_id=a.id)',[id])).rows[0];
  if(!row)return new Response(null,{status:404});const small=new URL(request.url).searchParams.get('size')==='small',data=small?row.thumbnail:row.bytes;
  return new Response(new Uint8Array(data),{headers:{'Content-Type':'image/webp','Content-Length':String(data.length),'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'ETag':'"'+id+(small?'-small':'')+'"'}});
 }catch{return new Response(null,{status:503,headers:{'Cache-Control':'no-store'}});}
}
