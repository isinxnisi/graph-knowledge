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
