"use client";
import Icon from "./Icon";
import { designLabels } from "../lib/i18n/design";
import { contentMessage } from "../lib/i18n/content";
import { useUiLocale } from "../lib/client/ui-locale";
import { explorerLabels, explorerMessage } from "../lib/i18n/explorer";
import { useSearchParams } from "next/navigation";
import ReferenceReader from "./ReferenceReader";
import SiteHeader from "./SiteHeader";
import { parseReadingLocation, withoutReadingReference } from "../lib/client/reading-reference";
import { explorerPaneLabels } from "../lib/i18n/explorer-panes";
import { entryLabels } from "../lib/i18n/exploration-entry";
import { contributionLabels } from "../lib/i18n/contribution";
import { explorationLabels } from "../lib/i18n/exploration";

import type { DatasetMode } from "../lib/domain/dataset";
import { datasetLabels } from "../lib/i18n/dataset";
import type { EntitySummary } from "../lib/domain/api";
import { overviewLabels } from "../lib/i18n/entity-overview";
import EntityOverview from "./EntityOverview";
import { useEffect, useRef, useState } from "react";
import { displayRelations, entityLabel } from "../lib/client/graph-presentation";
import { relationLabel } from "../lib/client/format";
import { dataReleaseLabels } from "../lib/i18n/data-release";
import { useGraphExplorer } from "../lib/client/use-graph-explorer";
import RelationFilter from "./RelationFilter";
import SearchPanel from "./SearchPanel";
import StartExamples from "./StartExamples";
import GraphCanvas, { type GraphCanvasHandle } from "./GraphCanvas";
import GraphNavigator from "./GraphNavigator";
import GraphPath from "./GraphPath";
import RelationsList from "./RelationsList";
import EntityDetails from "./EntityDetails";
import ClaimDetails from "./ClaimDetails";
import styles from "./Explorer.module.css";
import CapsuleDialog from "./CapsuleDialog";
import { capsuleLabels } from "../lib/i18n/capsules";
import WorkspaceDialog from "./WorkspaceDialog";
import { workspaceLabels } from "../lib/i18n/workspace";
import SavedViews from "./SavedViews";
import { savedViewLabels } from "../lib/i18n/saved-views";

function GraphNotice({ message, transient }: { message: string; transient: boolean }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!transient) return;
    const timer = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(timer);
  }, [transient]);
  return visible ? <p className={styles.graphNotice} role="status">{message}</p> : null;
}

