import { memberRuntime } from "../../../../../../lib/server/member/runtime";
import { memberHandle } from "../../../../../../lib/server/member/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) { return memberHandle(async () => memberRuntime().service.readSharedRevisions(request, (await context.params).id)); }
