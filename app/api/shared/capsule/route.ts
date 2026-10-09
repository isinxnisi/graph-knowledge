import { memberRuntime } from "../../../../lib/server/member/runtime";
import { memberHandle } from "../../../../lib/server/member/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const response = await memberHandle(async () => memberRuntime().service.readShared(request));
  response.headers.set("Vary", "X-Capsule-Token");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
