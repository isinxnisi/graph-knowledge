import { z } from "zod";
import { claimDetailSchema, claimSummarySchema, entityDetailSchema, entitySummarySchema } from "./api";

// A Capsule is its own document. References identify the KG record; snapshots
// describe only what this document actually observed, never an entire KG history.
export const CAPSULE_DOCUMENT_LIMITS = { nodes: 200, relations: 400, texts: 100, evidence: 1000, bytes: 2_000_000 } as const;
const key = z.uuidv4();
const point = z.strictObject({ x: z.number().finite().min(-1_000_000).max(1_000_000), y: z.number().finite().min(-1_000_000).max(1_000_000) });
export const capsuleLayoutSchema = z.strictObject({
  positions: z.record(key, point), pan: point, zoom: z.number().min(0.15).max(2),
  // A graph-space center survives a different display size. pan is retained for
  // older readers; it is not the authority when center is available.
  center: point.optional(),
  viewport: z.strictObject({ width: z.number().positive().max(100_000), height: z.number().positive().max(100_000) }).optional(),
});
const observation = z.strictObject({ capturedAt: z.iso.datetime(), revision: z.string().max(200).nullable() });
const neighborhood = z.strictObject({
  state: z.enum(["unknown", "partial", "complete"]),
  capturedAt: z.iso.datetime().optional(), revision: z.string().max(200).nullable().optional(),
  // Complete means complete for this stated query, not for every relation in KG.
  scope: z.string().max(4000), claimIds: z.array(key).max(800),
});
export const capsuleNodeSchema = z.strictObject({
  key, title: z.string().trim().min(1).max(200), description: z.string().max(8000), badge: z.string().max(60),
  origin: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("local") }),
    z.strictObject({ kind: z.literal("kg"), id: key, ...observation.shape, snapshot: entitySummarySchema,
      detail: entityDetailSchema.nullable(), neighbors: neighborhood }),
    // Old readers may have an unresolved reference. Preserve identity without
    // fabricating the old name, description, or a historical snapshot.
    z.strictObject({ kind: z.literal("unresolved"), id: key }),
  ]),
});
export const capsuleRelationSchema = z.strictObject({
  key, source: key, target: key, label: z.string().max(200), note: z.string().max(8000),
  origin: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("local") }),
    z.strictObject({ kind: z.literal("kg"), id: key, ...observation.shape, snapshot: claimSummarySchema,
      detail: claimDetailSchema.nullable() }),
  ]),
});
export const capsuleTextSchema = z.strictObject({
  key, text: z.string().min(1).max(4000), style: z.enum(["note", "heading", "muted"]),
  width: z.number().min(96).max(800).optional(), fontSize: z.number().min(12).max(48).optional(),
  fontWeight: z.enum(["normal", "bold"]).optional(), align: z.enum(["left", "center", "right"]).optional(),
});
export const capsuleEvidenceSchema = z.strictObject({
  key, targetKey: key, supports: z.enum(["identity", "name", "description", "relation"]),
  title: z.string().trim().min(1).max(300), url: z.url({ protocol: /^https?$/ }).max(2000).nullable(),
  locator: z.string().max(1000), note: z.string().max(4000), stance: z.enum(["support", "refute", "background"]),
});
export const capsuleDocumentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  nodes: z.array(capsuleNodeSchema).max(CAPSULE_DOCUMENT_LIMITS.nodes),
  relations: z.array(capsuleRelationSchema).max(CAPSULE_DOCUMENT_LIMITS.relations),
  texts: z.array(capsuleTextSchema).max(CAPSULE_DOCUMENT_LIMITS.texts),
  evidence: z.array(capsuleEvidenceSchema).max(CAPSULE_DOCUMENT_LIMITS.evidence),
  // Old claims whose endpoints could not be obtained stay explicit references.
  unresolvedClaimIds: z.array(key).max(CAPSULE_DOCUMENT_LIMITS.relations),
  layout: capsuleLayoutSchema,
}).superRefine((document, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  const nodes = new Map(document.nodes.map(n => [n.key, n]));
  const all = [...document.nodes, ...document.relations, ...document.texts, ...document.evidence].map(n => n.key);
  if (new Set(all).size !== all.length) issue("Element keys must be unique");
  const globalNodes = document.nodes.filter(n => n.origin.kind !== "local").map(n => n.origin.kind !== "local" ? n.origin.id : "");
  const globalClaims = [...document.relations.flatMap(r => r.origin.kind === "kg" ? [r.origin.id] : []), ...document.unresolvedClaimIds];
  if (new Set(globalNodes).size !== globalNodes.length || new Set(globalClaims).size !== globalClaims.length) issue("Duplicate KG reference");
  for (const n of document.nodes) if (n.origin.kind === "kg" && (n.origin.id !== n.origin.snapshot.id || n.origin.detail && n.origin.detail.id !== n.origin.id)) issue("Entity snapshot identity mismatch");
  for (const r of document.relations) {
    const source = nodes.get(r.source), target = nodes.get(r.target);
    if (!source || !target) issue("Missing relation endpoint");
    if (r.origin.kind === "kg") {
      const o = r.origin;
      if (o.id !== o.snapshot.id || o.detail && o.detail.id !== o.id || source?.origin.kind === "local" || target?.origin.kind === "local"
        || source?.origin.id !== o.snapshot.subjectId || target?.origin.id !== o.snapshot.objectId) issue("Claim snapshot identity mismatch");
      if (o.detail && JSON.stringify(claimSummarySchema.parse(Object.fromEntries(Object.keys(claimSummarySchema.shape).map(k => [k, o.detail![k as keyof typeof o.detail]])))) !== JSON.stringify(o.snapshot)) issue("Claim summary and detail disagree");
    }
  }
  const targets = new Set([...document.nodes, ...document.relations].map(n => n.key));
  for (const e of document.evidence) {
    if (!targets.has(e.targetKey)) issue("Missing evidence target");
    if (nodes.has(e.targetKey) === (e.supports === "relation")) issue("Evidence support must match its target");
  }
  const positioned = new Set([...document.nodes, ...document.texts].map(n => n.key));
  if (Object.keys(document.layout.positions).some(id => !positioned.has(id))) issue("Unknown layout element");
});
export type CapsuleDocument = z.infer<typeof capsuleDocumentSchema>;
export type CapsuleNode = z.infer<typeof capsuleNodeSchema>;
export type CapsuleRelation = z.infer<typeof capsuleRelationSchema>;
export type CapsuleEvidence = z.infer<typeof capsuleEvidenceSchema>;
export type CapsuleText = z.infer<typeof capsuleTextSchema>;
export function capsuleReferences(document: CapsuleDocument) {
  return {
    entityIds: document.nodes.flatMap(n => n.origin.kind === "local" ? [] : [n.origin.id]),
    claimIds: [...document.relations.flatMap(r => r.origin.kind === "kg" ? [r.origin.id] : []), ...document.unresolvedClaimIds],
  };
}
export function referencesMatchDocument(value: { entityIds: string[]; claimIds: string[]; document?: CapsuleDocument }) {
  if (!value.document) return value.entityIds.length > 0;
  const refs = capsuleReferences(value.document);
  return (["entityIds", "claimIds"] as const).every(k => refs[k].length === value[k].length && refs[k].every(id => value[k].includes(id)));
}
