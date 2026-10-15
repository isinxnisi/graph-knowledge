import { defineConfig } from "@playwright/test";
import base from "./playwright.launch.config";
export default defineConfig({ ...base, testMatch: "explorer-scroll.spec.ts", outputDir: "test-results/explorer-scroll" });
