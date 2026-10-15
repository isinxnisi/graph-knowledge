import { defineConfig } from "@playwright/test";
import base from "./playwright.launch.config";
export default defineConfig({ ...base, testMatch: "public-discovery.spec.ts", outputDir: "test-results/public-discovery" });
