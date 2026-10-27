import { createHash } from "node:crypto";
import type { AdminEntity, AdminIsland, AdminSnapshot } from "../domain/kg-admin";

export type RawEntity = Pick<AdminEntity, "id" | "name" | "kind" | "aliases">;
export type RawClaim = { id: string; subjectId: string; objectId: string; visibility: string; polarity: string; supported: boolean };
export const ADMIN_ENTITY_LIMIT = 50_000;
export const ADMIN_CLAIM_LIMIT = 200_000;
export function analyzeAdminGraph(entities: RawEntity[], claims: RawClaim[], revision: string, measuredAt = new Date().toISOString()): AdminSnapshot {
  if (entities.length > ADMIN_ENTITY_LIMIT || claims.length > ADMIN_CLAIM_LIMIT) throw Error("Snapshot exceeds safe capacity");
  const adjacency = new Map(entities.map(e => [e.id, new Set<string>()]));
  const incident = new Map(entities.map(e => [e.id, 0]));
  const ids = new Set<string>();
  if (adjacency.size !== entities.length) throw Error("Duplicate entity");
  const excluded = { unpublished: 0, denied: 0, unsupported: 0 };
  const accepted: RawClaim[] = [];
  for (const c of claims) {
    if (ids.has(c.id) || !adjacency.has(c.subjectId) || !adjacency.has(c.objectId)) throw Error("Invalid claim endpoints or duplicate claim");
    ids.add(c.id);
    if (c.visibility !== "published") { excluded.unpublished++; continue; }
    if (c.polarity !== "affirmed") { excluded.denied++; continue; }
    if (!c.supported) { excluded.unsupported++; continue; }
    accepted.push(c);
    // Self claims count once as Claims, but never make another adjacent Entity.
    incident.set(c.subjectId, incident.get(c.subjectId)! + 1);
    if (c.subjectId !== c.objectId) {
      incident.set(c.objectId, incident.get(c.objectId)! + 1);
      adjacency.get(c.subjectId)!.add(c.objectId); adjacency.get(c.objectId)!.add(c.subjectId);
    }
  }
  const owner = new Map<string, AdminIsland>(), byId = new Map(entities.map(e => [e.id, e]));
  const islands: AdminIsland[] = [];
  for (const start of [...adjacency.keys()].sort()) {
    if (owner.has(start)) continue;
    const component: string[] = [start], visited = new Set([start]);
    for (let at = 0; at < component.length; at++) for (const id of adjacency.get(component[at])!) if (!visited.has(id)) { visited.add(id); component.push(id); }
    component.sort();
    const island: AdminIsland = { id: createHash("sha256").update(JSON.stringify(["public-kg", revision, component])).digest("hex"), name: byId.get(start)!.name, representativeId: start, size: component.length, claimCount: 0, kinds: {} };
    for (const id of component) { owner.set(id, island); const kind = byId.get(id)!.kind; island.kinds[kind] = (island.kinds[kind] ?? 0) + 1; }
    islands.push(island);
  }
  for (const c of accepted) owner.get(c.subjectId)!.claimCount++;
  const distribution = [0, 0, 0, 0];
  const result = entities.map(e => { const island = owner.get(e.id)!, degree = adjacency.get(e.id)!.size; distribution[Math.min(degree, 3)]++; return { ...e, degree, claimCount: incident.get(e.id)!, islandId: island.id, islandSize: island.size }; });
  return { dataset: "public-kg", revision, measuredAt, entities: result, islands, excluded, claimCount: accepted.length, distribution };
}
