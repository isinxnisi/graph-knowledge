import type { KnowledgeSubmissionContent } from "./knowledge-submission";
import { declaredTextLanguage } from "./knowledge-language";

export type SubmissionLanguageField = "assertion" | "relation" | "scope" | "name" | "excerpt" | "document" | "title";

/** Language declarations describe one field, never the entire submission or UI. */
export function setSubmissionLanguage(content: KnowledgeSubmissionContent, index: number, field: SubmissionLanguageField, tag: string, id?: string): KnowledgeSubmissionContent {
  const language = tag ? declaredTextLanguage(tag) : undefined;
  if (field === "name") return { ...content, entities: content.entities.map(e => e.id === id ? { ...e, content: { ...e.content, language: tag || "und", textLanguages: { ...e.content.textLanguages, name: language } } } : e) };
  if (field === "document" || field === "title") return { ...content, sources: content.sources.map(s => s.id === id ? { ...s, content: { ...s.content, ...(field === "document" ? { language: tag || "und" } : {}), textLanguages: { ...s.content.textLanguages, [field]: language } } } : s) };
  return { ...content, items: content.items.map((item, i) => i !== index ? item : { ...item, record: field === "excerpt"
    ? { ...item.record, evidence: item.record.evidence.map(e => e.id === id ? { ...e, textLanguages: { ...e.textLanguages, excerpt: language } } : e) }
    : { ...item.record, textLanguages: { ...item.record.textLanguages, [field]: language } } }) };
}
