import { checkPendingFilmRoles } from "../lib/domain/pending-film-roles";
import { checkRoleVocabulary } from "../lib/domain/role-vocabulary";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { PREDICATES } from "../lib/domain/predicates";
import { explorationLabels } from "../lib/i18n/exploration";
import { checkVocabulary, vocabularyHash } from "../lib/domain/vocabulary";

const rawArgs = process.argv.slice(2);
const printHashes = rawArgs[0] === "--hashes";
const args = printHashes ? rawArgs.slice(1) : rawArgs;
if (args.length && (args.length !== 2 || args[0] !== "--base-ref" || !/^[A-Za-z0-9_./^~-]+$/.test(args[1]) || args[1].startsWith("-"))) throw new Error("Usage: vocabulary:check [--hashes] [--base-ref <trusted Git ref>]");
const baseRef = args[1] ?? "HEAD";
const paths = ["vocabulary/catalog.json", "vocabulary/baseline-v1.json", "vocabulary/reviews/records.json"];
const [catalog, baseline, reviews] = await Promise.all(paths.map(async (path) => JSON.parse(await readFile(path, "utf8"))));
execFileSync("git", ["rev-parse", "--verify", `${baseRef}^{commit}`], { stdio: "pipe" });
const tree = execFileSync("git", ["ls-tree", "--name-only", baseRef, ...paths], { encoding: "utf8" }).trim().split("\n");
function fromGit(path: string): unknown {
  return JSON.parse(execFileSync("git", ["show", `${baseRef}:${path}`], { encoding: "utf8" }));
}
if (tree.includes(paths[1]) && vocabularyHash(fromGit(paths[1])) !== vocabularyHash(baseline)) throw new Error("基準版の書換えを拒否。baseline-v1.jsonは変更せず新ID・比較票で対応する");
if (tree.includes(paths[2])) {
  const prior = fromGit(paths[2]) as { id: string; status: string }[];
  for (const record of prior.filter((item) => item.status === "approved")) {
    const next = reviews.find((item: { id: string }) => item.id === record.id);
    if (vocabularyHash(record) !== vocabularyHash(next)) throw new Error(`承認済み比較票の変更・削除を拒否: ${record.id}`);
  }
}
if (!tree.includes(paths[1])) console.log(`初回基準版導入: ${baseRef}にbaselineはありません`);
if (printHashes) {
  const prior = (tree.includes(paths[0]) ? fromGit(paths[0]) : baseline) as { entries: { id: string }[] };
  for (const entry of catalog.entries) {
    const before = prior.entries.find((item) => item.id === entry.id);
    console.log(JSON.stringify({ targetId: entry.id, beforeHash: before ? vocabularyHash(before) : null, afterHash: vocabularyHash(entry) }));
  }
}
const result = checkVocabulary({ catalog, baseline, reviews, previous: tree.includes(paths[0]) ? fromGit(paths[0]) : undefined,
  runtime: PREDICATES, searchLabels: explorationLabels("ja").predicates });
for (const warning of result.warnings) console.warn(`WARN ${warning}`);
for (const error of result.errors) console.error(`ERROR ${error}`);
console.log(`語彙検証: ${catalog.entries.length} predicate / ${result.errors.length} error / ${result.warnings.length} warning / Git base ${baseRef}`);
if (result.errors.length) process.exitCode = 1;

const rolePaths = ["vocabulary/contribution-roles/catalog.json", "vocabulary/contribution-roles/baseline-v1.json", "vocabulary/contribution-roles/reviews.json"];
const roleValues = await Promise.all(rolePaths.map(async (path) => JSON.parse(await readFile(path, "utf8"))));
const roleTree = execFileSync("git", ["ls-tree", "--name-only", baseRef, ...rolePaths], { encoding: "utf8" }).trim().split("\n");
if (roleTree.includes(rolePaths[1]) && vocabularyHash(fromGit(rolePaths[1])) !== vocabularyHash(roleValues[1])) throw new Error("Role baseline rewrite rejected");
if (roleTree.includes(rolePaths[2])) for (const record of (fromGit(rolePaths[2]) as { id: string; status: string }[]).filter((item) => item.status === "approved")) {
  if (vocabularyHash(record) !== vocabularyHash(roleValues[2].find((item: { id: string }) => item.id === record.id))) throw new Error("Approved Role review rewrite rejected");
}
const roleResult = checkRoleVocabulary(roleValues[0], roleValues[1], roleValues[2]);
if (roleTree.includes(rolePaths[0])) roleResult.errors.push(...checkRoleVocabulary(roleValues[0], fromGit(rolePaths[0]), roleValues[2]).errors);
for (const warning of roleResult.warnings) console.warn(`WARN ${warning}`);
for (const error of roleResult.errors) console.error(`ERROR ${error}`);
console.log(`Role検証: ${roleValues[0].entries.length} role / ${roleResult.errors.length} error`);
if (roleResult.errors.length) process.exitCode = 1;

if (printHashes) {
  const prior = (roleTree.includes(rolePaths[0]) ? fromGit(rolePaths[0]) : roleValues[1]) as { entries: { id: string }[] };
  for (const entry of roleValues[0].entries as { id: string }[]) {
    const before = prior.entries.find((item) => item.id === entry.id);
    console.log(JSON.stringify({ kind: "role", targetId: entry.id, beforeHash: before ? vocabularyHash(before) : null, afterHash: vocabularyHash(entry) }));
  }
}

const pendingFilm = checkPendingFilmRoles(JSON.parse(await readFile("vocabulary/contribution-roles/film-pending.json", "utf8")));
console.log("映画Role: " + pendingFilm.filter(role => !roleValues[0].entries.some((entry: {id: string}) => entry.id === role.targetId)).length + " pending / 承認済みcatalogを正本として判定");
if (printHashes) for (const draft of pendingFilm) console.log(JSON.stringify({ kind: "role", ...draft }));
