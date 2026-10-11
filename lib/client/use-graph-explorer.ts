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
import { ClientApiError, fetchDatasetRevision, fetchNeighbors, errorMessage } from "./api";
import { closeExpansion, reopenExpansion, projectGraph, emptyExpansion, emptyGraph, mergePage, type GraphState, type Selection } from "./graph-state";

export function useGraphExplorer() {
  const [graph, setGraph] = useState<GraphState>(emptyGraph);
  const [selection, setSelection] = useState<Selection>(null);
  const [dataChanged, setDataChanged] = useState(false);
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
    if (stale.current) return;
    pending.current.forEach(controller => controller.abort()); pending.current.clear(); generation.current += 1;
    stale.current = true; setDataChanged(true);
    const state = current.current;
    commit({ ...state, notice: dataReleaseLabels().changed, expansions: Object.fromEntries(Object.entries(state.expansions).map(([id, meta]) => [id, { ...meta, loading: false }])) });
  }, [commit]);
  const checkRevision = useCallback(async (revision: string, signal: AbortSignal) => {
    if ((await fetchDatasetRevision(signal)).revision !== revision) throw new ClientApiError(dataReleaseLabels().changed, 409);
  }, []);
  const expand = useCallback(async (id: string, more = false) => {
    if (stale.current) return;
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
      const page = await fetchNeighbors(id, after, controller.signal, state.predicates, state.contributionRoles ?? null, state.organizationPositions ?? null, state.eventRoles ?? null, ...(state.revision ? [state.revision] as const : []));
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

  const chooseRoot = useCallback((entity: EntitySummary, resetConditions = false) => {
    stale.current = false; setDataChanged(false); setPrevious(null); setViewRestoration(null);
    pending.current.forEach((controller) => controller.abort()); pending.current.clear();
    generation.current += 1;
    const predicates = resetConditions ? null : current.current.predicates;
    const eventRoles = resetConditions ? null : current.current.eventRoles ?? null;
    const organizationPositions = resetConditions ? null : current.current.organizationPositions ?? null;
    const contributionRoles = resetConditions ? null : current.current.contributionRoles ?? null;
    commit(projectGraph({ ...emptyGraph(generation.current), predicates, contributionRoles, organizationPositions, eventRoles, conditionKey: explorationKey(predicates, contributionRoles, organizationPositions, eventRoles), roots: [entity.id], centerId: entity.id, cacheNodes: { [entity.id]: entity } }));
    setSelection({ kind: "entity", id: entity.id }); void expand(entity.id);
  }, [commit, expand]);
  const switchRoot = useCallback((entity: EntitySummary, mode: "broad" | "same", view: GraphView | null) => {
    const old = current.current;
    const predicates = mode === "broad" ? null : old.predicates;
    const eventRoles = mode === "broad" ? null : old.eventRoles ?? null;
    const organizationPositions = mode === "broad" ? null : old.organizationPositions ?? null;
    const contributionRoles = mode === "broad" ? null : old.contributionRoles ?? null;
    const conditionKey = explorationKey(predicates, contributionRoles, organizationPositions, eventRoles);
    if (old.centerId === entity.id && old.conditionKey === conditionKey) return;
    const snapshot = captureExploration(old, selection, view);
    stale.current = false; setDataChanged(false); setPrevious(snapshot); setViewRestoration(null);
    pending.current.forEach((controller) => controller.abort()); pending.current.clear();
    generation.current += 1;
    commit(projectGraph({ ...emptyGraph(generation.current), predicates, contributionRoles, organizationPositions, eventRoles, conditionKey,
      roots: [entity.id], centerId: entity.id, cacheNodes: { [entity.id]: entity },
      notice: old.centerId && !snapshot ? overviewLabels().notSaved : null }));
    setSelection({ kind: "entity", id: entity.id }); void expand(entity.id);
  }, [commit, expand, selection]);
  const restorePrevious = useCallback(() => {
    if (!previous) return;
    const snapshot = previous, restoreEpoch = generation.current;
    const restore = () => {
      if (generation.current !== restoreEpoch) return;
      stale.current = false; setDataChanged(false);
      pending.current.forEach(controller => controller.abort()); pending.current.clear();
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
  }, [commit, previous, checkRevision]);
  const openSavedView = useCallback((entity: EntitySummary, values: ViewConditions, view: GraphView | null) => {
    const conditions = viewConditionsSchema.parse(values);
    const snapshot = captureExploration(current.current, selection, view);
    stale.current = false; setDataChanged(false); setPrevious(snapshot); setViewRestoration(null);
    pending.current.forEach(controller => controller.abort()); pending.current.clear();
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
    pending.current.forEach(controller => controller.abort()); pending.current.clear();
    generation.current += 1;
    setViewRestoration(workspace.view ? { generation: generation.current, view: workspace.view } : null);
    commit({ ...workspace.graph, generation: generation.current, notice: workspaceLabels().restored(workspace.skippedBranches) });
    setSelection(workspace.graph.centerId ? { kind: "entity", id: workspace.graph.centerId } : null);
  }, [commit, selection]);
  const changePredicates = useCallback((values: PredicateFilter, roleValues: ContributionRoleFilter = current.current.contributionRoles ?? null, positionValues: OrganizationPositionFilter = current.current.organizationPositions ?? null, eventRoleValues: EventRoleFilter = current.current.eventRoles ?? null, view: GraphView | null = null) => {
    const predicates = normalizePredicates(values);
    const eventRoles = normalizeEventRoles(eventRoleValues, predicates);
    const organizationPositions = normalizeOrganizationPositions(positionValues, predicates);
    const contributionRoles = normalizeContributionRoles(roleValues, predicates);
    if (explorationKey(predicates, contributionRoles, organizationPositions, eventRoles) === explorationKey(current.current.predicates, current.current.contributionRoles ?? null, current.current.organizationPositions ?? null, current.current.eventRoles ?? null)) return;
    const snapshot = captureExploration(current.current, selection, view);
    stale.current = false; setDataChanged(false); setPrevious(snapshot); setViewRestoration(null);
    const rootId = current.current.centerId;
    const root = rootId ? current.current.cacheNodes[rootId] : null;
    pending.current.forEach((controller) => controller.abort()); pending.current.clear();
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
  const close = useCallback((id: string) => commit(closeExpansion(current.current, id)), [commit]);
  const toggleEntity = useCallback((id: string) => {
    if (!current.current.nodes[id]) return;
    if (current.current.expansions[id]?.open) close(id); else void expand(id);
  }, [close, expand]);
  const reloadData = useCallback(() => {
    const state = current.current;
    const root = state.centerId ? state.cacheNodes[state.centerId] : null;
    if (root) chooseRoot(root);
  }, [chooseRoot]);
  return { invalidateData: invalidate, dataChanged, reloadData, graph, selection, previous, viewRestoration, switchRoot, restorePrevious, openSavedView, openWorkspace, changePredicates, chooseRoot, inspectEntity, selectEntity, selectClaim, selectRelation, expand, close, toggleEntity };
}
