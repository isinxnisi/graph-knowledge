import { claimSummarySchema, entitySummarySchema, type ClaimDetail, type ClaimSummary, type EntityDetail, type EntitySummary, type NeighborsResponse } from "../domain/api";
import { capsuleDocumentSchema, capsuleReferences, type CapsuleDocument, type CapsuleNode, type CapsuleRelation } from "../domain/capsule-document";
import { type DatasetMode } from "../domain/dataset";
import { type GraphState } from "./graph-state";
import { type GraphView } from "./graph-view";
import { capsuleSchema, type LocalCapsule, type ResolvedCapsule } from "./local-capsules";
import { normalizeRelationCondition } from "../domain/relation-conditions";
import { fetchAdjacentNeighbors, fetchNeighbors } from "./api";

export const capsuleClone = <T,>(value: T): T => structuredClone(value);
export const sameCapsuleValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export const snapshotEntity = (entity: EntitySummary | EntityDetail): EntitySummary => entitySummarySchema.parse(Object.fromEntries(Object.keys(entitySummarySchema.shape).map(k => [k, entity[k as keyof EntitySummary]])));
export const snapshotClaim = (claim: ClaimSummary | ClaimDetail): ClaimSummary => claimSummarySchema.parse(Object.fromEntries(Object.keys(claimSummarySchema.shape).map(k => [k, claim[k as keyof ClaimSummary]])));

export function captureCapsule(graph: GraphState, view: GraphView | null, dataset: DatasetMode, title: string): LocalCapsule {
  const capturedAt = new Date().toISOString();
  const nodes: CapsuleNode[] = Object.values(graph.nodes).map(n => {
    const meta = graph.expansions[n.id];
    return { key: n.id, title: n.name, description: n.description ?? "", badge: "", origin: { kind: "kg", id: n.id,
      capturedAt, revision: graph.revision ?? null, snapshot: snapshotEntity(n), detail: null,
      neighbors: { capturedAt, revision: graph.revision ?? null, state: meta?.pages.length ? meta.hasMore || graph.execution?.type === "pattern" ? "partial" : "complete" : "unknown",
        scope: JSON.stringify({ visibility: "published", condition: graph.relation ?? { predicates: graph.predicates, contributionRoles: graph.contributionRoles, organizationPositions: graph.organizationPositions, eventRoles: graph.eventRoles }, execution: graph.execution?.type ?? "adjacent" }),
        claimIds: [...new Set(meta?.pages.flatMap(p => p.claimIds) ?? [])] } } };
  });
  const relations: CapsuleRelation[] = Object.values(graph.claims).filter(c => graph.nodes[c.subjectId] && graph.nodes[c.objectId]).map(c => ({
    key: c.id, source: c.subjectId, target: c.objectId, label: "", note: "", origin: { kind: "kg", id: c.id, capturedAt,
      revision: graph.revision ?? null, snapshot: snapshotClaim(c), detail: null },
  }));
  const document = capsuleDocumentSchema.parse({ schemaVersion: 1, nodes, relations, texts: [], evidence: [], unresolvedClaimIds: [],
    layout: { positions: Object.fromEntries(Object.entries(view?.positions ?? {}).filter(([id]) => !!graph.nodes[id])), pan: view?.pan ?? { x: 0, y: 0 }, zoom: view?.zoom ?? 1, ...(view?.center && { center: view.center }), ...(view?.viewport && { viewport: view.viewport }) } });
  return capsuleSchema.parse({ id: crypto.randomUUID(), dataset, revision: 1, title: title.slice(0, 80), note: "", language: "ja", createdAt: capturedAt, ...capsuleReferences(document), document });
}

// Legacy references have no historical text. Materialize today's successful
// reads only after an explicit edit/save and retain unresolved identities.
export function materializeLegacy(capsule: LocalCapsule, resolved: ResolvedCapsule): LocalCapsule {
  if (capsule.document) return capsule;
  const capturedAt = new Date().toISOString();
  const nodes: CapsuleNode[] = capsule.entityIds.map(id => {
    const n = resolved.entities[id];
    return { key: id, title: n?.name ?? id, description: n?.description ?? "", badge: "", origin: n
      ? { kind: "kg", id, capturedAt, revision: null, snapshot: snapshotEntity(n), detail: n, neighbors: { state: "unknown", scope: "legacy reference; neighborhood not captured", claimIds: [] } }
      : { kind: "unresolved", id } };
  });
  const relations: CapsuleRelation[] = capsule.claimIds.flatMap(id => {
    const c = resolved.claims[id];
    return c && capsule.entityIds.includes(c.subjectId) && capsule.entityIds.includes(c.objectId) ? [{ key: id, source: c.subjectId, target: c.objectId, label: "", note: "", origin: { kind: "kg" as const, id, capturedAt, revision: null, snapshot: snapshotClaim(c), detail: c } }] : [];
  });
  const document = capsuleDocumentSchema.parse({ schemaVersion: 1, nodes, relations, texts: [], evidence: [], unresolvedClaimIds: capsule.claimIds.filter(id => !relations.some(r => r.key === id)), layout: { positions: {}, pan: { x: 0, y: 0 }, zoom: 1 } });
  return { ...capsule, document };
}

