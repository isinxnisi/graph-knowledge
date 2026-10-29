import { memberRuntime } from "../../../../lib/server/member/runtime";
import { memberHandle } from "../../../../lib/server/member/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return memberHandle(() => memberRuntime().service.capabilities(request));
}