export default function Explorer({ dataset = "demo" }: { dataset?: DatasetMode }) {
  const searchParams = useSearchParams();
  const { locale } = useUiLocale();
  const ui = explorerLabels(locale);
  const reading = parseReadingLocation(searchParams, dataset);
  const closeReading = () => window.history.replaceState(null, "", withoutReadingReference(new URL(window.location.href)));
  const labels = datasetLabels(dataset, locale);
  const entry = entryLabels(locale);
  const panes = explorerPaneLabels(locale);
  const [activePane, setActivePane] = useState<"search" | "graph" | "detail">("search");
  const paneNavigation = useRef<HTMLElement>(null);
  const previousPane = useRef(activePane);
  useEffect(() => {
    if (previousPane.current === activePane) return;
    previousPane.current = activePane;
    // CSS alone controls the breakpoint; desktop keeps its existing focus behavior.
    if (paneNavigation.current?.getClientRects().length) {
      document.getElementById(`explorer-${activePane}`)?.focus({ preventScroll: true });
    }
  }, [activePane]);
  const canvas = useRef<GraphCanvasHandle>(null);
  const [overview, setOverview] = useState<EntitySummary | null>(null);
  const [capsuleOpen, setCapsuleOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [savedViewsOpen, setSavedViewsOpen] = useState(false);
  const [detailWide, setDetailWide] = useState(false);
  const { invalidateData, dataChanged, reloadData, graph, selection, previous, viewRestoration, switchRoot, restorePrevious, openSavedView, openWorkspace, changePredicates, chooseRoot, inspectEntity, selectEntity, selectClaim, selectRelation, expand, close, toggleEntity } = useGraphExplorer();
  const restricted = graph.predicates !== null || (graph.contributionRoles ?? null) !== null || (graph.organizationPositions ?? null) !== null || (graph.eventRoles ?? null) !== null;
  const switchFrom = (entity: EntitySummary, mode: "broad" | "same") => {
    switchRoot(entity, mode, canvas.current?.capture() ?? null); setOverview(null); setActivePane("graph");
  };
  const startFrom = (entity: EntitySummary, broad = false) => {
    chooseRoot(entity, broad); setActivePane("graph");
  };
  const inspectFromClaim = (id: string) => {
    inspectEntity(id); setActivePane("detail");
    // The clicked button is removed with ClaimDetails; keep keyboard focus in the reader.
    document.getElementById("explorer-detail")?.focus({ preventScroll: true });
    document.getElementById("explorer-detail")?.scrollTo({ top: 0 });
  };
  const relations = displayRelations(graph.claims, locale);
  const selectedRelation = selection?.kind === "relation" ? relations[selection.id] : null;
  const selectedEntity = selection?.kind === "entity" ? graph.nodes[selection.id] : null;
  const selectedClaim = selection?.kind === "claim" ? graph.claims[selection.id] : null;
  const selectionText = selectedEntity ? entityLabel(selectedEntity, graph.nodes, locale).replace("\n", " / ") : selectedClaim ? `${graph.nodes[selectedClaim.subjectId]?.name} → ${relationLabel(selectedClaim, locale)} → ${graph.nodes[selectedClaim.objectId]?.name}` : selectedRelation ? `${graph.nodes[selectedRelation.subjectId]?.name} → ${selectedRelation.label.replaceAll("\n", " / ")} → ${graph.nodes[selectedRelation.objectId]?.name}` : ui.unselected;
  const key = `${graph.generation}:${selection?.kind}:${selection?.id}`;
  const lastDetail = useRef<string | null>(null);
  useEffect(() => {
    if (activePane !== "detail" || !paneNavigation.current?.getClientRects().length) return;
    // 同じ根拠への往復は読書位置を保ち、別の対象は先頭から読む。
    if (lastDetail.current !== key) document.getElementById("explorer-detail")?.scrollTo({ top: 0 });
    lastDetail.current = key;
  }, [activePane, key]);
  const loading = Object.values(graph.expansions).filter((meta) => meta.loading).length;
  const feedbackKey = `${key}:${loading}:${selectedEntity ? graph.expansions[selectedEntity.id]?.open : ""}`;
  const blocked = Object.values(graph.expansions).find((meta) => meta.blocked);
  return <div className={styles.explorer}>
    <SiteHeader dataset={dataset} />
    <nav ref={paneNavigation} className={styles.paneNavigation} aria-label={panes.navigation}>
      {(["search", "graph", "detail"] as const).map(pane => <button key={pane} aria-pressed={activePane === pane} aria-controls={`explorer-${pane}`} onClick={() => setActivePane(pane)}><Icon name={pane === "search" ? "search" : pane === "graph" ? "graph" : "book"} />{panes[pane]}</button>)}
    </nav>
    <main data-active-pane={activePane} className={`${styles.columns} ${detailWide ? styles.wideDetails : ""}`}>
      <div id="explorer-search" role="group" tabIndex={-1} aria-label={panes.search} className={styles.panel}><SearchPanel placeholder={labels.searchExample} onChoose={startFrom} /><div lang={locale} className={styles.localActions}><h3>{designLabels(locale).tools}</h3><button onClick={() => setSavedViewsOpen(true)}><Icon name="bookmark" />{savedViewLabels(locale).launch}</button><button onClick={() => setWorkspaceOpen(true)}><Icon name="history" />{workspaceLabels(locale).launch}</button><button onClick={() => setCapsuleOpen(true)}><Icon name="capsule" />{capsuleLabels(locale).launch}</button></div><StartExamples dataset={dataset} onChoose={(entity) => startFrom(entity, true)} /></div>
      <div id="explorer-graph" role="group" tabIndex={-1} aria-label={panes.graph} className={styles.centralScroll}>
      <section className={`${styles.panel} ${styles.graphPanel}`} aria-labelledby="graph-title">
        <div className={styles.graphHeader}>
          <div className={styles.graphHeading}><h2 id="graph-title">Graph</h2>
            <p data-testid="graph-counts">Entity {Object.keys(graph.nodes).length} / Claim {Object.keys(graph.claims).length}</p><p data-testid="relation-counts">Relation {Object.keys(relations).length}</p>
          </div>
          <div className={styles.rootBar}><p className={styles.rootLabel} data-testid="exploration-root">{entry.root}：{graph.centerId ? graph.nodes[graph.centerId]?.name : entry.rootEmpty}</p>
            <div lang={locale} className={styles.rootSaveActions}><button onClick={() => setSavedViewsOpen(true)}><Icon name="bookmark" />{savedViewLabels(locale).launch}</button><button onClick={() => setWorkspaceOpen(true)}><Icon name="history" />{workspaceLabels(locale).launch}</button><button onClick={() => setCapsuleOpen(true)}><Icon name="capsule" />{capsuleLabels(locale).launch}</button></div>
            {previous && <button onClick={restorePrevious}>{overviewLabels(locale).restore}</button>}</div>
        </div>
        {dataChanged && <div role="alert" className={styles.error}><p>{dataReleaseLabels(locale).changed}</p><button onClick={reloadData}>{dataReleaseLabels(locale).reload}</button></div>}
        <RelationFilter eventRoles={graph.eventRoles ?? null} positions={graph.organizationPositions ?? null} roles={graph.contributionRoles ?? null} value={graph.predicates} onApply={(predicates, roles, positions, eventRoles) => changePredicates(predicates, roles, positions, eventRoles, canvas.current?.capture() ?? null)} />
        {!graph.centerId && <div className={styles.empty}><h3>{entry.initialTitle}</h3><p>{entry.initialHelp}</p></div>}
        {Object.values(graph.expansions).some((meta) => meta.active && meta.hasMore) && <p className={styles.muted}>{explorationLabels(locale).neighborsPageHelp}</p>}
        {blocked && <p role="alert" className={styles.error}>{explorerMessage(blocked.error!, locale)}</p>}
        <GraphCanvas navigation={<GraphNavigator compact key={graph.generation} nodes={graph.nodes} selection={selection} onNavigate={(id) => {
          inspectEntity(id); canvas.current?.focusEntity(id);
        }} />} ref={canvas} restoration={viewRestoration} interactionBlocked={!!overview || savedViewsOpen || workspaceOpen || capsuleOpen || !!reading} onEntityDoubleClick={(id) => { if (graph.nodes[id]) setOverview(graph.nodes[id]); }} graph={graph} selection={selection} onEntity={selectEntity} onRelation={(id) => { selectRelation(id); setActivePane("detail"); }} onToggleEntity={toggleEntity} feedback={<>
          <div className={`${styles.feedback} ${!graph.centerId ? styles.initialFeedback : ""}`} aria-live="polite"><div key={feedbackKey} className={styles.feedbackContent}><p data-testid="selection-status">{ui.selected}：{selectionText}</p><p>{loading ? ui.graphLoading(loading) : selectedEntity ? graph.expansions[selectedEntity.id]?.expanded ? ui.expanded : graph.expansions[selectedEntity.id]?.pages.length ? ui.closed : ui.expandHelp : ui.grouped}</p></div></div>
          {graph.notice && !dataChanged && <GraphNotice key={`${graph.generation}:${graph.clock}:${graph.notice}`} message={contentMessage(graph.notice, locale)} transient={graph.notice === "取得済みの枝を復元しました。" || graph.notice === overviewLabels("ja").restored} />}
        </>} />
        <p className={styles.graphUsageHelp}>{entry.selectedHelp}</p>
          <button className={styles.compactLink} disabled={!selection} onClick={() => {
            document.getElementById("explorer-relations")?.scrollIntoView({ block: "start" });
            document.getElementById("explorer-relations")?.focus({ preventScroll: true });
          }}>{panes.toRelations}</button>
        {Object.values(graph.claims).some((claim) => claim.contribution?.roleId) && <p className={styles.muted}>{contributionLabels(locale).partial}</p>}
        <RelationsList dataset={dataset} graph={graph} selection={selection} onEntity={selectEntity} onClaim={(id) => { selectClaim(id); setActivePane("detail"); }} onExpand={(id, more) => void expand(id, more)} onClose={close} />
      </section>
      </div>
      <aside id="explorer-detail" tabIndex={-1} className={styles.panel} aria-labelledby="detail-title">
        <div className={styles.detailHeading}><h2 id="detail-title"><Icon name="book" />{ui.detail}</h2>{selection && <button aria-pressed={detailWide} onClick={() => setDetailWide(!detailWide)}>{detailWide ? entry.detailNormal : entry.detailWide}</button>}</div>
        {!selection && <p className={styles.muted}>{entry.detailHelp}</p>}
        {selectedEntity && <EntityDetails dataset={dataset} key={key} entity={selectedEntity} expansion={graph.expansions[selectedEntity.id]} onExpand={(more) => void expand(selectedEntity.id, more)} onClose={() => close(selectedEntity.id)} restricted={restricted} onOverview={() => setOverview(selectedEntity)} onSwitch={(mode) => switchFrom(selectedEntity, mode)} />}
        {selectedEntity && graph.centerId && <GraphPath key={`path:${key}`} nodes={graph.nodes} relations={relations} rootId={graph.centerId} targetId={selectedEntity.id} onRelation={(id) => {
          selectRelation(id); setActivePane("detail");
          document.getElementById("explorer-detail")?.focus({ preventScroll: true });
          document.getElementById("explorer-detail")?.scrollTo({ top: 0 });
        }} />}
        {selectedRelation && <ClaimDetails onDataChanged={invalidateData} revision={graph.revision} dataset={dataset} key={`${key}:${selectedRelation.claimIds[0]}`} id={selectedRelation.claimIds[0]} nodes={graph.nodes} onInspectEntity={inspectFromClaim} mode="relation" visibleClaimIds={selectedRelation.claimIds} visibleClaims={selectedRelation.claimIds.map(id => graph.claims[id])} eventRoles={graph.eventRoles ?? null} positions={graph.organizationPositions ?? null} roles={graph.contributionRoles ?? null} predicates={graph.predicates} />}
        {selection?.kind === "claim" && <ClaimDetails onDataChanged={invalidateData} revision={graph.revision} dataset={dataset} key={key} id={selection.id} nodes={graph.nodes} claimSummary={selectedClaim ?? undefined} onInspectEntity={inspectFromClaim} eventRoles={graph.eventRoles ?? null} positions={graph.organizationPositions ?? null} roles={graph.contributionRoles ?? null} predicates={graph.predicates} />}
      </aside>
    </main>
    {reading && <ReferenceReader key={searchParams.toString()} location={reading} dataset={dataset} onClose={closeReading} onExplore={entity => {
      switchFrom(entity, "broad"); closeReading();
    }} />}
    {overview && <EntityOverview key={overview.id} entity={overview} dataset={dataset} restricted={restricted} onClose={() => setOverview(null)} onSwitch={(mode) => switchFrom(overview, mode)} />}
    {capsuleOpen && <CapsuleDialog dataset={dataset} graph={graph} onClose={() => setCapsuleOpen(false)} />}
    {workspaceOpen && <WorkspaceDialog dataset={dataset} graph={graph} captureView={() => canvas.current?.capture() ?? null}
      onClose={() => setWorkspaceOpen(false)} onOpen={workspace => {
        openWorkspace(workspace, canvas.current?.capture() ?? null); setActivePane("graph");
      }} />}
    {savedViewsOpen && <SavedViews dataset={dataset} root={graph.centerId ? graph.nodes[graph.centerId] : null}
      conditions={{ predicates: graph.predicates, contributionRoles: graph.contributionRoles ?? null, organizationPositions: graph.organizationPositions ?? null, eventRoles: graph.eventRoles ?? null }}
      onClose={() => setSavedViewsOpen(false)} onOpen={(entity, conditions) => {
        openSavedView(entity, conditions, canvas.current?.capture() ?? null); setActivePane("graph");
      }} />}
  </div>;
}
