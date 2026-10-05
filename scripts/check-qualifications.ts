import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { checkPositionVocabulary } from "../lib/domain/position-vocabulary";
import { vocabularyHash } from "../lib/domain/vocabulary";
import { QUALIFICATION_TYPES } from "../lib/domain/qualifications";
import { loadScienceV2 } from "../lib/server/science-v2-dataset";
const paths = ["vocabulary/organization-positions/catalog.json", "vocabulary/organization-positions/baseline-v1.json"];
const [catalog, baseline] = await Promise.all(paths.map(async path => JSON.parse(await readFile(path, "utf8"))));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--base-ref" || !/^[A-Za-z0-9_./^~-]+$/.test(args[1]) || args[1].startsWith("-"))) throw new Error("Use --base-ref <trusted Git ref>");
const baseRef = args[1] ?? "HEAD";
execFileSync("git", ["rev-parse", "--verify", `${baseRef}^{commit}`], { stdio: "pipe" });
const tracked = execFileSync("git", ["ls-tree", "--name-only", baseRef, ...paths], { encoding: "utf8" }).trim().split("\n");
for (const path of paths) if (tracked.includes(path)) {
  const prior = JSON.parse(execFileSync("git", ["show", `${baseRef}:${path}`], { encoding: "utf8" }));
  if (vocabularyHash(prior) !== vocabularyHash(path.endsWith("catalog.json") ? catalog : baseline)) throw new Error("使用済み立場の契約／基準版変更を拒否。意味レビューと新ID方針を先に決める。");
}
const result = checkPositionVocabulary(catalog, baseline);
if (QUALIFICATION_TYPES.contribution.predicate !== "CONTRIBUTED_TO" || QUALIFICATION_TYPES.organizationParticipation.predicate !== "AFFILIATED_WITH") result.errors.push("Qualification applicability changed");
for (const error of result.errors) console.error(`ERROR ${error}`);
for (const warning of result.warnings) console.warn(`WARN ${warning}`);
const fixture = await loadScienceV2();
console.log(`限定契約検証: 2独立型 / 2組織立場 / ${fixture.claims.length} science v2 Claim / ${result.errors.length} error / ${result.warnings.length} warning`);
if (result.errors.length) process.exitCode = 1;
