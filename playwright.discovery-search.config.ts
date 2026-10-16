import { defineConfig } from "@playwright/test";
import base from "./playwright.launch.config";
export default defineConfig({ ...base, testMatch: ["discovery-search.spec.ts", "discovery-play.spec.ts"], outputDir: "test-results/discovery-search" });
