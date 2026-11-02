import { z } from "zod";
import { legacyDigest } from "../domain/knowledge-legacy";
import { knowledgeCommandSchema, knowledgePinSchema, knowledgeTimelineIssues, type KnowledgeCommand, type KnowledgePin } from "../domain/knowledge-foundation";
import { themeEntitySchema, themeEvidenceSchema, themeRecordInputSchema, themeConceptSchema, themeTimelineSchema } from "../domain/theme-workbench";

const oldRecord = themeRecordInputSchema.safeExtend({
  revision: z.number().int().positive(), updatedAt: z.string(), reason: z.string(),
  evidence: z.array(themeEvidenceSchema.safeExtend({ hash: z.string().optional() })).min(1),
  mapping: z.object({ revision: z.number().int().positive(), recordRevision: z.number().int().positive(), concept: themeConceptSchema.nullable(), reason: z.string(), updatedAt: z.string() }).nullable(),
});
const observedThemeSchema = z.object({
  id: z.string().min(1), title: z.string().min(1), description: z.string(), revision: z.number().int().positive(),
  entities: z.array(themeEntitySchema), records: z.array(oldRecord).min(1), timeline: themeTimelineSchema.optional(),
  createdAt: z.string(), updatedAt: z.string(), sourceHash: z.string(),
});
export const themeKnowledgeImportOptionsSchema = z.strictObject({
  namespace: z.string().min(1).max(32).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  entityBindings: z.record(z.string(), knowledgePinSchema).default({}),
  initialView: z.enum(["graph", "timeline", "split"]).default("split"),
});
export type ThemeKnowledgeImportOptions = z.input<typeof themeKnowledgeImportOptionsSchema>;
const requestId = (value: unknown) => {
  const h = legacyDigest(value);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/** Converts an observed immutable ThemeDetail into ordinary common commands.
 * This creates new objects; no old Theme, Capsule, or current object is changed.
 * Identity reuse only occurs through the caller's explicit observed bindings. */
export function prepareThemeKnowledgeImport(input: unknown, rawOptions: ThemeKnowledgeImportOptions) {
  const observed = z.json().parse(input), theme = observedThemeSchema.parse(input), options = themeKnowledgeImportOptionsSchema.parse(rawOptions);
  const observedSha256 = legacyDigest(observed), planKey = legacyDigest({ observedSha256, options });
  const prefix = `${options.namespace}:${planKey.slice(0, 16)}`;
  const allocate = (kind: string, oldId: string) => `${prefix}:${kind}:${legacyDigest(oldId).slice(0, 20)}`;
  if (new Set(theme.entities.map(e => e.id)).size !== theme.entities.length || new Set(theme.records.map(r => r.id)).size !== theme.records.length)
    throw new Error("取込元の対象・記録IDが重複しています");
  const usedEntityIds = new Set(theme.records.flatMap(r => [r.subject, r.object].filter((id): id is string => id !== null)));
  for (const id of Object.keys(options.entityBindings)) if (!usedEntityIds.has(id)) throw new Error(`使われていない対象の対応指定です: ${id}`);
  const entityIds = new Map(theme.entities.filter(e => usedEntityIds.has(e.id)).map(e => [e.id, options.entityBindings[e.id]?.id ?? allocate("entity", e.id)]));
  for (const id of usedEntityIds) if (!entityIds.has(id)) throw new Error(`取込元の対象がありません: ${id}`);
  const entities = theme.entities.filter(e => usedEntityIds.has(e.id) && !options.entityBindings[e.id]).map(e => ({ id: entityIds.get(e.id)!, content: { name: e.name, aliases: [], kind: e.kind, description: e.description, language: "und" } }));
  const entityPins: KnowledgePin[] = [];
  for (const binding of Object.values(options.entityBindings)) {
    const previous = entityPins.find(p => p.id === binding.id);
    if (previous && previous.revision !== binding.revision) throw new Error("同じ対象に異なる観測版が指定されています");
    if (!previous) entityPins.push(binding);
  }
  const sourceMap = new Map<string, { id: string; content: { title: string; url: string; bibliography: string; language: string } }>();
  const records = theme.records.map(r => ({ id: allocate("record", r.id), content: {
    kind: r.kind, subjectId: entityIds.get(r.subject)!, objectId: r.object ? entityIds.get(r.object)! : null,
    assertion: r.assertion, relation: r.relation, scope: r.scope, polarity: r.polarity,
    times: r.time ? [{ id: "original-time", time: r.time }] : [],
    evidence: r.evidence.map((e, i) => {
      // Shared source metadata only. Locator/excerpt/retrieval/hash stay with the
      // original assertion evidence, never copied as support for another claim.
      const identity = JSON.stringify([e.url, e.title]);
      if (!sourceMap.has(identity)) sourceMap.set(identity, { id: allocate("source", identity), content: { title: e.title, url: e.url, bibliography: "", language: "und" } });
      return { id: `evidence-${i + 1}`, source: { id: sourceMap.get(identity)!.id, revision: 1 }, locator: e.locator, excerpt: e.excerpt, stance: "support" as const };
    }),
  } }));
  const rawObject = z.record(z.string(), z.json()).parse(observed);
  const rawRecords = z.array(z.record(z.string(), z.json())).parse(rawObject.records);
  const rawEntities = z.array(z.record(z.string(), z.json())).parse(rawObject.entities);
  const metadata = Object.fromEntries(Object.entries(rawObject).filter(([key]) => key !== "records" && key !== "entities"));
  const origin = { kind: "theme75-observation", themeId: theme.id, themeRevision: theme.revision, observedSha256, sourceHash: theme.sourceHash };
  const legacyLinks = theme.records.map((r, i) => {
    const payload = { schemaVersion: 1, importKind: "theme75", origin, theme: metadata,
      record: rawRecords.find(raw => raw.id === r.id)!, entities: rawEntities.filter(raw => raw.id === r.subject || raw.id === r.object) };
    return { dataset: `theme75:${observedSha256}`, legacyClaimId: r.id, recordId: records[i].id, importedRevision: 1 as const, payload, sha256: legacyDigest(payload) };
  });
  const reason = `旧テーマ「${theme.title}」内容版 ${theme.revision} の観測断面を新しい共通記録へ取り込む`;
  const bundle = knowledgeCommandSchema.parse({ requestId: requestId([planKey, "bundle"]), action: "create-bundle", entities, sources: [...sourceMap.values()], records, entityPins, visibility: "public", reason, legacyLinks });
  const warnings: { recordId: string; code: string }[] = [];
  const mappings: KnowledgeCommand[] = [];
  for (const r of theme.records) {
    if (!r.mapping?.concept) continue;
    if (r.mapping.recordRevision !== r.revision) { warnings.push({ recordId: r.id, code: "stale-mapping-preserved-in-origin-only" }); continue; }
    mappings.push(knowledgeCommandSchema.parse({ requestId: requestId([planKey, "mapping", r.id]), action: "set-mapping", recordId: allocate("record", r.id), expectedMappingRevision: 0, recordRevision: 1,
      concept: { ...r.mapping.concept, id: allocate("concept", legacyDigest(r.mapping.concept)), revision: 1 }, reason: `観測版に対応する意味付けを引継ぎ: ${r.mapping.reason}` }));
  }
  const timeline = theme.timeline ? { ...theme.timeline,
    placements: theme.timeline.placements.map(p => ({ recordId: allocate("record", p.recordId), timeId: "original-time", axisId: p.axisId })),
    insets: theme.timeline.insets.map(i => ({ ...i, parentRecordId: allocate("record", i.parentRecordId) })),
  } : undefined;
  const timelineErrors = knowledgeTimelineIssues(records.map(r => ({ ...r, revision: 1, createdAt: "", reason })), timeline);
  if (timelineErrors.length) throw new Error(timelineErrors.join(" / "));
  const themeId = `${prefix}:theme`;
  const createTheme = knowledgeCommandSchema.parse({ requestId: requestId([planKey, "theme"]), action: "create-theme", id: themeId, title: theme.title, description: theme.description,
    recordPins: records.map(r => ({ id: r.id, revision: 1 })), entityPins: [...entityPins, ...entities.map(e => ({ id: e.id, revision: 1 }))], sourcePins: [...sourceMap.values()].map(s => ({ id: s.id, revision: 1 })), ...(timeline ? { timeline } : {}),
    initialView: records.some(r => r.content.times.length > 0) ? options.initialView : "graph", reason });
  return { schemaVersion: 1 as const, origin, options, observed, themeId,
    counts: { entitiesCreated: entities.length, entitiesReused: entityPins.length, sources: sourceMap.size, records: records.length, mappings: mappings.length },
    entityBindings: Object.fromEntries(theme.entities.filter(e => usedEntityIds.has(e.id)).map(e => [e.id, { id: entityIds.get(e.id)!, revision: options.entityBindings[e.id]?.revision ?? 1 }])),
    commands: [bundle, ...mappings, createTheme], warnings,
  };
}
