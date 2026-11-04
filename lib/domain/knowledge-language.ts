import { z } from "zod";

// UI locale, authorship, source language and quotation language are independent.
// Absence means unknown. Never manufacture a declaration when reading old data.
export const knowledgeLanguageTagSchema = z.string().min(2).max(35).refine(value => {
  try { return Intl.getCanonicalLocales(value).length === 1; } catch { return false; }
}, "言語の指定を確認してください");
export const knowledgeTextLanguageSchema = z.strictObject({
  tag: knowledgeLanguageTagSchema,
  basis: z.enum(["declared", "generated"]),
});
export type KnowledgeTextLanguage = z.infer<typeof knowledgeTextLanguageSchema>;
export const declaredTextLanguage = (tag: string): KnowledgeTextLanguage => knowledgeTextLanguageSchema.parse({ tag, basis: "declared" });

/** Editing a snapshot must not label new prose with the old author's language. */
export function retainedTextLanguages<T extends Record<string, unknown>, L extends Record<string, unknown>>(before: T, after: T, languages: L | undefined): L | undefined {
  if (!languages) return undefined;
  return Object.fromEntries(Object.entries(languages).filter(([field]) => JSON.stringify(before[field]) === JSON.stringify(after[field]))) as L;
}
