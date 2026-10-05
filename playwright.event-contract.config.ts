import { defineConfig } from "@playwright/test";
export default defineConfig({
  outputDir: "test-results/event-contract", testDir: "./tests/e2e", testMatch: "event-contract.spec.ts", workers: 1, timeout: 60000, expect: { timeout: 15000 },
  use: { baseURL: "http://127.0.0.1:3216", viewport: { width: 1440, height: 1000 }, trace: "retain-on-failure" },
  webServer: { command: "node --import tsx scripts/event-contract-test.ts dev", url: "http://127.0.0.1:3216", reuseExistingServer: process.env.GRAPH_TEST_REUSE === "1", timeout: 120000 },
});
