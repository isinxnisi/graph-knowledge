import type { PathWitness } from "../domain/discovery-paths";
import { dataReleaseLabels } from "../i18n/data-release";
import { z } from "zod";
import { workspaceLabels } from "../i18n/workspace";
import { DATASET_MODES, type DatasetMode } from "../domain/dataset";
import { claimSummarySchema, entitySummarySchema } from "../domain/api";
import { explorationKey, matchesClaim } from "../domain/exploration";
import { ClientApiError, fetchEntity, fetchNeighbors } from "./api";
import { CACHE_LIMITS, emptyExpansion, emptyGraph, projectGraph, withinLimits, type GraphState } from "./graph-state";
import type { GraphView } from "./graph-view";
import { viewConditionsSchema } from "./saved-views";

export const WORKSPACE_PAGE_LIMIT = 40;
export const WORKSPACE_FILE_LIMIT = 100_000;
export const WORKSPACE_COUNT_LIMIT = 10;
const WORKSPACE_STORAGE_LIMIT = WORKSPACE_COUNT_LIMIT * WORKSPACE_FILE_LIMIT + 4096;
const point = z.strictObject({ x: z.number().finite(), y: z.number().finite() });
export const workspaceSchema = z.strictObject({
  version: z.literal(1), dataset: z.enum(DATASET_MODES), id: z.uuidv4(),
  title: z.string().trim().min(1).max(80), savedAt: z.iso.datetime(), rootId: z.uuidv4(),
  conditions: viewConditionsSchema,
  branches: z.array(z.strictObject({ id: z.uuidv4(), open: z.boolean(), pages: z.number().int().min(0).max(WORKSPACE_PAGE_LIMIT) })).max(CACHE_LIMITS.entities),
  view: z.strictObject({
    positions: z.record(z.uuidv4(), point).refine(value => Object.keys(value).length <= CACHE_LIMITS.entities),
    pan: point, zoom: z.number().min(0.15).max(2), initialLayoutDone: z.boolean(),
  }).nullable(),
}).refine(value => new Set(value.branches.map(branch => branch.id)).size === value.branches.length
  && value.branches.reduce((sum, branch) => sum + branch.pages, 0) <= WORKSPACE_PAGE_LIMIT);
export type SavedWorkspace = z.infer<typeof workspaceSchema>;
export type RebuiltWorkspace = { graph: GraphState; view: GraphView | null; skippedBranches: number; selectedEntityId?: string; discoveryPath?: PathWitness };
export const workspaceKey = (dataset: DatasetMode) => `graph-knowledge:workspace:${dataset}`;
export class WorkspaceRootNotFound extends ClientApiError {
  constructor() { super("起点の対象が見つかりません。", 404); }
}
export class WorkspaceError extends Error {
  constructor(public reason: "invalid" | "storage" | "conflict" | "limit" | "loading" | "response" | "fileInvalid" | "dataset" | "emptyFile" | "countLimit") { super(reason); }
}
type StorageAccess = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function captureWorkspace(dataset: DatasetMode, title: string, graph: GraphState, view: GraphView | null): SavedWorkspace {
  if (Object.values(graph.expansions).some(meta => meta.loading)) throw new WorkspaceError("loading");
  const branches = Object.entries(graph.expansions).map(([id, meta]) => ({ id, open: meta.open, pages: meta.pages.length }));
  if (branches.reduce((sum, branch) => sum + branch.pages, 0) > WORKSPACE_PAGE_LIMIT) throw new WorkspaceError("limit");
  return workspaceSchema.parse({
    version: 1, dataset, id: crypto.randomUUID(), title, savedAt: new Date().toISOString(), rootId: graph.centerId,
    conditions: { predicates: graph.predicates, contributionRoles: graph.contributionRoles, organizationPositions: graph.organizationPositions, eventRoles: graph.eventRoles },
    branches,
    view: view ? { ...view, positions: Object.fromEntries(Object.entries(view.positions).filter(([id]) => graph.cacheNodes[id])) } : null,
  });
}

const workspaceCollectionSchema = z.strictObject({
  version: z.literal(2), dataset: z.enum(DATASET_MODES),
  workspaces: z.array(workspaceSchema).max(WORKSPACE_COUNT_LIMIT),
}).refine(value => new Set(value.workspaces.map(item => item.id)).size === value.workspaces.length
  && value.workspaces.every(item => item.dataset === value.dataset));

