import { defineConfig } from "@playwright/test";
const baseURL = process.env.FILM43_BASE_URL;
if (!["http://127.0.0.1:3200","http://127.0.0.1:3286","https://graph-beta.isinxnisi.com"].includes(baseURL ?? "")) throw Error("Explicit existing local3200/beta target required");
export default defineConfig({
 testDir:"./tests/film43",workers:1,timeout:180000,expect:{timeout:30000},
 outputDir:process.env.FILM43_RESULTS ?? "test-results/film43",
 reporter:[["list"],["json",{outputFile:(process.env.FILM43_RESULTS ?? "test-results/film43")+"/results.json"}]],
 use:{baseURL,actionTimeout:45000,trace:"off",video:"off"},
});
