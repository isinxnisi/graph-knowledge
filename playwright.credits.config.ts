import { defineConfig } from "@playwright/test";
import base from "./playwright.expanded.config";
export default defineConfig({ ...base, testMatch: "contribution-credits.spec.ts", outputDir: "test-results/contribution-credits" });
