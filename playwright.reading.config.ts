import { defineConfig } from "@playwright/test";
import base from "./playwright.expanded.config";
export default defineConfig({ ...base, testMatch: ["relation-reading.spec.ts", "mobile-shell.spec.ts"], outputDir: "test-results/relation-reading" });
