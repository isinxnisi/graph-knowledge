import { defineConfig } from "@playwright/test";
export default defineConfig({
  outputDir: "test-results/manga-role", testDir: "./tests/e2e", testMatch: "manga-role.spec.ts",
  workers: 1, timeout: 60000, expect: { timeout: 15000 },
  use: { baseURL: process.env.GRAPH_TEST_BASE_URL ?? "http://127.0.0.1:3200", viewport: { width: 1440, height: 1000 }, trace: "off" },
});
