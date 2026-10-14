import { NextResponse, type NextRequest } from "next/server";
// The advertisement origin never serves account, KG APIs, application pages or local saves.
export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (/^(?:ads\.plunode\.net(?::443)?|ads\.localhost(?::\d+)?)$/.test(host) && !/^\/integrations\/ad\/(?:desktop|mobile)$/.test(request.nextUrl.pathname)) {
    return new NextResponse(null, { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow, noarchive", "Cache-Control": "no-store" } });
  }
  return NextResponse.next();
}
