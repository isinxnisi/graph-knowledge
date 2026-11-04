import { expect, it } from "vitest";
import { knowledgeLanguageTagSchema, declaredTextLanguage, retainedTextLanguages } from "../lib/domain/knowledge-language";
import { knowledgeEntityContentSchema, knowledgeSourceContentSchema, knowledgeRecordContentSchema, knowledgeThemeContentSchema, type KnowledgeSnapshot } from "../lib/domain/knowledge-foundation";
import { knowledgeSubmissionContentSchema } from "../lib/domain/knowledge-submission";
import { setSubmissionLanguage } from "../lib/domain/knowledge-submission-languages";
import { captureKnowledgeCapsule, capsuleKnowledgeProjection } from "../lib/client/capsule-knowledge";
import { capsuleKnowledgeSchema } from "../lib/domain/capsule-knowledge";

const ja = declaredTextLanguage("ja"), en = declaredTextLanguage("en");
const record = () => knowledgeRecordContentSchema.parse({ kind: "relation", subjectId: "a", objectId: "b", relation: "描いた", assertion: "AはBを描いた。", textLanguages: { assertion: ja, relation: ja }, evidence: [{ id: "q", source: { id: "s", revision: 1 }, locator: "Credit", excerpt: "Written by A", textLanguages: { excerpt: en } }] });
const form = () => knowledgeSubmissionContentSchema.parse({ title: "Draft", entities: [{ id: "a", content: { name: "A", kind: "person" } }], sources: [{ id: "s", content: { title: "原題", url: "https://example.test/source" } }], items: [{ key: "item", operation: "correct-record", record: record() }] });

it("accepts language tags without restricting authors to their UI language", () => {
  for (const tag of ["ja", "en", "en-GB", "zh-Hant", "und", "mul"]) expect(knowledgeLanguageTagSchema.safeParse(tag).success).toBe(true);
  for (const tag of ["", "English text", "ja<script>", "x".repeat(40)]) expect(knowledgeLanguageTagSchema.safeParse(tag).success).toBe(false);
});
it("keeps old declarations absent and newly unspecified entity/source language unknown", () => {
  expect(knowledgeEntityContentSchema.parse({ name: "A", kind: "person" }).language).toBe("und");
  expect(knowledgeSourceContentSchema.parse({ title: "Source", url: "https://example.test" }).language).toBe("und");
  const historical = knowledgeEntityContentSchema.parse({ name: "A", kind: "person", language: "ja" });
  expect(historical.language).toBe("ja"); expect(historical).not.toHaveProperty("textLanguages");
});
it("keeps statement, arrow, entity, source document, title and quotation languages independent", () => {
  let draft = setSubmissionLanguage(form(), 0, "assertion", "en");
  draft = setSubmissionLanguage(draft, 0, "name", "ja", "a");
  draft = setSubmissionLanguage(draft, 0, "document", "en", "s");
  draft = setSubmissionLanguage(draft, 0, "title", "ja", "s");
  expect(draft.items[0].record.textLanguages).toEqual({ assertion: en, relation: ja });
  expect(draft.items[0].record.evidence[0].textLanguages).toEqual({ excerpt: en });
  expect(draft.entities[0].content.textLanguages).toEqual({ name: ja });
  expect(draft.sources[0].content).toMatchObject({ language: "en", textLanguages: { document: en, title: ja } });
  const roundtrip = knowledgeSubmissionContentSchema.parse(JSON.parse(JSON.stringify(draft)));
  expect(roundtrip).toEqual(draft);
  const unspecified = setSubmissionLanguage(draft, 0, "assertion", "");
  expect(unspecified.items[0].record.textLanguages?.assertion).toBeUndefined();
  expect(unspecified.items[0].record.textLanguages?.relation).toEqual(ja);
});
it("retains language per immutable field rather than carrying it onto edited snapshot prose", () => {
  expect(retainedTextLanguages({ assertion: "旧文", relation: "描いた" }, { assertion: "New prose", relation: "描いた" }, { assertion: ja, relation: ja })).toEqual({ relation: ja });
  expect(retainedTextLanguages({ assertion: "Old" }, { assertion: "Old" }, undefined)).toBeUndefined();
});
it("pins original languages through Capsule serialization and clears only edited field declarations", () => {
  const version = <T>(id: string, content: T) => ({ id, revision: 1, createdAt: "2026-11-05T00:00:00Z", reason: "Original", content });
  const snapshot: KnowledgeSnapshot = { schemaVersion: 1, entities: [version("a", knowledgeEntityContentSchema.parse({ name: "A", kind: "person", language: "ja", textLanguages: { name: ja } })), version("b", knowledgeEntityContentSchema.parse({ name: "B", kind: "work" }))], sources: [version("s", knowledgeSourceContentSchema.parse({ title: "Source", url: "https://example.test", language: "en", textLanguages: { document: en } }))], records: [version("r", record())], mappings: [], initialView: "graph" };
  const local = captureKnowledgeCapsule({ snapshot, title: "Original languages" });
  const document = local.document!;
  expect(capsuleKnowledgeSchema.parse(JSON.parse(JSON.stringify(document.knowledge))).snapshot).toEqual(snapshot);
  document.relations[0].note = "A drew B.";
  const projection = capsuleKnowledgeProjection(document)!;
  expect(projection.records[0].content.textLanguages).toEqual({ relation: ja });
  expect(projection.records[0].content.evidence[0].textLanguages?.excerpt).toEqual(en);
  expect(document.knowledge!.snapshot.records[0].content.assertion).toBe("AはBを描いた。");
  expect(document.knowledge!.snapshot.records[0].content.textLanguages?.assertion).toEqual(ja);
});
it("retains independent theme title/description languages without translating theme identity", () => {
  const theme = knowledgeThemeContentSchema.parse({ title: "Theme", description: "日本語の解説", recordPins: [{ id: "r", revision: 1 }], entityPins: [], sourcePins: [], textLanguages: { title: en, description: ja } });
  expect(theme.textLanguages).toEqual({ title: en, description: ja });
  expect(theme.recordPins).toEqual([{ id: "r", revision: 1 }]);
});

it("keeps language positions aligned with aliases in one immutable revision",()=>{
 expect(knowledgeEntityContentSchema.parse({name:"A",kind:"person",aliases:["別名"],textLanguages:{aliases:[ja]}}).textLanguages?.aliases).toEqual([ja]);
 expect(knowledgeEntityContentSchema.safeParse({name:"A",kind:"person",aliases:[],textLanguages:{aliases:[ja]}}).success).toBe(false);
});
