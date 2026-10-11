import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createPublicBackup, planPublicRestore, restorePublicBackup } from "../lib/server/public-backup";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fixtureCounts } from "../lib/domain/fixture";
import { assertDatasetTarget } from "../lib/domain/dataset";
import { loadPublicRelease, preparePublicDataset, PUBLIC_DIRECTORY, validateInitialPublicDataset } from "../lib/server/public-dataset";
import { applyPublicRelease, planPublicRelease } from "../lib/server/public-graph";
import { openDatabase } from "../lib/server/neo4j";

const [command, directory] = process.argv.slice(2);
if (process.argv.length > 4) throw new Error("Too many arguments");
if (command === "prepare") {
  if (directory) throw new Error("Initial prepare has a fixed output directory");
  const prepared = await preparePublicDataset();
  await mkdir(PUBLIC_DIRECTORY, { recursive: true });
  await writeFile(`${PUBLIC_DIRECTORY}/data.json`, prepared.data);
  await writeFile(`${PUBLIC_DIRECTORY}/manifest.json`, prepared.manifest);
  console.log(JSON.stringify({ generated: true, counts: fixtureCounts(prepared.release.fixture) }, null, 2));
} else if (command === "validate") {
  const counts = directory ? fixtureCounts((await loadPublicRelease(directory)).fixture) : await validateInitialPublicDataset();
  console.log(JSON.stringify({ valid: true, counts }, null, 2));
} else if (["plan", "apply", "backup", "restore-plan", "restore", "dev", "build", "start"].includes(command)) {
  process.loadEnvFile(".env.public");
  if (process.env.GRAPH_DATASET !== "public-kg") throw new Error("Public commands require GRAPH_DATASET=public-kg");
  assertDatasetTarget("public-kg", process.env.NEO4J_URI ?? "");
  if (["backup", "restore-plan", "restore"].includes(command)) {
    if (!directory) throw new Error("Specify a backup file path");
    // 復元前にartifactを読む。dry-runのrevisionを明示した時だけ復元する。
    const input = command === "backup" ? null : JSON.parse(await readFile(directory, "utf8"));
    const expected = process.env.PUBLIC_RESTORE_EXPECTED_REVISION;
    if (command !== "backup" && !expected) throw new Error("Set PUBLIC_RESTORE_EXPECTED_REVISION (empty for an empty DB)");
    const { driver, database } = openDatabase();
    try {
      if (command === "backup") {
        const backup = await createPublicBackup(driver, database);
        await writeFile(directory, JSON.stringify(backup, null, 2) + "\n", { flag: "wx", mode: 0o600 });
        console.log(JSON.stringify({ backedUp: true, release: backup.payload.release, revision: backup.payload.revision, checksum: backup.checksum }));
      } else console.log(JSON.stringify(await (command === "restore" ? restorePublicBackup : planPublicRestore)(driver, database, input, expected!), null, 2));
    } finally { await driver.close(); }
  } else if (command === "plan" || command === "apply") {
    const release = await loadPublicRelease(directory);
    const { driver, database } = openDatabase();
    try {
      const result = await (command === "apply" ? applyPublicRelease : planPublicRelease)(driver, database, release);
      console.log(JSON.stringify({ ...result, counts: fixtureCounts(release.fixture) }, null, 2));
    } finally { await driver.close(); }
  } else {
    if (directory) throw new Error("Web commands do not take a release directory");
    const require = createRequire(import.meta.url);
    const args = [require.resolve("next/dist/bin/next"), command, ...(command === "build" ? [] : ["--hostname", "127.0.0.1", "--port", "3200"])];
    const child = spawn(process.execPath, args, { stdio: "inherit", env: process.env });
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
    child.on("exit", code => { process.exitCode = code ?? 1; });
  }
} else throw new Error("Use prepare, validate, plan, apply, backup, restore-plan, restore, dev, build or start");
