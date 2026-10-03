import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import catalog from "../vocabulary/catalog.json";
import baseline from "../vocabulary/baseline-v1.json";
import ledger from "../datasets/pilot-urasawa/v1/ledger.json";
import { PREDICATES } from "../lib/domain/predicates";
import { explorationLabels } from "../lib/i18n/exploration";
import { checkVocabulary, vocabularyHash, vocabularyCatalogSchema, type VocabularyEntry, type VocabularyReview } from "../lib/domain/vocabulary";

const contracts = vocabularyCatalogSchema.parse(catalog);

function setup() {
  return { catalog: vocabularyCatalogSchema.parse(structuredClone(catalog)), baseline: vocabularyCatalogSchema.parse(structuredClone(baseline)), reviews: [] as VocabularyReview[],
    runtime: structuredClone(PREDICATES) as Record<string, unknown>, searchLabels: { ...explorationLabels().predicates } as Record<string, string> };
}
function approval(target: VocabularyEntry, before: VocabularyEntry | null, change: VocabularyReview["change"]): VocabularyReview {
  return { id: "test-review", targetId: target.id, kind: "predicate", change, beforeHash: before ? vocabularyHash(before) : null, afterHash: vocabularyHash(target),
    status: "approved", reviewer: "test-only-reviewer", reviewedAt: "2026-10-03", outcome: before ? "meaning-preserving" : "new-predicate",
    motivation: "テスト専用。実際の承認ではない", evidenceExample: "資料が命題を直接述べる例", counterexample: "同じ端点でも違う命題の例",
    comparisons: target.comparisons as VocabularyReview["comparisons"], impacts: { claims: "変更しない", conditions: "変更しない", translations: "差分を確認", presentation: "差分を確認" }, rationale: "意味の不変性を人が判断するテストケース" };
}

