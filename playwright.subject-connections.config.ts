import { defineConfig } from "@playwright/test";
import base from "./playwright.launch.config";
export default defineConfig({...base,testMatch:["discovery-subject-connections.spec.ts"],outputDir:"test-results/subject-connections",timeout:180000});
