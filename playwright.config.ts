import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1, timeout: 60000,
  use: { baseURL: "http://127.0.0.1:3210", viewport: { width: 1440, height: 1000 }, trace: "retain-on-failure" },
  webServer: { command: "npm run dev -- --port 3210", url: "http://127.0.0.1:3210", reuseExistingServer: false, timeout: 120000, env: { NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1" } },
});
