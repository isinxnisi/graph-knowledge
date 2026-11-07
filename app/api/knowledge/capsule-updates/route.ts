import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { knowledgeReadGuard } from "../../../../lib/server/knowledge-read-runtime";
import { knowledgePublicationPreview } from "../../../../lib/server/knowledge-publication-preview";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow"};
/** Public, bounded read. Only source identifiers leave the Capsule; no authored text. */
export async function POST(request:Request){
 try{
  knowledgeReadGuard(request);
  const reader=request.body?.getReader();if(!reader)return NextResponse.json({error:'入力がありません'},{status:400,headers});
  const chunks:Uint8Array[]=[];let length=0;
  while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.byteLength;if(length>512_000){await reader.cancel();return NextResponse.json({error:'参照が多すぎます'},{status:413,headers});}chunks.push(chunk.value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const input=JSON.parse(new TextDecoder().decode(bytes));const service=await knowledgePublicationPreview();
  return NextResponse.json(await service.capsuleUpdates(input),{headers});
 }catch(error){const status=error instanceof ZodError||error instanceof SyntaxError?400:error instanceof Error&&'status' in error?Number(error.status):503;return NextResponse.json({error:status===400?'参照の形式を確認してください':status===404?'現在は取得元を閲覧できません':'更新の比較に必要なデータを取得できませんでした。保存内容は変更していません。'},{status,headers});}
}
