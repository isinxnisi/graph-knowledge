import { defineConfig } from "@playwright/test";
export default defineConfig({
  outputDir: "test-results/member", testDir: "./tests/e2e", testMatch: "member.spec.ts",
  fullyParallel: false, workers: 1, timeout: 120_000, expect: { timeout: 15_000 }, globalTimeout: 900_000,
  use: { baseURL: "http://127.0.0.1:3221", viewport: { width: 1440, height: 1000 }, trace: "retain-on-failure" },
  webServer: { command: "npm run dev -- --webpack --port 3221", url: "http://127.0.0.1:3221/member", reuseExistingServer: false, timeout: 120_000,
    env: { NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", GRAPH_DATASET: "demo" } },
});
