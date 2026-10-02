"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EntitySummary } from "../domain/api";
import { fetchNeighbors, errorMessage } from "./api";
import { emptyExpansion, emptyGraph, mergePage, type GraphState, type Selection } from "./graph-state";

export function useGraphExplorer() {
  const [graph, setGraph] = useState<GraphState>(emptyGraph);
  const [selection, setSelection] = useState<Selection>(null);
  const current = useRef(graph);
  const generation = useRef(0);
  const pending = useRef(new Map<string, AbortController>());
  const commit = useCallback((next: GraphState) => { current.current = next; setGraph(next); }, []);

  useEffect(() => {
    const requests = pending.current;
    return () => { requests.forEach((controller) => controller.abort()); requests.clear(); };
  }, []);

  const expand = useCallback(async (id: string, more = false) => {
    const state = current.current;
    const meta = state.expansions[id] ?? emptyExpansion();
    if (!state.nodes[id] || pending.current.has(id) || meta.blocked) return;
    if (more ? !meta.expanded || !meta.hasMore : meta.expanded) return;
    const epoch = generation.current;
    const controller = new AbortController();
    pending.current.set(id, controller);
    commit({ ...state, expansions: { ...state.expansions, [id]: { ...meta, loading: true, error: null } } });
    try {
      const page = await fetchNeighbors(id, more ? meta.nextCursor : null, controller.signal);
      if (controller.signal.aborted || generation.current !== epoch) return;
      if (page.centerId !== id) throw new Error("Unexpected center");
      commit(mergePage(current.current, page));
    } catch (error) {
      if (controller.signal.aborted || generation.current !== epoch) return;
      const latest = current.current;
      commit({ ...latest, expansions: { ...latest.expansions, [id]: {
        ...(latest.expansions[id] ?? emptyExpansion()), loading: false, error: errorMessage(error),
      } } });
    } finally {
      if (pending.current.get(id) === controller) pending.current.delete(id);
    }
  }, [commit]);

  const chooseRoot = useCallback((entity: EntitySummary) => {
    pending.current.forEach((controller) => controller.abort()); pending.current.clear();
    generation.current += 1;
    commit({ ...emptyGraph(generation.current), centerId: entity.id, nodes: { [entity.id]: entity } });
    setSelection({ kind: "entity", id: entity.id });
    void expand(entity.id);
  }, [commit, expand]);
  const selectEntity = useCallback((id: string) => {
    if (!current.current.nodes[id]) return;
    setSelection({ kind: "entity", id });
    void expand(id);
  }, [expand]);
  const selectClaim = useCallback((id: string) => {
    if (current.current.claims[id]) setSelection({ kind: "claim", id });
  }, []);

  return { graph, selection, chooseRoot, selectEntity, selectClaim, expand };
}
