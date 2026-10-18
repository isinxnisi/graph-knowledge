import { defineConfig } from "@playwright/test";
import base from "./playwright.launch.config";
export default defineConfig({ ...base, testMatch: ["discovery-preset-browser.spec.ts", "discovery-path-presets.spec.ts", "discovery-paths.spec.ts", "discovery-records.spec.ts", "discovery-prototype.spec.ts", "discovery-search.spec.ts", "discovery-play.spec.ts", "discovery-release.spec.ts"], outputDir: "test-results/discovery-release" });
