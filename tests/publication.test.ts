import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { adFrameEnabled, publicSiteEnabled, publicServicesPolicy, publicPagePath, GA_MEASUREMENT_ID } from "../lib/domain/publication";
import { adFrame, analyticsFrame, frameResponse } from "../lib/server/integration-frames";
import { readPrivacy } from "../lib/client/privacy-preferences";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

describe("公開・計測・広告の境界", () => {
  const env = { GRAPH_DATASET: "public-kg", PLUNODE_PUBLIC_ENABLED: "1", PLUNODE_ADS_ENABLED: "1" };
  it("GA4・index許可は正式本番のみ。広告は承認されたローカル・Tunnelでも使える", () => {
    expect(publicServicesPolicy("plunode.net", env)).toEqual({ analytics: true, ads: true });
    for (const host of ["graph-beta.isinxnisi.com", "127.0.0.1:3200", "localhost:3217"]) expect(publicServicesPolicy(host, env)).toEqual({ analytics: false, ads: true });
    for (const host of [null, "graph.isinxnisi.net", "plunode.net.evil.example", "evil.example", "plunode.net:8080"]) expect(publicServicesPolicy(host, env)).toEqual({ analytics: false, ads: false });
    expect(publicSiteEnabled("plunode.net", { ...env, PLUNODE_PUBLIC_ENABLED: "0" })).toBe(false);
    expect(publicServicesPolicy("plunode.net", { ...env, GRAPH_DATASET: "demo" })).toEqual({ analytics: false, ads: false });
    expect(adFrameEnabled("ads.plunode.net", env)).toBe(true); expect(adFrameEnabled("ads.localhost:3200", env)).toBe(true);
    expect(adFrameEnabled("plunode.net", env)).toBe(false); expect(adFrameEnabled("graph-beta.isinxnisi.com", env)).toBe(false);
  });
  it("会員URL・検索語・Graph状態・tokenをページ位置へ使わない", () => {
    expect(publicPagePath("/explore/10000000-0000-4000-8000-000000000001")).toContain("/explore/");
    for (const path of ["/member?capsule=private", "/shared#secret", "/?s=compressed", "//evil.example", "/explore/invalid"]) expect(publicPagePath(path)).toBe("/");
    expect(readPrivacy('{"analytics":true,"ads":false,"token":"secret"}')).toEqual({ analytics: true, ads: false });
    for (const value of [null, "bad", '{"analytics":"true","ads":true}']) expect(readPrivacy(value)).toBeNull();
  });
  it("GA初期page_viewを無効化し、bridgeは一回の閲覧と許可したイベントだけ送る", () => {
    const parent = { postMessage() {} }, messages: Array<(event: unknown) => void> = [];
    const context = vm.createContext({ parent, Date, addEventListener: (_: string, fn: (event: unknown) => void) => messages.push(fn) });
    context.window = context;
    vm.runInContext(analyticsFrame().match(/<script>([\s\S]*?)<\/script>/)![1], context);
    const dataLayer = context.dataLayer as IArguments[];
    const config = dataLayer.find(args => args[0] === "config")!;
    expect(config[1]).toBe(GA_MEASUREMENT_ID); expect(config[2].send_page_view).toBe(false);
    const send = (event: string, path = "/?s=SECRET&name=PRIVATE", source: object = parent, origin = "https://plunode.net") => messages[0]({ source, origin, data: { type: "plunode-metric", event, path, name: "PRIVATE", token: "SECRET" } });
    send("page_view", "/member", {}); send("page_view", "/", parent, "https://evil.example");
    send("page_view"); send("page_view"); send("private_capsule"); send("search");
    const events = dataLayer.filter(args => args[0] === "event");
    expect(events.map(args => args[1])).toEqual(["page_view", "search"]);
    expect(JSON.stringify(events)).not.toMatch(/SECRET|PRIVATE|private_capsule|\?s=/);
    expect(events[0][2]).toMatchObject({ page_location: "https://plunode.net/", page_referrer: "", page_title: "Plunode" });
  });
  it("広告タグは分離文書へ一つだけ。sandboxとno-referrer・noindexを維持", () => {
    expect(adFrame("mobile")).toContain("93ba1c5c8d797794cf1c721bce01ff42");
    expect(adFrame("desktop")).not.toContain("93ba1c5c8d797794cf1c721bce01ff42");
    const response = frameResponse(adFrame("desktop"), true);
    expect(response.headers.get("Content-Security-Policy")).toContain("sandbox allow-scripts allow-same-origin");
    expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors https://plunode.net");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
  });
  it("広告originでは会員・認証・KG・アプリ画面を提供しない", () => {
    for (const host of ["ads.plunode.net", "ads.localhost:3200"]) for (const path of ["/", "/member", "/shared", "/privacy", "/api/member/profile", "/api/auth/sign-out", "/api/entities", "/_next/static/private.js"]) expect(proxy(new NextRequest(`https://${host}${path}`, { headers: { host } })).status).toBe(404);
    expect(proxy(new NextRequest("https://plunode.net/member", { headers: { host: "plunode.net" } })).headers.get("x-middleware-next")).toBe("1");
  });
});
