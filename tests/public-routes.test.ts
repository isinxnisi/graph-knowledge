import { describe, expect, it } from "vitest";
import { publicLocalePath } from "../lib/domain/public-routes";
import { publicPagePath } from "../lib/domain/publication";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
const id = "2b7c6289-d050-4dc0-93e3-9307681253cc";
describe("公開ページの日英URLと内部言語header", () => {
  it("成立した言語版だけを往復し、旧日本語URLを保持する", () => {
    for (const ja of ["/", "/support", "/privacy", `/explore/${id}`]) {
      const en = publicLocalePath(ja, "en")!;
      expect(publicLocalePath(en, "ja")).toBe(ja); expect(publicLocalePath(en, "en")).toBe(en);
    }
    for (const path of ["/member", "/shared", "/api/auth", "/en/member", "//evil.example", "/explore/invalid", "/?s=private"]) expect(publicLocalePath(path,"en")).toBeNull();
  });
  it("送信者がSSR言語を偽装できず、広告originの隔離も維持する", () => {
    for (const path of ["/", "/en", "/en/support", `/en/explore/${id}`]) {
      const response = proxy(new NextRequest("https://plunode.net" + path, { headers: { host: "plunode.net", "x-plunode-locale":"evil", "x-plunode-public-locale":"evil" } }));
      expect(response.headers.get("x-middleware-request-x-plunode-locale")).toBe(path.startsWith("/en") ? "en" : "ja");
      expect(response.headers.get("x-middleware-request-x-plunode-public-locale")).toBe(path.startsWith("/en") ? "en" : "ja");
    }
    expect(proxy(new NextRequest("https://ads.plunode.net/en", { headers: {host:"ads.plunode.net"} })).status).toBe(404);
  });
  it("GAの英語ページ位置にもquery・認証・限定共有を含めない", () => {
    expect(publicPagePath(`/en/explore/${id}`)).toBe(`/en/explore/${id}`); expect(publicPagePath("/en")).toBe("/en");
    for(const path of ["/en/member", "/en/shared#secret", `/en/explore/${id}?s=private`]) expect(publicPagePath(path)).toBe("/");
  });
});
