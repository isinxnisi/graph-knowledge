import {knowledgeIdSchema,knowledgeRevisionSchema,knowledgePinSchema} from "./knowledge-ids";
import {translationCommandShape} from "./knowledge-translation";
import { z } from "zod";
import { themeTimeSchema } from "./theme-workbench";
import { themeTimelineIssues } from "./theme-timeline";
import { knowledgeTimelineLayout, knowledgeTimelineRows } from "./knowledge-timeline";
import { knowledgeTextLanguageSchema as originalLanguage } from "./knowledge-language";

// A common record is independent of any editorial Theme. IDs never derive from
// display names; a pin identifies one immutable content revision.
export {knowledgeIdSchema,knowledgeRevisionSchema,knowledgePinSchema} from "./knowledge-ids";
export type KnowledgePin = z.infer<typeof knowledgePinSchema>;
const text = z.string().trim().min(1);
export const knowledgeEntityContentSchema = z.strictObject({
  name: text.max(200), aliases: z.array(text.max(200)).max(30).default([]),
  kind: text.max(80), description: z.string().max(8000).default(""),
  language: text.max(35).default("und"),
  textLanguages: z.strictObject({ name: originalLanguage.optional(), description: originalLanguage.optional(), aliases: z.array(originalLanguage.nullable()).max(30).optional() }).optional(),
}).refine(e => !e.textLanguages?.aliases || e.textLanguages.aliases.length === e.aliases.length, "別名と言語指定の数が一致しません");
export const knowledgeSourceContentSchema = z.strictObject({
  title: text.max(300), url: z.url({ protocol: /^https?$/ }).max(2000).nullable().default(null),
  bibliography: z.string().trim().max(4000).default(""), language: text.max(35).default("und"),
  textLanguages: z.strictObject({ title: originalLanguage.optional(), bibliography: originalLanguage.optional(), document: originalLanguage.optional() }).optional(),
}).refine(s => Boolean(s.url || s.bibliography), "資料URLまたは書誌を記入してください");
export const knowledgeEvidenceSchema = z.strictObject({
  id: knowledgeIdSchema, source: knowledgePinSchema,
  locator: text.max(1000), excerpt: z.string().max(4000).default(""),
  textLanguages: z.strictObject({ locator: originalLanguage.optional(), excerpt: originalLanguage.optional() }).optional(),
  stance: z.enum(["support", "refute", "background"]).default("support"),
});
export const knowledgeTimeAnnotationSchema = z.strictObject({ id: knowledgeIdSchema, time: themeTimeSchema });
export const knowledgeRecordContentSchema = z.strictObject({
  kind: z.enum(["relation", "episode", "note"]),
  aboutRecord: knowledgePinSchema.optional(), aboutTheme: knowledgeIdSchema.optional(),
  legacySemantics: z.strictObject({recordRevision:knowledgeRevisionSchema,sha256:z.string().regex(/^[a-f0-9]{64}$/)}).optional(),
  subjectId: knowledgeIdSchema.nullable().default(null), objectId: knowledgeIdSchema.nullable().default(null),
  assertion: text.max(4000), relation: z.string().trim().max(200).default(""),
  polarity: z.enum(["affirmed", "denied", "uncertain"]).default("affirmed"),
  scope: z.string().max(3000).default(""),
  textLanguages: z.strictObject({ assertion: originalLanguage.optional(), relation: originalLanguage.optional(), scope: originalLanguage.optional() }).optional(),
  times: z.array(knowledgeTimeAnnotationSchema).max(16).default([]),
  evidence: z.array(knowledgeEvidenceSchema).min(1).max(20),
}).superRefine((r, c) => {
  if (r.kind === "relation" && (!r.subjectId || !r.objectId || !r.relation))
    c.addIssue({ code: "custom", message: "関係には両端の対象と具体的な関係名が必要です" });
  if (new Set(r.times.map(t => t.id)).size !== r.times.length || new Set(r.evidence.map(e => e.id)).size !== r.evidence.length)
    c.addIssue({ code: "custom", message: "時間注釈・根拠のIDが重複しています" });
});
export const knowledgeConceptSchema = z.strictObject({ id: knowledgeIdSchema, revision: knowledgeRevisionSchema, label: text.max(200), definition: text.max(4000) });
export const knowledgeMappingContentSchema = z.strictObject({ recordRevision: knowledgeRevisionSchema, concept: knowledgeConceptSchema.nullable() });
export const knowledgeTimelineSchema = z.strictObject({
  version: z.literal(1),
  axes: z.array(z.strictObject({ id: knowledgeIdSchema, kind: z.enum(["calendar", "cycle", "qualitative"]), label: text.max(200), order: z.array(text.max(200)).max(400).optional(), originLabel: z.string().max(1000).optional() })).max(32),
  placements: z.array(z.strictObject({ recordId: knowledgeIdSchema, timeId: knowledgeIdSchema, axisId: knowledgeIdSchema })).max(400),
  insets: z.array(z.strictObject({ parentRecordId: knowledgeIdSchema, axisId: knowledgeIdSchema, label: text.max(200) })).max(32).default([]),
});
export const knowledgeThemeContentSchema = z.strictObject({
  title: text.max(200), description: z.string().max(8000).default(""),
  textLanguages: z.strictObject({ title: originalLanguage.optional(), description: originalLanguage.optional() }).optional(),
  recordPins: z.array(knowledgePinSchema).min(1).max(400), entityPins: z.array(knowledgePinSchema).max(400),
  sourcePins: z.array(knowledgePinSchema).max(800), mappingPins: z.array(knowledgePinSchema).max(400).default([]),
  timeline: knowledgeTimelineSchema.optional(), initialView: z.enum(["graph", "timeline", "split"]).default("graph"),
});
export type KnowledgeEntityContent = z.infer<typeof knowledgeEntityContentSchema>;
export type KnowledgeSourceContent = z.infer<typeof knowledgeSourceContentSchema>;
export type KnowledgeRecordContent = z.infer<typeof knowledgeRecordContentSchema>;
export type KnowledgeMappingContent = z.infer<typeof knowledgeMappingContentSchema>;
export type KnowledgeThemeContent = z.infer<typeof knowledgeThemeContentSchema>;
export type KnowledgeTimeline = z.infer<typeof knowledgeTimelineSchema>;
export type KnowledgeKind = "entity" | "source" | "record" | "theme" | "mapping";
export type KnowledgeVersion<T> = { id: string; revision: number; content: T; createdAt: string; reason: string };
export type KnowledgeEntityVersion = KnowledgeVersion<KnowledgeEntityContent>;
export type KnowledgeSourceVersion = KnowledgeVersion<KnowledgeSourceContent>;
export type KnowledgeRecordVersion = KnowledgeVersion<KnowledgeRecordContent>;
export type KnowledgeMappingVersion = KnowledgeVersion<KnowledgeMappingContent>;
export type KnowledgeThemeVersion = KnowledgeVersion<KnowledgeThemeContent>;
export type KnowledgeContentByKind = { entity: KnowledgeEntityContent; source: KnowledgeSourceContent; record: KnowledgeRecordContent; theme: KnowledgeThemeContent; mapping: KnowledgeMappingContent };
export type KnowledgeStatus = { kind: KnowledgeKind; id: string; revision: number; visibility: "private" | "public" | "hidden"; confirmation: "unreviewed" | "checked" | "disputed" };
export type KnowledgeActor = { kind: "operator" | "collector" | "collection" | "import" | "submission" | "user" | "reader"; id: string };
export type KnowledgeList = { entities: KnowledgeEntityVersion[]; sources: KnowledgeSourceVersion[]; records: KnowledgeRecordVersion[]; themes: KnowledgeThemeVersion[]; statuses: KnowledgeStatus[] };
export type KnowledgeSnapshot = { translations?:import("./knowledge-translation").KnowledgeTranslationVersion[]; schemaVersion: 1; entities: KnowledgeEntityVersion[]; sources: KnowledgeSourceVersion[]; records: KnowledgeRecordVersion[]; mappings: KnowledgeMappingVersion[]; timeline?: KnowledgeTimeline; initialView: "graph" | "timeline" | "split" };
export type KnowledgeThemeResolved = { theme: KnowledgeThemeVersion; snapshot: KnowledgeSnapshot };
export type KnowledgeChange = { kind: KnowledgeKind; id: string; beforeRevision: number | null; afterRevision: number | null; before: unknown; after: unknown; requiresRecordCorrection?: boolean };
export type KnowledgeThemeDiff = { themeId: string; revision: number; refreshToken: string; changes: KnowledgeChange[]; unavailable: { kind: KnowledgeKind; id: string }[] };

