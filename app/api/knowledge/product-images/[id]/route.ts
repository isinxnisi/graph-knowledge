import {memberRuntime} from '../../../../../lib/server/member/runtime';
import {knowledgeReadGuard} from '../../../../../lib/server/knowledge-read-runtime';
import {themeOperator,operatorThemePool,PRIVATE_THEME_HEADERS} from '../../../../../lib/server/theme-operator-preview';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  knowledgeReadGuard(request);const {id}=await params;if(!/^[a-f0-9]{64}$/.test(id))return new Response(null,{status:404,headers:PRIVATE_THEME_HEADERS});
  const pool=memberRuntime().pool,row=(await pool.query('SELECT a.bytes,a.thumbnail,EXISTS(SELECT 1 FROM product_editorial_version p WHERE p.image_id=a.id) AS product FROM product_image_asset a WHERE a.id=$1',[id])).rows[0];
  if(!row)return new Response(null,{status:404,headers:PRIVATE_THEME_HEADERS});
  let isPublic=!!row.product;
  if(!isPublic){const knowledge=await operatorThemePool();isPublic=!!(await knowledge.query("SELECT 1 FROM knowledge75.theme_publications h JOIN knowledge75.theme_releases r ON r.theme_id=h.theme_id JOIN knowledge75.objects o ON o.kind='theme' AND o.id=h.theme_id WHERE h.published_revision IS NOT NULL AND o.visibility='public' AND r.image_ids ? $1 LIMIT 1",[id])).rowCount;}
  if(!isPublic){try{await themeOperator(request.headers,{imageId:id});}catch{return new Response(null,{status:404,headers:PRIVATE_THEME_HEADERS});}}
  const small=new URL(request.url).searchParams.get('size')==='small',data=small?row.thumbnail:row.bytes;
  return new Response(new Uint8Array(data),{headers:{...(!isPublic?PRIVATE_THEME_HEADERS:{'Cache-Control':row.product?'public, max-age=31536000, immutable':'public, max-age=0, must-revalidate'}),'Content-Type':'image/webp','Content-Length':String(data.length),'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'ETag':'"'+id+(small?'-small':'')+'"'}});
 }catch{return new Response(null,{status:503,headers:PRIVATE_THEME_HEADERS});}
}
