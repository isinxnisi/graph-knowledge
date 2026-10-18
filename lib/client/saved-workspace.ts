import type { PathWitness } from "../domain/discovery-paths";
import { dataReleaseLabels } from "../i18n/data-release";
import { z } from "zod";
import { workspaceLabels } from "../i18n/workspace";
import { DATASET_MODES, type DatasetMode } from "../domain/dataset";
import { claimSummarySchema, entitySummarySchema } from "../domain/api";
import { ClientApiError, fetchEntity, fetchNeighbors } from "./api";
import { CACHE_LIMITS, emptyExpansion, emptyGraph, projectGraph, withinLimits, type GraphState } from "./graph-state";
import type { GraphView } from "./graph-view";
import { viewConditionsSchema } from "./saved-views";
import { relationConditionSchema, relationAcceptsClaim, relationConditionKey } from "../domain/relation-conditions";
import { routeRefSchema, validateRelationRoute } from "../domain/relation-patterns";
import { publicRevisionSchema } from "../domain/discovery-targets";
import { routeKey } from "../domain/pattern-graph";
import { graphRelation, legacyRelation } from "./relation-state";
import { fetchPatternGraph } from "./pattern-graph";
import { fetchAdjacentNeighbors } from "./api";
import { emptyPatternGraph, restorePatternGraph, mergePatternPage } from "./graph-state";

export const WORKSPACE_PAGE_LIMIT = 40;
export const WORKSPACE_FILE_LIMIT = 100_000;
export const WORKSPACE_COUNT_LIMIT = 10;
const WORKSPACE_STORAGE_LIMIT = WORKSPACE_COUNT_LIMIT * WORKSPACE_FILE_LIMIT + 4096;
const point = z.strictObject({ x: z.number().finite(), y: z.number().finite() });
export const legacyWorkspaceSchema = z.strictObject({
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
const branchesSchema = z.array(z.strictObject({ id: z.uuidv4(), open: z.boolean(), pages: z.number().int().min(0).max(WORKSPACE_PAGE_LIMIT) })).max(CACHE_LIMITS.entities)
  .refine(v => new Set(v.map(b => b.id)).size === v.length && v.reduce((sum, b) => sum + b.pages, 0) <= WORKSPACE_PAGE_LIMIT);
export const savedExecutionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("adjacent"), branches: branchesSchema }),
  z.strictObject({ type: z.literal("pattern"), routes: z.array(z.strictObject({ route: routeRefSchema, open: z.boolean() })).max(100),
    requiredRouteKey: z.string().nullable(), candidateBoundary: routeRefSchema.nullable(),
    collapsedNodes: z.array(z.strictObject({ id: z.uuidv4(), routeKeys: z.array(z.string().min(1).max(128)).min(1).max(100).refine(keys => new Set(keys).size === keys.length) })).max(CACHE_LIMITS.entities).optional() }),
]);
export const workspaceV2Schema = z.strictObject({
  version: z.literal(2), dataset: z.enum(DATASET_MODES), id: z.uuidv4(), title: z.string().trim().min(1).max(80), savedAt: z.iso.datetime(), rootId: z.uuidv4(),
  relation: relationConditionSchema, execution: savedExecutionSchema, observedRevision: publicRevisionSchema.nullable(),
  view: z.strictObject({ positions: z.record(z.uuidv4(), point).refine(v => Object.keys(v).length <= CACHE_LIMITS.entities),
    pan: point, zoom: z.number().min(0.15).max(2), initialLayoutDone: z.boolean() }).nullable(),
}).superRefine((v, ctx) => {
  const ex = v.execution;
  let valid = ex.type === v.relation.type;
  if (ex.type === "pattern") {
    const keys = ex.routes.map(r => routeKey(r.route));
    valid &&= v.dataset === "public-kg" && new Set(keys).size === keys.length
      && ex.routes.every(r => r.route.nodeIds[0] === v.rootId && r.route.claimIds.length === 2)
      && (ex.requiredRouteKey === null || keys.includes(ex.requiredRouteKey))
      && new Set(ex.collapsedNodes?.map(n => n.id)).size === (ex.collapsedNodes?.length ?? 0)
      && (ex.collapsedNodes ?? []).every(n => n.routeKeys.every(key => ex.routes.some(r => routeKey(r.route) === key && r.route.nodeIds.includes(n.id))))
      && (ex.candidateBoundary === null || ex.routes.some(r => JSON.stringify(r.route) === JSON.stringify(ex.candidateBoundary)));
  }
  if (!valid) ctx.addIssue({ code: "custom", message: "Inconsistent saved relation execution" });
});
export type SavedWorkspace = z.infer<typeof workspaceV2Schema>;
export const workspaceSchema = z.union([workspaceV2Schema, legacyWorkspaceSchema.transform(value => {
  const { conditions, branches, ...rest } = value;
  return workspaceV2Schema.parse({ ...rest, version: 2, relation: legacyRelation(conditions), execution: { type: "adjacent", branches }, observedRevision: null });
})]);
export type WorkspaceInput = z.input<typeof workspaceSchema>;
export type RebuiltWorkspace = { graph: GraphState; view: GraphView | null; skippedBranches: number; selectedEntityId?: string; discoveryPath?: PathWitness; revisionChanged?: boolean };
export const legacyWorkspaceKey = (dataset: DatasetMode) => `graph-knowledge:workspace:${dataset}`;
export const workspaceKey = (dataset: DatasetMode) => `${legacyWorkspaceKey(dataset)}:v3`;
export class WorkspaceRootNotFound extends ClientApiError {
  constructor() { super("起点の対象が見つかりません。", 404); }
}
export class WorkspaceError extends Error {
  constructor(public reason: "invalid" | "storage" | "conflict" | "limit" | "loading" | "response" | "fileInvalid" | "dataset" | "emptyFile" | "countLimit") { super(reason); }
}
type StorageAccess = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function captureWorkspace(dataset: DatasetMode, title: string, graph: GraphState, view: GraphView | null): SavedWorkspace {
  if (Object.values(graph.expansions).some(meta => meta.loading) || graph.execution?.type === "pattern" && graph.execution.loading) throw new WorkspaceError("loading");
  if (graph.execution?.type === "pattern") {
    if (graph.relation?.type !== "pattern" || !graph.centerId) throw new WorkspaceError("response");
    const nodes = new Map(Object.entries(graph.cacheNodes)), claims = new Map(Object.entries(graph.cacheClaims));
    for (const entry of Object.values(graph.execution.routes)) {
      try { validateRelationRoute(graph.relation, graph.centerId, entry.route, nodes, claims); }
      catch { throw new WorkspaceError("response"); }
    }
  }
  const branches = Object.entries(graph.expansions).map(([id, meta]) => ({ id, open: meta.open, pages: meta.pages.length }));
  if (branches.reduce((sum, branch) => sum + branch.pages, 0) > WORKSPACE_PAGE_LIMIT) throw new WorkspaceError("limit");
  return workspaceV2Schema.parse({
    version: 2, dataset, id: crypto.randomUUID(), title, savedAt: new Date().toISOString(), rootId: graph.centerId,
    relation: graphRelation(graph), observedRevision: graph.revision ?? null,
    execution: graph.execution?.type === "pattern" ? { type: "pattern", routes: Object.values(graph.execution.routes), requiredRouteKey: graph.execution.requiredRoute, candidateBoundary: graph.execution.candidateBoundary,
      ...(Object.keys(graph.execution.collapsedNodes ?? {}).length ? { collapsedNodes: Object.entries(graph.execution.collapsedNodes!).sort(([a], [b]) => a.localeCompare(b)).map(([id, routeKeys]) => ({ id, routeKeys })) } : {}) } : { type: "adjacent", branches },
    view: view ? { pan: view.pan, zoom: view.zoom, initialLayoutDone: view.initialLayoutDone, positions: Object.fromEntries(Object.entries(view.positions).filter(([id]) => graph.cacheNodes[id])) } : null,
  });
}

