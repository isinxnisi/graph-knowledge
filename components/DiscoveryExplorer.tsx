"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { EntitySummary } from "../lib/domain/api";
import { CONTRIBUTION_ROLE_IDS } from "../lib/domain/contribution";
import { initialContext, prototypeSeeds, questionsForWorld, questionNames, questionPredicates, readPrototypeContext, resolveDiscovery, WORLD_IDS, worldNames, type DiscoveryContext, type QuestionId } from "../lib/domain/discovery-prototype";
import DiscoveryPresetBrowser, { PresetModeSwitch } from "./DiscoveryPresetBrowser";
import { catalogWorkspaceSchema, initialCatalogWorkspace, presetCatalog, type CatalogPreset, type CatalogWorkspace } from "../lib/domain/discovery-preset-catalog";
import { executeDiscoveryPlan, usePrototypeQuery } from "../lib/client/use-discovery-prototype";
import { useUiLocale } from "../lib/client/ui-locale";
import { explorationHref } from "../lib/client/exploration-url";
import { contributionLabels } from "../lib/i18n/contribution";
import { localizedPublicHref } from "../lib/domain/public-routes";
import DiscoveryPaths from "./DiscoveryPaths";
import { rebasePathUi } from "../lib/domain/discovery-path-state";
import { resolvePathPreset, type PathPresetRef } from "../lib/domain/discovery-path-presets";
import { pathScope, pathUiSchema, type PathUi } from "../lib/domain/discovery-paths";
import DiscoveryClaimRow from "./DiscoveryClaimRow";
import Icon from "./Icon";
import DiscoveryWorldIcon from "./DiscoveryWorldIcon";
import type { DiscoveryCriteria } from "../lib/client/use-discovery-search";
import type { PredicateFilter } from "../lib/domain/exploration";
import { focusDestination } from "../lib/client/focus-destination";
import { useDialogDismiss } from "../lib/client/use-dialog-dismiss";
import { useDialogBackdrop } from "../lib/client/use-dialog-backdrop";
import DiscoveryListPanel from "./DiscoveryListPanel";
import styles from "./DiscoveryExplorer.module.css";
import DiscoveryConnections from "./DiscoveryConnections";
import { connectionsWorkspaceSchema, initialConnectionsWorkspace, type ConnectionsWorkspace } from "../lib/domain/discovery-connections";
import { useDiscoveryHistory } from "../lib/client/use-discovery-history";
type Entry = "connections" | "worlds" | "list";
type Variant = "staged" | "tabs";
type Label = readonly [string, string];
const textOf = (value: Label, locale: string) => value[locale === "en" ? 1 : 0];
const relationChoices = ["connections", "credits", "affiliations", "influences"] as const;
const relationNames: Record<typeof relationChoices[number], Label> = { connections: ["すべて", "All"], credits: ["制作", "Production"], affiliations: ["所属", "Affiliation"], influences: ["影響", "Influence"] };
type GraphHref = (id: string, all?: boolean) => string;

function Seed({ seed, preset = false, requiredKind, onChoose }: { seed: typeof prototypeSeeds[number]; preset?: boolean; requiredKind?: EntitySummary["kind"]; onChoose: (entity: EntitySummary) => void }) {
  const { locale } = useUiLocale(), en = locale === "en";
  const query = usePrototypeQuery({ state: "ready", operation: "neighbors", anchorId: seed.id, predicate: questionPredicates[seed.question]!, role: null }, null);
  const data = query.result, name = data?.anchor?.name ?? (seed.world === "manga" ? "PLUTO" : seed.id === prototypeSeeds[1].id ? "Princeton" : en ? "Niels Bohr Institute" : "ニールス・ボーア研究所");
  const people = data ? [...new Set(data.claims.map(claim => data.nodes.find(node => node.id === (claim.subjectId === seed.id ? claim.objectId : claim.subjectId))?.name).filter(Boolean))].slice(0, 2).join(" · ") : "";
  const title = seed.world === "manga" ? ["PLUTOのつくり手", "Who made PLUTO?"] : seed.id === prototypeSeeds[1].id ? ["Princetonの人々", "People at Princeton"] : ["研究所で出会う", "Meet through NBI"];
  const action = preset ? (en ? "Start with " + title[1] + ": subject and relation" : title[0] + "から始める：対象と関係を設定") : en ? "Use " + name + " as subject" : name + "を対象にする";
  return <span className={preset ? styles.preset : styles.seed} data-seed={seed.id}>
    <button disabled={!data?.anchor || !data.claims.length || !!requiredKind && data.anchor.kind !== requiredKind} onClick={() => onChoose(data!.anchor!)} aria-label={action}>
      {preset ? <>
        <span className={styles.presetMark}><DiscoveryWorldIcon world={seed.world}/></span>
        <span className={styles.presetContent}><strong>{title[en ? 1 : 0]}</strong><span className={styles.presetPeople}>{people || (data ? (en ? "No records for this relation" : "この関係の公開記録はありません") : query.error ? (en ? "Unable to verify" : "接点を確認できませんでした") : en ? "Checking public records…" : "公開記録を確認中…")}</span><small>{textOf(relationNames[seed.question], locale)}{en ? " records" : "の記録"}<Icon name="arrow"/></small></span>
      </> : name}
    </button>{query.error && <button onClick={query.retry}>{en ? "Retry example" : "例を再確認"}</button>}
  </span>;
}

