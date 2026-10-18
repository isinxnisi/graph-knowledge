"use client";
import { focusDestination } from "../lib/client/focus-destination";
import { graphNoticePresentation } from "../lib/client/graph-notice";
import GraphNotice from "./GraphNotice";
import DiscoveryHome from "./DiscoveryHome";
import type { DiscoveryHomeData } from "../lib/domain/discovery-home";
import { discoveryHomeLabels } from "../lib/i18n/discovery-home";
import Icon from "./Icon";
import PublicServices, { type PublicServicesHandle } from "./PublicServices";
import type { PublicServicesPolicy } from "../lib/domain/publication";
import { trackPublicEvent } from "../lib/client/public-events";
import { rememberExplorationReturn } from "../lib/client/account-navigation";
import { explorationUrlLabels } from "../lib/i18n/exploration-url";
import { useExplorationUrl } from "../lib/client/use-exploration-url";
import { designLabels } from "../lib/i18n/design";
import { useUiLocale } from "../lib/client/ui-locale";
import { explorerLabels, explorerMessage } from "../lib/i18n/explorer";
import { useRouter, useSearchParams } from "next/navigation";
import ReferenceReader from "./ReferenceReader";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import { parseReadingLocation, withoutReadingReference } from "../lib/client/reading-reference";
import { explorerPaneLabels } from "../lib/i18n/explorer-panes";
import { entryLabels } from "../lib/i18n/exploration-entry";
import { explorationLabels } from "../lib/i18n/exploration";

import type { DatasetMode } from "../lib/domain/dataset";
import { datasetLabels } from "../lib/i18n/dataset";
import type { EntitySummary } from "../lib/domain/api";
import { overviewLabels } from "../lib/i18n/entity-overview";
import EntityOverview from "./EntityOverview";
import { useCallback, useEffect, useRef, useState } from "react";
import { displayRelations, entityLabel } from "../lib/client/graph-presentation";
import { relationLabel } from "../lib/client/format";
import { dataReleaseLabels } from "../lib/i18n/data-release";
import { useGraphExplorer } from "../lib/client/use-graph-explorer";
import { graphRelation, freeRelation } from "../lib/client/relation-state";
import { relationText } from "../lib/i18n/relation-condition";
import PatternRoutes from "./PatternRoutes";
import RelationFilter from "./RelationFilter";
import SearchPanel from "./SearchPanel";
import DiscoverySearch from "./DiscoverySearch";
import type { DiscoveryCriteria } from "../lib/client/use-discovery-search";
import { discoveryExplorationHref } from "../lib/client/discovery-navigation";
import StartExamples from "./StartExamples";
import GraphCanvas, { type GraphCanvasHandle } from "./GraphCanvas";
import GraphNavigator from "./GraphNavigator";
import DiscoveryGraphRoute from "./DiscoveryGraphRoute";
import type { PathWitness } from "../lib/domain/discovery-paths";
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

