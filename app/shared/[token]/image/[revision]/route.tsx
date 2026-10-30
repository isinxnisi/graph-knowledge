import { capsulePreview } from "../../../../../lib/server/capsule-preview";
import { capsuleShareImage } from "../../../../../lib/server/capsule-share-image";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{token:string;revision:string}>}){
  const {token,revision}=await params;
  const shared=await capsulePreview(token,revision);
  if(!shared)return new Response(null,{status:404,headers:{"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow, noarchive","Referrer-Policy":"no-referrer"}});
  return capsuleShareImage(shared.capsule);
}
