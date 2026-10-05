import { z } from "zod";
import { vocabularyEntrySchema, vocabularyHash } from "./vocabulary";
import { eventRoleSchema } from "./event-participation";
import { eventParticipationLabels } from "../i18n/event-participation";
export const eventRoleCatalogSchema = z.strictObject({ schemaVersion: z.literal(1), entries: z.array(z.strictObject({
  id: eventRoleSchema, predicate: z.literal("PARTICIPATED_IN"), definitionLanguage: z.literal("ja"),
  meaning: vocabularyEntrySchema.shape.meaning, translations: vocabularyEntrySchema.shape.translations,
  predicateRationale: z.string().min(1),
})).length(1) });
export function checkEventRoleVocabulary(input: unknown, baselineInput: unknown) {
  const catalog = eventRoleCatalogSchema.parse(input), baseline = eventRoleCatalogSchema.parse(baselineInput);
  const errors: string[] = [], warnings: string[] = [];
  if (vocabularyHash(catalog) !== vocabularyHash(baseline)) errors.push("使用済みEvent立場の意味・基準版変更を拒否。別途意味レビューが必要");
  for (const entry of catalog.entries) {
    if (entry.translations.ja?.label !== eventParticipationLabels().roles[entry.id]) errors.push("Event role label mismatch");
    for (const category of ["include", "exclude", "boundary"]) if (!entry.meaning.examples.some(e => e.category === category)) errors.push(`Missing ${category}`);
  }
  return { errors, warnings };
}
