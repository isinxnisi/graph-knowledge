import { memberRuntime } from "../../../../../lib/server/member/runtime";
import { memberHandle } from "../../../../../lib/server/member/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
async function handle(action: () => Promise<Response>) {
  const response = await memberHandle(action);
  response.headers.set("Vary", "Cookie, X-Capsule-Token, X-Member-User");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
export function GET(request: Request, context: Context) { return handle(async () => memberRuntime().service.readDiscussion(request, (await context.params).id)); }
export function POST(request: Request, context: Context) { return handle(async () => memberRuntime().service.createDiscussionPost(request, (await context.params).id)); }
export function PATCH(request: Request, context: Context) { return handle(async () => memberRuntime().service.closeDiscussion(request, (await context.params).id)); }
export function DELETE(request: Request, context: Context) { return handle(async () => memberRuntime().service.withdrawDiscussionPost(request, (await context.params).id)); }
