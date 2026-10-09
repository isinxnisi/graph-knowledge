import { memberRuntime } from "../../../../lib/server/member/runtime";
import { memberHandle } from "../../../../lib/server/member/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const response = await memberHandle(() => memberRuntime().service.listOwnDiscussionPosts(request));
  response.headers.set("Vary", "Cookie, X-Member-User");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
