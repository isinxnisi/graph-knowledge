import { defineConfig } from "@playwright/test";
import base from "./playwright.launch.config";
export default defineConfig({ ...base, testMatch: ["discovery-prototype.spec.ts", "discovery-search.spec.ts", "discovery-play.spec.ts", "discovery-release.spec.ts"], outputDir: "test-results/discovery-release" });
