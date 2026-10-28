import { test, expect } from "vitest";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";

test("generation catches drift; recognizing a synthetic eleventh Role does not adopt it", () => {
 const root = mkdtempSync(join(tmpdir(), "plunode-role-generation-"));
 try {
  for (const path of ["lib", "vocabulary", "package.json", "tsconfig.json"]) cpSync(resolve(path), join(root, path), { recursive: true });
  cpSync(resolve("scripts"), join(root, "scripts"), { recursive: true });
  symlinkSync(resolve("node_modules"), join(root, "node_modules"), "dir");
  const run = (args: string[]) => execFileSync(process.execPath, ["--import", "tsx", ...args], { cwd: root, stdio: "pipe" }).toString();
  run(["scripts/generate-contribution-roles.ts", "--check"]);
  const output = join(root, "lib/generated/contribution-roles.ts"), original = readFileSync(output, "utf8");
  writeFileSync(output, original + "\n");
  expect(() => run(["scripts/generate-contribution-roles.ts", "--check"])).toThrow();
  writeFileSync(output, original);
  const path = join(root, "vocabulary/contribution-roles/catalog.json"), catalog = JSON.parse(readFileSync(path, "utf8"));
  const entry = structuredClone(catalog.entries.at(-1)); entry.id = "PILOT_SYNTHETIC_ROLE";
  catalog.entries.push(entry); writeFileSync(path, JSON.stringify(catalog));
  run(["scripts/generate-contribution-roles.ts"]);
  const result = JSON.parse(run(["-e", "const c=require('./lib/domain/contribution.ts');const p=require('./lib/server/publication-compatibility.ts');console.log(JSON.stringify({recognized:c.roleIdSchema.safeParse('PILOT_SYNTHETIC_ROLE').success,catalogValid:p.publicationCapabilities().catalogValid}));"]));
  expect(result).toEqual({ recognized: true, catalogValid: false });
 } finally { rmSync(root, { recursive: true, force: true }); }
});
