import { z } from "zod";
import { vocabularyEntrySchema, vocabularyHash, vocabularyReviewSchema } from "./vocabulary";
import { ADOPTED_CONTRIBUTION_ROLE_IDS, CONTRIBUTION_ROLE_IDS, roleIdSchema } from "./contribution";
import { contributionLabels } from "../i18n/contribution";
const text = z.string().trim().min(1);
const comparisons = z.array(z.strictObject({ roleId: roleIdSchema, relation: z.enum(["same", "narrower", "overlap", "distinct"]), rationale: text }));
export const roleCatalogSchema = z.strictObject({ schemaVersion: z.literal(1), entries: z.array(z.strictObject({
  id: roleIdSchema, predicate: z.literal("CONTRIBUTED_TO"), definitionLanguage: text,
  meaning: vocabularyEntrySchema.shape.meaning, translations: vocabularyEntrySchema.shape.translations,
  predicateRationale: text, comparisons,
})).min(1) });
export const roleReviewSchema = z.strictObject({ ...vocabularyReviewSchema.shape, kind: z.literal("role"), predicateRationale: text, comparisons }).superRefine((record, ctx) => {
  if (record.status === "approved" && (!record.reviewer || !record.reviewedAt)) ctx.addIssue({ code: "custom", message: "Approval requires reviewer and date" });
  if ((record.change === "addition") !== (record.beforeHash === null)) ctx.addIssue({ code: "custom", message: "Only additions have null beforeHash" });
});
export function checkRoleVocabulary(catalogInput: unknown, baselineInput: unknown, reviewsInput: unknown) {
  const catalog = roleCatalogSchema.parse(catalogInput), baseline = roleCatalogSchema.parse(baselineInput);
  const reviews = z.array(roleReviewSchema).parse(reviewsInput);
  const errors: string[] = [], warnings: string[] = [];
  // An immutable historical approval compares the roles available at that date.
  // Same-day additions form one cohort; new approvals still compare every prior role.
  const firstAddition = (id: string) => reviews.filter(review => review.targetId === id && review.change === "addition" && review.status === "approved")
    .map(review => review.reviewedAt!).sort()[0];
  const roleIdsAt = (date: string) => catalog.entries.map(entry => entry.id).filter(id => {
    const added = firstAddition(id);
    return baseline.entries.some(entry => entry.id === id) || !added || added <= date;
  });
  if (new Set(reviews.map((review) => review.id)).size !== reviews.length) errors.push("Duplicate role review ID");
  for (const review of reviews.filter((item) => item.status === "approved")) {
    if (!catalog.entries.some((entry) => entry.id === review.targetId)) errors.push(`${review.id}: unknown role review target`);
    if (/\b(?:TODO|TBD)\b/.test(JSON.stringify(review))) errors.push(`${review.id}: unfinished role review`);
    const compared = review.comparisons.map((comparison) => comparison.roleId);
    if (new Set(compared).size !== compared.length || compared.includes(review.targetId as typeof CONTRIBUTION_ROLE_IDS[number])) errors.push(`${review.id}: invalid comparison targets`);
  }
  if (new Set(catalog.entries.map((entry) => entry.id)).size !== catalog.entries.length) errors.push("Duplicate role ID");
  for (const id of ADOPTED_CONTRIBUTION_ROLE_IDS) if (!catalog.entries.some((entry) => entry.id === id)) errors.push(`Missing role ${id}`);
  for (const entry of catalog.entries) {
    if (!(CONTRIBUTION_ROLE_IDS as readonly string[]).includes(entry.id)) errors.push(entry.id + ": unknown role cannot enter the adopted catalog");
    for (const category of ["include", "exclude", "boundary"]) if (!entry.meaning.examples.some((example) => example.category === category)) errors.push(`${entry.id}: missing ${category}`);
    if (entry.translations.ja?.label !== contributionLabels().roles[entry.id]) errors.push(`${entry.id}: runtime label mismatch`);
    const ids = entry.comparisons.map((item) => item.roleId);
    if (new Set(ids).size !== ids.length || ids.includes(entry.id)) errors.push(`${entry.id}: invalid comparisons`);
    const addedAt = firstAddition(entry.id);
    const previous = baseline.entries.find(old => old.id === entry.id);
    const requiredComparisons = previous ? previous.comparisons.map(item => item.roleId) : addedAt ? roleIdsAt(addedAt) : [...CONTRIBUTION_ROLE_IDS];
    for (const id of requiredComparisons.filter(id => id !== entry.id)) if (!ids.includes(id)) errors.push(`${entry.id}: missing comparison ${id}`);
    if (entry.comparisons.some((item) => item.relation === "same")) errors.push(`${entry.id}: synonym needs an alias, not another role`);
    const old = baseline.entries.find((item) => item.id === entry.id);
    const before = old ? vocabularyHash(old) : null, after = vocabularyHash(entry);
    if (before !== after) {
      const review = reviews.find((item) => item.targetId === entry.id && item.beforeHash === before && item.afterHash === after && item.status === "approved");
      if (!review || !review.reviewer || !review.reviewedAt || !["qualifier", "meaning-preserving", "alias"].includes(review.outcome) || review.change === "meaning-change") errors.push(`${entry.id}: missing meaning-preserving role review`);
      if (review && (review.comparisons.some((item) => item.relation === "same") || roleIdsAt(review.reviewedAt!).filter((id) => id !== entry.id).some((id) => !review.comparisons.some((item) => item.roleId === id)))) errors.push(`${entry.id}: incomplete role review`);
      if (review?.change === "translation" && old && vocabularyHash(old.meaning) !== vocabularyHash(entry.meaning)) errors.push(`${entry.id}: semantic edit disguised as translation`);
      warnings.push(`${entry.id}: human semantic review required`);
    }
  }
  for (const old of baseline.entries) if (!catalog.entries.some((entry) => entry.id === old.id)) errors.push(`Used role removed: ${old.id}`);
  const labels = new Map<string, string>();
  for (const entry of catalog.entries) for (const [locale, translation] of Object.entries(entry.translations)) for (const word of [translation.label, ...translation.aliases]) {
    const key = `${locale}:${word.normalize("NFKC").toLowerCase()}`;
    if (labels.has(key)) warnings.push(`Role label collision ${key}: ${labels.get(key)} / ${entry.id}`);
    labels.set(key, entry.id);
  }
  return { errors, warnings };
}