export default function Explorer({ dataset = "demo", initialRoot, services, publicOverview, discoveryHome }: { dataset?: DatasetMode; initialRoot?: string; services?: PublicServicesPolicy; publicOverview?: import("react").ReactNode; discoveryHome?: DiscoveryHomeData }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { locale } = useUiLocale();
  const ui = explorerLabels(locale);
  const reading = parseReadingLocation(searchParams, dataset);
  const closeReading = () => {
    window.history.replaceState(null, "", withoutReadingReference(new URL(window.location.href)));
    urlState.schedule();
  };
  const labels = datasetLabels(dataset, locale);
  const entry = entryLabels(locale);
  const panes = explorerPaneLabels(locale);
  const [activePane, setActivePane] = useState<"search" | "graph" | "detail">(discoveryHome || initialRoot ? "graph" : "search");
  const paneNavigation = useRef<HTMLElement>(null);
  const previousPane = useRef(activePane);
  const paneFocusRequested = useRef(false);
  const moveToPane = (pane: "search" | "graph" | "detail") => {
    paneFocusRequested.current = pane !== activePane;
    setActivePane(pane);
  };
  useEffect(() => {
    if (previousPane.current === activePane) return;
    previousPane.current = activePane;
    // CSS alone controls the breakpoint; desktop keeps its existing focus behavior.
    if (paneNavigation.current?.getClientRects().length && (paneFocusRequested.current || document.activeElement !== document.body)) {
      focusDestination(document.getElementById(`explorer-${activePane}`));
    }
    paneFocusRequested.current = false;
  }, [activePane]);
  const canvas = useRef<GraphCanvasHandle>(null);
  const publicServices = useRef<PublicServicesHandle>(null);
  const [discoveryCriteria, setDiscoveryCriteria] = useState<DiscoveryCriteria | null>(null);
  const closeDiscovery = useCallback((source?: string | null) => {
    setDiscoveryCriteria(null);
    if (source === "list" || source === "more" || source === "search") setActivePane("search");
    else if (source === "home") setActivePane("graph");
  }, []);
  useEffect(() => {
    const sync = () => {
      const value = window.history.state?.plunodeDiscovery;
      setDiscoveryCriteria(value && typeof value.q === "string" ? value : null);
    };
    const timer = setTimeout(sync, 0); window.addEventListener("popstate", sync);
    return () => { clearTimeout(timer); window.removeEventListener("popstate", sync); };
  }, []);
  const [overview, setOverview] = useState<EntitySummary | null>(null);
  const [capsuleOpen, setCapsuleOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [savedViewsOpen, setSavedViewsOpen] = useState(false);
  const [detailWide, setDetailWide] = useState(false);
  const [detailReturn, setDetailReturn] = useState<{ generation: number; entityId: string; source: { kind: "claim" | "relation"; id: string } } | null>(null);
  const { applyRelation, cancelRelation, relationLoading, loadPattern, togglePatternRoute, invalidateData, dataChanged, reloadData, graph, selection, previous, viewRestoration, switchRoot, restorePrevious, openSavedView, openWorkspace, changePredicates, chooseRoot, inspectEntity, selectEntity, selectClaim, selectRelation, expand, close, toggleEntity } = useGraphExplorer();
  const [discoveryRoute, setDiscoveryRoute] = useState<{path: PathWitness; conditionKey: string} | null>(null);
  const urlState = useExplorationUrl({ dataset, initialRoot, graph, locale, capture: () => canvas.current?.capture() ?? null, apply: value => { setDiscoveryRoute(value.discoveryPath ? { path: value.discoveryPath, conditionKey: value.graph.conditionKey } : null); openWorkspace(value, canvas.current?.capture() ?? null); setActivePane("graph"); } });
  const [navigationError, setNavigationError] = useState(false);
  const beforeAccountNavigation = () => {
    if (graph.centerId && !urlState.flush()) { setNavigationError(true); return false; }
    rememberExplorationReturn(); setNavigationError(false); return true;
  };
  const openDiscovery = (criteria: DiscoveryCriteria) => {
    if (graph.centerId && !urlState.flush()) { setNavigationError(true); return; }
    setDiscoveryCriteria(criteria);
  };
  const restricted = graph.predicates !== null || (graph.contributionRoles ?? null) !== null || (graph.organizationPositions ?? null) !== null || (graph.eventRoles ?? null) !== null;
  const switchFrom = (entity: EntitySummary, mode: "broad" | "same") => {
    switchRoot(entity, mode, canvas.current?.capture() ?? null); setOverview(null); moveToPane("graph");
  };
  const startFrom = (entity: EntitySummary, broad = false) => {
    trackPublicEvent("explore_start");
    // A real route entry keeps Home and Graph distinct for browser Back/Forward.
    if (discoveryHome && !graph.centerId && !initialRoot) {
      router.push(`${locale === "en" ? "/en" : ""}/explore/${entity.id}`);
      return;
    }
    chooseRoot(entity, broad); moveToPane("graph");
  };
  const inspectFromClaim = (id: string) => {
    if (selection && selection.kind !== "entity") setDetailReturn({ generation: graph.generation, entityId: id, source: { kind: selection.kind, id: selection.id } });
    inspectEntity(id); moveToPane("detail");
    // The clicked button is removed with ClaimDetails; keep keyboard focus in the reader.
    focusDestination(document.getElementById("explorer-detail"));
    document.getElementById("explorer-detail")?.scrollTo({ top: 0 });
  };
  const relations = displayRelations(graph.claims, locale);
  // A reader return belongs to this graph and this endpoint, not a later search or selection.
  const returnTarget = detailReturn && !dataChanged && detailReturn.generation === graph.generation && selection?.kind === "entity" && selection.id === detailReturn.entityId
    && (detailReturn.source.kind === "relation" ? relations[detailReturn.source.id] : graph.claims[detailReturn.source.id]) ? detailReturn.source : null;
  if (detailReturn && !returnTarget) setDetailReturn(null);
  const returnToDetail = () => {
    if (!returnTarget) return;
    if (returnTarget.kind === "relation") selectRelation(returnTarget.id); else selectClaim(returnTarget.id);
    setDetailReturn(null); moveToPane("detail");
    focusDestination(document.getElementById("explorer-detail"));
    document.getElementById("explorer-detail")?.scrollTo({ top: 0 });
  };
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
  const patternExecution = graph.execution?.type === "pattern" ? graph.execution : null;
  const loading = Object.values(graph.expansions).filter((meta) => meta.loading).length + (patternExecution?.loading ? 1 : 0) + (relationLoading ? 1 : 0);
  const feedbackKey = `${key}:${loading}:${selectedEntity ? graph.expansions[selectedEntity.id]?.open : ""}`;
  const blocked = Object.values(graph.expansions).find((meta) => meta.blocked);
  const notice = !dataChanged ? graphNoticePresentation(graph.notice, locale) : null;
  const atHome = !!discoveryHome && !graph.centerId && !initialRoot;
  return <><div className={styles.explorer}>
    <SiteHeader dataset={dataset} onBeforeAccountNavigation={beforeAccountNavigation} onPrivacySettings={services && (services.ads || services.analytics) ? () => publicServices.current?.openSettings() : undefined} />
    {navigationError && <p role="alert">{locale === "en" ? "The exploration is not ready to restore. Wait for loading to finish, or save the workspace before leaving." : "探索を復元できる状態にできませんでした。取得の完了を待つか、探索途中を保存してから移動してください。"}</p>}
    <nav ref={paneNavigation} className={styles.paneNavigation} aria-label={panes.navigation}>
      {(["search", "graph", "detail"] as const).map(pane => <button key={pane} aria-label={pane === "graph" && atHome ? discoveryHomeLabels(locale).home : panes[pane]} aria-pressed={activePane === pane} aria-controls={`explorer-${pane}`} onClick={() => moveToPane(pane)}><Icon name={pane === "search" ? "search" : pane === "graph" ? "graph" : "book"} /><span>{pane === "detail" ? ui.detail : pane === "graph" && atHome ? discoveryHomeLabels(locale).home : panes[pane]}</span></button>)}
    </nav>
    <div lang={locale} aria-live="polite">{urlState.busy && <p role="status">{explorationUrlLabels(locale).restoring}</p>}{urlState.failure && <div role="alert" className={styles.error}><p>{urlState.failure}</p><button onClick={urlState.retry}>{explorationUrlLabels(locale).retry}</button>{urlState.canRestart && <button onClick={urlState.restart}>{relationText(locale).restart}</button>}<button onClick={urlState.abandon}>{explorationUrlLabels(locale).abandon}</button></div>}</div>
    <main inert={urlState.busy || !!urlState.failure} data-active-pane={activePane} className={`${styles.columns} ${detailWide ? styles.wideDetails : ""}`}>
      <div id="explorer-search" role="group" tabIndex={-1} data-focus-destination aria-label={panes.search} className={styles.panel}><SearchPanel placeholder={labels.searchExample} onChoose={startFrom} onDiscover={openDiscovery} /><div lang={locale} className={styles.localActions}><h3>{designLabels(locale).tools}</h3><button onClick={() => setSavedViewsOpen(true)}><Icon name="bookmark" />{savedViewLabels(locale).launch}</button><button onClick={() => setWorkspaceOpen(true)}><Icon name="history" />{workspaceLabels(locale).launch}</button><button onClick={() => setCapsuleOpen(true)}><Icon name="capsule" />{capsuleLabels(locale).launch}</button></div><StartExamples dataset={dataset} onChoose={(entity) => startFrom(entity, true)} /></div>
      <div id="explorer-graph" role="group" tabIndex={-1} data-focus-destination data-discovery-home={atHome || undefined} aria-label={panes.graph} className={styles.centralScroll}>
      {atHome && <DiscoveryHome data={discoveryHome} onDiscover={() => openDiscovery({ q: "", kind: null, presentation: "explore" })} onSearch={() => {
        moveToPane("search");
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#explorer-search input")?.focus({ preventScroll: true }));
      }} />}
      <section hidden={atHome} className={`${styles.panel} ${styles.graphPanel}`} aria-labelledby="graph-title">
        <div className={styles.graphHeader}>
          <div className={styles.graphHeading}><h2 id="graph-title">Graph</h2>
            <p data-testid="graph-counts">Entity {Object.keys(graph.nodes).length} / Claim {Object.keys(graph.claims).length}</p><p data-testid="relation-counts">Relation {Object.keys(relations).length}</p>
          </div>
          <div className={styles.rootBar}><p className={styles.rootLabel} data-testid="exploration-root">{entry.root}：{graph.centerId ? graph.nodes[graph.centerId]?.name : entry.rootEmpty}</p>
            <button className={styles.copyExploration} aria-label={explorationUrlLabels(locale).copy} title={explorationUrlLabels(locale).copy} disabled={!urlState.ready || urlState.busy || !!urlState.failure || loading > 0} onClick={() => void urlState.copy()}><Icon name="copy" /><span>{explorationUrlLabels(locale).copy}</span></button><div lang={locale} className={styles.rootSaveActions}><button onClick={() => setSavedViewsOpen(true)}><Icon name="bookmark" />{savedViewLabels(locale).launch}</button><button onClick={() => setWorkspaceOpen(true)}><Icon name="history" />{workspaceLabels(locale).launch}</button><button onClick={() => setCapsuleOpen(true)}><Icon name="capsule" />{capsuleLabels(locale).launch}</button></div>
            {previous && <button className={styles.restoreExploration} aria-label={overviewLabels(locale).restore} title={overviewLabels(locale).restore} onClick={restorePrevious}><Icon name="back" /><span>{overviewLabels(locale).restore}</span></button>}</div>
        </div>
        {urlState.notice && <p role="status" className={styles.muted}>{urlState.notice}</p>}
        {dataChanged && <div role="alert" className={styles.error}><p>{dataReleaseLabels(locale).changed}</p><button onClick={reloadData}>{dataReleaseLabels(locale).reload}</button></div>}
        <RelationFilter relation={graph.relation} patternAllowed={dataset === "public-kg" && !!graph.centerId && graph.cacheNodes[graph.centerId]?.kind === "work"}
          onCancelRelation={cancelRelation} onApplyRelation={graph.centerId ? relation => applyRelation(graph.cacheNodes[graph.centerId!], relation, null, canvas.current?.capture() ?? null) : undefined} eventRoles={graph.eventRoles ?? null} positions={graph.organizationPositions ?? null} roles={graph.contributionRoles ?? null} value={graph.predicates} onApply={(predicates, roles, positions, eventRoles) => changePredicates(predicates, roles, positions, eventRoles, canvas.current?.capture() ?? null)} />
        {patternExecution && <div className={styles.patternModeAction}><button disabled={relationLoading || patternExecution.loading} onClick={() => { if (graph.centerId) void applyRelation(graph.cacheNodes[graph.centerId], freeRelation(graphRelation(graph)), null, canvas.current?.capture() ?? null); }}>{relationText(locale).free}</button><span className={styles.muted}>{relationText(locale).freeHelp}</span></div>}
        {relationLoading && <p role="status">{relationText(locale).applying} <button onClick={cancelRelation}>{entry.cancel}</button></p>}
        {!graph.centerId && <div className={styles.empty}><h3>{entry.initialTitle}</h3><p>{entry.initialHelp}</p></div>}
        {Object.values(graph.expansions).some((meta) => meta.active && meta.hasMore) && <p className={styles.muted}>{explorationLabels(locale).neighborsPageHelp}</p>}
        {blocked && <p role="alert" className={styles.error}>{explorerMessage(blocked.error!, locale)}</p>}
        {notice?.kind === "warning" && <GraphNotice notice={notice} />}
        <GraphCanvas notification={notice?.kind === "info" ? <GraphNotice key={`${graph.generation}:${graph.notice}`} notice={notice} /> : null} compactGuide footerAction={<button className={styles.adjacentJump} disabled={!selection} onClick={() => {
          document.getElementById("explorer-relations")?.scrollIntoView({ block: "start" });
          focusDestination(document.getElementById("explorer-relations"));
        }}>{panes.toRelations}<Icon name="chevron" /></button>} onViewChange={urlState.schedule} navigation={<GraphNavigator compact key={graph.generation} nodes={graph.nodes} selection={selection} onNavigate={(id) => {
          inspectEntity(id); canvas.current?.focusEntity(id);
        }} />} ref={canvas} restoration={viewRestoration} interactionBlocked={relationLoading || !!discoveryCriteria || !!overview || savedViewsOpen || workspaceOpen || capsuleOpen || !!reading} onEntityDoubleClick={(id) => { if (graph.nodes[id]) setOverview(graph.nodes[id]); }} graph={graph} selection={selection} onEntity={selectEntity} onRelation={id => { selectRelation(id); if (matchMedia("(min-width: 801px)").matches) trackPublicEvent("relation_detail"); }} onRelationDoubleClick={(id) => { selectRelation(id); moveToPane("detail"); if (matchMedia("(max-width: 800px)").matches) trackPublicEvent("relation_detail"); }} onToggleEntity={id => { if (!graph.expansions[id]?.open) trackPublicEvent("graph_expand"); toggleEntity(id); }} feedback={<>
          <div className={`${styles.feedback} ${!graph.centerId ? styles.initialFeedback : ""}`} aria-live="polite"><div key={feedbackKey} className={styles.feedbackContent}><p data-testid="selection-status">{ui.selected}：{selectionText}</p><p>{loading ? ui.graphLoading(loading) : selectedEntity ? patternExecution ? relationText(locale).help : graph.expansions[selectedEntity.id]?.expanded ? ui.expanded : graph.expansions[selectedEntity.id]?.pages.length ? ui.closed : ui.expandHelp : <><span className={styles.desktopRelationHelp}>{ui.grouped}</span><span className={styles.touchRelationHelp}>{entry.touchRelationHelp}</span></>}</p></div></div>
        </>} />
      </section>
      {services && (services.ads || services.analytics) && <PublicServices ref={publicServices} inline active={activePane === "graph" && !atHome} policy={services} beforeNavigation={beforeAccountNavigation} />}
      <section hidden={atHome} className={`${styles.panel} ${styles.adjacencyPanel}`} data-testid="adjacency-card">
        {patternExecution ? <PatternRoutes graph={graph} disabled={relationLoading || dataChanged} onToggle={key => void togglePatternRoute(key)} onMore={() => void loadPattern()}
          onClaim={id => { selectClaim(id); moveToPane("detail"); }} /> : <RelationsList dataset={dataset} graph={graph} selection={selection} onEntity={selectEntity} onClaim={(id) => { selectClaim(id); moveToPane("detail"); }} onExpand={(id, more) => void expand(id, more)} onClose={close} />}
      </section>
      </div>
      <aside id="explorer-detail" tabIndex={-1} data-focus-destination className={styles.panel} aria-labelledby="detail-title">
        <div className={styles.detailHeading}><h2 id="detail-title" className={returnTarget ? styles.srOnly : undefined}><Icon name="book" />{ui.detail}</h2>{returnTarget && <button className={styles.detailBack} onClick={returnToDetail}><Icon name="back" />{returnTarget.kind === "relation" ? panes.backToRelation : panes.backToClaim}</button>}{selection && <button aria-pressed={detailWide} onClick={() => setDetailWide(!detailWide)}>{detailWide ? entry.detailNormal : entry.detailWide}</button>}</div>
        {!selection && <p className={styles.muted}>{entry.detailHelp}</p>}
        {discoveryRoute && discoveryRoute.conditionKey === graph.conditionKey && <DiscoveryGraphRoute path={discoveryRoute.path} graph={graph} onClear={() => setDiscoveryRoute(null)} onClaim={id => { selectClaim(id); moveToPane("detail"); }} />}
        {selectedEntity && <EntityDetails pattern={!!patternExecution} dataset={dataset} key={key} entity={selectedEntity} expansion={graph.expansions[selectedEntity.id]} onExpand={(more) => void expand(selectedEntity.id, more)} onClose={() => close(selectedEntity.id)} restricted={restricted} onOverview={() => setOverview(selectedEntity)} onSwitch={(mode) => switchFrom(selectedEntity, mode)} />}
        {selectedEntity && graph.centerId && <GraphPath key={`path:${key}`} nodes={graph.nodes} relations={relations} rootId={graph.centerId} targetId={selectedEntity.id} onRelation={(id) => {
          selectRelation(id); moveToPane("detail");
          focusDestination(document.getElementById("explorer-detail"));
          document.getElementById("explorer-detail")?.scrollTo({ top: 0 });
        }} />}
        {selectedRelation && <ClaimDetails onDataChanged={invalidateData} revision={graph.revision} dataset={dataset} key={`${key}:${selectedRelation.claimIds[0]}`} id={selectedRelation.claimIds[0]} nodes={graph.nodes} onInspectEntity={inspectFromClaim} mode="relation" visibleClaimIds={selectedRelation.claimIds} visibleClaims={selectedRelation.claimIds.map(id => graph.claims[id])} eventRoles={graph.eventRoles ?? null} positions={graph.organizationPositions ?? null} roles={graph.contributionRoles ?? null} predicates={graph.predicates} />}
        {selection?.kind === "claim" && <ClaimDetails onDataChanged={invalidateData} revision={graph.revision} dataset={dataset} key={key} id={selection.id} nodes={graph.nodes} claimSummary={selectedClaim ?? undefined} onInspectEntity={inspectFromClaim} eventRoles={graph.eventRoles ?? null} positions={graph.organizationPositions ?? null} roles={graph.contributionRoles ?? null} predicates={graph.predicates} />}
      </aside>
    </main>
    {discoveryCriteria && <DiscoverySearch presetBrowser={searchParams.get("discovery") === "presets"} dataset={dataset} initial={discoveryCriteria} onClose={closeDiscovery} onChoose={(entity, predicates, roles) => {
      if (predicates === undefined) { startFrom(entity); return; }
      trackPublicEvent("explore_start");
      if (discoveryHome && !graph.centerId && !initialRoot) router.push(`${locale === "en" ? "/en" : ""}${discoveryExplorationHref(dataset, entity.id, predicates, roles ?? null)}`);
      else { openSavedView(entity, { predicates, contributionRoles: roles ?? null, organizationPositions: null, eventRoles: null }, canvas.current?.capture() ?? null); moveToPane("graph"); }
    }} />}
    {reading && <ReferenceReader key={searchParams.toString()} location={reading} dataset={dataset} onClose={closeReading} onExplore={entity => {
      switchFrom(entity, "broad"); closeReading();
    }} />}
    {overview && <EntityOverview key={overview.id} entity={overview} dataset={dataset} restricted={restricted} onClose={() => setOverview(null)} onSwitch={(mode) => switchFrom(overview, mode)} />}
    {capsuleOpen && <CapsuleDialog onBeforeAccountNavigation={beforeAccountNavigation} dataset={dataset} graph={graph} onClose={() => setCapsuleOpen(false)} />}
    {workspaceOpen && <WorkspaceDialog dataset={dataset} graph={graph} captureView={() => canvas.current?.capture() ?? null}
      onClose={() => setWorkspaceOpen(false)} onOpen={workspace => {
        openWorkspace(workspace, canvas.current?.capture() ?? null); moveToPane("graph");
      }} />}
    {savedViewsOpen && <SavedViews relation={graphRelation(graph)} onOpenRelation={async (entity, relation, signal) => { const applied = await applyRelation(entity, relation, null, canvas.current?.capture() ?? null, signal); if (applied) moveToPane("graph"); return applied; }} dataset={dataset} root={graph.centerId ? graph.nodes[graph.centerId] : null}
      conditions={{ predicates: graph.predicates, contributionRoles: graph.contributionRoles ?? null, organizationPositions: graph.organizationPositions ?? null, eventRoles: graph.eventRoles ?? null }}
      onClose={() => setSavedViewsOpen(false)} onOpen={(entity, conditions) => {
        openSavedView(entity, conditions, canvas.current?.capture() ?? null); moveToPane("graph");
      }} />}
  </div>{(!initialRoot || !graph.centerId || initialRoot === graph.centerId) && publicOverview}<SiteFooter languagePath={graph.centerId || initialRoot ? `/explore/${graph.centerId ?? initialRoot}` : "/"} beforeNavigation={beforeAccountNavigation} /></>;
}
