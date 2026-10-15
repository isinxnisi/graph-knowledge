import { defineConfig } from "@playwright/test";
import base from "./playwright.launch.config";
export default defineConfig({ ...base, testMatch: "focus-feedback.spec.ts", outputDir: "test-results/focus-feedback" });
