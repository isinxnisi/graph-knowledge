import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { defaultAdvertising, isJapanAddress } from "../lib/server/advertising-country";
import { advertisingAllowed } from "../lib/client/privacy-preferences";
const now = Date.parse("2026-10-15T00:00:00Z");
it("Japan IPv4/IPv6だけ標準表示。海外・欠落・不正・古い表は許可待ち", () => {
  for (const ip of ["1.0.16.1", "::ffff:1.0.16.1", "2400:8500::1"]) expect(isJapanAddress(ip, now), ip).toBe(true);
  for (const ip of [null, "", "bad", "127.0.0.1", "10.0.0.1", "::1", "fe80::1%eth0", "8.8.8.8", "81.2.69.142", "80.128.0.1", "1.0.16.1, 8.8.8.8"]) expect(isJapanAddress(ip, now), String(ip)).toBe(false);
  expect(isJapanAddress("1.0.16.1", Date.parse("2027-02-01"))).toBe(false);
});
it("本番はCaddyのXFFだけ、TunnelはCloudflareの接続元だけを参照する", () => {
  const headers = new Headers({ host: "plunode.net", "x-forwarded-for": "1.0.16.1", "cf-connecting-ip": "8.8.8.8" });
  expect(defaultAdvertising(headers, { GRAPH_DEPLOYMENT: "production" }, now)).toBe(true);
  expect(defaultAdvertising(headers, {}, now)).toBe(false);
  headers.set("x-forwarded-for", "8.8.8.8"); headers.set("cf-ipcountry", "JP");
  expect(defaultAdvertising(headers, { GRAPH_DEPLOYMENT: "production" }, now)).toBe(false);
  headers.set("host", "graph-beta.isinxnisi.com"); headers.set("cf-connecting-ip", "1.0.16.1");
  expect(defaultAdvertising(headers, {}, now)).toBe(true);
  headers.set("cf-connecting-ipv6", "2001:4860:4860::8888");
  expect(defaultAdvertising(headers, {}, now)).toBe(false);
  headers.set("host", "localhost:3200");
  expect(defaultAdvertising(headers, {}, now)).toBe(true);
  expect(defaultAdvertising(headers, { GRAPH_DEPLOYMENT: "production" }, now)).toBe(false);
});
it("従来の拒否を維持し、日本の自動ONを海外での同意に読み替えない", () => {
  expect(advertisingAllowed(null, true)).toBe(true);
  expect(advertisingAllowed(null, false)).toBe(false);
  expect(advertisingAllowed({ analytics: true, ads: false }, true)).toBe(false);
  expect(advertisingAllowed({ analytics: false, ads: true }, false)).toBe(true);
  expect(advertisingAllowed({ analytics: true, ads: true, adsConsent: false }, false)).toBe(false);
});
