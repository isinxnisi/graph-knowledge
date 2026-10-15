import { publicLocalePath } from "./lib/domain/public-routes";
import { NextResponse, type NextRequest } from "next/server";
// The advertisement origin never serves account, KG APIs, application pages or local saves.
export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (/^(?:ads\.plunode\.net(?::443)?|ads\.localhost(?::\d+)?)$/.test(host) && !/^\/integrations\/ad\/(?:desktop|mobile)$/.test(request.nextUrl.pathname)) {
    return new NextResponse(null, { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow, noarchive", "Cache-Control": "no-store" } });
  }
  const requestHeaders = new Headers(request.headers);
  // Always overwrite this internal header; clients cannot choose the SSR language.
  requestHeaders.delete("x-plunode-public-locale");
  if (publicLocalePath(request.nextUrl.pathname, "ja") !== null) requestHeaders.set("x-plunode-public-locale", request.nextUrl.pathname.startsWith("/en") ? "en" : "ja");
  requestHeaders.set("x-plunode-locale", /^\/en(?:\/|$)/.test(request.nextUrl.pathname) ? "en" : "ja");
  return NextResponse.next({ request: { headers: requestHeaders } });
}
