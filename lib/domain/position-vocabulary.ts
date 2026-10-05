import { z } from "zod";
import { vocabularyEntrySchema, vocabularyHash } from "./vocabulary";
import { organizationPositionSchema, ORGANIZATION_POSITION_IDS } from "./organization-participation";
import { organizationParticipationLabels } from "../i18n/organization-participation";
const text = z.string().trim().min(1);
export const positionCatalogSchema = z.strictObject({ schemaVersion: z.literal(1), entries: z.array(z.strictObject({
  id: organizationPositionSchema, predicate: z.literal("AFFILIATED_WITH"), definitionLanguage: text,
  meaning: vocabularyEntrySchema.shape.meaning, translations: vocabularyEntrySchema.shape.translations,
  predicateRationale: text, comparisons: z.array(z.strictObject({ positionId: organizationPositionSchema, relation: z.enum(["same", "narrower", "overlap", "distinct"]), rationale: text })),
})).length(2) });
export function checkPositionVocabulary(input: unknown, baselineInput: unknown) {
  const catalog = positionCatalogSchema.parse(input), baseline = positionCatalogSchema.parse(baselineInput);
  const errors: string[] = [], warnings: string[] = [];
  if (new Set(catalog.entries.map(entry => entry.id)).size !== 2) errors.push("Missing or duplicate position ID");
  for (const entry of catalog.entries) {
    const old = baseline.entries.find(value => value.id === entry.id);
    // 今回の二値に意味変更・廃止の承認フローは設けない。必要時は新IDと比較レビューを先に決める。
    if (!old || vocabularyHash(entry) !== vocabularyHash(old)) errors.push(`${entry.id}: used position contract changed; separate semantic review required`);
    if (entry.translations.ja?.label !== organizationParticipationLabels().positions[entry.id]) errors.push(`${entry.id}: label mismatch`);
    for (const category of ["include", "exclude", "boundary"]) if (!entry.meaning.examples.some(example => example.category === category)) errors.push(`${entry.id}: missing ${category}`);
    const targets = entry.comparisons.map(comparison => comparison.positionId);
    if (targets.includes(entry.id) || new Set(targets).size !== targets.length || ORGANIZATION_POSITION_IDS.filter(id => id !== entry.id).some(id => !targets.includes(id))) errors.push(`${entry.id}: incomplete comparisons`);
    if (entry.comparisons.some(comparison => comparison.relation === "same")) errors.push(`${entry.id}: synonym must not become a new position ID`);
  }
  const labels = new Map<string, string>();
  for (const entry of catalog.entries) for (const [locale, translation] of Object.entries(entry.translations)) for (const name of [translation.label, ...translation.aliases]) {
    const key = `${locale}:${name.normalize("NFKC").toLowerCase()}`;
    if (labels.has(key)) warnings.push(`Position label collision: ${key}`);
    labels.set(key, entry.id);
  }
  return { errors, warnings };
}
