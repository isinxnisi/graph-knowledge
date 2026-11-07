import { z } from "zod";
import { knowledgeIdSchema, knowledgePinSchema, knowledgeRecordContentSchema, type KnowledgeRecordVersion } from "../domain/knowledge-foundation";
import { retainedTextLanguages } from "../domain/knowledge-language";

export const knowledgeInputDraftKey = "plunode:knowledge75:operator-input:v1";
const fields = ["subjectName", "subjectKind", "objectName", "objectKind", "relation", "assertion", "polarity", "scope", "from", "to", "sourceTitle", "sourceUrl", "bibliography", "locator", "excerpt", "reason"] as const;
export type KnowledgeInputField = typeof fields[number];
const valuesSchema = z.record(z.enum(fields), z.string().max(8000));
const choiceSchema = knowledgePinSchema.extend({ label: z.string().max(300) });
const shared = { version: z.literal(1), values: valuesSchema, times: z.array(z.strictObject({id:knowledgeIdSchema,time:z.discriminatedUnion("kind",[
 z.strictObject({kind:z.literal("calendar"),from:z.string().max(32),to:z.string().max(32).optional(),meaning:z.enum(["point","duration","occurrence-window"]).optional(),startLatest:z.string().max(32).optional(),endEarliest:z.string().max(32).optional(),label:z.string().max(300),expression:z.string().max(300).optional()}),
 z.strictObject({kind:z.literal("cycle"),axis:z.string().max(300),period:z.number(),from:z.number(),to:z.number(),wrap:z.boolean(),unit:z.string().max(300),label:z.string().max(300)}),
 z.strictObject({kind:z.literal("qualitative"),axis:z.string().max(300),from:z.string().max(300),to:z.string().max(300).optional(),coordinateMeaning:z.string().max(300),label:z.string().max(300)})
 ])})).max(16).optional(), submission: z.strictObject({ fingerprint: z.string().max(100000), requestId: z.uuidv4() }).nullable() };
export const knowledgeInputDraftSchema = z.discriminatedUnion("mode", [
  z.strictObject({ ...shared, mode: z.literal("create"), ids: z.strictObject({ record: knowledgeIdSchema, subject: knowledgeIdSchema, object: knowledgeIdSchema, source: knowledgeIdSchema }), kind: z.enum(["relation", "episode", "note"]), subject: choiceSchema.nullable(), object: choiceSchema.nullable(), source: choiceSchema.nullable() }),
  z.strictObject({ ...shared, mode: z.literal("correct"), base: z.strictObject({ id: knowledgeIdSchema, revision: z.number().int().positive(), content: knowledgeRecordContentSchema }) }),
]);
export type KnowledgeInputDraft = z.infer<typeof knowledgeInputDraftSchema>;
export type KnowledgeInputChoice = z.infer<typeof choiceSchema>;
const emptyValues = () => Object.fromEntries(fields.map(field => [field, field === "polarity" ? "affirmed" : ""])) as Record<KnowledgeInputField, string>;
export function newKnowledgeInputDraft(): KnowledgeInputDraft {
  return { version: 1, mode: "create", ids: { record: crypto.randomUUID(), subject: crypto.randomUUID(), object: crypto.randomUUID(), source: crypto.randomUUID() }, kind: "relation", subject: null, object: null, source: null, values: emptyValues(), submission: null };
}
export function correctionKnowledgeInputDraft(record: KnowledgeRecordVersion): KnowledgeInputDraft {
  return { version: 1, mode: "correct", base: { id: record.id, revision: record.revision, content: record.content }, times: structuredClone(record.content.times), values: { ...emptyValues(), relation: record.content.relation, assertion: record.content.assertion }, submission: null };
}
export function readKnowledgeInputDraft(storage: Pick<Storage, "getItem">): KnowledgeInputDraft | null {
  try { const raw = storage.getItem(knowledgeInputDraftKey); if (!raw || raw.length > 150000) return null; const parsed = knowledgeInputDraftSchema.safeParse(JSON.parse(raw)); return parsed.success ? parsed.data : null; } catch { return null; }
}
export function writeKnowledgeInputDraft(storage: Pick<Storage, "setItem" | "removeItem">, draft: KnowledgeInputDraft | null): boolean {
  try { if (draft) storage.setItem(knowledgeInputDraftKey, JSON.stringify(knowledgeInputDraftSchema.parse(draft))); else storage.removeItem(knowledgeInputDraftKey); return true; } catch { return false; }
}
export function knowledgeInputCommand(draft: KnowledgeInputDraft): Record<string, unknown> {
  const v = (field: KnowledgeInputField) => draft.values[field].trim();
  if (draft.mode === "correct") {
    const content = { ...draft.base.content, ...(draft.times?{times:draft.times}:{}), assertion: v("assertion"), relation: draft.base.content.kind === "relation" ? v("relation") : draft.base.content.relation };
    content.textLanguages = retainedTextLanguages(draft.base.content, content, draft.base.content.textLanguages);
    return { action: "correct", kind: "record", id: draft.base.id, expectedRevision: draft.base.revision, content, reason: v("reason") };
  }
  const entities: { id: string; content: { name: string; aliases: string[]; kind: string; description: string; language: string } }[] = [];
  const entityPins: { id: string; revision: number }[] = [];
  const endpoint = (side: "subject" | "object") => {
    const chosen = draft[side];
    if (chosen) { entityPins.push({ id: chosen.id, revision: chosen.revision }); return chosen.id; }
    const name = v(side === "subject" ? "subjectName" : "objectName"); if (!name) return null;
    entities.push({ id: draft.ids[side], content: { name, aliases: [], kind: v(side === "subject" ? "subjectKind" : "objectKind") || "person", description: "", language: "ja" } }); return draft.ids[side];
  };
  const subjectId = endpoint("subject"), objectId = draft.kind === "relation" ? endpoint("object") : null;
  const content = { kind: draft.kind, subjectId, objectId, assertion: v("assertion"), relation: draft.kind === "relation" ? v("relation") : "", polarity: v("polarity"), scope: v("scope"), times: draft.times ?? (v("from") ? [{ id: "time-1", time: { kind: "calendar", from: v("from"), ...(v("to") ? { to: v("to"), meaning: "duration" } : { meaning: "point" }), label: "" } }] : []), evidence: [{ id: "evidence-1", source: { id: draft.source?.id ?? draft.ids.source, revision: draft.source?.revision ?? 1 }, locator: v("locator"), excerpt: v("excerpt"), stance: "support" }] };
  return { action: "create-bundle", entities, entityPins: [...new Map(entityPins.map(pin => [pin.id, pin])).values()], sources: draft.source ? [] : [{ id: draft.ids.source, content: { title: v("sourceTitle"), url: v("sourceUrl") || null, bibliography: v("bibliography"), language: "ja" } }], records: [{ id: draft.ids.record, content }], reason: "画面から根拠付き記録を登録" };
}
export function prepareKnowledgeInputSubmission(draft: KnowledgeInputDraft) {
  const command = knowledgeInputCommand(draft), fingerprint = JSON.stringify(command, (_key, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value);
  const requestId = draft.submission?.fingerprint === fingerprint ? draft.submission.requestId : crypto.randomUUID();
  return { draft: { ...draft, submission: { fingerprint, requestId } } as KnowledgeInputDraft, command: { ...command, requestId } };
}