export function readWorkspaces(storage: StorageAccess, dataset: DatasetMode): SavedWorkspace[] {
  let raw: string | null;
  try { raw = storage.getItem(workspaceKey(dataset)); } catch { throw new WorkspaceError("storage"); }
  if (raw === null) return [];
  try {
    if (raw.length > WORKSPACE_STORAGE_LIMIT) throw new Error("Oversized collection");
    const input = JSON.parse(raw);
    // Reading a legacy slot is side-effect free. The first successful edit writes
    // the collection in one setItem, retaining the legacy entry unless selected.
    const collection = input?.version === 1
      ? { version: 2, dataset, workspaces: [workspaceSchema.parse(input)] }
      : input;
    const parsed = workspaceCollectionSchema.parse(collection);
    if (parsed.dataset !== dataset) throw new Error("Unexpected dataset");
    parsed.workspaces.forEach(item => parseWorkspaceBackup(JSON.stringify(item), dataset));
    return parsed.workspaces;
  } catch { throw new WorkspaceError("invalid"); }
}

// null means add a new entry. Replacement/deletion targets the exact reviewed
// revision, preserving other entries, including additions from another tab.
export function writeWorkspace(storage: StorageAccess, dataset: DatasetMode, expectedId: string | null, value: SavedWorkspace | null) {
  const current = readWorkspaces(storage, dataset);
  if (expectedId !== null && !current.some(item => item.id === expectedId)) throw new WorkspaceError("conflict");
  let workspace: SavedWorkspace | null = null;
  if (value !== null) {
    try { workspace = parseWorkspaceBackup(JSON.stringify(value), dataset); }
    catch { throw new WorkspaceError("invalid"); }
    if (current.some(item => item.id === workspace!.id)) throw new WorkspaceError("invalid");
  }
  const remaining = current.filter(item => item.id !== expectedId);
  const workspaces = workspace ? [workspace, ...remaining] : remaining;
  if (workspaces.length > WORKSPACE_COUNT_LIMIT) throw new WorkspaceError("countLimit");
  try {
    if (workspaces.length) storage.setItem(workspaceKey(dataset), JSON.stringify({ version: 2, dataset, workspaces }));
    else if (expectedId !== null) storage.removeItem(workspaceKey(dataset));
  } catch { throw new WorkspaceError("storage"); }
  return workspace;
}

export function parseWorkspaceBackup(raw: string, dataset: DatasetMode): SavedWorkspace {
  let workspace: SavedWorkspace;
  try {
    if (raw.length > WORKSPACE_FILE_LIMIT || new TextEncoder().encode(raw).length > WORKSPACE_FILE_LIMIT) throw new Error("Oversized workspace");
    workspace = workspaceSchema.parse(JSON.parse(raw));
  } catch { throw new WorkspaceError("fileInvalid"); }
  if (workspace.dataset !== dataset) throw new WorkspaceError("dataset");
  return workspace;
}

export function exportWorkspace(storage: StorageAccess, dataset: DatasetMode, id: string): string {
  const workspace = readWorkspaces(storage, dataset).find(item => item.id === id);
  if (!workspace) throw new WorkspaceError("emptyFile");
  // Compact output keeps even a full 400-position workspace within the input budget.
  const raw = JSON.stringify(workspace);
  parseWorkspaceBackup(raw, dataset);
  return raw;
}

export function importWorkspace(storage: StorageAccess, dataset: DatasetMode, expectedId: string | null, raw: string): SavedWorkspace {
  const incoming = parseWorkspaceBackup(raw, dataset);
  // A file can retain an old ID while its contents change. Every accepted import
  // is a new local revision, so other tabs cannot mistake it for their reviewed slot.
  const workspace = { ...incoming, id: crypto.randomUUID() };
  writeWorkspace(storage, dataset, expectedId, workspace);
  return workspace;
}

const neighborsSchema = z.object({
  revision: z.string().min(1).optional(), centerId: z.uuidv4(), nodes: z.array(entitySummarySchema).max(51), claims: z.array(claimSummarySchema).max(50),
  page: z.object({ hasMore: z.boolean(), nextCursor: z.string().min(1).nullable() }),
});

