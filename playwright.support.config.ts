import { defineConfig } from "@playwright/test";
import base from "./playwright.launch.config";
export default defineConfig({ ...base, testMatch: "support.spec.ts", outputDir: "test-results/support" });
