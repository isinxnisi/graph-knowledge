import { defineConfig } from "@playwright/test";
export default defineConfig({
 testDir:"./tests/e2e",testMatch:"capsule-mobile-viewport.spec.ts",workers:1,timeout:60000,
 outputDir:"test-results/capsule-mobile",use:{baseURL:process.env.CAPSULE_MOBILE_BASE_URL??"http://127.0.0.1:3210",viewport:{width:390,height:660},isMobile:true,hasTouch:true,trace:"retain-on-failure"},
 projects:[{name:"chromium",use:{browserName:"chromium"}},{name:"webkit",use:{browserName:"webkit"}}],
});
