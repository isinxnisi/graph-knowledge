import { memberRuntime } from "../../../../../../../lib/server/member/runtime";
import { memberHandle } from "../../../../../../../lib/server/member/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string; requestId: string }> }) {
  const { id, requestId } = await context.params;
  return memberHandle(() => memberRuntime().service.updateStatus(request, id, requestId));
}
