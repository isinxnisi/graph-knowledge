import { defineConfig } from "@playwright/test";
if (!/^graph-film41-[a-f0-9]{12}$/.test(process.env.FILM41_CONTAINER ?? "") || !/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.FILM41_BASE_URL ?? "")) throw Error("Use scripts/test-film-collection.py");
export default defineConfig({
 testDir: "./tests/film41", testMatch: "film-collection.spec.ts", workers: 1, timeout: 180000,
 expect: { timeout: 30000 }, outputDir: process.env.FILM41_RESULTS + "/browser",
 reporter: [["list"], ["json", { outputFile: process.env.FILM41_RESULTS + "/browser-results.json" }]],
 use: { actionTimeout: 45000, baseURL: process.env.FILM41_BASE_URL, viewport: { width: 1440, height: 1000 }, trace: "retain-on-failure", video: "off" },
});