// Re-resolve references using current data, never old claims or old cursors.
// Build off-screen; cancellation, invalid responses and limits cannot replace
// the active exploration with a partially replayed graph.
export async function rebuildWorkspace(value: SavedWorkspace, signal: AbortSignal, progress: (done: number, total: number) => void = () => {}): Promise<RebuiltWorkspace> {
  const workspace = workspaceSchema.parse(value);
  const conditions = workspace.conditions;
  signal.throwIfAborted();
  const rootResponse = await fetchEntity(workspace.rootId, signal).catch(error => {
    if (error instanceof ClientApiError && error.status === 404) throw new WorkspaceRootNotFound();
    throw error;
  });
  const root = entitySummarySchema.strip().parse(rootResponse.entity);
  signal.throwIfAborted();
  if (root.id !== workspace.rootId) throw new WorkspaceError("response");
  let graph: GraphState = { ...emptyGraph(), ...conditions,
    conditionKey: explorationKey(conditions.predicates, conditions.contributionRoles, conditions.organizationPositions, conditions.eventRoles),
    roots: [root.id], centerId: root.id, cacheNodes: { [root.id]: root },
  };
  const remaining = new Map(workspace.branches.map(branch => [branch.id, branch]));
  const total = workspace.branches.reduce((sum, branch) => sum + branch.pages, 0);
  let done = 0;
  progress(done, total);
  while (remaining.size) {
    // A closed ancestor still supplies references for its dormant descendants.
    // Unreachable references are never promoted to new roots.
    const branch = [...remaining.values()].find(item => graph.cacheNodes[item.id]);
    if (!branch) break;
    remaining.delete(branch.id);
    const meta = emptyExpansion();
    meta.open = branch.open;
    if (branch.open && branch.pages === 0) meta.error = workspaceLabels().unfetched;
    const seenCursors = new Set<string>();
    for (let index = 0; index < branch.pages; index++) {
      signal.throwIfAborted();
      const after = meta.nextCursor;
      const parsed = neighborsSchema.safeParse(await fetchNeighbors(branch.id, after, signal, conditions.predicates, conditions.contributionRoles, conditions.organizationPositions, conditions.eventRoles, ...(graph.revision ? [graph.revision] as const : [])));
      signal.throwIfAborted();
      if (!parsed.success) throw new WorkspaceError("response");
      const page = parsed.data;
      if (graph.revision && graph.revision !== page.revision) throw new ClientApiError(dataReleaseLabels().workspaceChanged, 409);
      if (page.revision) graph.revision = page.revision;
      const nodes = new Set(page.nodes.map(node => node.id));
      if (page.centerId !== branch.id || !nodes.has(branch.id)
        || page.page.hasMore !== (page.page.nextCursor !== null)
        || (page.page.nextCursor !== null && seenCursors.has(page.page.nextCursor))
        || page.claims.some(claim => (claim.subjectId !== branch.id && claim.objectId !== branch.id)
          || !nodes.has(claim.subjectId) || !nodes.has(claim.objectId)
          || !matchesClaim(claim, conditions.predicates, conditions.contributionRoles, conditions.organizationPositions, conditions.eventRoles))) throw new WorkspaceError("response");
      page.nodes.forEach(node => { graph.cacheNodes[node.id] = node; });
      page.claims.forEach(claim => { graph.cacheClaims[claim.id] = claim; });
      if (Object.keys(graph.cacheNodes).length > CACHE_LIMITS.entities || Object.keys(graph.cacheClaims).length > CACHE_LIMITS.claims) throw new WorkspaceError("limit");
      meta.pages.push({ after, claimIds: page.claims.map(claim => claim.id), nextCursor: page.page.nextCursor });
      meta.nextCursor = page.page.nextCursor; meta.hasMore = page.page.hasMore;
      if (meta.nextCursor) seenCursors.add(meta.nextCursor);
      progress(++done, total);
      if (!meta.hasMore) break;
    }
    meta.used = ++graph.clock;
    graph.expansions[branch.id] = meta;
  }
  graph = projectGraph(graph);
  if (!withinLimits(graph)) throw new WorkspaceError("limit");
  signal.throwIfAborted();
  const view = workspace.view ? { ...workspace.view, positions: Object.fromEntries(Object.entries(workspace.view.positions).filter(([id]) => graph.cacheNodes[id])) } : null;
  return { graph, view, skippedBranches: remaining.size };
}
