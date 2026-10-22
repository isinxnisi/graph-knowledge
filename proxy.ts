import { publicLocalePath } from "./lib/domain/public-routes";
import { NextResponse, type NextRequest } from "next/server";
// The advertisement origin never serves account, KG APIs, application pages or local saves.
export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const lab = /^\/(?:en\/)?ai-lab(?:\/|$)/.test(request.nextUrl.pathname) || /^\/api\/ai-lab(?:\/|$)/.test(request.nextUrl.pathname);
  if (lab && !/^(?:(?:plunode\.net|graph\.isinxnisi\.net|graph-beta\.isinxnisi\.com|graph-ailab\.isinxnisi\.com)(?::443)?|(?:localhost|127\.0\.0\.1)(?::\d{1,5})?)$/.test(host.toLowerCase())) return new NextResponse(null,{status:404});
  if (/^(?:ads\.plunode\.net(?::443)?|ads\.localhost(?::\d+)?)$/.test(host) && !/^\/integrations\/ad\/(?:desktop|mobile)$/.test(request.nextUrl.pathname)) {
    return new NextResponse(null, { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow, noarchive", "Cache-Control": "no-store" } });
  }
  const requestHeaders = new Headers(request.headers);
  // Always overwrite this internal header; clients cannot choose the SSR language.
  requestHeaders.delete("x-plunode-public-locale");
  if (publicLocalePath(request.nextUrl.pathname, "ja") !== null) requestHeaders.set("x-plunode-public-locale", request.nextUrl.pathname.startsWith("/en") ? "en" : "ja");
  requestHeaders.set("x-plunode-locale", /^\/en(?:\/|$)/.test(request.nextUrl.pathname) ? "en" : "ja");
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (lab) {
    response.headers.set("Content-Security-Policy","default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    response.headers.set("X-Robots-Tag","noindex, nofollow, noarchive");
    response.headers.set("Referrer-Policy","same-origin");
    response.headers.set("Cache-Control","no-store");
  }
  return response;
}
