import {NextResponse} from "next/server";
import {z} from "zod";
import {knowledgeTextTargetSchema,translationLanguageSchema} from "../../../../lib/domain/knowledge-translation";
import {knowledgeReadGuard} from "../../../../lib/server/knowledge-read-runtime";
import {knowledgePublicationPreview} from "../../../../lib/server/knowledge-publication-preview";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow"};
export async function GET(request:Request){
 try{
  knowledgeReadGuard(request);const q=new URL(request.url).searchParams;
  if(q.has('id')){const id=z.string().regex(/^translation:[a-f0-9]{48}$/).parse(q.get('id')),revision=q.has('revision')?z.coerce.number().int().positive().parse(q.get('revision')):undefined;return NextResponse.json({translation:await (await knowledgePublicationPreview()).translationById(id,revision)},{headers});}
  const target=knowledgeTextTargetSchema.parse(JSON.parse(q.get('target')??'null')),language=translationLanguageSchema.parse(q.get('language'));
  const revision=q.has('revision')?z.coerce.number().int().positive().parse(q.get('revision')):undefined;
  return NextResponse.json(await (await knowledgePublicationPreview()).textTranslation(target,language,revision),{headers});
 }catch(e){const status=e instanceof z.ZodError||e instanceof SyntaxError?400:e instanceof Error&&'status' in e?Number(e.status):503;
  return NextResponse.json({error:status===400?'翻訳の指定を確認してください':status<500?'この原文・訳文は現在読めません':'訳文を取得できません。再試行してください'},{status,headers});
 }
}
