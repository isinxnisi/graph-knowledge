// 開発・レビュー用。APIやClaim schemaの正本を置き換えない。
import { createHash } from "node:crypto";
import { z } from "zod";
import { ENTITY_KINDS } from "./predicates";

const text = z.string().trim().min(1);
const id = z.string().regex(/^[A-Z][A-Z0-9_]*$/);
const comparison = z.strictObject({ predicateId: id, relation: z.enum(["same", "narrower", "overlap", "distinct"]), rationale: text });
const translation = z.strictObject({ label: text, reverseLabel: text, description: text, aliases: z.array(text) });
const runtime = z.strictObject({ subjectKind: z.enum(ENTITY_KINDS), objectKind: z.enum(ENTITY_KINDS), label: text, reverseLabel: text, description: text });
export const vocabularyEntrySchema = z.strictObject({
  id, status: z.enum(["active", "retired"]), definitionLanguage: text,
  runtime,
  meaning: z.strictObject({ definition: text, subjectRole: text, objectRole: text, direction: z.literal("subject-to-object"),
    rules: z.array(text).min(1),
    examples: z.array(z.strictObject({ id: text, category: z.enum(["include", "exclude", "boundary"]), scenario: text, rationale: text })).min(3),
    nearbyConcepts: z.array(z.strictObject({ term: text, difference: text })).min(1),
  }),
  translations: z.record(text, translation), comparisons: z.array(comparison),
});
export const vocabularyCatalogSchema = z.strictObject({ schemaVersion: z.literal(1), entries: z.array(vocabularyEntrySchema).min(1) });
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const vocabularyReviewSchema = z.strictObject({
  id: text, targetId: id, kind: z.enum(["predicate", "role", "classification", "alias", "preset"]),
  change: z.enum(["addition", "clarification", "translation", "retirement", "meaning-change"]),
  beforeHash: hash.nullable(), afterHash: hash,
  status: z.enum(["draft", "approved", "rejected"]), reviewer: text.nullable(), reviewedAt: z.iso.date().nullable(),
  outcome: z.enum(["new-predicate", "meaning-preserving", "new-id-required", "alias", "qualifier", "classification", "preset"]),
  motivation: text, evidenceExample: text, counterexample: text,
  comparisons: z.array(comparison).min(1),
  impacts: z.strictObject({ claims: text, conditions: text, translations: text, presentation: text }),
  rationale: text,
}).superRefine((record, ctx) => {
  if (record.status === "approved" && (!record.reviewer || !record.reviewedAt)) ctx.addIssue({ code: "custom", message: "承認には判断者と判断日が必要" });
  if ((record.change === "addition") !== (record.beforeHash === null)) ctx.addIssue({ code: "custom", message: "追加だけbeforeHash=null" });
});
export type VocabularyCatalog = z.infer<typeof vocabularyCatalogSchema>;
export type VocabularyEntry = z.infer<typeof vocabularyEntrySchema>;
export type VocabularyReview = z.infer<typeof vocabularyReviewSchema>;
export type VocabularyResult = { errors: string[]; warnings: string[] };

// JSONのキー順だけの変更を意味の変更として扱わない。
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
export function vocabularyHash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
const normalized = (value: string) => value.normalize("NFKC").trim().toLowerCase();