describe("predicate meaning contracts", () => {
  it("covers the exact runtime and warns about the two person/person predicates", () => {
    const result = checkVocabulary(setup());
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(["同一端点組: ASSISTANT_OF / INFLUENCED_BY。比較理由を人が確認する"]);
  });
  it("hashes object key reordering identically but detects content changes", () => {
    expect(vocabularyHash({ a: 1, b: 2 })).toBe(vocabularyHash({ b: 2, a: 1 }));
    expect(vocabularyHash({ a: 1 })).not.toBe(vocabularyHash({ a: 2 }));
  });
  it.each(["include", "exclude", "boundary"])("rejects a missing %s case", (category) => {
    const input = setup(); input.catalog.entries[0].meaning.examples = input.catalog.entries[0].meaning.examples.map((example) => example.category === category ? { ...example, category: "boundary" as const } : example).filter((example) => example.category !== category);
    while (input.catalog.entries[0].meaning.examples.length < 3) input.catalog.entries[0].meaning.examples.push({ id: "extra-case", category: category === "boundary" ? "include" : "boundary", scenario: "別の例", rationale: "構造検証" });
    expect(checkVocabulary(input).errors.join()).toContain(`${category}例がない`);
  });
  it("rejects duplicate IDs, unknown/self/missing comparisons and blank reasoning", () => {
    const input = setup(); input.catalog.entries.push(input.catalog.entries[0]);
    expect(checkVocabulary(input).errors.join()).toContain("IDの重複");
    const refs = setup(); refs.catalog.entries[0].comparisons[0].predicateId = "UNKNOWN";
    expect(checkVocabulary(refs).errors.join()).toContain("不正な比較先");
    const self = setup(); self.catalog.entries[0].comparisons[0].predicateId = self.catalog.entries[0].id;
    expect(checkVocabulary(self).errors.join()).toContain("不正な比較先");
    const missing = setup(); missing.catalog.entries[0].comparisons.pop();
    expect(checkVocabulary(missing).errors.join()).toContain("比較がない");
    const blank = setup(); blank.catalog.entries[0].comparisons[0].rationale = " ";
    expect(checkVocabulary(blank).errors.join()).toContain("catalog:");
  });
  it("rejects runtime-only vocabulary or labels drifting away from the contract", () => {
    const input = setup(); input.runtime.EXTRA = input.runtime.ASSISTANT_OF;
    expect(checkVocabulary(input).errors.join()).toContain("意味契約がない");
    const changed = setup(); changed.runtime.ASSISTANT_OF = { ...PREDICATES.ASSISTANT_OF, description: "師弟も含む" };
    expect(checkVocabulary(changed).errors.join()).toContain("実行辞書と契約が不一致");
    const label = setup(); label.searchLabels.ASSISTANT_OF = "師弟だった";
    expect(checkVocabulary(label).errors.join()).toContain("関係選択label");
  });
  it("rejects silent meaning edits, deletion and endpoint reversal even with a review", () => {
    const input = setup(); input.catalog.entries[0].meaning.definition += "師弟も含む";
    expect(checkVocabulary(input).errors.join()).toContain("承認済み比較票がない");
    const deleted = setup(); deleted.catalog.entries.shift(); delete deleted.runtime.ASSISTANT_OF;
    expect(checkVocabulary(deleted).errors.join()).toContain("使用済みID");
    const reverse = setup(); reverse.catalog.entries[0].meaning.subjectRole = "制作を補助された人物";
    reverse.reviews.push(approval(reverse.catalog.entries[0], contracts.entries[0], "clarification"));
    expect(checkVocabulary(reverse).errors.join()).toContain("新IDが必要");
    const kinds = setup(); kinds.catalog.entries[0].runtime.objectKind = "work";
    kinds.reviews.push(approval(kinds.catalog.entries[0], contracts.entries[0], "clarification"));
    expect(checkVocabulary(kinds).errors.join()).toContain("新IDが必要");
  });
  it("requires an approved comparison record bound to exact before/after hashes", () => {
    const input = setup(); input.catalog.entries[0].meaning.examples[0].rationale += "（説明の明確化）";
    const review = approval(input.catalog.entries[0], contracts.entries[0], "clarification");
    input.reviews.push({ ...review, status: "draft" });
    expect(checkVocabulary(input).errors.join()).toContain("承認済み比較票がない");
    input.reviews[0] = review; expect(checkVocabulary(input).errors).toEqual([]);
    input.catalog.entries[0].meaning.examples[0].rationale += "追加変更";
    expect(checkVocabulary(input).errors.join()).toContain("承認済み比較票がない");
  });
  it("does not permit explicit meaning change or fake translation-only semantic changes", () => {
    const input = setup(); input.catalog.entries[0].meaning.definition += "変更";
    input.reviews.push(approval(input.catalog.entries[0], contracts.entries[0], "meaning-change"));
    expect(checkVocabulary(input).errors.join()).toContain("意味変更は既存IDで承認できない");
    input.reviews[0].change = "translation";
    expect(checkVocabulary(input).errors.join()).toContain("翻訳修正として扱えない");
    input.reviews[0].reviewer = null;
    expect(checkVocabulary(input).errors.join()).toContain("判断者と判断日");
  });
  it("accepts an example new predicate only after all existing comparisons and approval", () => {
    const input = setup(); const added = structuredClone(input.catalog.entries[1]);
    added.id = "TEST_RESPECTS"; added.meaning.definition = "テスト専用の別概念";
    added.comparisons = contracts.entries.map((entry) => ({ predicateId: entry.id, relation: "distinct" as const, rationale: "テスト専用：尊敬と既存の命題を区別する" }));
    input.catalog.entries.push(added); input.runtime[added.id] = added.runtime; input.searchLabels[added.id] = added.runtime.label;
    expect(checkVocabulary(input).errors.join()).toContain("追加に一致する承認済み比較票がない");
    input.reviews.push(approval(added, null, "addition"));
    expect(checkVocabulary(input).errors).toEqual([]);
    input.reviews[0].comparisons = input.reviews[0].comparisons.slice(1);
    expect(checkVocabulary(input).errors.join()).toContain("比較がない");
    input.reviews[0].comparisons[0].relation = "same";
    expect(checkVocabulary(input).errors.join()).toContain("同義predicate");
  });
  it("role or classification decisions cannot approve a new predicate", () => {
    const input = setup(); const added = structuredClone(input.catalog.entries[2]); added.id = "TEST_ROLE";
    added.comparisons.push({ predicateId: "CONTRIBUTED_TO", relation: "narrower", rationale: "制作の役割という限定" });
    input.catalog.entries.push(added); input.runtime[added.id] = added.runtime; input.searchLabels[added.id] = added.runtime.label;
    input.reviews.push({ ...approval(added, null, "addition"), kind: "role", outcome: "qualifier" });
    expect(checkVocabulary(input).errors.join()).toContain("承認済み比較票がない");
  });
  it("warns about normalized labels/aliases and definitions without deciding synonymy", () => {
    const input = setup(); input.catalog.entries[0].translations.ja.aliases.push("影響を受けた", "影響を受けた");
    const warnings = checkVocabulary(input).warnings.join();
    expect(warnings).toContain("同名候補"); expect(warnings).toContain("label / alias重複");
    const duplicate = setup(); duplicate.catalog.entries[0].meaning.definition = duplicate.catalog.entries[1].meaning.definition;
    expect(checkVocabulary(duplicate).warnings.join()).toContain("定義文の重複候補");
  });
  it("checks the Git comparison even if someone replaces the local baseline", () => {
    const input = setup(); input.catalog.entries[0].meaning.definition += "書換え"; input.baseline = structuredClone(input.catalog);
    expect(checkVocabulary({ ...input, previous: catalog }).errors.join()).toContain("Git比較版");
  });
  it("cannot hide semantic edits behind a chain of translation reviews", () => {
    const input = setup(); const intermediate = structuredClone(contracts.entries[0]);
    intermediate.meaning.definition += "中間の変更";
    input.catalog.entries[0].meaning.definition += "最終の変更";
    input.reviews.push(approval(intermediate, contracts.entries[0], "translation"));
    input.reviews.push({ ...approval(input.catalog.entries[0], intermediate, "translation"), id: "second-review" });
    expect(checkVocabulary(input).errors.join()).toContain("承認済み比較票がない");
  });
  it("rejects retirement ID reuse and permits neither incomplete nor duplicate review records", () => {
    const input = setup(); input.baseline.entries[0].status = "retired";
    expect(checkVocabulary(input).errors.join()).toContain("廃止ID再利用");
    const review = approval(contracts.entries[0], contracts.entries[0], "clarification");
    const duplicate = setup(); duplicate.reviews.push(review, review);
    expect(checkVocabulary(duplicate).errors.join()).toContain("review IDの重複");
    const incomplete = setup(); incomplete.reviews.push({ ...review, motivation: "" });
    expect(checkVocabulary(incomplete).errors.join()).toContain("reviews:");
    const placeholder = setup(); placeholder.reviews.push({ ...review, rationale: "TODO: 審査が必要" });
    expect(checkVocabulary(placeholder).errors.join()).toContain("未記入プレースホルダー");
  });
  it("CLI refuses baseline replacement and approved-record rewriting against committed history", () => {
    const directory = mkdtempSync(join(tmpdir(), "graph-vocabulary-"));
    const script = resolve("scripts/check-vocabulary.ts");
    try {
      mkdirSync(join(directory, "vocabulary/reviews"), { recursive: true });
      const review = approval(contracts.entries[0], contracts.entries[0], "clarification");
      for (const [path, value] of [["catalog.json", catalog], ["baseline-v1.json", baseline], ["reviews/records.json", [review]]] as const) writeFileSync(join(directory, "vocabulary", path), JSON.stringify(value));
      execFileSync("git", ["init", "-q"], { cwd: directory });
      execFileSync("git", ["add", "."], { cwd: directory });
      execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "test baseline"], { cwd: directory });
      // tsxの解決は呼出元リポジトリの絶対loaderを使用する。
      const check = () => execFileSync(process.execPath, ["--import", resolve("node_modules/tsx/dist/loader.mjs"), script, "--base-ref", "HEAD"], { cwd: directory, stdio: "pipe" });
      expect(check().toString()).toContain("0 error");
      const replacement = structuredClone(baseline); replacement.entries[0].meaning.definition += "基準を置換";
      writeFileSync(join(directory, "vocabulary/baseline-v1.json"), JSON.stringify(replacement));
      expect(() => check()).toThrow(/基準版の書換え/);
      writeFileSync(join(directory, "vocabulary/baseline-v1.json"), JSON.stringify(baseline));
      writeFileSync(join(directory, "vocabulary/reviews/records.json"), JSON.stringify([{ ...review, rationale: "承認後に変更" }]));
      expect(() => check()).toThrow(/承認済み比較票の変更/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 15000);
  it("validates the real CLI against a trusted existing Git ref", () => {
    const output = execFileSync(process.execPath, ["--import", "tsx", "scripts/check-vocabulary.ts", "--base-ref", "HEAD"], { encoding: "utf8" });
    expect(output).toContain("4 predicate / 0 error");
    expect(() => execFileSync(process.execPath, ["--import", "tsx", "scripts/check-vocabulary.ts", "--base-ref", "no-such-vocabulary-ref"], { stdio: "pipe" })).toThrow();
  });
});

describe("frozen pilot as reviewed semantic examples, not automatic source classification", () => {
  const expected = [
    ["aacddf82-87ae-4981-8542-0470e981a94f", "浦沢直樹×手塚治虫"],
    ["e3b37447-87f5-40ed-b738-6ba37578c8c3", "長崎尚志プロデュース"],
    ["75f911ca-a247-42bd-8bf0-c166649ce145", "監修"],
    ["d9780089-361d-49a0-b95a-a54c2cd2fa7a", "浦沢直樹"],
    ["3ee2132d-436a-44cf-a33e-851faddd3163", "脚本"],
    ["48c3605b-34d8-409d-a4d2-fdd50c524c74", "脚本"],
    ["11d202ab-e9a4-4da5-9ff2-735f48f83133", "著"],
    ["1ad08ee5-bbc3-41bf-b647-4b7419820a14", "ストーリー共同制作"],
  ];
  it.each(expected)("retains the broad contribution and source scope of %s", (id, originalRole) => {
    const item = ledger.claims.find((entry) => entry.claim.id === id)!;
    expect(item.claim.predicate).toBe("CONTRIBUTED_TO");
    expect(item.evidence.originalRole).toBe(originalRole);
    expect(item.evidence.scope).toContain("全巻・全期間の役割を断定しません");
    expect(item.claim).not.toHaveProperty("role");
  });
  it("keeps original-basis and organization cooperation deferred", () => {
    expect(ledger.deferred.some((item) => item.reason.includes("原作・翻案"))).toBe(true);
    expect(ledger.deferred.some((item) => item.subject.includes("手塚プロダクション"))).toBe(true);
    const rules = catalog.entries.find((entry) => entry.id === "CONTRIBUTED_TO")!.meaning.rules;
    expect(rules).toContain("役割なしは全役割の肯定ではない。");
    expect(rules).toContain("将来の役割限定の否定を制作関与全体の否定へ変換しない。");
  });
});
