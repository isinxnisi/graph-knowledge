import { expect, it, vi } from "vitest";
vi.mock("../lib/server/publication", () => ({ publicationPolicy: vi.fn() }));
import { publicationPolicy } from "../lib/server/publication";
import robots from "../app/robots";

it("正式サイトの共有ページと画像を巡回でき、会員APIは除外する", async () => {
  vi.mocked(publicationPolicy).mockResolvedValue({ public: true, analytics: true, ads: true, adDefault: false });
  const result = await robots();
  const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
  const common = rules.find(rule => rule.userAgent === "*")!;
  const excluded = Array.isArray(common.disallow) ? common.disallow : [common.disallow];
  for (const path of ["/shared/example", "/shared/example/image/7"]) {
    expect(excluded.some(prefix => prefix && path.startsWith(prefix))).toBe(false);
  }
  for (const path of ["/member", "/api/member/capsules", "/integrations/analytics"]) {
    expect(excluded.some(prefix => prefix && path.startsWith(prefix))).toBe(true);
  }
});

it("非公開環境の全体巡回禁止を維持する", async () => {
  vi.mocked(publicationPolicy).mockResolvedValue({ public: false, analytics: false, ads: false, adDefault: false });
  expect(await robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
});
