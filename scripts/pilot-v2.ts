import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { assertDatasetTarget, datasetMode } from "../lib/domain/dataset";

process.loadEnvFile(".env.pilot-v2");
const mode = datasetMode(process.env.GRAPH_DATASET);
if (mode !== "pilot-urasawa-v2") throw new Error("Pilot command requires GRAPH_DATASET=pilot-urasawa-v2 in .env.pilot-v2");
assertDatasetTarget(mode, process.env.NEO4J_URI ?? "");
const require = createRequire(import.meta.url);
const command = process.argv[2];
const args = command === "seed" ? ["--import", "tsx", "scripts/seed.ts", "--dataset=pilot-urasawa-v2"] :
  command === "dev" ? [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3212"] :
    command === "build" ? [require.resolve("next/dist/bin/next"), "build"] : null;
if (!args) throw new Error("Use pilot-v2.ts seed, dev or build");
const child = spawn(process.execPath, args, { stdio: "inherit", env: process.env });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => { process.exitCode = code ?? 1; });
