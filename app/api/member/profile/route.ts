import { memberRuntime } from "../../../../lib/server/member/runtime";
import { memberHandle } from "../../../../lib/server/member/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return memberHandle(() => memberRuntime().service.profile(request)); }
