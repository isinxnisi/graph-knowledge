import { defineConfig } from "@playwright/test";
export default defineConfig({
  outputDir: "test-results/public", testDir: "./tests/e2e", testMatch: "public.spec.ts",
  workers: 1, timeout: 60000, expect: { timeout: 15000 },
  use: { baseURL: process.env.GRAPH_TEST_BASE_URL ?? "http://127.0.0.1:3200", viewport: { width: 1440, height: 1000 }, trace: "retain-on-failure" },
  // 外部指定は既に起動した本番imageの検証用。開発serverを代わりに起動しない。
  ...(!process.env.GRAPH_TEST_BASE_URL ? { webServer: { command: "npm run public:dev", url: "http://127.0.0.1:3200", reuseExistingServer: process.env.GRAPH_TEST_REUSE === "1", timeout: 120000 } } : {}),
});
