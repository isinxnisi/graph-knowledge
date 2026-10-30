import { memberRuntime } from "../../../../../../lib/server/member/runtime";
import { memberHandle } from "../../../../../../lib/server/member/http";
export const runtime="nodejs";
export function POST(request:Request,context:{params:Promise<{id:string}>}) { return memberHandle(async()=>memberRuntime().service.restore(request,(await context.params).id)); }
