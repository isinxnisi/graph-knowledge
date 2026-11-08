import { memberRuntime } from "../../../../lib/server/member/runtime";
import { memberHandle } from "../../../../lib/server/member/http";
import { knowledgePublicationPreview } from "../../../../lib/server/knowledge-publication-preview";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const catalog = async () => (await knowledgePublicationPreview()).themes();
export async function GET(request: Request) {
  return memberHandle(() => memberRuntime().service.operator.featuredThemes(request, catalog));
}
export async function POST(request: Request) {
  return memberHandle(() => memberRuntime().service.operator.saveFeaturedThemes(request, catalog));
}
