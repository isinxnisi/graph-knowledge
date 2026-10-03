import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e", testMatch: "pilot.spec.ts", workers: 1, timeout: 60000, expect: { timeout: 15000 },
  use: { baseURL: "http://127.0.0.1:3211", viewport: { width: 1440, height: 1000 }, trace: "retain-on-failure" },
  webServer: { command: "npm run pilot:dev", url: "http://127.0.0.1:3211", reuseExistingServer: process.env.GRAPH_TEST_REUSE === "1", timeout: 120000 },
});
