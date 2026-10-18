"use client";

import type { RebuiltWorkspace } from "./saved-workspace";
import { dataReleaseLabels } from "../i18n/data-release";
import { workspaceLabels } from "../i18n/workspace";
import { captureExploration, type ExplorationSnapshot } from "./exploration-snapshot";
import type { GraphView, ViewRestoration } from "./graph-view";
import { viewConditionsSchema, type ViewConditions } from "./saved-views";
import { overviewLabels } from "../i18n/entity-overview";
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizePredicates, normalizeContributionRoles, normalizeOrganizationPositions, normalizeEventRoles, type EventRoleFilter, explorationKey, type OrganizationPositionFilter, type ContributionRoleFilter, type PredicateFilter } from "../domain/exploration";
import { explorationLabels } from "../i18n/exploration";
import type { EntitySummary } from "../domain/api";
import { displayRelations } from "./graph-presentation";
import { ClientApiError, fetchDatasetRevision, fetchNeighbors, fetchAdjacentNeighbors, errorMessage } from "./api";
import { fetchPatternGraph } from "./pattern-graph";
import { normalizeRelationCondition, relationConditionKey, type RelationCondition } from "../domain/relation-conditions";
import { relationText } from "../i18n/relation-condition";
import type { MatchWitness } from "../domain/relation-patterns";
import { patternNodeOpen, nextPatternRoute, closeExpansion, reopenExpansion, projectGraph, emptyExpansion, emptyGraph, mergePage, emptyPatternGraph, mergePatternPage, restorePatternGraph, setPatternRouteOpen, setPatternRoutesOpen, type GraphState, type Selection } from "./graph-state";

