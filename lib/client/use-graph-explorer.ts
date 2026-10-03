"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EntitySummary } from "../domain/api";
import { displayRelations } from "./graph-presentation";
import { fetchNeighbors, errorMessage } from "./api";
import { closeExpansion, reopenExpansion, projectGraph, emptyExpansion, emptyGraph, mergePage, type GraphState, type Selection } from "./graph-state";

export function useGraphExplorer() {
  const [graph, setGraph] = useState<GraphState>(emptyGraph);
  const [selection, setSelection] = useState<Selection>(null);
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
    return () => { requests.forEach((controller) => controller.abort()); requests.clear(); };
  }, []);

  const expand = useCallback(async (id: string, more = false) => {
    let state = current.current;
    const meta = state.expansions[id] ?? emptyExpansion();
    if (!state.nodes[id] || pending.current.has(id)) return;
    if (!more && meta.pages.length && !meta.open) {
      commit(reopenExpansion(state, id)); return;
    }
    if (more ? !meta.expanded || !meta.hasMore : meta.expanded) return;
    const epoch = generation.current;
    const controller = new AbortController();
    const request = meta.request + 1;
    const after = more ? meta.nextCursor : null;
    state = projectGraph({ ...state, notice: state.evictedIds.includes(id) ? "以前の枝はキャッシュから外れたため、近傍を再取得します。" : meta.pages.length ? state.notice : meta.open === false && state.expansions[id] ? "取得済みの枝がないため近傍を取得します。" : null,
      expansions: { ...state.expansions, [id]: { ...meta, open: true, request, loading: true, error: null, blocked: false } } });
    pending.current.set(id, controller); commit(state);
    const valid = () => !controller.signal.aborted && generation.current === epoch && current.current.expansions[id]?.request === request && current.current.expansions[id]?.active;
    try {
      const page = await fetchNeighbors(id, after, controller.signal);
      if (!valid()) return;
      if (page.centerId !== id) throw new Error("Unexpected center");
      commit(mergePage(current.current, page, after));
    } catch (error) {
      if (!valid()) return;
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
    commit(projectGraph({ ...emptyGraph(generation.current), roots: [entity.id], centerId: entity.id, cacheNodes: { [entity.id]: entity } }));
    setSelection({ kind: "entity", id: entity.id }); void expand(entity.id);
  }, [commit, expand]);
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
  return { graph, selection, chooseRoot, selectEntity, selectClaim, selectRelation, expand, close };
}
