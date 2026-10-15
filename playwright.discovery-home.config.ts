import { defineConfig } from "@playwright/test";
import base from "./playwright.launch.config";
export default defineConfig({ ...base, testMatch: "discovery-home.spec.ts", outputDir: "test-results/discovery-home" });
