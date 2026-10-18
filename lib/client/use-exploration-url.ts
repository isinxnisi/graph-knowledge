"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { parsePathWitness } from "../domain/discovery-paths";
import { publicLocalePath } from "../domain/public-routes";
import type { DatasetMode } from "../domain/dataset";
import type { GraphState } from "./graph-state";
import type { GraphView } from "./graph-view";
import { captureWorkspace, workspaceSchema, restartWorkspace, type SavedWorkspace, type RebuiltWorkspace } from "./saved-workspace";
import { assertUrlReplayable, decodeExploration, explorationHref, ExplorationUrlError, rebuildExplorationUrl, URL_STATE_TARGET, URL_STATE_LIMIT, isWorkspaceLoading } from "./exploration-url";
import { explorationUrlLabels } from "../i18n/exploration-url";
import { WorkspaceError, WorkspaceRootNotFound } from "./saved-workspace";

export function useExplorationUrl({ dataset, initialRoot, graph, capture, apply, locale }: {
  dataset: DatasetMode; initialRoot?: string; graph: GraphState; capture: () => GraphView | null;
  apply: (value: RebuiltWorkspace) => void; locale: "ja" | "en";
}) {
  const [busy, setBusy] = useState(!!initialRoot);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const restartRequested = useRef<number | null>(null);
  const [canRestart, setCanRestart] = useState(false);
  const savedInput = useRef<SavedWorkspace | null>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef({ graph, capture, apply, dataset, locale });
  const restoring = useRef(!!initialRoot);
  const failed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { latest.current = { graph, capture, apply, dataset, locale }; });
  const update = useCallback(() => {
    const { graph, capture, dataset, locale } = latest.current;
    const labels = explorationUrlLabels(locale);
    if (restoring.current || failed.current || !graph.centerId || new URLSearchParams(location.search).has("read")) return false;
    try {
      const view = capture(); if (!view) return false;
      const rawHref = explorationHref(captureWorkspace(dataset, "URL", graph, view));
      const href = (publicLocalePath(rawHref.split("?")[0], location.pathname.startsWith("/en") ? "en" : "ja") ?? rawHref.split("?")[0]) + rawHref.slice(rawHref.indexOf("?"));
      if (href.length > URL_STATE_LIMIT) throw new ExplorationUrlError("limit");
      assertUrlReplayable(graph, view);
      // Native History integrates with Next searchParams without adding history entries.
      if (`${location.pathname}${location.search}` !== href) history.replaceState(history.state, "", href);
      document.title = `${graph.cacheNodes[graph.centerId]?.name ?? graph.centerId} — ${labels.pageTitle}`;
      setReady(true);
      setNotice(href.length + location.origin.length > URL_STATE_TARGET
        ? labels.long : "");
      return true;
    } catch (error) {
      if (isWorkspaceLoading(error)) { setReady(false); return false; }
      setReady(false);
      setNotice((error instanceof ExplorationUrlError || error instanceof WorkspaceError) && error.reason === "limit" ? labels.limit : error instanceof ExplorationUrlError && error.reason === "changed" ? labels.detached : labels.updateFailed);
      return false;
    }
  }, []);
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(update, 350);
  }, [update]);
  useEffect(() => { schedule(); }, [graph, locale, schedule]);
  useEffect(() => {
    window.addEventListener("pagehide", update);
    return () => { window.removeEventListener("pagehide", update); if (timer.current) clearTimeout(timer.current); };
  }, [update]);
  useEffect(() => {
    const restartThisAttempt = restartRequested.current === attempt;
    const rootId = initialRoot ?? /^(?:\/en)?\/explore\/([^/]+)$/.exec(location.pathname)?.[1];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    restoring.current = true; failed.current = false;
    let disposed = false;
    void (async () => {
      await Promise.resolve();
      if (disposed) return;
      setBusy(!!rootId);
      try {
        if (!rootId) {
          if (["s", "via"].some(key => new URLSearchParams(location.search).has(key))) throw new ExplorationUrlError("invalid");
          return;
        }
        if (!z.uuidv4().safeParse(rootId).success) throw new ExplorationUrlError("invalid");
        const params = new URLSearchParams(location.search);
        if (params.getAll("s").length > 1) throw new ExplorationUrlError("invalid");
        const encoded = params.get("s");
        const workspace = encoded !== null ? decodeExploration(encoded, rootId, dataset) : workspaceSchema.parse({
          version: 1 as const, dataset, id: rootId, rootId, title: "URL", savedAt: "2000-01-01T00:00:00.000Z",
          conditions: { predicates: null, contributionRoles: null, organizationPositions: null, eventRoles: null },
          branches: [{ id: rootId, open: true, pages: 1 }], view: null,
        });
        let witness;
        try {
          if (params.getAll("via").length > 1 || params.has("via") && (dataset !== "public-kg" || location.pathname.length + location.search.length > URL_STATE_LIMIT)) throw Error();
          witness = parsePathWitness(params.get("via"),rootId);
        } catch { throw new ExplorationUrlError("invalid"); }
        savedInput.current = workspace;
        setCanRestart(workspace.relation.type === "pattern");
        const rebuilt = restartThisAttempt ? await restartWorkspace(workspace, controller.signal) : await rebuildExplorationUrl(workspace, controller.signal,witness);
        controller.signal.throwIfAborted();
        latest.current.apply(rebuilt);
        setFailure(null); setReady(true);
      } catch (error) {
        if (disposed) return;
        failed.current = true;
        const labels = explorationUrlLabels(latest.current.locale);
        setFailure(error instanceof WorkspaceRootNotFound ? labels.rootMissing
          : error instanceof ExplorationUrlError && error.reason === "dataset" ? labels.dataset
            : error instanceof ExplorationUrlError && error.reason === "invalid" ? labels.invalid : error instanceof ExplorationUrlError && error.reason === "changed" && new URLSearchParams(location.search).has("via") ? labels.pathChanged : labels.restoreFailed);
      } finally {
        clearTimeout(timeout);
        if (!disposed) { restoring.current = false; setBusy(false); schedule(); }
      }
    })();
    return () => { disposed = true; clearTimeout(timeout); controller.abort(); };
    // Restore only on entry/retry, never in response to our own replaceState.
  }, [initialRoot, dataset, attempt, schedule]);
  return { busy, failure, notice, ready, schedule, flush: update, canRestart, restart: () => { if (savedInput.current?.relation.type === "pattern") { setBusy(true); setFailure(null); restartRequested.current = attempt + 1; setAttempt(a => a + 1); } }, retry: () => { restartRequested.current = null; setBusy(true); setFailure(null); setAttempt(a => a + 1); },
    abandon: () => { failed.current = false; setFailure(null); history.replaceState(history.state, "", location.pathname.startsWith("/en") ? "/en" : "/"); },
    copy: async () => { if (!update()) return; try { await navigator.clipboard.writeText(location.href); setNotice(explorationUrlLabels(locale).copied); } catch { setNotice(explorationUrlLabels(locale).manualCopy); } } };
}