const reason = text.max(4000);
const base = { requestId: z.uuidv4() };
const entityNew = z.strictObject({ id: knowledgeIdSchema, content: knowledgeEntityContentSchema });
const sourceNew = z.strictObject({ id: knowledgeIdSchema, content: knowledgeSourceContentSchema });
const recordNew = z.strictObject({ id: knowledgeIdSchema, content: knowledgeRecordContentSchema });
export const knowledgeCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({...base,...translationCommandShape,reason}),
  z.strictObject({...base,action:z.literal("set-translation-visibility"),id:knowledgeIdSchema,expectedStatusRevision:knowledgeRevisionSchema,visibility:z.enum(["public","hidden"]),reason}),
  z.strictObject({...base,action:z.literal("accept-record"),entities:z.array(entityNew).max(40),sources:z.array(sourceNew).max(40),entityPins:z.array(knowledgePinSchema).max(40),sourcePins:z.array(knowledgePinSchema).max(40),record:recordNew,expectedRevision:knowledgeRevisionSchema.optional(),themes:z.array(knowledgePinSchema).max(8).optional(),preserveLegacySemantics:z.boolean().optional(),legacyEntities:z.array(z.strictObject({id:knowledgeIdSchema,content:knowledgeEntityContentSchema,revision:z.string(),payload:z.unknown(),sha256:z.string().regex(/^[a-f0-9]{64}$/)})).max(40).optional(),legacySources:z.array(z.strictObject({id:knowledgeIdSchema,content:knowledgeSourceContentSchema})).max(80).optional(),legacyRecords:z.array(z.strictObject({id:knowledgeIdSchema,content:knowledgeRecordContentSchema,revision:z.string(),payload:z.unknown(),sha256:z.string().regex(/^[a-f0-9]{64}$/)})).max(20).optional(),reason}),
  z.strictObject({ ...base, action: z.literal("create-bundle"), entities: z.array(entityNew).max(200).default([]), sources: z.array(sourceNew).max(400).default([]), records: z.array(recordNew).min(1).max(400), entityPins: z.array(knowledgePinSchema).max(400).default([]), visibility: z.enum(["private", "public"]).default("public"), reason,
    legacyLinks: z.array(z.strictObject({ dataset: text.max(100), legacyClaimId: knowledgeIdSchema, recordId: knowledgeIdSchema, importedRevision: z.literal(1), payload: z.json(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })).max(400).default([]),
  }),
  z.strictObject({ ...base, action: z.literal("correct"), kind: z.enum(["entity", "source", "record"]), id: knowledgeIdSchema, expectedRevision: knowledgeRevisionSchema, content: z.unknown(), entityPins: z.array(knowledgePinSchema).max(400).optional(), reason }),
  z.strictObject({ ...base, action: z.literal("create-theme"), id: knowledgeIdSchema, title: text.max(200), description: z.string().max(8000).default(""), textLanguages: knowledgeThemeContentSchema.shape.textLanguages, recordPins: z.array(knowledgePinSchema).min(1).max(400), entityPins: z.array(knowledgePinSchema).max(400).optional(), sourcePins: z.array(knowledgePinSchema).max(800).optional(), timeline: knowledgeTimelineSchema.optional(), initialView: z.enum(["graph", "timeline", "split"]).default("graph"), reason: reason.default("テーマへ記録を選択") }),
  z.strictObject({ ...base, action: z.literal("refresh-theme"), id: knowledgeIdSchema, expectedRevision: knowledgeRevisionSchema, refreshToken: z.string().regex(/^[a-f0-9]{64}$/), recordPins: z.array(knowledgePinSchema).min(1).max(400).optional(), entityPins: z.array(knowledgePinSchema).max(400).optional(), sourcePins: z.array(knowledgePinSchema).max(800).optional(), reason }),
  z.strictObject({ ...base, action: z.literal("set-visibility"), kind: z.enum(["entity", "source", "record", "theme"]), id: knowledgeIdSchema, expectedStatusRevision: knowledgeRevisionSchema, visibility: z.enum(["private", "public", "hidden"]), reason }),
  z.strictObject({ ...base, action: z.literal("set-confirmation"), kind: z.enum(["entity", "source", "record"]), id: knowledgeIdSchema, expectedStatusRevision: knowledgeRevisionSchema, expectedContentRevision: knowledgeRevisionSchema, confirmation: z.enum(["unreviewed", "checked", "disputed"]), reason }),
  z.strictObject({ ...base, action: z.literal("set-mappings"), entries: z.array(z.strictObject({ recordId: knowledgeIdSchema, recordRevision: knowledgeRevisionSchema, expectedMappingRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1) })).min(1).max(50), concept: knowledgeConceptSchema.nullable(), reason }),
  z.strictObject({ ...base, action: z.literal("set-mapping"), recordId: knowledgeIdSchema, expectedMappingRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1), recordRevision: knowledgeRevisionSchema, concept: knowledgeConceptSchema.nullable(), reason }),
]);
export type KnowledgeCommand = z.infer<typeof knowledgeCommandSchema>;

