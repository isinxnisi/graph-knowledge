import { defineConfig } from "@playwright/test";
const port = Number(process.env.GRAPH_TEST_PORT ?? "3210");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("GRAPH_TEST_PORT must be a valid port");
const url = `http://127.0.0.1:${port}`;
export default defineConfig({
  outputDir: "test-results/demo",
  testDir: "./tests/e2e", testIgnore: ["member.spec.ts", "pilot.spec.ts", "pilot-v2.spec.ts", "science.spec.ts", "science-v2.spec.ts", "event.spec.ts", "event-contract.spec.ts", "public.spec.ts"], fullyParallel: false, workers: 1, timeout: 60000,
  expect: { timeout: 15000 },
  use: { baseURL: url, viewport: { width: 1440, height: 1000 }, trace: "retain-on-failure" },
  webServer: { command: `npm run dev -- --port ${port}`, url, reuseExistingServer: process.env.GRAPH_TEST_REUSE === "1", timeout: 120000, env: { NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1" } },
});