export function withDocument(capsule: LocalCapsule, document: CapsuleDocument): LocalCapsule {
  return { ...capsule, document, ...capsuleReferences(document) };
}
export function withCapsuleView(capsule: LocalCapsule, view: GraphView | null): LocalCapsule {
  if (!capsule.document || !view) return capsule;
  const ids = new Set([...capsule.document.nodes, ...capsule.document.texts].map(n => n.key));
  return withDocument(capsule, { ...capsule.document, layout: { positions: Object.fromEntries(Object.entries(view.positions).filter(([id]) => ids.has(id))), pan: view.pan, zoom: view.zoom, ...(view.center && { center: view.center }), ...(view.viewport && { viewport: view.viewport }) } });
}

// Pre-center documents did not record the viewport dimensions, so their screen
// pan cannot be faithfully reconstructed. Keep their authored scale and node
// positions, and open their extent at the center instead of an arbitrary offset.
// New saves always capture the actual center, including deliberately empty space.
export function capsuleGraphView(layout: CapsuleDocument["layout"]): GraphView {
  const positions = Object.values(layout.positions);
  const center = layout.center ?? (!layout.viewport && positions.length ? {
    x: (Math.min(...positions.map(p => p.x)) + Math.max(...positions.map(p => p.x))) / 2,
    y: (Math.min(...positions.map(p => p.y)) + Math.max(...positions.map(p => p.y))) / 2,
  } : undefined);
  return { ...layout, ...(center && { center }), initialLayoutDone: positions.length > 0 };
}
export function removeCapsuleElements(document: CapsuleDocument, keys: string[]): CapsuleDocument {
  const removed = new Set(keys);
  document.relations.forEach(r => { if (removed.has(r.source) || removed.has(r.target)) removed.add(r.key); });
  return { ...document, nodes: document.nodes.filter(n => !removed.has(n.key)), relations: document.relations.filter(r => !removed.has(r.key)), texts: document.texts.filter(t => !removed.has(t.key)), evidence: document.evidence.filter(e => !removed.has(e.targetKey)), layout: { ...document.layout, positions: Object.fromEntries(Object.entries(document.layout.positions).filter(([id]) => !removed.has(id))) } };
}
export type CapsuleHistory = { past: LocalCapsule[]; present: LocalCapsule; future: LocalCapsule[] };
export const capsuleHistory = (present: LocalCapsule): CapsuleHistory => ({ past: [], present, future: [] });
export function recordCapsule(history: CapsuleHistory, present: LocalCapsule): CapsuleHistory {
  return sameCapsuleValue(history.present, present) ? history : { past: [...history.past.slice(-39), history.present], present, future: [] };
}
export function undoCapsule(history: CapsuleHistory): CapsuleHistory {
  return history.past.length ? { past: history.past.slice(0, -1), present: history.past.at(-1)!, future: [history.present, ...history.future] } : history;
}
export function redoCapsule(history: CapsuleHistory): CapsuleHistory {
  return history.future.length ? { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1) } : history;
}

export type CapsuleNeighborhoodComparison = { state: "same" | "changed" | "unknown" | "failed"; added: string[]; removed: string[] };
export async function compareCapsuleNeighborhood(node: CapsuleNode, revision: string | null, signal: AbortSignal): Promise<CapsuleNeighborhoodComparison> {
  const unknown: CapsuleNeighborhoodComparison = { state: "unknown", added: [], removed: [] };
  if (node.origin.kind !== "kg" || node.origin.neighbors.state !== "complete") return unknown;
  const origin = node.origin;
  let scope: { visibility?: string; execution?: string; condition?: Record<string, unknown> };
  try { scope = JSON.parse(origin.neighbors.scope); } catch { return unknown; }
  if (scope.visibility !== "published" || scope.execution !== "adjacent" || !scope.condition || scope.condition.type && scope.condition.type !== "adjacent") return unknown;
  try {
    const condition = scope.condition.type ? normalizeRelationCondition(scope.condition) : null;
    const ids = new Set<string>(), cursors = new Set<string>();
    let after: string | null = null;
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(60_000)]);
    do {
      const result: NeighborsResponse = condition ? await fetchAdjacentNeighbors(origin.id, after, bounded, condition, revision, "id")
        : await fetchNeighbors(origin.id, after, bounded,
          scope.condition.predicates as GraphState["predicates"] ?? null,
          scope.condition.contributionRoles as GraphState["contributionRoles"] ?? null,
          scope.condition.organizationPositions as GraphState["organizationPositions"] ?? null,
          scope.condition.eventRoles as GraphState["eventRoles"] ?? null, revision, "id");
      if (result.centerId !== origin.id || revision && result.revision !== revision || result.page.hasMore !== (result.page.nextCursor !== null)
        || result.claims.some(c => c.subjectId !== origin.id && c.objectId !== origin.id)) throw Error("Invalid neighborhood");
      result.claims.forEach(c => ids.add(c.id));
      if (ids.size > 800) return unknown;
      after = result.page.nextCursor;
      if (after) { if (cursors.has(after)) throw Error("Repeated cursor"); cursors.add(after); }
    } while (after);
    const previous = new Set(origin.neighbors.claimIds);
    const added = [...ids].filter(id => !previous.has(id)), removed = [...previous].filter(id => !ids.has(id));
    return { state: added.length || removed.length ? "changed" : "same", added, removed };
  } catch { signal.throwIfAborted(); return { state: "failed", added: [], removed: [] }; }
}
