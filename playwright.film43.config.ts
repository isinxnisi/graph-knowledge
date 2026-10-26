import { defineConfig } from "@playwright/test";
const baseURL = process.env.FILM43_BASE_URL;
const formalRevision = process.env.FILM_FORMAL_REVISION;
const production = baseURL === "https://plunode.net";
if (production && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(formalRevision ?? "")) throw Error("Production E2E requires the freshly published formal revision");
if (!production && !["http://127.0.0.1:3200","http://127.0.0.1:3286","https://graph-beta.isinxnisi.com"].includes(baseURL ?? "")) throw Error("Explicit local3200/beta or approved production target required");
export default defineConfig({
 testDir:"./tests/film43",workers:1,timeout:180000,expect:{timeout:30000},
 outputDir:process.env.FILM43_RESULTS ?? "test-results/film43",
 reporter:[["list"],["json",{outputFile:(process.env.FILM43_RESULTS ?? "test-results/film43")+"/results.json"}]],
 use:{baseURL,actionTimeout:45000,trace:"off",video:"off"},
});