export function useGraphExplorer() {
  const [graph, setGraph] = useState<GraphState>(emptyGraph);
  const [selection, setSelection] = useState<Selection>(null);
  const [dataChanged, setDataChanged] = useState(false);
  const [relationLoading, setRelationLoading] = useState(false);
  const [previous, setPrevious] = useState<ExplorationSnapshot | null>(null);
  const [viewRestoration, setViewRestoration] = useState<ViewRestoration | null>(null);
  const stale = useRef(false);
  const current = useRef(graph);
  const generation = useRef(0);
  const pending = useRef(new Map<string, AbortController>());
  const commit = useCallback((next: GraphState) => {
    // 到達不能な通信も無効化。復元しても中断ページは自動取得しない。
    const expansions = { ...next.expansions };
    pending.current.forEach((controller, id) => {
      if (id.startsWith("$")) return;
      if (!expansions[id]?.active) {
        controller.abort(); pending.current.delete(id);
        if (expansions[id]) expansions[id] = { ...expansions[id], loading: false, request: expansions[id].request + 1 };
      }
    });
    next = { ...next, expansions }; current.current = next; setGraph(next);
    setSelection((selected) => {
      if (!selected) return null;
      if (selected.kind === "entity") return next.nodes[selected.id] ? selected : next.centerId ? { kind: "entity", id: next.centerId } : null;
      if (selected.kind === "claim") return next.claims[selected.id] ? selected : null;
      return displayRelations(next.claims)[selected.id] ? selected : null;
    });
  }, []);

  useEffect(() => {
    const requests = pending.current;
    return () => { generation.current += 1; requests.forEach((controller) => controller.abort()); requests.clear(); };
  }, []);

  const invalidate = useCallback(() => {
    pending.current.forEach(controller => controller.abort()); pending.current.clear(); setRelationLoading(false); generation.current += 1;
    stale.current = true; setDataChanged(true); setRelationLoading(false);
    const state = current.current;
    commit({ ...state, notice: dataReleaseLabels().changed, ...(state.execution?.type === "pattern" ? { execution: { ...state.execution, loading: false, request: state.execution.request + 1 } } : {}), expansions: Object.fromEntries(Object.entries(state.expansions).map(([id, meta]) => [id, { ...meta, loading: false }])) });
  }, [commit]);
  const checkRevision = useCallback(async (revision: string, signal: AbortSignal) => {
    if ((await fetchDatasetRevision(signal)).revision !== revision) throw new ClientApiError(dataReleaseLabels().changed, 409);
  }, []);
  const expand = useCallback(async (id: string, more = false) => {
    if (stale.current || pending.current.has("$transition") || current.current.execution?.type === "pattern") return;
    let state = current.current;
    const meta = state.expansions[id] ?? emptyExpansion();
    if (!state.nodes[id] || pending.current.has(id)) return;
    if (!more && meta.pages.length && !meta.open) {
      if (!state.revision) { commit(reopenExpansion(state, id)); return; }
      const epoch = generation.current, controller = new AbortController();
      pending.current.set(id, controller);
      try {
        await checkRevision(state.revision, controller.signal);
        if (!controller.signal.aborted && generation.current === epoch) commit(reopenExpansion(current.current, id));
      } catch (error) {
        if (!controller.signal.aborted && generation.current === epoch) {
          if (error instanceof ClientApiError && error.status === 409) invalidate();
          else commit({ ...current.current, notice: errorMessage(error) });
        }
      } finally { if (pending.current.get(id) === controller) pending.current.delete(id); }
      return;
    }
    if (more ? !meta.expanded || !meta.hasMore : meta.expanded) return;
    const epoch = generation.current;
    const controller = new AbortController();
    const request = meta.request + 1;
    const after = more ? meta.nextCursor : null;
    state = projectGraph({ ...state, notice: state.evictedIds.includes(id) ? "以前の枝はキャッシュから外れたため、近傍を再取得します。" : meta.pages.length ? state.notice : meta.open === false && state.expansions[id] ? "取得済みの枝がないため近傍を取得します。" : state.notice === overviewLabels().notSaved ? state.notice : null,
      expansions: { ...state.expansions, [id]: { ...meta, open: true, request, loading: true, error: null, blocked: false } } });
    pending.current.set(id, controller); commit(state);
    const valid = () => !controller.signal.aborted && generation.current === epoch && current.current.expansions[id]?.request === request && current.current.expansions[id]?.active;
    try {
      const page = state.relation ? await fetchAdjacentNeighbors(id, after, controller.signal, state.relation, state.revision ?? null)
        : await fetchNeighbors(id, after, controller.signal, state.predicates, state.contributionRoles ?? null, state.organizationPositions ?? null, state.eventRoles ?? null, ...(state.revision ? [state.revision] as const : []));
      if (!valid()) return;
      if (page.centerId !== id) throw new Error("Unexpected center");
      commit(mergePage(current.current, page, after));
    } catch (error) {
      if (!valid()) return;
      if (error instanceof ClientApiError && error.status === 409) { invalidate(); return; }
      const latest = current.current;
      commit({ ...latest, expansions: { ...latest.expansions, [id]: {
        ...(latest.expansions[id] ?? emptyExpansion()), loading: false, error: errorMessage(error),
      } } });
    } finally {
      if (pending.current.get(id) === controller) pending.current.delete(id);
    }
  }, [commit, checkRevision, invalidate]);

  const applyRelation = useCallback(async (entity: EntitySummary, input: RelationCondition, witness: MatchWitness | null = null, view: GraphView | null = null, signal?: AbortSignal) => {
    if (signal?.aborted) return false;
    const relation = normalizeRelationCondition(input);
    if (relation.type === "pattern" && entity.kind !== "work" || relation.type === "adjacent" && witness) { commit({ ...current.current, notice: "この対象・証拠には適用できない関係条件です。" }); return false; }
    pending.current.forEach(c => c.abort()); pending.current.clear(); setRelationLoading(false); generation.current += 1;
    const epoch = generation.current, controller = new AbortController(), old = current.current;
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    pending.current.set("$transition", controller); setRelationLoading(true);
    commit({ ...old, expansions: Object.fromEntries(Object.entries(old.expansions).map(([id, meta]) => [id, { ...meta, loading: false, request: meta.request + 1 }])),
      ...(old.execution?.type === "pattern" ? { execution: { ...old.execution, loading: false, request: old.execution.request + 1 } } : {}) });
    try {
      let next: GraphState;
      if (relation.type === "pattern") {
        const response = await fetchPatternGraph({ version: 1, dataset: "public-kg", rootId: entity.id, relation, revision: witness?.revision ?? null, operation: { type: "page", after: null, requiredWitness: witness } }, controller.signal);
        next = mergePatternPage(emptyPatternGraph(entity, relation, epoch), response, null);
      } else {
        const response = await fetchAdjacentNeighbors(entity.id, null, controller.signal, relation);
        next = mergePage({ ...emptyGraph(epoch), relation, conditionKey: relationConditionKey(relation), predicates: relation.predicates, contributionRoles: relation.contributionRoles,
          organizationPositions: relation.organizationPositions, eventRoles: relation.eventRoles, roots: [entity.id], centerId: entity.id, cacheNodes: { [entity.id]: entity } }, response);
      }
      if (controller.signal.aborted || generation.current !== epoch) return false;
      if (next.execution?.type === "pattern" && next.execution.blocked || Object.values(next.expansions).some(e => e.blocked)) throw new Error("Graph limit");
      setPrevious(captureExploration(old, selection, view)); setViewRestoration(null); stale.current = false; setDataChanged(false);
      commit(next); setSelection({ kind: "entity", id: entity.id }); return true;
    } catch (error) {
      if (!controller.signal.aborted && generation.current === epoch) {
        if (error instanceof ClientApiError && error.status === 409) invalidate();
        else commit({ ...current.current, notice: errorMessage(error) });
      }
      return false;
    } finally { signal?.removeEventListener("abort", abort); if (pending.current.get("$transition") === controller) { pending.current.delete("$transition"); setRelationLoading(false); } }
  }, [commit, invalidate, selection]);
  const cancelRelation = useCallback(() => { pending.current.get("$transition")?.abort(); pending.current.delete("$transition"); setRelationLoading(false); }, []);
  const loadPattern = useCallback(async (restore = false) => {
    const state = current.current, ex = state.execution;
    if (state.relation?.type !== "pattern" || ex?.type !== "pattern" || !state.revision || pending.current.has("$transition") || pending.current.has("$pattern") || !restore && (stale.current || !ex.hasMore)) return;
    const controller = new AbortController(), epoch = generation.current, request = ex.request + 1;
    pending.current.set("$pattern", controller); commit({ ...state, execution: { ...ex, request, loading: true, error: null, blocked: false } });
    const valid = () => !controller.signal.aborted && generation.current === epoch && current.current.execution?.type === "pattern" && current.current.execution.request === request;
    try {
      const required = ex.requiredRoute ? ex.routes[ex.requiredRoute]?.route : null;
      const response = await fetchPatternGraph({ version: 1, dataset: "public-kg", rootId: state.centerId!, relation: state.relation, revision: restore ? null : state.revision,
        operation: restore ? { type: "restore", routes: Object.values(ex.routes).map(r => r.route), observedRevision: state.revision, candidateBoundary: ex.candidateBoundary }
          : { type: "page", after: ex.nextCursor, requiredWitness: required ? { version: 1, dataset: "public-kg", revision: state.revision, conditionKey: state.conditionKey, route: required } : null } }, controller.signal);
      if (!valid()) return;
      const next = restore ? restorePatternGraph(current.current, response) : mergePatternPage(current.current, response, ex.nextCursor);
      commit(next);
      if (restore && next.execution?.type === "pattern" && !next.execution.blocked) { stale.current = false; setDataChanged(false); }
    } catch (error) {
      if (!valid()) return;
      if (error instanceof ClientApiError && error.status === 409) { invalidate(); return; }
      const latest = current.current;
      if (latest.execution?.type === "pattern") commit({ ...latest, execution: { ...latest.execution, loading: false, error: errorMessage(error) } });
    } finally { if (pending.current.get("$pattern") === controller) pending.current.delete("$pattern"); }
  }, [commit, invalidate]);
  const openPatternRoutes = useCallback(async (keys: string[]) => {
    const state = current.current, ex = state.execution;
    if (ex?.type !== "pattern" || keys.some(key => !ex.routes[key]) || stale.current || pending.current.has("$transition")) return;
    for (const id of ["$pattern", "$route"]) { pending.current.get(id)?.abort(); pending.current.delete(id); }
    commit({ ...state, execution: { ...ex, loading: false, request: ex.request + 1 } });
    const epoch = generation.current, controller = new AbortController(); pending.current.set("$route", controller);
    try { await checkRevision(state.revision!, controller.signal); if (!controller.signal.aborted && generation.current === epoch) commit(setPatternRoutesOpen(current.current, keys, true)); }
    catch (error) { if (!controller.signal.aborted && generation.current === epoch) { if (error instanceof ClientApiError && error.status === 409) invalidate(); else commit({ ...current.current, notice: errorMessage(error) }); } }
    finally { if (pending.current.get("$route") === controller) pending.current.delete("$route"); }
  }, [checkRevision, commit, invalidate]);
  const togglePatternRoute = useCallback(async (key: string) => {
    const state = current.current, ex = state.execution;
    if (ex?.type !== "pattern" || !ex.routes[key] || stale.current || pending.current.has("$transition")) return;
    if (!ex.routes[key].open) { await openPatternRoutes([key]); return; }
    for (const id of ["$pattern", "$route"]) { pending.current.get(id)?.abort(); pending.current.delete(id); }
    commit(setPatternRouteOpen(state, key, false));
  }, [commit, openPatternRoutes]);

  const chooseRoot = useCallback((entity: EntitySummary, resetConditions = false) => {
    if (!resetConditions && current.current.relation) { void applyRelation(entity, current.current.relation); return; }
    setRelationLoading(false);
    stale.current = false; setDataChanged(false); setPrevious(null); setViewRestoration(null);
    pending.current.forEach((controller) => controller.abort()); pending.current.clear(); setRelationLoading(false);
    generation.current += 1;
    const predicates = resetConditions ? null : current.current.predicates;
    const eventRoles = resetConditions ? null : current.current.eventRoles ?? null;
    const organizationPositions = resetConditions ? null : current.current.organizationPositions ?? null;
    const contributionRoles = resetConditions ? null : current.current.contributionRoles ?? null;
    commit(projectGraph({ ...emptyGraph(generation.current), predicates, contributionRoles, organizationPositions, eventRoles, conditionKey: explorationKey(predicates, contributionRoles, organizationPositions, eventRoles), roots: [entity.id], centerId: entity.id, cacheNodes: { [entity.id]: entity } }));
    setSelection({ kind: "entity", id: entity.id }); void expand(entity.id);
  }, [commit, expand, applyRelation]);
  const switchRoot = useCallback((entity: EntitySummary, mode: "broad" | "same", view: GraphView | null) => {
    if (mode === "same" && current.current.relation) { void applyRelation(entity, current.current.relation, null, view); return; }
    setRelationLoading(false);
    const old = current.current;
    const predicates = mode === "broad" ? null : old.predicates;
    const eventRoles = mode === "broad" ? null : old.eventRoles ?? null;
    const organizationPositions = mode === "broad" ? null : old.organizationPositions ?? null;
    const contributionRoles = mode === "broad" ? null : old.contributionRoles ?? null;
    const conditionKey = explorationKey(predicates, contributionRoles, organizationPositions, eventRoles);
    if (old.centerId === entity.id && old.conditionKey === conditionKey) return;
    const snapshot = captureExploration(old, selection, view);
    stale.current = false; setDataChanged(false); setPrevious(snapshot); setViewRestoration(null);
    pending.current.forEach((controller) => controller.abort()); pending.current.clear(); setRelationLoading(false);
    generation.current += 1;
    commit(projectGraph({ ...emptyGraph(generation.current), predicates, contributionRoles, organizationPositions, eventRoles, conditionKey,
      roots: [entity.id], centerId: entity.id, cacheNodes: { [entity.id]: entity },
      notice: old.centerId && !snapshot ? overviewLabels().notSaved : null }));
    setSelection({ kind: "entity", id: entity.id }); void expand(entity.id);
  }, [commit, expand, selection, applyRelation]);
  const restorePrevious = useCallback(() => {
    if (!previous) return;
    cancelRelation();
    const snapshot = previous, restoreEpoch = generation.current;
    const restore = () => {
      if (generation.current !== restoreEpoch) return;
      stale.current = false; setDataChanged(false);
      pending.current.forEach(controller => controller.abort()); pending.current.clear(); setRelationLoading(false);
      generation.current += 1;
      setPrevious(null);
      setViewRestoration(snapshot.view ? { generation: generation.current, view: snapshot.view } : null);
      commit(projectGraph({ ...snapshot.graph, generation: generation.current, notice: overviewLabels().restored }));
      setSelection(snapshot.selection);
    };
    if (!snapshot.graph.revision) { restore(); return; }
    void checkRevision(snapshot.graph.revision, new AbortController().signal).then(restore).catch(error => {
      if (generation.current !== restoreEpoch) return;
      // 一時的な取得失敗では復帰先を保持。版の失効だけを破棄する。
      if (error instanceof ClientApiError && error.status === 409) setPrevious(null);
      commit({ ...current.current, notice: error instanceof ClientApiError && error.status === 409 ? dataReleaseLabels().changed : errorMessage(error) });
    });
  }, [commit, previous, checkRevision, cancelRelation]);
  const openSavedView = useCallback((entity: EntitySummary, values: ViewConditions, view: GraphView | null) => {
    const conditions = viewConditionsSchema.parse(values);
    const snapshot = captureExploration(current.current, selection, view);
    stale.current = false; setDataChanged(false); setPrevious(snapshot); setViewRestoration(null);
    pending.current.forEach(controller => controller.abort()); pending.current.clear(); setRelationLoading(false);
    generation.current += 1;
    commit(projectGraph({ ...emptyGraph(generation.current), ...conditions,
      conditionKey: explorationKey(conditions.predicates, conditions.contributionRoles, conditions.organizationPositions, conditions.eventRoles),
      roots: [entity.id], centerId: entity.id, cacheNodes: { [entity.id]: entity },
      notice: current.current.centerId && !snapshot ? overviewLabels().notSaved : null,
    }));
    setSelection({ kind: "entity", id: entity.id }); void expand(entity.id);
  }, [commit, expand, selection]);
  const openWorkspace = useCallback((workspace: RebuiltWorkspace, view: GraphView | null) => {
    stale.current = false; setDataChanged(false);
    setPrevious(captureExploration(current.current, selection, view));
    pending.current.forEach(controller => controller.abort()); pending.current.clear(); setRelationLoading(false);
    generation.current += 1;
    setViewRestoration(workspace.view ? { generation: generation.current, view: workspace.view } : null);
    commit({ ...workspace.graph, generation: generation.current, notice: workspace.revisionChanged ? relationText("ja").changed : workspaceLabels().restored(workspace.skippedBranches) });
    setSelection(workspace.graph.centerId ? { kind: "entity", id: workspace.selectedEntityId ?? workspace.graph.centerId } : null);
  }, [commit, selection]);
  const changePredicates = useCallback((values: PredicateFilter, roleValues: ContributionRoleFilter = current.current.contributionRoles ?? null, positionValues: OrganizationPositionFilter = current.current.organizationPositions ?? null, eventRoleValues: EventRoleFilter = current.current.eventRoles ?? null, view: GraphView | null = null) => {
    if (current.current.relation) { commit({ ...current.current, notice: "この探索の条件編集はまだ未対応です。自由探索へ明示的に切り替えてください。" }); return; }
    const predicates = normalizePredicates(values);
    const eventRoles = normalizeEventRoles(eventRoleValues, predicates);
    const organizationPositions = normalizeOrganizationPositions(positionValues, predicates);
    const contributionRoles = normalizeContributionRoles(roleValues, predicates);
    if (explorationKey(predicates, contributionRoles, organizationPositions, eventRoles) === explorationKey(current.current.predicates, current.current.contributionRoles ?? null, current.current.organizationPositions ?? null, current.current.eventRoles ?? null)) return;
    const snapshot = captureExploration(current.current, selection, view);
    stale.current = false; setDataChanged(false); setPrevious(snapshot); setViewRestoration(null);
    const rootId = current.current.centerId;
    const root = rootId ? current.current.cacheNodes[rootId] : null;
    pending.current.forEach((controller) => controller.abort()); pending.current.clear(); setRelationLoading(false);
    generation.current += 1;
    commit(projectGraph({ ...emptyGraph(generation.current), predicates, contributionRoles, organizationPositions, eventRoles, conditionKey: explorationKey(predicates, contributionRoles, organizationPositions, eventRoles),
      centerId: rootId, roots: rootId ? [rootId] : [], cacheNodes: root ? { [root.id]: root } : {},
      notice: root && !snapshot ? overviewLabels().notSaved : explorationLabels().changed }));
    setSelection(root ? { kind: "entity", id: root.id } : null);
    if (root) void expand(root.id);
  }, [commit, expand, selection]);
  const inspectEntity = useCallback((id: string) => {
    if (current.current.nodes[id]) setSelection({ kind: "entity", id });
  }, []);
  const selectEntity = useCallback((id: string) => {
    if (!current.current.nodes[id]) return;
    setSelection({ kind: "entity", id }); void expand(id);
  }, [expand]);
  const selectClaim = useCallback((id: string) => {
    if (current.current.claims[id]) setSelection({ kind: "claim", id });
  }, []);
  const selectRelation = useCallback((id: string) => {
    if (displayRelations(current.current.claims)[id]) setSelection({ kind: "relation", id });
  }, []);
  const close = useCallback((id: string) => {
    if (pending.current.has("$transition")) return;
    if (current.current.execution?.type === "pattern") for (const key of ["$pattern", "$route"]) { pending.current.get(key)?.abort(); pending.current.delete(key); }
    commit(closeExpansion(current.current, id));
  }, [commit]);
  const toggleEntity = useCallback((id: string) => {
    if (!current.current.nodes[id]) return;
    if (current.current.execution?.type === "pattern") { if (patternNodeOpen(current.current, id)) close(id); else { const key = nextPatternRoute(current.current, id); if (key) void openPatternRoutes(current.current.execution.collapsedNodes?.[id] ?? [key]); } return; }
    if (current.current.expansions[id]?.open) close(id); else void expand(id);
  }, [close, expand, openPatternRoutes]);
  const openNextPatternRoute = useCallback((id: string) => {
    if (!current.current.nodes[id]) return;
    const key = nextPatternRoute(current.current, id);
    if (key) void togglePatternRoute(key);
  }, [togglePatternRoute]);
  const reloadData = useCallback(() => {
    const state = current.current;
    if (state.execution?.type === "pattern") { void loadPattern(true); return; }
    const root = state.centerId ? state.cacheNodes[state.centerId] : null;
    if (root) chooseRoot(root);
  }, [chooseRoot, loadPattern]);
  return { openNextPatternRoute, applyRelation, cancelRelation, relationLoading, loadPattern, togglePatternRoute, invalidateData: invalidate, dataChanged, reloadData, graph, selection, previous, viewRestoration, switchRoot, restorePrevious, openSavedView, openWorkspace, changePredicates, chooseRoot, inspectEntity, selectEntity, selectClaim, selectRelation, expand, close, toggleEntity };
}
