import { deflateSync, Inflate, strFromU8, strToU8 } from "fflate";
import { workspaceSchema, rebuildWorkspace, WorkspaceError, type SavedWorkspace, type WorkspaceInput } from "./saved-workspace";
import type { GraphState } from "./graph-state";
import { fetchDatasetRevision } from "./api";
import type { PathWitness } from "../domain/discovery-paths";
import type { GraphView } from "./graph-view";
import type { DatasetMode } from "../domain/dataset";

export const URL_STATE_TARGET = 4000;
export const URL_STATE_LIMIT = 8000;
const RAW_LIMIT = 100_000;
export class ExplorationUrlError extends Error {
  constructor(public reason: "invalid" | "dataset" | "limit" | "changed") { super(reason); }
}
// Versioned portable state, deliberately excluding local save metadata, API bodies and cursors.
export function encodeExploration(workspace: WorkspaceInput): string {
  const value = workspaceSchema.parse(workspace);
  const raw = JSON.stringify({ v: 2, d: value.dataset, r: value.rootId, c: value.relation, x: value.execution, o: value.observedRevision,
    p: value.view ? Object.entries(value.view.positions).map(([id, p]) => [id, p.x, p.y]) : [],
    z: value.view?.zoom ?? 1, l: value.view?.initialLayoutDone ?? false });
  if (strToU8(raw).length > RAW_LIMIT) throw new ExplorationUrlError("limit");
  const bytes = deflateSync(strToU8(raw), { level: 9 });
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join("")).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
export function explorationHref(workspace: WorkspaceInput): string {
  const href = `/explore/${workspace.rootId}?s=${encodeExploration(workspace)}`;
  if (href.length > URL_STATE_LIMIT) throw new ExplorationUrlError("limit");
  return href;
}
export function decodeExploration(encoded: string, rootId: string, dataset: DatasetMode): SavedWorkspace {
  try {
    if (!encoded || `/explore/${rootId}?s=${encoded}`.length > URL_STATE_LIMIT || !/^[\w-]+$/.test(encoded)) throw Error();
    const compressed = Uint8Array.from(atob(encoded.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
    // Streaming output budget: a tiny hostile compressed input cannot allocate an unbounded result.
    const chunks: Uint8Array[] = []; let size = 0;
    const stream = new Inflate(chunk => {
      size += chunk.length; if (size > RAW_LIMIT) throw Error(); chunks.push(chunk);
    });
    for (let i = 0; i < compressed.length; i += 64) stream.push(compressed.subarray(i, i + 64), i + 64 >= compressed.length);
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const value = JSON.parse(strFromU8(bytes));
    if ((value.v === 1 ? Object.keys(value).sort().join() !== "b,c,d,l,p,r,v,z" : value.v === 2 ? Object.keys(value).sort().join() !== "c,d,l,o,p,r,v,x,z" : true) || value.r !== rootId || !Array.isArray(value.p)) throw Error();
    if (value.d !== dataset) throw new ExplorationUrlError("dataset");
    if (value.p.some((p: unknown) => !Array.isArray(p) || p.length !== 3) || new Set(value.p.map((p: unknown[]) => p[0])).size !== value.p.length) throw Error();
    if (value.v === 1 && (!Array.isArray(value.b) || value.b.some((b: unknown) => !Array.isArray(b) || b.length !== 3 || (b[1] !== 0 && b[1] !== 1)))) throw Error();
    return workspaceSchema.parse({ version: value.v, dataset, rootId, id: rootId, title: "URL", savedAt: "2000-01-01T00:00:00.000Z",
      ...(value.v === 1 ? { conditions: value.c, branches: value.b.map((b: [string, number, number]) => ({ id: b[0], open: b[1] === 1, pages: b[2] })) } : { relation: value.c, execution: value.x, observedRevision: value.o }),
      view: { positions: Object.fromEntries(value.p.map((p: [string, number, number]) => [p[0], { x: p[1], y: p[2] }])), pan: { x: 0, y: 0 }, zoom: value.z, initialLayoutDone: value.l } });
  } catch (error) {
    if (error instanceof ExplorationUrlError) throw error;
    throw new ExplorationUrlError("invalid");
  }
}
export async function rebuildExplorationUrl(workspace: SavedWorkspace, signal: AbortSignal, witness?: PathWitness) {
  workspace = workspaceSchema.parse(workspace);
  if (witness) {
    if (workspace.relation.type !== "adjacent" || workspace.relation.polarity !== "all-records") throw new ExplorationUrlError("invalid");
    const observed = await fetchDatasetRevision(signal);
    if (observed.dataset !== workspace.dataset || observed.revision !== witness.revision) throw new ExplorationUrlError("changed");
  }
  const result = await rebuildWorkspace(workspace, signal);
  if (result.skippedBranches || workspace.execution.type === "adjacent" && workspace.execution.branches.some(b => result.graph.expansions[b.id]?.pages.length !== b.pages)
    || Object.keys(workspace.view?.positions ?? {}).some(id => !result.graph.cacheNodes[id])) throw new ExplorationUrlError("changed");
  if (witness) {
    const observed = await fetchDatasetRevision(signal);
    if (result.graph.revision !== witness.revision || observed.revision !== witness.revision || observed.dataset !== workspace.dataset
      || witness.nodeIds[0] !== workspace.rootId || witness.nodeIds.some(id => !result.graph.nodes[id])
      || witness.claimIds.some((ids,i) => ids.some(id => {
        const c = result.graph.claims[id];
        return !c || ![c.subjectId,c.objectId].includes(witness.nodeIds[i]) || ![c.subjectId,c.objectId].includes(witness.nodeIds[i+1]);
      }))) throw new ExplorationUrlError("changed");
  }
  return { ...result, ...(witness ? { selectedEntityId: witness.nodeIds.at(-1)!, discoveryPath: witness } : {}), view: result.view ? { ...result.view, recenter: true } : null };
}
// Cache eviction can leave dormant islands. Never create a URL that promises to
// replay an island that the remaining accepted pages no longer connect to root.
export function assertUrlReplayable(graph: GraphState, view: GraphView) {
  if (graph.execution?.type === "pattern") {
    const ids = new Set([graph.centerId, ...Object.values(graph.execution.routes).flatMap(r => r.route.nodeIds)]);
    if (Object.keys(view.positions).filter(id => graph.cacheNodes[id]).some(id => !ids.has(id))) throw new ExplorationUrlError("changed");
    return;
  }
  const reachable = new Set<string>();
  const pending = graph.centerId ? [graph.centerId] : [];
  for (let index = 0; index < pending.length; index++) {
    const id = pending[index];
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const page of graph.expansions[id]?.pages ?? []) for (const claimId of page.claimIds) {
      const claim = graph.cacheClaims[claimId];
      if (claim) pending.push(claim.subjectId, claim.objectId);
    }
  }
  if (Object.keys(graph.expansions).some(id => !reachable.has(id))
    || Object.keys(view.positions).filter(id => graph.cacheNodes[id]).some(id => !reachable.has(id))) throw new ExplorationUrlError("changed");
}
export const isWorkspaceLoading = (error: unknown) => error instanceof WorkspaceError && error.reason === "loading";
