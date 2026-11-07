import {NextResponse} from "next/server";
import {z} from "zod";
import {knowledgeReadGuard} from "../../../../lib/server/knowledge-read-runtime";
import {readLegacyTranslationReference} from "../../../../lib/server/knowledge-legacy-translation";
export const dynamic="force-dynamic";
export async function GET(request:Request){const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow"};try{knowledgeReadGuard(request);const q=new URL(request.url).searchParams;const kind=z.enum(["entity","record"]).parse(q.get("kind")),id=z.uuidv4().parse(q.get("id"));return NextResponse.json(await readLegacyTranslationReference(kind,id),{headers});}catch(e){const status=e instanceof z.ZodError?400:e instanceof Error&&"status" in e?Number(e.status):503;return NextResponse.json({error:status<500?"公開原文を確認してください":"原文を取得できませんでした"},{status,headers});}}
