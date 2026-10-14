import { defineConfig } from "@playwright/test";

// Already-running public KG only. This suite does not seed or start a server.
export default defineConfig({
  testDir: "./tests/e2e", testMatch: "expanded-public.spec.ts",
  outputDir: "test-results/expanded-public", workers: 1, timeout: 90000,
  expect: { timeout: 20000 },
  use: {
    baseURL: process.env.GRAPH_TEST_BASE_URL ?? "http://127.0.0.1:3200",
    viewport: { width: 1440, height: 1000 }, actionTimeout: 15000, trace: "retain-on-failure",
    ...(process.env.GRAPH_PREVIEW_USER && process.env.GRAPH_PREVIEW_PASSWORD ? {
      httpCredentials: { username: process.env.GRAPH_PREVIEW_USER, password: process.env.GRAPH_PREVIEW_PASSWORD },
    } : {}),
  },
});
