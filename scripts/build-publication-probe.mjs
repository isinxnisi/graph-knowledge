import { build } from "esbuild";
await build({ entryPoints: ["scripts/publication-compatibility.ts"], bundle: true, platform: "node", format: "cjs", target: "node24", outfile: ".local/publication-probe/publication-probe.cjs" });
