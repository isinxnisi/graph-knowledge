import { memberRuntime } from "../../../../../../lib/server/member/runtime";
import { memberHandle, memberJson } from "../../../../../../lib/server/member/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request:Request,context:{params:Promise<{id:string}>}) {
  if(process.env.COMMUNITY_ENABLED!=="1")return memberJson({error:{code:"NOT_FOUND"}},404);
  return memberHandle(async()=>memberRuntime().service.community.ownCapsuleDestinations(request,(await context.params).id));
}
