import { z } from "zod";
import { DATASET_MODES, type DatasetMode } from "../domain/dataset";
import { claimDetailSchema, entityDetailSchema, type ClaimDetail, type EntityDetail } from "../domain/api";
import { ClientApiError, fetchClaim, fetchEntity } from "./api";
import { emptyGraph, type GraphState } from "./graph-state";

export const CAPSULE_LIMITS = { count: 10, entities: 30, claims: 60, title: 80, note: 4000, bytes: 300_000 } as const;
const ids = (limit: number) => z.array(z.uuidv4()).max(limit).refine(values => new Set(values).size === values.length);
export const capsuleSchema = z.strictObject({
  id: z.uuidv4(), dataset: z.enum(DATASET_MODES), revision: z.literal(1),
  title: z.string().trim().min(1).max(CAPSULE_LIMITS.title),
  note: z.string().max(CAPSULE_LIMITS.note), language: z.literal("ja"), createdAt: z.iso.datetime(),
  entityIds: ids(CAPSULE_LIMITS.entities).refine(values => values.length > 0), claimIds: ids(CAPSULE_LIMITS.claims),
});
export type LocalCapsule = z.infer<typeof capsuleSchema>;
const collectionSchema = z.strictObject({ format: z.literal("local-capsules"), version: z.literal(1), capsules: z.array(capsuleSchema).max(CAPSULE_LIMITS.count) })
  .refine(value => new Set(value.capsules.map(item => item.id)).size === value.capsules.length);
export const capsulesKey = (dataset: DatasetMode) => `graph-knowledge:capsules:${dataset}`;
type StorageAccess = Pick<Storage, "getItem" | "setItem">;
export class CapsuleError extends Error {
  constructor(public reason: "invalid" | "storage" | "limit" | "conflict") { super(reason); }
}
export function readCapsules(storage: StorageAccess, dataset: DatasetMode): LocalCapsule[] {
  let raw: string | null;
  try { raw = storage.getItem(capsulesKey(dataset)); } catch { throw new CapsuleError("storage"); }
  if (raw === null) return [];
  try {
    if (raw.length > CAPSULE_LIMITS.bytes || new TextEncoder().encode(raw).length > CAPSULE_LIMITS.bytes) throw new Error();
    const result = collectionSchema.parse(JSON.parse(raw));
    if (result.capsules.some(item => item.dataset !== dataset)) throw new Error();
    return result.capsules;
  } catch { throw new CapsuleError("invalid"); }
}
export function writeCapsule(storage: StorageAccess, dataset: DatasetMode, action: { add: LocalCapsule } | { remove: LocalCapsule }): LocalCapsule[] {
  const previous = readCapsules(storage, dataset);
  let next: LocalCapsule[];
  if ("add" in action) {
    const parsed = capsuleSchema.safeParse(action.add);
    if (!parsed.success || parsed.data.dataset !== dataset) throw new CapsuleError("invalid");
    if (previous.length >= CAPSULE_LIMITS.count) throw new CapsuleError("limit");
    if (previous.some(item => item.id === parsed.data.id)) throw new CapsuleError("conflict");
    next = [parsed.data, ...previous];
  } else {
    const current = previous.find(item => item.id === action.remove.id);
    if (!current || JSON.stringify(current) !== JSON.stringify(action.remove)) throw new CapsuleError("conflict");
    next = previous.filter(item => item.id !== current.id);
  }
  const raw = JSON.stringify({ format: "local-capsules", version: 1, capsules: next });
  if (new TextEncoder().encode(raw).length > CAPSULE_LIMITS.bytes) throw new CapsuleError("limit");
  try { storage.setItem(capsulesKey(dataset), raw); } catch { throw new CapsuleError("storage"); }
  return next;
}

// Only visible, explicitly chosen references enter the content. Required claim
// endpoints are shown as selected in the editor, then persisted as members too.
export function createCapsule(dataset: DatasetMode, title: string, note: string, entityIds: string[], claimIds: string[], graph: GraphState): LocalCapsule {
  const members = new Set(entityIds);
  if (claimIds.some(id => {
    const claim = graph.claims[id];
    return !claim || !members.has(claim.subjectId) || !members.has(claim.objectId);
  }) || entityIds.some(id => !graph.nodes[id])) throw new CapsuleError("invalid");
  const result = capsuleSchema.safeParse({ id: crypto.randomUUID(), dataset, revision: 1, title, note, language: "ja", createdAt: new Date().toISOString(), entityIds, claimIds });
  if (!result.success) throw new CapsuleError("invalid");
  return result.data;
}

export type CapsuleIssue = { kind: "entity" | "claim"; id: string; reason: "missing" | "failed" | "endpoints" };
export type ResolvedCapsule = { entities: Record<string, EntityDetail>; claims: Record<string, ClaimDetail>; issues: CapsuleIssue[] };
// No neighbors, inferred edges, related claims or cached knowledge enter here.
// Four workers bound requests; the owning UI bounds the whole read and aborts on exit.
export async function resolveCapsule(capsule: LocalCapsule, signal: AbortSignal): Promise<ResolvedCapsule> {
  const value = capsuleSchema.parse(capsule);
  const result: ResolvedCapsule = { entities: {}, claims: {}, issues: [] };
  const tasks = [...value.entityIds.map(id => ({ kind: "entity" as const, id })), ...value.claimIds.map(id => ({ kind: "claim" as const, id }))];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      signal.throwIfAborted();
      const task = tasks[cursor++];
      try {
        if (task.kind === "entity") {
          const entity = entityDetailSchema.parse((await fetchEntity(task.id, signal)).entity);
          if (entity.id !== task.id) throw new Error();
          result.entities[task.id] = entity;
        } else {
          const claim = claimDetailSchema.parse((await fetchClaim(task.id, signal)).claim);
          if (claim.id !== task.id) throw new Error();
          if (!value.entityIds.includes(claim.subjectId) || !value.entityIds.includes(claim.objectId)) {
            result.issues.push({ ...task, reason: "endpoints" });
          } else result.claims[task.id] = claim;
        }
      } catch (error) {
        signal.throwIfAborted();
        result.issues.push({ ...task, reason: error instanceof ClientApiError && error.status === 404 ? "missing" : "failed" });
      }
    }
  }));
  signal.throwIfAborted();
  return result;
}
export function capsuleGraph(resolved: ResolvedCapsule): GraphState {
  // This is a renderer adapter, never projectGraph/exploration persistence.
  const nodes = resolved.entities;
  const claims = Object.fromEntries(Object.entries(resolved.claims).filter(([, claim]) => nodes[claim.subjectId] && nodes[claim.objectId]));
  return { ...emptyGraph(), nodes, claims };
}
