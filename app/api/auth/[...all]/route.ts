import { memberAuthReady } from "../../../../lib/server/member/auth";
import { z } from "zod";
import { memberRuntime } from "../../../../lib/server/member/runtime";
import { assertMemberOrigin, MemberError, memberHandle, memberInput, memberJson } from "../../../../lib/server/member/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  return memberHandle(async () => {
    const { auth, config, service } = memberRuntime();
    await memberAuthReady(auth);
    const path = new URL(request.url).pathname.replace(/^\/api\/auth/, "");
    const allowed = request.method === "GET" ? ["/get-session", "/callback/google", "/callback/fixture", "/error"]
      : ["/sign-in/social", "/sign-out", "/revoke-sessions"];
    if (!allowed.includes(path)) throw new MemberError(404, "NOT_FOUND");
    if (request.method === "POST") assertMemberOrigin(request, config.origin);
    // The UI also pins the displayed user for session-ending actions.
    if (["/sign-out", "/revoke-sessions"].includes(path) && request.headers.has("x-member-user")) await service.profile(request);
    let authRequest = request;
    if (path === "/sign-in/social") {
      const input = await memberInput(request, z.strictObject({
        provider: z.literal(config.provider.kind), callbackURL: z.string().min(1).max(2048), disableRedirect: z.boolean().optional(),
      }));
      // Keep the initial OAuth surface narrow: no client-supplied scopes,
      // tokens, provider parameters or implicit linking flows.
      // Keep login failures inside the product, retaining only valid local
      // selection IDs. No arbitrary error redirect is accepted from the client.
      const errorURL = new URL("/member", config.origin);
      if (!URL.canParse(input.callbackURL, config.origin)) throw new MemberError(400, "INVALID_ARGUMENT");
      const callback = new URL(input.callbackURL, config.origin);
      if (callback.origin === config.origin && callback.pathname === "/member") {
        for (const key of ["import", "capsule"]) {
          const value = callback.searchParams.get(key);
          if (z.uuidv4().safeParse(value).success) errorURL.searchParams.set(key, value!);
        }
      }
      authRequest = new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ ...input, errorCallbackURL: errorURL.href }) });
    }
    const response = await auth.handler(authRequest);
    if (response.status >= 500) return memberJson({ error: { code: "MEMBER_UNAVAILABLE" } }, 503);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Cookie");
    return response;
  });
}
export const GET = handle;
export const POST = handle;