export function knowledgeRecordSearchText(record: KnowledgeRecordVersion, entities: KnowledgeEntityVersion[]) {
  return [record.content.assertion, record.content.relation, record.content.scope,
    ...entities.filter(e => e.id === record.content.subjectId || e.id === record.content.objectId).flatMap(e => [e.content.name, ...e.content.aliases]),
    ...record.content.evidence.map(e => e.excerpt)].join(" ").normalize("NFKC").toLocaleLowerCase();
}

export function knowledgeTimelineIssues(records: KnowledgeRecordVersion[], timeline?: KnowledgeTimeline): string[] {
  if (!timeline) return [];
  const issues: string[] = [];
  const byRecord = new Map(records.map(r => [r.id, r]));
  const seen = new Set<string>();
  for (const p of timeline.placements) {
    if (!byRecord.get(p.recordId)?.content.times.some(t => t.id === p.timeId))
      issues.push("時間注釈の参照がありません");
    const key = JSON.stringify([p.recordId, p.timeId]);
    if (seen.has(key)) issues.push("同じ時間注釈の配置が重複しています");
    seen.add(key);
  }
  // Reuse the established axis semantics and explicit nesting contracts after
  // separating factual Record identity from each time annotation's drawing row.
  issues.push(...themeTimelineIssues(knowledgeTimelineRows(records), knowledgeTimelineLayout(records, timeline)).map(i => i.message));
  return [...new Set(issues)];
}
