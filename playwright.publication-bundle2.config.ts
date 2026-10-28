import { defineConfig } from "@playwright/test";
if (!process.env.PUBLICATION_TEST_REVISION) throw Error("An isolated applied revision is required");
export default defineConfig({
 testDir: "./tests/publication-bundle2", workers: 1, timeout: 180000,
 expect: { timeout: 30000 },
 outputDir: process.env.PUBLICATION_TEST_RESULTS,
 reporter: [["list"], ["json", { outputFile: process.env.PUBLICATION_TEST_RESULTS + "/results.json" }]],
 use: { baseURL: "http://127.0.0.1:3296", viewport: { width: 1440, height: 1000 }, trace: "off", video: "off" },
});
