import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./tests/e2e", testMatch: "public-launch.spec.ts", outputDir: "test-results/public-launch", workers: 1, timeout: 90000, expect: { timeout: 20000 }, use: { baseURL: process.env.GRAPH_TEST_BASE_URL ?? "http://127.0.0.1:3217", trace: "off", actionTimeout: 15000 } });