const workspaceCollectionSchema = z.strictObject({
  version: z.literal(3), dataset: z.enum(DATASET_MODES),
  workspaces: z.array(workspaceV2Schema).max(WORKSPACE_COUNT_LIMIT),
}).refine(value => new Set(value.workspaces.map(item => item.id)).size === value.workspaces.length
  && value.workspaces.every(item => item.dataset === value.dataset));

export function readWorkspaces(storage: StorageAccess, dataset: DatasetMode): SavedWorkspace[] {
  let raw: string | null;
  let modern = false;
  try { raw = storage.getItem(workspaceKey(dataset)); modern = raw !== null; if (raw === null) raw = storage.getItem(legacyWorkspaceKey(dataset)); } catch { throw new WorkspaceError("storage"); }
  if (raw === null) return [];
  try {
    if (raw.length > WORKSPACE_STORAGE_LIMIT) throw new Error("Oversized collection");
    const input = JSON.parse(raw);
    if (modern && input?.version !== 3) throw Error("Unknown collection version");
    // Reading a legacy slot is side-effect free. The first successful edit writes
    // the collection in one setItem, retaining the legacy entry unless selected.
    const legacyCollection = z.strictObject({ version: z.literal(2), dataset: z.enum(DATASET_MODES), workspaces: z.array(legacyWorkspaceSchema).max(WORKSPACE_COUNT_LIMIT) });
    const collection = input?.version === 1
      ? { version: 3, dataset, workspaces: [workspaceSchema.parse(input)] }
      : input?.version === 2 ? { ...legacyCollection.parse(input), version: 3, workspaces: legacyCollection.parse(input).workspaces.map(w => workspaceSchema.parse(w)) } : input;
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
    storage.setItem(workspaceKey(dataset), JSON.stringify({ version: 3, dataset, workspaces }));
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
export async function rebuildWorkspace(value: WorkspaceInput, signal: AbortSignal, progress: (done: number, total: number) => void = () => {}): Promise<RebuiltWorkspace> {
  const workspace = workspaceSchema.parse(value);
  const conditions = workspace.relation;
  signal.throwIfAborted();
  const rootResponse = await fetchEntity(workspace.rootId, signal).catch(error => {
    if (error instanceof ClientApiError && error.status === 404) throw new WorkspaceRootNotFound();
    throw error;
  });
  const root = entitySummarySchema.strip().parse(rootResponse.entity);
  signal.throwIfAborted();
  if (root.id !== workspace.rootId) throw new WorkspaceError("response");
  if (conditions.type === "pattern") {
    if (workspace.execution.type !== "pattern" || root.kind !== "work") throw new WorkspaceError("response");
    const ex = workspace.execution;
    progress(0, ex.routes.length);
    const response = await fetchPatternGraph({ version: 1, dataset: "public-kg", rootId: root.id, relation: conditions, revision: null,
      operation: { type: "restore", routes: ex.routes.map(r => r.route), observedRevision: workspace.observedRevision, candidateBoundary: ex.candidateBoundary } }, signal);
    signal.throwIfAborted();
    const initial = emptyPatternGraph(root, conditions);
    if (initial.execution?.type !== "pattern") throw new WorkspaceError("response");
    const graph = restorePatternGraph({ ...initial, execution: { ...initial.execution, routes: Object.fromEntries(ex.routes.map(r => [routeKey(r.route), r])), requiredRoute: ex.requiredRouteKey, candidateBoundary: ex.candidateBoundary,
      ...(ex.collapsedNodes ? { collapsedNodes: Object.fromEntries(ex.collapsedNodes.map(n => [n.id, n.routeKeys])) } : {}) } }, response);
    if (graph.execution?.type !== "pattern" || graph.execution.blocked) throw new WorkspaceError("limit");
    progress(ex.routes.length, ex.routes.length);
    return { graph, view: workspace.view, skippedBranches: 0, revisionChanged: workspace.observedRevision !== null && workspace.observedRevision !== graph.revision };
  }
  if (workspace.execution.type !== "adjacent") throw new WorkspaceError("response");
  // The old endpoint normalizes a full predicate set to null. Explicit sets in
  // the new contract must retain their identity, including cursor binding.
  const legacyCompatible = conditions.polarity === "all-records" && relationConditionKey(legacyRelation(viewConditionsSchema.parse({
    predicates: conditions.predicates, contributionRoles: conditions.contributionRoles,
    organizationPositions: conditions.organizationPositions, eventRoles: conditions.eventRoles,
  }))) === relationConditionKey(conditions);
  let graph: GraphState = { ...emptyGraph(), predicates: conditions.predicates, contributionRoles: conditions.contributionRoles,
    organizationPositions: conditions.organizationPositions, eventRoles: conditions.eventRoles, relation: conditions,
    conditionKey: relationConditionKey(conditions),
    roots: [root.id], centerId: root.id, cacheNodes: { [root.id]: root },
  };
  const remaining = new Map(workspace.execution.branches.map(branch => [branch.id, branch]));
  const total = workspace.execution.branches.reduce((sum, branch) => sum + branch.pages, 0);
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
      const parsed = neighborsSchema.safeParse(!legacyCompatible
        ? await fetchAdjacentNeighbors(branch.id, after, signal, conditions, graph.revision ?? null)
        : await fetchNeighbors(branch.id, after, signal, conditions.predicates, conditions.contributionRoles, conditions.organizationPositions, conditions.eventRoles, ...(graph.revision ? [graph.revision] as const : [])));
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
          || !relationAcceptsClaim(conditions, claim))) throw new WorkspaceError("response");
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

// Explicit recovery starts the SAME subject and conditions with fresh candidates.
// It never writes to storage and never replaces missing saved routes silently.
export async function restartWorkspace(value: WorkspaceInput, signal: AbortSignal): Promise<RebuiltWorkspace> {
  const workspace = workspaceSchema.parse(value);
  if (workspace.relation.type === "adjacent") return rebuildWorkspace({ ...workspace, execution: { type: "adjacent", branches: [{ id: workspace.rootId, open: true, pages: 1 }] }, view: null }, signal);
  const root = (await fetchEntity(workspace.rootId, signal)).entity;
  signal.throwIfAborted();
  if (root.id !== workspace.rootId || root.kind !== "work") throw new WorkspaceError("response");
  const response = await fetchPatternGraph({ version: 1, dataset: "public-kg", rootId: workspace.rootId, relation: workspace.relation, revision: null,
    operation: { type: "page", after: null, requiredWitness: null } }, signal);
  signal.throwIfAborted();
  const graph = mergePatternPage(emptyPatternGraph(root, workspace.relation), response, null);
  if (graph.execution?.type !== "pattern" || graph.execution.blocked) throw new WorkspaceError("limit");
  return { graph, view: null, skippedBranches: 0 };
}