export default function DiscoveryExplorer({ lab = false, presetBrowser = false, initial = { q: "", kind: null, presentation: "explore" }, onClose, onChoose }: {
  lab?: boolean; presetBrowser?: boolean; initial?: DiscoveryCriteria; onClose?: (source?: string | null) => void; onChoose?: (entity: EntitySummary, predicates?: PredicateFilter, roles?: import("../lib/domain/exploration").ContributionRoleFilter) => void;
}) {
  const { locale, setLocale } = useUiLocale(), en = locale === "en";
  const t = (ja: string, english: string) => en ? english : ja;
  const [catalog, setCatalog] = useState<CatalogWorkspace>(initialCatalogWorkspace);
  const [connectionFlow,setConnectionFlow]=useState<ConnectionsWorkspace>(initialConnectionsWorkspace);
  const [catalogBusy, setCatalogBusy] = useState(false), [catalogError, setCatalogError] = useState<string | null>(null);
  const catalogRestore = useRef<number | null>(null);
  const catalogRequest = useRef<AbortController | null>(null);
  const [context, setContext] = useState<DiscoveryContext>(initialContext);
  const [pathUi,setPathUi] = useState<PathUi>({scope:"",open:false,depth:2,selected:null});
  const [lookupOpen, setLookupOpen] = useState(false), [lookupQ, setLookupQ] = useState("");
  const [undo, setUndo] = useState<{ context: DiscoveryContext; label: Label; lookupOpen: boolean; lookupQ: string; pathUi: PathUi; reader?: "records" | "paths" } | null>(null);
  const [entry, setEntry] = useState<Entry>(!lab && initial.presentation !== "explore" ? "list" : "connections"), [variant, setVariant] = useState<Variant>("tabs");
  const preview = presetBrowser && entry === "connections";
  const browsingPresets = preview && catalog.mode === "presets";
  const pendingPreset = presetCatalog.find(p => p.id === catalog.pending);
  const initialInput = useRef(initial), selected = useRef(false), returnFocus = useRef<string | null>(null);
  const [listCriteria, setListCriteria] = useState(initial), [listCursors, setListCursors] = useState<(string | null)[]>([null]);
  const [ready, setReady] = useState(false), [composing, setComposing] = useState(false), [cursors, setCursors] = useState<(string | null)[]>([null]);
  const dialog = useRef<HTMLDialogElement>(null), body = useRef<HTMLDivElement>(null), launch = useRef<HTMLButtonElement>(null);
  const basePlan = resolveDiscovery(context);
  // Name lookup changes the visible operation, while keeping all exploration criteria.
  const names = (preview && catalog.mode === "names") || lookupOpen || (!context.anchor && basePlan.state !== "unsupported");
  const plan = names ? lookupQ.trim() ? { state: "ready" as const, operation: "names" as const, q: lookupQ.trim() } : { state: "needs-name" as const } : basePlan;
  const query = usePrototypeQuery(ready && entry !== "list" && !browsingPresets && !preview ? plan : { state: "needs-anchor" }, names ? null : cursors.at(-1)!, composing && names);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const resumed = !!window.history.state?.plunodeDiscovery;
    const origin = resumed ? window.history.state?.discoveryReturnFocus : previousFocus?.dataset.discoveryLaunch;
    returnFocus.current = ["home", "list", "more", "search"].includes(origin) ? origin : null;
    if (!lab && !resumed) window.history.pushState({ ...window.history.state, plunodeDiscovery: initialInput.current, discoveryReturnFocus: returnFocus.current }, "", window.location.href);
    const pop = () => { if (!window.history.state?.plunodeDiscovery) onClose?.(returnFocus.current); };
    if (!lab) window.addEventListener("popstate", pop);
    const element = dialog.current!;
    const timer = setTimeout(() => {
      let saved = lab ? window.history.state?.discoveryPrototype : resumed ? window.history.state?.discoveryWorkspace : null;
      if (lab && !saved) { try { saved = JSON.parse(sessionStorage.getItem("plunode.discovery-prototype.v1") ?? "null"); } catch { /* Optional storage. */ } }
      if (saved) {
        if(presetBrowser){const flow=connectionsWorkspaceSchema.safeParse(saved.connectionFlow);if(flow.success)setConnectionFlow(flow.data);}
        if (presetBrowser) { const restoredCatalog = catalogWorkspaceSchema.safeParse(saved.catalog); if (restoredCatalog.success) {setCatalog(restoredCatalog.data);if(restoredCatalog.data.mode === "presets")catalogRestore.current=restoredCatalog.data.scroll;} }
        const savedPath = pathUiSchema.safeParse(saved.pathUi);
        if (savedPath.success) setPathUi(savedPath.data);
        const restored = readPrototypeContext(saved.context);
        setContext({ ...restored, names: false, q: restored.names ? "" : restored.q });
        setLookupOpen(saved.lookupOpen === true || restored.names);
        setLookupQ(typeof saved.lookupQ === "string" ? saved.lookupQ.slice(0, 100) : restored.names ? restored.q : "");
        if (saved.entry === "worlds" || (!lab && saved.entry === "list")) setEntry(saved.entry);
        if (!lab && saved.listCriteria && typeof saved.listCriteria.q === "string") setListCriteria(saved.listCriteria);
        if (!lab && Array.isArray(saved.listCursors) && saved.listCursors.length && saved.listCursors.every((v: unknown) => v === null || typeof v === "string")) setListCursors(saved.listCursors);
        if (lab && saved.layoutVersion === 2 && saved.variant === "staged") setVariant("staged");
      }
      setReady(true); dialog.current?.showModal(); document.getElementById("prototype-title")?.focus({ preventScroll: true });
    }, 0);
    return () => {
      catalogRequest.current?.abort();
      clearTimeout(timer); window.removeEventListener("popstate", pop);
      const wasOpen = element.open; element.close();
      if (!lab && wasOpen && !selected.current) requestAnimationFrame(() => {
        const target = returnFocus.current ? document.querySelector<HTMLElement>('[data-discovery-launch="' + returnFocus.current + '"]') : previousFocus;
        if (target?.isConnected) focusDestination(target);
      });
    };
  }, [lab, onClose, presetBrowser]);
  const snapshot = useMemo(() => ({ layoutVersion: 2, context, entry, variant, lookupOpen, lookupQ, listCriteria, listCursors, pathUi, ...(presetBrowser ? { catalog,connectionFlow } : {}) }), [context, entry, variant, lookupOpen, lookupQ, listCriteria, listCursors, pathUi, presetBrowser, catalog,connectionFlow]);
  const {checkpoint,flush}=useDiscoveryHistory(snapshot,ready,lab,returnFocus);
  const checkpointConnection=useCallback((flow:ConnectionsWorkspace)=>{setConnectionFlow(flow);checkpoint(flow);},[checkpoint]);
  useLayoutEffect(() => {
    if (!ready || !browsingPresets || catalogRestore.current === null || !body.current) return;
    body.current.scrollTop = catalogRestore.current;
    catalogRestore.current = null;
  }, [ready,browsingPresets]);
  const change = (next: DiscoveryContext, label: Label) => {
    if (JSON.stringify(next) === JSON.stringify(context)) return;
    setUndo({ context, label, lookupOpen, lookupQ, pathUi, reader: catalog.reader }); setPathUi(rebasePathUi(pathUi,context,next)); setContext(next);
    if (JSON.stringify(resolveDiscovery(context)) !== JSON.stringify(resolveDiscovery(next))) setCursors([null]);
  };
  const clearAll = () => {
    setUndo({ context, label: ["すべての条件の解除", "Clear all criteria"], lookupOpen, lookupQ, pathUi, reader: catalog.reader });
    setPathUi({scope:"",open:false,depth:2,selected:null});
    setContext(initialContext); setLookupOpen(false); setLookupQ(""); setCursors([null]);
  };
  const focusSubject = () => {
    const origin = document.activeElement;
    requestAnimationFrame(() => {
    if (document.activeElement !== origin && document.activeElement !== document.body) return;
    if (body.current) body.current.scrollTop = 0;
    document.getElementById("prototype-subject")?.focus({ preventScroll: true });
    });
  };
  const showCatalog = () => {
    if(preview)setConnectionFlow(old=>({...old,step:"presets"}));
    catalogRequest.current?.abort(); setCatalogBusy(false); setCatalogError(null);
    catalogRestore.current = catalog.scroll;
    setCatalog(old => ({ ...old, mode: "presets", pending: null }));
  };
  const showCatalogNames = () => {
    catalogRequest.current?.abort(); setCatalogBusy(false); setCatalogError(null);
    const scroll = body.current?.scrollTop ?? catalog.scroll;
    setCatalog(old => ({ ...old, mode: "names", pending: null, scroll: old.mode === "presets" ? scroll : old.scroll }));
    setLookupOpen(true);
    requestAnimationFrame(() => { if (body.current) body.current.scrollTop = 0; document.getElementById("prototype-name")?.focus({preventScroll:true}); });
  };
  const executeCatalog = (preset: CatalogPreset, anchor: EntitySummary) => {
    if (anchor.kind !== preset.kind) { setCatalogError(t("対象の種類がこの探し方と一致しません。別の対象を選べます。","This subject kind does not match the preset. Choose another subject.")); return; }
    const scroll = body.current?.scrollTop ?? catalog.scroll;
    const next = { ...context, anchor, question:preset.question, role:preset.role, q:"", names:false };
    change(next,["プリセットの適用","Preset application"]);
    setUndo({context,label:["プリセットの適用","Preset application"],lookupOpen,lookupQ,pathUi,reader:catalog.reader});
    const execution=preset.execution;
    setPathUi(execution.type === "template" ? {scope:pathScope(anchor.id,questionPredicates[preset.question]!,preset.role),open:true,depth:resolvePathPreset(execution.path).depth,selected:null,preset:execution.path,changed:false} : {scope:"",open:false,depth:2,selected:null});
    setCatalog(old=>({...old,mode:"explore",pending:null,active:preset.id,reader:execution.type === "template" ? "paths":"records",scroll:old.mode === "presets" ? scroll : old.scroll}));
    setLookupOpen(false); setCursors([null]); focusSubject();
  };
  const selectCatalog = async (preset: CatalogPreset, example = false) => {
    catalogRequest.current?.abort(); setCatalogError(null);
    if (preset.execution.type === "template" && !example) {
      const scroll=body.current?.scrollTop ?? catalog.scroll;
      setCatalog(old=>({...old,mode:"names",pending:preset.id,scroll}));
      setLookupOpen(true); setLookupQ("");
      requestAnimationFrame(()=>{ if(body.current)body.current.scrollTop=0; document.getElementById("prototype-name")?.focus({preventScroll:true}); });
      return;
    }
    const controller=new AbortController(); catalogRequest.current=controller; setCatalogBusy(true);
    try {
      const result=await executeDiscoveryPlan({state:"ready",operation:"neighbors",anchorId:preset.execution.type === "fixed" ? preset.execution.anchorId:preset.execution.exampleId,predicate:questionPredicates[preset.question]!,role:preset.role},null,controller.signal);
      if (!controller.signal.aborted && result.anchor) executeCatalog(preset,result.anchor);
    } catch { if(!controller.signal.aborted)setCatalogError(t("公開記録を確認できませんでした。もう一度選んで再試行できます。","Could not verify public records. Select the preset again to retry.")); }
    finally {if(!controller.signal.aborted)setCatalogBusy(false);}
  };
  const chooseSubject = (anchor: EntitySummary) => {
    if (preview) { catalogRequest.current?.abort(); setCatalogBusy(false); }
    if (preview && pendingPreset) { executeCatalog(pendingPreset,anchor); return; }
    if (preview) setCatalog(old=>({...old,mode:"explore",pending:null,active:null}));
    change({ ...context, anchor, names: false }, ["対象の変更", "Subject change"]); setLookupOpen(false);
    focusSubject();
  };
  const changePathUi = (next: PathUi) => {
    const current: PathUi = pathUi.scope===next.scope ? pathUi : {scope:next.scope,open:false,depth:2,selected:null};
    if (next.depth!==current.depth || next.preset?.id!==current.preset?.id) {
      setUndo({context,label:next.depth!==current.depth?["経路の段数の変更","Path length change"]:["探し方の解除","Preset removal"],lookupOpen,lookupQ,pathUi:current});
    }
    setPathUi(next);
  };
  const applyPathPreset = (preset: PathPresetRef) => {
    const template=resolvePathPreset(preset);
    if (!context.anchor || context.anchor.kind!==template.kinds[0]) return;
    const question=template.predicate==="CONTRIBUTED_TO" ? "credits" : "affiliations";
    const role=question==="credits" ? context.role : null;
    change({...context,question,role},["探し方の適用","Discovery preset application"]);
    setUndo({context,label:["探し方の適用","Discovery preset application"],lookupOpen,lookupQ,pathUi});
    setPathUi({scope:pathScope(context.anchor.id,template.predicate,role),open:true,depth:template.depth,selected:null,preset,changed:false});
    setLookupOpen(false);
  };
  const pickQuestion = (question: QuestionId) => { change({ ...context, question }, ["関係・問いの変更", "Relation / question change"]); setLookupOpen(false); };
  const switchEntry = (next: Entry) => {
    if (entry === next) return;
    catalogRequest.current?.abort(); setCatalogBusy(false);
    setEntry(next);
    requestAnimationFrame(() => { if (body.current) body.current.scrollTop = 0; });
  };
  const startNames = () => { if (preview) { showCatalogNames(); return; } setLookupOpen(true); requestAnimationFrame(() => document.getElementById("prototype-name")?.focus({ preventScroll: true })); };
  const dismiss = useDialogDismiss(dialog, () => window.history.back());
  const close = () => { flush(); if (!lab) return dismiss(); dialog.current?.close(); launch.current?.focus({ preventScroll: true }); };
  const backdrop = useDialogBackdrop(close);
  const chooseListResult = (entity: EntitySummary, predicates?: PredicateFilter, roles?: import("../lib/domain/exploration").ContributionRoleFilter) => {
    if (!onChoose) return;
    flush();
    selected.current = true;
    window.addEventListener("popstate", () => { onChoose(entity, predicates, roles); requestAnimationFrame(() => focusDestination(document.getElementById("explorer-graph"))); }, { once: true });
    window.history.back();
  };
  const displayed = query.result ?? query.previous, blocked = query.loading || !!query.error;
  const normalize = (value: string) => value.normalize("NFKC").toLowerCase();
  const claims = displayed?.claims.filter(c => !context.q.trim() || displayed.nodes.some(n => (n.id === c.subjectId || n.id === c.objectId) && n.id !== context.anchor?.id && normalize(n.name).includes(normalize(context.q.trim())))) ?? [];
  const candidates = new Map<string, EntitySummary>();
  if (!names && query.result?.anchor) for (const claim of query.result.claims) {
    const anchorId = query.result.anchor.id, target = query.result.nodes.find(n => n.id === (claim.subjectId === anchorId ? claim.objectId : claim.subjectId));
    if (target) candidates.set(target.id, target);
  }
  const graphHref: GraphHref = (id, all = false) => (en ? "/en" : "") + explorationHref({
    version: 1, dataset: "public-kg", id, rootId: id, title: "Discovery", savedAt: "2000-01-01T00:00:00.000Z",
    conditions: { predicates: !all && basePlan.state === "ready" && basePlan.operation === "neighbors" && basePlan.predicate ? [basePlan.predicate] : null, contributionRoles: !all && context.role ? [context.role] : null, organizationPositions: null, eventRoles: null },
    branches: [{ id, open: true, pages: 1 }], view: null,
  });
  const appliedGraph = basePlan.state === "ready" && basePlan.operation === "neighbors";
  const hasConditions = !!context.world || !!context.anchor || context.question !== "connections" || !!context.role || !!context.q;
  const showPresets = !context.anchor && context.question === "connections" && !context.role && !context.q;
  const seeds = <div key="seeds" className={showPresets ? styles.presetChoices : styles.seedChoices} data-testid={showPresets ? "prototype-presets" : undefined}>
    {prototypeSeeds.map(seed => <Seed key={seed.id} seed={seed} preset={showPresets} requiredKind={preview ? pendingPreset?.kind : undefined} onChoose={anchor => {
      if (preview && showPresets && !pendingPreset) { void selectCatalog(presetCatalog.find(p=>p.execution.type === "fixed" && p.execution.anchorId === seed.id)!); return; }
      if (preview || !showPresets) return chooseSubject(anchor);
      change({ ...context, anchor, question: seed.question }, ["プリセットの適用", "Preset application"]);
      setLookupOpen(false); focusSubject();
    }}/>) }
  </div>;

  return <>
    {lab && <main className={styles.page}>
    <p className={styles.eyebrow}>PLUNODE / DISCOVERY LAB</p><h1>{t("探索UIを試す", "Try Discovery Lab")}</h1>
    <button ref={launch} onClick={() => { dialog.current?.showModal(); document.getElementById("prototype-title")?.focus({ preventScroll: true }); }}>{t("試作を開く", "Open prototype")}</button> <a href={localizedPublicHref("/", locale)}>{t("Home・現在の検索へ", "Home & current search")}</a>
    </main>}
    <dialog ref={dialog} lang={locale} data-formal={!lab || undefined} className={styles.dialog} onCancel={e => { e.preventDefault(); close(); }} aria-labelledby="prototype-title" {...backdrop}>
      <header className={styles.header}><div><span className={styles.brand}><Icon name="graph"/>PLUNODE<span>{lab ? "Discovery Lab" : "Discovery"}</span></span><h2 id="prototype-title" tabIndex={-1} data-focus-destination>{lab ? t("探索する", "Explore") : t("知識を探す", "Discover")}</h2></div><div className={styles.headerActions}>{lab && <button className={styles.layoutToggle} aria-label={variant === "tabs" ? t("段階表示を試す", "Try staged layout") : t("タブ表示に戻す", "Use tabs")} onClick={() => setVariant(variant === "tabs" ? "staged" : "tabs")}><span className={styles.layoutLabel}>{variant === "tabs" ? t("段階表示を試す", "Try staged layout") : t("タブ表示に戻す", "Use tabs")}</span><span className={styles.layoutCompact} aria-hidden="true">{variant === "tabs" ? t("段階", "Stages") : t("タブ", "Tabs")}</span></button>}<div className={styles.language} aria-label={t("表示言語", "Language")}><button aria-pressed={!en} onClick={() => setLocale("ja")}>JA</button><button aria-pressed={en} onClick={() => setLocale("en")}>EN</button></div><button className={styles.close} aria-label={lab ? t("試作を閉じる", "Close prototype") : t("検索を閉じる", "Close search")} onClick={close}><Icon name="close"/></button></div></header>
      <div ref={body} className={styles.body} data-testid="prototype-body">
          <nav className={styles.entryNav} aria-label={t("探索の入口", "Discovery entrances")}>
            {variant === "tabs" ? <div className={styles.tabs} role="tablist" aria-label={t("探索の入口", "Discovery entrances")}>{((lab ? ["connections", "worlds"] : ["connections", "worlds", "list"]) as Entry[]).map(value => <button key={value} role="tab" aria-label={value === "connections" ? t("今ある接点から", "Existing connections") : value === "worlds" ? t("知識世界から", "Knowledge worlds") : t("一覧・条件から", "Browse & refine")} id={"prototype-tab-" + value} aria-controls={value === "list" ? "discovery-list-panel" : "prototype-entry"} aria-selected={entry === value} tabIndex={entry === value ? 0 : -1} onClick={() => switchEntry(value)} onKeyDown={e => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) { e.preventDefault(); const values: Entry[] = lab ? ["connections", "worlds"] : ["connections", "worlds", "list"]; const next = e.key === "Home" ? values[0] : e.key === "End" ? values.at(-1)! : values[(values.indexOf(entry) + (e.key === "ArrowRight" ? 1 : values.length - 1)) % values.length]; switchEntry(next); document.getElementById("prototype-tab-" + next)?.focus({ preventScroll: true }); } }}>{value === "connections" ? <Icon name="graph"/> : value === "worlds" ? <DiscoveryWorldIcon world="geography"/> : <Icon name="list"/>}<span className={styles.tabLong}>{value === "connections" ? t("今ある接点から", "Existing connections") : value === "worlds" ? t("知識世界から", "Knowledge worlds") : t("一覧・条件から", "Browse & refine")}</span><span className={styles.tabShort} aria-hidden="true">{value === "connections" ? t("接点から", "Connections") : value === "worlds" ? t("知識世界", "Worlds") : t("一覧検索", "Browse")}</span></button>)}</div>
            : <button className={styles.stagedSwitch} onClick={() => switchEntry(entry === "connections" ? "worlds" : "connections")}>{entry === "connections" ? t("知識世界から探す →", "Explore knowledge worlds →") : t("接点から探す →", "Explore connections →")}</button>}

          </nav>
        {preview ? ready&&<DiscoveryConnections value={connectionFlow} onChange={setConnectionFlow} body={body} onCheckpoint={checkpointConnection} onGraph={snapshot=>{
          selected.current=true;setConnectionFlow(snapshot);
          checkpoint(snapshot,true);
        }}/>:entry === "list" ? <DiscoveryListPanel criteria={listCriteria} cursors={listCursors} onChange={value => { setListCriteria(value); setListCursors([null]); }} onPage={setListCursors} onChoose={chooseListResult}/> : browsingPresets ? <DiscoveryPresetBrowser filters={catalog.filters} onChange={filters=>setCatalog(old=>({...old,filters}))} onSelect={selectCatalog} onNames={showCatalogNames} busy={catalogBusy} error={catalogError}/> : <>
        {!(preview && catalog.mode === "names" && !context.anchor) && <section className={styles.selectionSummary} data-empty={!hasConditions || undefined} aria-label={t("選択要約", "Selection summary")}>
          <div className={styles.summaryChips}>
            <span className={styles.subjectChip}><button id="prototype-subject" onClick={startNames} title={context.anchor?.name}><span className={styles.subjectLabel}>{t("対象：", "Subject: ")}</span>{context.anchor?.name ?? t("名前から指定", "choose by name")}<Icon name="search"/></button>{context.anchor && <button aria-label={t("対象だけ外す", "Remove only subject")} onClick={() => change({ ...context, anchor: null }, ["対象の解除", "Subject removal"])}>×</button>}</span>
            {context.world && <span className={styles.selectionChip}><button onClick={() => switchEntry("worlds")}><DiscoveryWorldIcon world={context.world}/>{textOf(worldNames[context.world], locale)}</button> <button aria-label={t("世界だけ外す", "Remove only world")} onClick={() => change({ ...context, world: null }, ["世界の解除", "World removal"])}>×</button></span>}
            {context.question !== "connections" && <span className={styles.selectionChip}><span>{textOf(questionNames[context.question], locale)}</span><button aria-label={t("問いだけ外す", "Remove only question")} onClick={() => pickQuestion("connections")}>×</button></span>}
            {context.role && <span className={styles.selectionChip}><span>{contributionLabels(locale).roles[context.role]}</span><button aria-label={t("制作役割だけ外す", "Remove only role")} onClick={() => change({ ...context, role: null }, ["制作役割の解除", "Role removal"])}>×</button></span>}
            {context.q && <span className={styles.selectionChip}><span>{t("名前：", "Name: ")}{context.q}</span><button aria-label={t("名前の絞込だけ外す", "Remove only name filter")} onClick={() => change({ ...context, q: "" }, ["名前の絞込の解除", "Name filter removal"])}>×</button></span>}
          </div>
          <div className={styles.conditionActions} data-idle={!undo && !hasConditions && !lookupQ || undefined}><button className={styles.undo} disabled={!undo} onClick={() => { if (undo) { setContext(undo.context); setPathUi(undo.pathUi); setLookupOpen(undo.lookupOpen); setLookupQ(undo.lookupQ); setUndo(null); if (undo.reader) setCatalog(old=>({...old,reader:undo.reader!})); setCursors([null]); } }}>{undo ? t("取り消す：" + textOf(undo.label, locale), "Undo: " + textOf(undo.label, locale)) : t("取り消す", "Undo")}</button><button className={styles.clearAll} disabled={!hasConditions && !lookupQ} onClick={clearAll}>{t("すべての条件を解除", "Clear all criteria")}</button></div>
        </section>}
        <div className={styles.workspace} data-entry={entry} data-selected={!!context.anchor || undefined}>
        <aside className={styles.editor}>
        <section className={styles.entryPanel}>
          <div id="prototype-entry" key={entry} role={variant === "tabs" ? "tabpanel" : undefined} aria-labelledby={variant === "tabs" ? "prototype-tab-" + entry : undefined}>
            {entry === "connections" ? <>
              <div className={styles.sectionHeading}><h3>{showPresets ? t("気になる接点から", "Start with a connection") : t("別の接点へ", "Other connections")}</h3><span>{showPresets ? t("選ばず検索もできます", "Or search directly") : t("対象を変える候補", "Optional subjects")}</span></div>
              {!showPresets && !!candidates.size && <div className={styles.targetChoices} data-testid="prototype-next-targets"><span>{t("対象を変更：", "Change subject:")}</span>{[...candidates.values()].slice(0, 4).map(target => <button key={target.id} onClick={() => chooseSubject(target)} aria-label={t(target.name + "を対象にする", "Use " + target.name + " as subject")}>{target.name}</button>)}</div>}
              <div key="examples" className={showPresets ? undefined : styles.exampleRow}>{!showPresets && <span>{t("対象の例：", "Examples:")}</span>}{seeds}</div>
            </>
            : <>          <div className={styles.sectionHeading}><h3>{t("興味のある世界", "A world of interest")}</h3></div><div className={styles.worldChoices} aria-label={t("世界の選択", "World interests")}><button aria-label={context.world ? t("世界だけ外す", "Remove only world") : t("世界を指定しない", "No world interest")} aria-pressed={!context.world} onClick={() => change({ ...context, world: null }, ["世界の解除", "World removal"])}>{t("指定なし", "Any")}</button>{WORLD_IDS.map(world => <button key={world} data-world={world} aria-pressed={context.world === world} onClick={() => change({ ...context, world }, ["世界の変更", "World change"])}><DiscoveryWorldIcon world={world}/>{textOf(worldNames[world], locale)}</button>)}<small>{t("関連する問いを表示。結果の分野は限定しません。", "Shows questions; does not filter results by field.")}</small></div>
{context.world ? <div className={styles.questions} key={context.world} aria-label={t("問いの候補", "Question suggestions")}><span className={styles.questionLabel}>{t("どんなつながりを？", "What would you like to explore?")}</span>{questionsForWorld[context.world].map(question => <button key={question} aria-pressed={context.question === question} onClick={() => pickQuestion(question)}><span>{textOf(questionNames[question], locale)}</span>{!questionPredicates[question] ? <small>{t("未対応", "unsupported")}</small> : <Icon name="arrow"/>}</button>)}</div> : <span className={styles.note}>{t("世界から問いを選ぶことも、下の名前から探すこともできます。", "Choose a question by world, or search by name below.")}</span>}<small className={styles.coverage}>{t("収録範囲・収集予定は未確認です", "Coverage and collection plans are unassessed.")}</small></>}
          </div>
        </section>
        {!(preview && catalog.mode === "names") && <section className={styles.relationControls} aria-label={t("関係の条件を編集", "Edit relation criteria")}>
          <div className={styles.conditionRow}><span className={styles.fieldLabel}>{t("見る関係", "Relations")}</span><div className={styles.relations} aria-label={t("関係の条件", "Relation criteria")}>{relationChoices.map(question => <button key={question} aria-pressed={context.question === question} onClick={() => pickQuestion(question)}>{textOf(relationNames[question], locale)}</button>)}</div>{!relationChoices.includes(context.question as typeof relationChoices[number]) && <span className={styles.pending}>{textOf(questionNames[context.question], locale)}<button className={styles.remove} aria-label={t("問いだけ外す", "Remove only question")} onClick={() => pickQuestion("connections")}>×</button></span>}</div>
          {(context.question === "credits" || context.role) && <div className={styles.conditionRow}><span className={styles.fieldLabel}>{t("制作役割", "Role")}</span><div className={styles.roleChoices} aria-label={t("制作役割の条件", "Production role criteria")}>{context.question === "credits" ? <><button data-role="" aria-pressed={!context.role} onClick={() => change({ ...context, role: null }, ["制作役割の解除", "Role removal"])}>{t("限定なし", "Any role")}</button>{CONTRIBUTION_ROLE_IDS.map(role => <button key={role} data-role={role} aria-pressed={context.role === role} onClick={() => change({ ...context, role }, ["制作役割の変更", "Role change"])}>{contributionLabels(locale).roles[role]}</button>)}</> : <span>{context.role ? contributionLabels(locale).roles[context.role] : t("制作を選ぶと役割も指定できます", "Choose production to specify a role")}</span>}{context.role && <button className={styles.remove} aria-label={t("制作役割だけ外す", "Remove only role")} onClick={() => change({ ...context, role: null }, ["制作役割の解除", "Role removal"])}>×</button>}</div></div>}
        </section>
        }
        {!lab && !(preview && catalog.mode === "names") && !context.anchor && questionPredicates[context.question] && basePlan.state !== "unsupported" && <button className={styles.recordHandoff} onClick={() => {
          setListCriteria({ ...listCriteria, predicates: [questionPredicates[context.question]!], contributionRole: context.role, recordView: true, presentation: "list" });
          setListCursors([null]); switchEntry("list");
        }}>{t("この関係・役割で一覧の記録を探す", "Search this relation and role in the list")}<Icon name="arrow"/></button>}
        {basePlan.state === "unsupported" && <aside className={styles.unavailable} data-testid="prototype-unsupported"><strong>{t("この条件の検索は未対応です", "These search criteria are unsupported")}{names && t("（条件は保持中）", " (criteria retained)")}</strong><p>{textOf(basePlan.reason, locale)}</p><span>{t("収録状況は未確認。この問いを実行していないため、0件とは判定していません。", "Coverage unassessed. This question was not executed, so it is not a zero-result search.")}</span><div>{!names && <button onClick={startNames}>{t("条件を保って名前を探す", "Find names, keeping criteria")}</button>}{context.role && <><button onClick={() => change({ ...context, role: null }, ["制作役割の解除", "Role removal"])}>{t("制作役割だけ外す", "Remove only the role")}</button><button onClick={() => pickQuestion("credits")}>{t("関係を制作に変更", "Change relation to production")}</button></>}</div></aside>}
        </aside>
        <section className={styles.matches} aria-label={t("探索結果", "Discovery results")} aria-busy={query.loading}>
          {preview && (catalog.mode === "names" ? <PresetModeSwitch mode="names" onChange={mode=>mode === "presets" ? showCatalog() : undefined}/> : <div className={styles.catalogReturn}><button onClick={showCatalog}>← {t("プリセット検索へ戻る","Back to preset search")}</button><button onClick={showCatalogNames}>{t("名前から探す","Find by name")}</button></div>)}
          {preview && pendingPreset && <div className={styles.pendingPreset} aria-busy={catalogBusy}><strong>{textOf(pendingPreset.title,locale)}</strong><p>{t("この探し方に使う" + (pendingPreset.kind === "work" ? "作品" : pendingPreset.kind === "person" ? "人物" : "組織") + "を選んでください。", "Choose a " + pendingPreset.kind + " for this preset.")}</p><div>{pendingPreset.execution.type === "template" && <button disabled={catalogBusy} onClick={()=>selectCatalog(pendingPreset,true)}>{t(pendingPreset.execution.exampleName[0]+"で試す","Try "+pendingPreset.execution.exampleName[1])} →</button>}{context.anchor?.kind === pendingPreset.kind && <button onClick={()=>executeCatalog(pendingPreset,context.anchor!)}>{t(context.anchor.name+"を使う","Use "+context.anchor.name)}</button>}<button onClick={()=>{catalogRequest.current?.abort();setCatalogBusy(false);setCatalog(old=>({...old,pending:null}));}}>{t("探し方だけ外す","Remove only preset")}</button></div></div>}
          {preview && catalogError && <p role="alert">{catalogError}</p>}
          <form hidden={preview && !names && catalog.reader === "paths"} className={styles.keyword} data-testid="prototype-keyword" onSubmit={e => { e.preventDefault(); query.retry(); }}>
            <div className={styles.keywordLabel}><label htmlFor="prototype-name">{names ? t("名前・別名から探す", "Find a name or alias") : t("このページの相手の名前で絞る", "Filter connected names on this page")}</label>{names && context.anchor && <button type="button" onClick={() => {setLookupOpen(false);if(preview){catalogRequest.current?.abort();setCatalogBusy(false);setCatalog(old=>({...old,mode:"explore",pending:null}));}}}>{t(context.anchor.name + "の関係に戻る", "Back to " + context.anchor.name)}</button>}</div>
            <div className={styles.inputRow}><Icon name="search"/><input id="prototype-name" value={names ? lookupQ : context.q} maxLength={100} placeholder={names ? t("作品・人・組織の名前…", "A work, person or institution…") : t("相手の名前で絞る…", "Filter connected names…")} onChange={e => { if(preview && catalogBusy){catalogRequest.current?.abort();setCatalogBusy(false);} if(names)setLookupQ(e.target.value);else change({ ...context, q: e.target.value }, ["名前の絞込", "Name filter"]); }} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}/>{(names ? lookupQ : context.q) && <button type="button" onClick={() => names ? setLookupQ("") : change({ ...context, q: "" }, ["名前の絞込の解除", "Name filter removal"])}>{t("消去", "Clear")}</button>}<button className={styles.searchSubmit} type="submit">{t("検索", "Search")}<Icon name="arrow"/></button></div>
          </form>
          {names && hasConditions && <p className={styles.lookupNote}>{t("選択条件は保持中。名前候補には世界・関係・役割の条件を適用しません。", "Criteria retained. World, relation and role filters do not apply to these name matches.")}</p>}
          <div className={styles.resultHeading}><div><h3 id="prototype-results-title" tabIndex={-1} data-focus-destination>{names ? t("名前の候補", "Name matches") : preview && catalog.reader === "paths" ? t("接点の経路", "Connection routes") : t("関係の記録", "Relation records")}</h3><span role="status">{query.loading ? t("取得中…", "Loading…") : query.result ? names ? t(query.result.items.length + "件", query.result.items.length + " matches") : preview && catalog.reader === "paths" ? "" : t("このページ " + claims.length + "件", claims.length + " on this page") : ""}</span></div>{context.anchor && appliedGraph && <a className={styles.graphLaunch} data-testid="prototype-graph" href={graphHref(context.anchor.id)} aria-label={t(context.anchor.name + "をGraphで開く", "Open " + context.anchor.name + " in Graph")}><Icon name="graph"/>{t("Graphで開く", "Open Graph")}<Icon name="external"/></a>}</div>
          {preview && !names && context.anchor && <div className={styles.readerSwitch} role="group" aria-label={t("表示する探索結果","Discovery result view")}><button aria-pressed={catalog.reader === "records"} onClick={()=>setCatalog(old=>({...old,reader:"records"}))}>{t("関係の記録","Relation records")}</button><button aria-pressed={catalog.reader === "paths"} onClick={()=>{setCatalog(old=>({...old,reader:"paths"}));const scope=pathScope(context.anchor!.id,questionPredicates[context.question]??null,context.role);setPathUi(old=>old.scope === scope ? {...old,open:true}:{scope,open:true,depth:2,selected:null});}}>{t("経路を見る","Explore routes")}</button></div>}
          {(!preview || catalog.reader === "paths") && query.result && !names && plan.state === "ready" && plan.operation === "neighbors" && (() => {
            const scope = pathScope(plan.anchorId,plan.predicate,plan.role);
            return <DiscoveryPaths compact={preview} anchor={context.anchor!} anchorId={plan.anchorId} predicate={plan.predicate} role={plan.role} revision={query.result.revision}
              ui={pathUi.scope===scope?pathUi:{scope,open:false,depth:2,selected:null}} onChange={changePathUi} onPreset={applyPathPreset} onRefresh={query.retry} pageFilter={!!context.q}/>;
          })()}
          {query.error && <div role="alert" className={styles.unavailable}><p>{query.conflict ? t("公開KGの版が変わりました。先頭から再取得してください。", "The public KG changed. Refresh from the first page.") : t("記録を取得できませんでした。再試行してください。", "Could not load records. Please retry.")}</p><button onClick={() => { setCursors([null]); query.retry(); }}>{t("再取得", "Retry")}</button></div>}
          {(!preview || names || catalog.reader === "records") && (plan.state !== "ready" ? <div className={styles.empty} data-initial={plan.state === "needs-name" || undefined}>{plan.state === "needs-name" ? <><svg className={styles.emptyDrawing} viewBox="0 0 260 90" fill="none" aria-hidden="true"><path d="M35 58C70 58 65 25 117 25S173 65 225 50M117 25Q135 78 179 74"/><circle cx="35" cy="58" r="6"/><circle cx="117" cy="25" r="10"/><circle cx="225" cy="50" r="6"/><circle cx="179" cy="74" r="4"/></svg><h4>{t("ひとつの名前から、その先へ。", "One name. Many connections.")}</h4><p>{t("名前を入力するか、気になる接点を選ぶと、ここに記録が並びます。", "Search a name or choose a connection to see the published records here.")}</p></> : plan.state === "unsupported" ? t("問いは保持しています。関係を変更するか、条件を保って名前を探せます。", "Question retained. Change the relation or search names while keeping it.") : t("名前から対象を選ぶと、関係の記録を確認できます。", "Choose a subject by name to see its relation records.")}</div>
          : <div className={styles.resultStage} data-testid="prototype-results" data-updating={blocked || undefined}><div inert={blocked} aria-hidden={blocked || undefined}>
            {displayed && names && displayed.items.map(entity => <div className={styles.nameRow} key={entity.id}><span className={styles.entityMark} data-kind={entity.kind}><Icon name={entity.kind === "person" ? "person" : entity.kind === "organization" ? "organization" : entity.kind === "event" ? "event" : "book"}/></span><div className={styles.nameIdentity}><strong>{entity.name}</strong>{entity.description && <p>{entity.description}</p>}</div><div className={styles.rowActions}><button disabled={preview && !!pendingPreset && entity.kind !== pendingPreset.kind} onClick={() => chooseSubject(entity)} aria-label={t("対象を" + entity.name + "に変更", "Change subject to " + entity.name)}>{t("ここから探す", "Explore from here")}<Icon name="arrow"/></button><a className={styles.graphLink} href={graphHref(entity.id, true)} aria-label={t(entity.name + "を全関係のGraphで開く", "Open " + entity.name + " in Graph with all relations")}><Icon name="graph"/>Graph<small>{t("全関係", "all relations")}</small></a></div></div>)}
            {displayed?.anchor && !names && <div className={styles.recordList}>{claims.map(claim => <DiscoveryClaimRow key={displayed.revision + ":" + claim.id} claim={claim} nodes={displayed.nodes} anchor={displayed.anchor!} revision={displayed.revision} onChoose={chooseSubject} graphHref={graphHref}/>)}</div>}
            {query.result && (names ? !query.result.items.length : !claims.length) && <div className={styles.empty}><strong>{t("この条件・取得範囲では該当なし", "No match in this request's scope")}</strong><p>{t("世界全体のデータがないという意味ではありません。", "This does not mean this whole world has no data.")}</p>{!names && context.q && <button onClick={() => change({ ...context, q: "" }, ["名前の絞込の解除", "Name filter removal"])}>{t("名前の絞込だけ外す", "Remove only the name filter")}</button>}{!names && context.role && <button onClick={() => change({ ...context, role: null }, ["制作役割の解除", "Role removal"])}>{t("制作役割だけ外す", "Remove only the role")}</button>}</div>}
          </div>{query.loading && !displayed && <div className={styles.skeleton} aria-hidden="true"/>}</div>)}
          {(!preview || catalog.reader === "records") && !names && plan.state === "ready" && <nav className={styles.pagination} aria-label={t("記録のページ", "Record pages")}><button disabled={blocked || cursors.length === 1} onClick={() => setCursors(v => v.slice(0, -1))}>{t("前へ", "Previous")}</button><span>{t(cursors.length + "ページ", "Page " + cursors.length)}</span><button disabled={blocked || !query.result?.nextCursor} onClick={() => setCursors(v => [...v, query.result!.nextCursor])}>{t("次へ", "Next")}</button></nav>}
          {query.result?.hasMore && (!preview || names || catalog.reader === "records") && <p className={styles.note}>{names ? t("続きがあります。名前を具体的にすると候補を絞れます。", "More names match. Refine the name.") : t("未取得の続きがあります。名前の絞込は現在のページだけです。", "More records are available. Names are filtered only on this page.")}</p>}
          {!names && query.result?.claims.some(c => c.predicate === "AFFILIATED_WITH") && <p className={styles.note}>{t("同じ機関への記録は、同時在籍・交流・共同研究の証明ではありません。", "A shared institution does not prove simultaneous affiliation, contact or collaboration.")}</p>}
          {query.result && (!preview || names || catalog.reader === "records") && <p className={styles.scopeNote}>{t("この対象と直接つながる記録です。名前で絞れるのは表示中のページです。Graphには関係と制作役割を引き継ぎます。", "Direct connections to this subject. Name filtering applies to this page. Graph carries relation and role filters.")}</p>}
          {query.result && <small className={styles.revision}>PUBLIC KG · {query.result.revision}</small>}
        </section>
        </div>
        </>}
      </div>
    </dialog>
  </>;
}
