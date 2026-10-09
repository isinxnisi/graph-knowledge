import { memberRuntime } from "../../../../../../lib/server/member/runtime";
import { memberHandle } from "../../../../../../lib/server/member/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) { return memberHandle(async () => memberRuntime().service.shareStatus(request, (await context.params).id)); }
export function POST(request: Request, context: Context) { return memberHandle(async () => memberRuntime().service.issueShare(request, (await context.params).id)); }
export function DELETE(request: Request, context: Context) { return memberHandle(async () => memberRuntime().service.revokeShare(request, (await context.params).id)); }
