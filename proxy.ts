import { publicLocalePath } from "./lib/domain/public-routes";
import { NextResponse, type NextRequest } from "next/server";
import { adminAuthorized, ADMIN_HEADERS, ADMIN_HOST } from "./lib/server/kg-admin-access";
// The advertisement origin never serves account, KG APIs, application pages or local saves.
export async function proxy(request: NextRequest) {
  const adminPath = /^\/(?:en\/)?kg-admin(?:\/|$)/.test(request.nextUrl.pathname) || /^\/api\/kg-admin(?:\/|$)/.test(request.nextUrl.pathname);
  if (process.env.KG_ADMIN_ENABLED === "1" || adminPath) {
    if (!await adminAuthorized(request.headers)) return new NextResponse(null, { status: 404, headers: ADMIN_HEADERS });
    // A dedicated runtime has no account/write/public API routes. Static assets
    // also require Access; no unauthenticated path exceptions.
    if (!adminPath && !request.nextUrl.pathname.startsWith("/_next/static/") && request.nextUrl.pathname !== "/") return new NextResponse(null, { status: 404, headers: ADMIN_HEADERS });
    if (request.nextUrl.pathname === "/") return NextResponse.redirect(`https://${ADMIN_HOST}/kg-admin`, { headers: ADMIN_HEADERS });
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-plunode-locale", request.nextUrl.pathname.startsWith("/en/") ? "en" : "ja");
    requestHeaders.delete("x-plunode-public-locale");
    return NextResponse.next({ request: { headers: requestHeaders }, headers: ADMIN_HEADERS });
  }
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