export function checkVocabulary(input: {
  catalog: unknown; baseline: unknown; reviews: unknown;
  runtime: Record<string, unknown>; searchLabels: Record<string, string>;
  previous?: unknown;
}): VocabularyResult {
  const errors: string[] = [], warnings: string[] = [];
  const catalog = vocabularyCatalogSchema.safeParse(input.catalog);
  const baseline = vocabularyCatalogSchema.safeParse(input.baseline);
  const records = z.array(vocabularyReviewSchema).safeParse(input.reviews);
  const previous = input.previous === undefined ? undefined : vocabularyCatalogSchema.safeParse(input.previous);
  for (const [name, result] of [["catalog", catalog], ["baseline", baseline], ["reviews", records], ["previous", previous]] as const) {
    if (result && !result.success) errors.push(`${name}: ${result.error.message}`);
  }
  if (!catalog.success || !baseline.success || !records.success || (previous && !previous.success)) return { errors, warnings };
  const current = catalog.data;
  const reviews = records.data;
  const entries = new Map(current.entries.map((entry) => [entry.id, entry]));
  if (entries.size !== current.entries.length) errors.push("predicate IDの重複");
  if (new Set(reviews.map((record) => record.id)).size !== reviews.length) errors.push("review IDの重複");
  const known = new Set(current.entries.map((entry) => entry.id));
  function checkComparisons(items: VocabularyEntry["comparisons"], target: string, required: string[], context: string) {
    const ids = items.map((item) => item.predicateId);
    if (new Set(ids).size !== ids.length) errors.push(`${context}: 比較先の重複`);
    for (const item of items) {
      if (!known.has(item.predicateId) || item.predicateId === target) errors.push(`${context}: 不正な比較先 ${item.predicateId}`);
      if (item.relation === "same") errors.push(`${context}: 同義predicateは新IDで増やさず別名を検討する`);
    }
    for (const requiredId of required) if (!ids.includes(requiredId)) errors.push(`${context}: ${requiredId}との比較がない`);
  }
  const words = new Map<string, Set<string>>();
  for (const entry of current.entries) {
    if (vocabularyHash(input.runtime[entry.id]) !== vocabularyHash(entry.runtime)) errors.push(`${entry.id}: 実行辞書と契約が不一致`);
    if (input.searchLabels[entry.id] !== entry.runtime.label) errors.push(`${entry.id}: 関係選択labelと契約が不一致`);
    const exampleIds = entry.meaning.examples.map((example) => example.id);
    if (new Set(exampleIds).size !== exampleIds.length) errors.push(`${entry.id}: 例IDの重複`);
    for (const category of ["include", "exclude", "boundary"]) if (!entry.meaning.examples.some((example) => example.category === category)) errors.push(`${entry.id}: ${category}例がない`);
    if (!entry.translations[entry.definitionLanguage]) errors.push(`${entry.id}: 定義言語の翻訳がない`);
    if (vocabularyHash(entry.translations.ja && { label: entry.translations.ja.label, reverseLabel: entry.translations.ja.reverseLabel, description: entry.translations.ja.description }) !== vocabularyHash({ label: entry.runtime.label, reverseLabel: entry.runtime.reverseLabel, description: entry.runtime.description })) errors.push(`${entry.id}: 現行ja表現と契約が不一致`);
    checkComparisons(entry.comparisons, entry.id, baseline.data.entries.map((item) => item.id).filter((key) => key !== entry.id), entry.id);
    for (const [locale, labels] of Object.entries(entry.translations)) {
      const local = new Set<string>();
      for (const word of [labels.label, ...labels.aliases]) {
        const key = `${locale}:${normalized(word)}`;
        if (local.has(key)) warnings.push(`${entry.id}: ${locale}内のlabel / alias重複 ${word}`);
        local.add(key);
        const owners = words.get(key) ?? new Set<string>(); owners.add(entry.id); words.set(key, owners);
      }
    }
  }
  for (const key of Object.keys(input.runtime)) if (!known.has(key)) errors.push(`${key}: 実行辞書に意味契約がない`);
  for (const [word, owners] of words) if (owners.size > 1) warnings.push(`同名候補 ${word}: ${[...owners].join(", ")}（同義判定ではない）`);
  for (let i = 0; i < current.entries.length; i++) for (const other of current.entries.slice(i + 1)) {
    const entry = current.entries[i];
    if (entry.runtime.subjectKind === other.runtime.subjectKind && entry.runtime.objectKind === other.runtime.objectKind) warnings.push(`同一端点組: ${entry.id} / ${other.id}。比較理由を人が確認する`);
    if (normalized(entry.meaning.definition) === normalized(other.meaning.definition)) warnings.push(`定義文の重複候補: ${entry.id} / ${other.id}`);
  }
  for (const record of reviews) {
    // draftは保留された提案。公開済みの変更を許可する根拠にはならない。
    if (record.status !== "approved") continue;
    if (/\b(?:TODO|TBD)\b/.test(JSON.stringify(record))) errors.push(`${record.id}: 承認票に未記入プレースホルダーがある`);
    if (!known.has(record.targetId)) errors.push(`${record.id}: 承認対象の契約がない`);
    checkComparisons(record.comparisons, record.targetId, baseline.data.entries.map((entry) => entry.id).filter((key) => key !== record.targetId), record.id);
    if (record.change === "meaning-change") errors.push(`${record.id}: 意味変更は既存IDで承認できない。新IDが必要`);
  }
  function reviewedPath(target: string, before: string | null, after: string, addition: boolean, meaningChanged = false): boolean {
    const seen = new Set<string>();
    const queue = [{ hash: before, clarified: false }];
    while (queue.length) {
      const state = queue.shift()!;
      const from = state.hash;
      const key = `${from}:${state.clarified}`;
      if (seen.has(key)) continue;
      seen.add(key);
      for (const review of reviews.filter((r) => r.targetId === target && r.status === "approved" && r.beforeHash === from)) {
        const allowed = from === null
          ? review.change === "addition" && review.kind === "predicate" && review.outcome === "new-predicate"
          : ["clarification", "translation", "retirement"].includes(review.change) && ["meaning-preserving", "alias"].includes(review.outcome) && (review.kind === "predicate" || (review.kind === "alias" && review.change === "translation"));
        if (!allowed || (!addition && from === null)) continue;
        if (review.comparisons.some((item) => item.relation === "same") && review.kind === "predicate") continue;
        const clarified = state.clarified || review.change === "clarification";
        if (review.afterHash === after && (!meaningChanged || clarified)) return true;
        queue.push({ hash: review.afterHash, clarified });
      }
    }
    return false;
  }
  function compare(prior: VocabularyCatalog, context: string) {
    const old = new Map(prior.entries.map((entry) => [entry.id, entry]));
    for (const entry of prior.entries) {
      const next = entries.get(entry.id);
      if (!next) { errors.push(`${context}: 使用済みID ${entry.id}の削除`); continue; }
      if (next.runtime.subjectKind !== entry.runtime.subjectKind || next.runtime.objectKind !== entry.runtime.objectKind || next.meaning.subjectRole !== entry.meaning.subjectRole || next.meaning.objectRole !== entry.meaning.objectRole) errors.push(`${context}: ${entry.id}の端点・意味方向変更は新IDが必要`);
      if (entry.status === "retired" && next.status === "active") errors.push(`${context}: ${entry.id}の廃止ID再利用`);
      const before = vocabularyHash(entry), after = vocabularyHash(next);
      if (before !== after && !reviewedPath(entry.id, before, after, false, vocabularyHash(entry.meaning) !== vocabularyHash(next.meaning))) errors.push(`${context}: ${entry.id}の変更に一致する承認済み比較票がない (${before} -> ${after})`);
      if (before !== after) {
        warnings.push(`${context}: ${entry.id}変更。意味が不変か人間レビューが必要`);
        for (const review of reviews.filter((r) => r.targetId === entry.id && r.beforeHash === before && r.afterHash === after && r.status === "approved")) {
          if (review.change === "translation" && vocabularyHash(entry.meaning) !== vocabularyHash(next.meaning)) errors.push(`${review.id}: 意味契約の変更を翻訳修正として扱えない`);
        }
      }
    }
    for (const entry of current.entries.filter((item) => !old.has(item.id))) {
      checkComparisons(entry.comparisons, entry.id, [...old.keys()], `${context}: ${entry.id}追加`);
      const approval = reviews.find((record) => record.targetId === entry.id && record.beforeHash === null && record.afterHash === vocabularyHash(entry) && record.status === "approved");
      if (approval) checkComparisons(approval.comparisons, entry.id, [...old.keys()], approval.id);
      if (!reviewedPath(entry.id, null, vocabularyHash(entry), true)) errors.push(`${context}: ${entry.id}追加に一致する承認済み比較票がない`);
    }
  }
  compare(baseline.data, "基準版");
  if (previous?.success) compare(previous.data, "Git比較版");
  return { errors, warnings: [...new Set(warnings)] };
}
