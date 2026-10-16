import { defineConfig } from "@playwright/test";
import base from "./playwright.launch.config";
export default defineConfig({ ...base, testMatch: ["discovery-prototype.spec.ts"], outputDir: "test-results/discovery-prototype" });
