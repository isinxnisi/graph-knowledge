"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import Icon from "./Icon";
import GraphCanvas, { type GraphCanvasHandle } from "./GraphCanvas";
import KnowledgeSplit from "./KnowledgeSplit";
import KnowledgeTimeline from "./KnowledgeTimeline";
import KnowledgeRecordDetail from "./KnowledgeRecordDetail";
import KnowledgeThemeContext from "./KnowledgeThemeContext";
import { emptyGraph, type Selection } from "../lib/client/graph-state";
import { knowledgeCanvas } from "../lib/client/knowledge-canvas";
import { readKnowledge, useKnowledgeWorkspace } from "../lib/client/use-knowledge-workspace";
import { useUiLocale } from "../lib/client/ui-locale";
import type { DatasetMode } from "../lib/domain/dataset";
import type { KnowledgePublishedRecord } from "../lib/domain/knowledge-publication";
import type { KnowledgeThemePage } from "../lib/domain/knowledge-theme-reader";
import type { KnowledgeEntityVersion } from "../lib/domain/knowledge-foundation";
import { contributionLabels } from "../lib/i18n/contribution";
import base from "./Explorer.module.css";
import css from "./KnowledgeWorkspace.module.css";

type ThemeSummary = KnowledgeThemePage["themes"][number];
type RecordPage = { generation: string; records: KnowledgePublishedRecord[]; nextCursor: string | null; hasMore: boolean };
const canvasSelection = (s: { kind: "entity" | "record"; id: string } | null): Selection => s ? s.kind === "record" ? { kind: "relation", id: "record:" + s.id } : { kind: "entity", id: s.id } : null;

/** The ordinary Explorer frame, with separate ordinary and pinned-Theme canvases. */
export default function KnowledgeWorkspace({ dataset = "demo", initialRoot }: { dataset?: DatasetMode; initialRoot?: string }) {
  const w = useKnowledgeWorkspace({ initialRootId: initialRoot });
  const { locale } = useUiLocale(), en = locale === "en";
  const [pane, setPane] = useState<"search" | "graph" | "detail">("graph");
  const [searchKind, setSearchKind] = useState<"entities" | "records" | "themes">("entities");
  const [recordPage, setRecordPage] = useState<RecordPage | null>(null), [recordLoading, setRecordLoading] = useState<string | null | false>(false), [recordError, setRecordError] = useState("");
  const [relatedRead, setRelatedRead] = useState<{ id: string; accessToken?: string; themes: ThemeSummary[] } | null>(null);
  const [roleId, setRoleId] = useState(""), [isbn, setIsbn] = useState("");
  const [searchPending, setSearchPending] = useState(false);
  const recordRequest = useRef(0), recordFilter = useRef<Record<string, unknown>>({});
  const normalCanvas = useRef<GraphCanvasHandle>(null), themeCanvas = useRef<GraphCanvasHandle>(null);
  const central = useRef<HTMLDivElement>(null), detail = useRef<HTMLElement>(null);
  const themeGraphPane = useRef<HTMLDivElement>(null);
  const scrollBeforeTheme = useRef({ central: 0, detail: 0, pane: "graph" as typeof pane });
  const previousTheme = useRef<string | null>(null);
  const checkpointTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkpoint = useRef<() => void>(() => {});
  const active = w.activeTheme, retained = w.retainedTheme;
  const selection = active ? w.themeSelection : w.normal.selection;
  const records = active ? active.records : w.normal.records;
  const entities = active ? active.snapshot.entities : w.normal.entities;
  const selectedRecord = selection?.kind === "record" ? records.find((r) => r.record.id === selection.id) : null;
  const selectedEntity = selection?.kind === "entity" ? entities.find((e) => e.id === selection.id) : null;
  const normalContent = useMemo(() => knowledgeCanvas(w.normal.records, w.normal.entities), [w.normal.records, w.normal.entities]);
  const normalState = useMemo(() => emptyGraph(w.normal.epoch), [w.normal.epoch]);
  const themeState = useMemo(() => emptyGraph(retained?.theme.revision ?? 0), [retained?.theme.revision]);
  const themeContent = useMemo(() => {
    const rows = retained?.records.filter((r) => r.record.content.kind === "relation") ?? [];
    const ids = new Set(rows.flatMap((r) => [r.record.content.subjectId, r.record.content.objectId]));
    return knowledgeCanvas(rows, retained?.snapshot.entities.filter((e) => ids.has(e.id)) ?? []);
  }, [retained]);
  const themeHasTime = Boolean(retained?.snapshot.records.some((r) => r.content.times.length));
  const themeHasGraph = Boolean(themeContent.nodes.length);
  const themeMode = themeHasTime ? themeHasGraph && w.themeView === "split" ? "split" : "timeline" : "graph";
  const kinds = [...new Set(["person", "work", "organization", "event", ...(w.entityPage?.entities ?? []).map((e) => e.content.kind), ...entities.map((e) => e.content.kind), ...(w.kind ? [w.kind] : [])])];
  const busy = w.busy || searchPending || (recordLoading !== false && recordLoading === w.normal.generation) || w.restoring;
  const related = relatedRead?.id === selectedEntity?.id && relatedRead?.accessToken === w.status?.changeToken ? relatedRead?.themes ?? [] : [];
  const visibleRecordPage = recordPage?.generation === w.normal.generation ? recordPage : null;
  useEffect(() => { checkpoint.current = () => {
    if (checkpointTimer.current) clearTimeout(checkpointTimer.current);
    checkpointTimer.current = null;
    if (active) w.captureThemeView(themeCanvas.current?.capture() ?? null);
    else w.captureNormalView(normalCanvas.current?.capture() ?? null);
  }; });
  useEffect(() => {
    const save = () => checkpoint.current(); window.addEventListener("pagehide", save);
    return () => { window.removeEventListener("pagehide", save); if (checkpointTimer.current) clearTimeout(checkpointTimer.current); };
  }, []);
  function scheduleCheckpoint() {
    if (checkpointTimer.current) clearTimeout(checkpointTimer.current);
    checkpointTimer.current = setTimeout(() => checkpoint.current(), 350);
  }
  useEffect(() => {
    const prior = previousTheme.current; previousTheme.current = active?.theme.id ?? null;
    if (prior && !active) requestAnimationFrame(() => {
      central.current?.scrollTo({ top: scrollBeforeTheme.current.central });
      detail.current?.scrollTo({ top: scrollBeforeTheme.current.detail });
      setPane(scrollBeforeTheme.current.pane);
    });
  }, [active]);
  useEffect(() => {
    let alive = true;
    if (selectedEntity) readKnowledge<KnowledgeThemePage>("themes", { entityId: selectedEntity.id }).then((p) => { if (alive) setRelatedRead({ id: selectedEntity.id, accessToken: w.status?.changeToken, themes: p.themes }); }).catch(() => {});
    return () => { alive = false; };
  }, [selectedEntity, w.status?.changeToken]);
  useEffect(() => { recordRequest.current++; }, [w.normal.generation]);
  useEffect(() => {
    if (!recordPage || recordPage.generation !== w.normal.generation) return;
    let alive = true; const captured = recordPage, token = recordRequest.current;
    const ids = captured.records.map((r) => r.record.id);
    const reads = Array.from({ length: Math.ceil(ids.length / 200) }, (_, i) => readKnowledge<{ records: KnowledgePublishedRecord[] }>("graph", { generation: captured.generation, recordIds: ids.slice(i * 200, (i + 1) * 200).join(",") }));
    Promise.all(reads).then((pages) => {
      if (!alive || token !== recordRequest.current) return;
      const allowed = new Set(pages.flatMap((p) => p.records.map((r) => r.record.id)));
      setRecordPage((old) => old !== captured || old.records.every((r) => allowed.has(r.record.id)) ? old : { ...old, records: old.records.filter((r) => allowed.has(r.record.id)) });
    }).catch(() => {});
    return () => { alive = false; };
  }, [recordPage, w.normal.generation, w.status?.changeToken]);

  function openTheme(t: { id: string; revision?: number }) {
    checkpoint.current();
    if (!active) scrollBeforeTheme.current = { central: central.current?.scrollTop ?? 0, detail: detail.current?.scrollTop ?? 0, pane };
    void w.openTheme(t); setPane("graph");
  }
  function chooseEntity(id: string) {
    if (active) w.setThemeSelection({ kind: "entity", id }); else w.selectEntity(id);
    setPane("detail");
  }
  function chooseRecord(id: string) {
    if (active) w.setThemeSelection({ kind: "record", id }); else void w.selectRecord(id);
    setPane("detail");
  }
  function startFrom(e: KnowledgeEntityVersion) {
    if (active) scrollBeforeTheme.current = { central: 0, detail: 0, pane: "graph" };
    void w.startFrom(e); setPane("graph");
  }
  function openSearchRecord(id: string) {
    if (active) scrollBeforeTheme.current = { central: 0, detail: 0, pane: "graph" };
    void w.selectRecord(id); setPane("graph");
  }
  async function searchRecords(cursor?: string | null) {
    const token = ++recordRequest.current, generation = w.normal.generation;
    setRecordLoading(generation); setRecordError("");
    const args = cursor ? { ...recordFilter.current, cursor } : { q: w.query, ...(roleId ? { roleId } : {}), ...(isbn ? { isbn13: isbn } : {}) };
    if (!cursor) recordFilter.current = args;
    try {
      const page = await readKnowledge<RecordPage>("search", { ...args, generation });
      if (token !== recordRequest.current) return;
      setRecordPage((old) => cursor && old ? { ...page, records: [...old.records, ...page.records] } : page);
    } catch (e) { if (token === recordRequest.current) setRecordError(e instanceof Error ? e.message : "検索できませんでした"); }
    finally { if (token === recordRequest.current) setRecordLoading(false); }
  }
  async function search(event: FormEvent) {
    event.preventDefault(); setSearchPending(true);
    try {
      if (searchKind === "entities") await w.searchEntities();
      else if (searchKind === "themes") await w.searchThemes(w.query);
      else await searchRecords();
    } finally { setSearchPending(false); }
  }
  function graphFromTimeline(id: string) {
    w.setThemeSelection({ kind: "record", id });
    w.setThemeView("split");
    requestAnimationFrame(() => { themeCanvas.current?.ensureVisible?.("record:" + id); if (matchMedia("(max-width: 1100px)").matches) themeGraphPane.current?.scrollIntoView({ block: "start", behavior: "smooth" }); });
  }
  const themeButton = (t: ThemeSummary) => <button key={t.id} className={css.result} onClick={() => openTheme(t)} disabled={busy}><span className={css.resultHeading}><Icon name={t.hasTimeline ? "event" : "graph"} /><strong>{t.title}</strong></span><small>{t.hasTimeline ? en ? "Timeline & relations" : "年表と関係図" : en ? "Theme" : "テーマ"}</small></button>;
  return <><div className={`${base.explorer} ${css.workspace}`}>
    <SiteHeader dataset={dataset} memberTools={false} datasetNotice={{ badge: en ? "Preview" : "開発確認", description: en ? "Explore subjects, timelines and evidence from registered sources." : "資料から登録した対象と年表を、根拠とともに辿ります。" }} onBeforeAccountNavigation={() => { checkpoint.current(); return true; }} />
    <nav className={base.paneNavigation} aria-label={en ? "Workspace panes" : "探索の表示欄"}>{(["search", "graph", "detail"] as const).map((p) => <button key={p} aria-pressed={pane === p} onClick={() => setPane(p)}><Icon name={p === "search" ? "search" : p === "graph" ? "graph" : "book"} />{p === "search" ? en ? "Search" : "検索" : p === "graph" ? en ? "Graph" : "Graph" : en ? "Details" : "詳細"}</button>)}</nav>
    <main className={base.columns} data-active-pane={pane}>
      <section id="explorer-search" aria-label={en ? "Search" : "検索"} className={`${base.panel} ${css.searchPanel}`}>
        <h2><Icon name="search" />{en ? "Find connections" : "つながりを探す"}</h2>
        <div className={css.searchKinds} role="group" aria-label={en ? "Search for" : "探すもの"}>{(["entities", "records", "themes"] as const).map((k) => <button key={k} disabled={w.restoring} aria-pressed={searchKind === k} onClick={() => setSearchKind(k)}>{k === "entities" ? en ? "Subjects" : "対象" : k === "records" ? en ? "Records" : "記録" : en ? "Themes" : "テーマ"}</button>)}</div>
        <form className={base.searchForm} onSubmit={search}><label>{en ? "Name or words" : "名前・言葉"}<input value={w.query} maxLength={200} disabled={w.restoring} onChange={(e) => w.setQuery(e.target.value)} placeholder={en ? "Name, relation, theme…" : "人物・関係・テーマなど"} /></label>
          {searchKind === "entities" && <details><summary>{en ? "Kind" : "分類"}</summary><select aria-label={en ? "Subject kind" : "対象の分類"} value={w.kind} onChange={(e) => w.setKind(e.target.value)}><option value="">{en ? "All" : "すべて"}</option>{kinds.map((id) => <option key={id} value={id}>{en ? id : ({person:"人物",work:"作品",organization:"組織",event:"出来事"} as Record<string,string>)[id] ?? id}</option>)}</select></details>}
          {searchKind === "records" && <details><summary>{en ? "Credit & publication" : "役割・刊行物"}</summary><label>{en ? "Role" : "役割"}<select value={roleId} onChange={(e) => setRoleId(e.target.value)}><option value="">{en ? "All" : "すべて"}</option>{Object.entries(contributionLabels(locale).roles).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>ISBN<input value={isbn} maxLength={13} onChange={(e) => setIsbn(e.target.value)} /></label></details>}
          <button disabled={busy}><Icon name="search" />{searchPending ? en ? "Searching…" : "検索中…" : en ? "Search" : "検索"}</button>
        </form>
        {searchKind === "entities" && <><div className={css.resultList}>{w.entityPage?.entities.map((e) => <button key={e.id} className={css.result} disabled={busy} onClick={() => startFrom(e)}><strong>{e.content.name}</strong><small>{e.content.kind}</small></button>)}</div>{w.entityPage && !w.entityPage.entities.length && <p className={base.muted}>{en ? "No subjects match these words." : "条件に合う対象はありません。"}</p>}{w.entityPage?.hasMore && <button disabled={busy} onClick={() => void w.searchEntities(w.entityPage?.nextCursor)}>{en ? "More subjects" : "続きを見る"}</button>}</>}
        {searchKind === "records" && <>{recordError && <p role="alert" className={base.error}>{recordError}</p>}<div className={css.resultList}>{visibleRecordPage?.records.map((r) => <button key={r.record.id} className={css.result} disabled={busy} onClick={() => openSearchRecord(r.record.id)}><strong>{r.record.content.assertion}</strong><small>{r.label} · {en ? "revision" : "内容版"} {r.record.revision}</small></button>)}</div>{visibleRecordPage?.hasMore && <button disabled={busy} onClick={() => void searchRecords(visibleRecordPage.nextCursor)}>{en ? "More records" : "続きを見る"}</button>}</>}
        {searchKind === "themes" && <div className={css.resultList}>{w.themes.map(themeButton)}{!w.restoring && !w.themes.length && <p className={base.muted}>{en ? "No themes match these words." : "条件に合うテーマはありません。"}</p>}</div>}
        <nav className={css.editLinks}><Link href="/themes/records" onClick={() => checkpoint.current()}><Icon name="edit" />{en ? "Register / correct" : "登録・訂正"}</Link><Link href="/themes" onClick={() => checkpoint.current()}>{en ? "Manage themes" : "テーマを整える"}</Link></nav>
      </section>
      <div ref={central} id="explorer-graph" className={base.centralScroll} aria-label={en ? "Graph workspace" : "Graph表示領域"}>
        {w.error && <div className={base.error} role="alert">{w.error}<button onClick={() => void w.refreshLatest()}>{en ? "Read latest" : "最新の公開版を読む"}</button></div>}
        {w.restoring && <p role="status" className={css.notice}>{en ? "Restoring your reading…" : "探索を再開しています…"}</p>}
        {w.status?.pending && <p className={css.notice} role="status">{w.status.lastFailure ? en ? "Retrying the update; the readable version is retained." : "更新を再試行しています。読める版は保持しています。" : en ? "Updating the readable version…" : "記録の更新を探索へ反映しています…"}</p>}
        {!active && w.status?.active && w.normal.generation && w.status.active.id !== w.normal.generation && <div className={css.notice}>{en ? "A new public version is available." : "新しい公開版があります。"}<button disabled={busy} onClick={() => void w.refreshLatest()}>{en ? "Read latest" : "最新版を読む"}</button></div>}
        {w.message && <p role="status" className={css.notice}>{w.message}</p>}
        <section hidden={Boolean(active)} className={`${base.panel} ${base.graphPanel} ${css.stage}`} aria-label={en ? "Ordinary exploration" : "通常の関係探索"}>
          <header className={css.stageHeader}><h2>Graph</h2><span role="status">{busy ? en ? "Reading…" : "読み込み中…" : `${w.normal.entities.length} ${en ? "subjects" : "対象"} · ${w.normal.records.filter(r => r.record.content.kind === "relation").length} ${en ? "relations" : "関係"}`}</span></header>
          {!w.normal.rootId && !w.normal.records.length && <div className={css.home}><h3>{en ? "Follow a subject, or read a theme" : "対象から辿る、テーマを読む"}</h3><p>{en ? "Search for a subject on the left. Themes can also open directly as timelines." : "左から対象を探して関係を広げられます。テーマから年表を主役にして読み始めることもできます。"}</p><div className={css.themeCards}>{w.themes.map(themeButton)}</div></div>}
          <div className={css.canvasFrame}><GraphCanvas ref={normalCanvas} graph={normalState} content={normalContent} restoration={w.normalRestoration} onViewChange={scheduleCheckpoint} contentOnly fillHeight compactGuide selection={canvasSelection(w.normal.selection)} interactionBlocked={busy || Boolean(active)} onEntity={(id) => w.selectEntity(id)} onEntityDoubleClick={(id) => { void w.expandEntity(id); }} onToggleEntity={(id) => { void w.expandEntity(id); }} onRelation={(id) => chooseRecord(id.replace(/^record:/,""))} /></div>
          <div className={css.recordStrip}>{w.normal.records.map((r) => <button key={r.record.id} onClick={() => chooseRecord(r.record.id)} aria-pressed={w.normal.selection?.kind === "record" && w.normal.selection.id === r.record.id}>{r.label || r.record.content.assertion}</button>)}</div>
        </section>
        {retained && <section hidden={!active} className={`${base.panel} ${base.graphPanel} ${css.stage}`} aria-label={en ? "Theme reading" : "テーマを読む"}>
          <header className={css.themeHeader}><button onClick={() => { checkpoint.current(); w.closeTheme(); }} className={css.return}><Icon name="back" />{en ? "Back to exploration" : "探索に戻る"}</button><span>{en ? "Saved composition" : "構成版"} {retained.theme.revision}</span><h2 title={retained.theme.content.title}>{retained.theme.content.title}</h2><button className={css.themeInfo} aria-label={en ? "About this theme" : "テーマについて"} title={en ? "About this theme" : "テーマについて"} onClick={() => { w.setThemeSelection(null); setPane("detail"); }}><Icon name="book" /></button></header>
          <KnowledgeThemeContext key={retained.theme.id + ":" + retained.theme.revision} records={retained.records} selectedRecordId={w.themeSelection?.kind === "record" ? w.themeSelection.id : null} onRead={(id) => { w.setThemeSelection({ kind: "record", id }); setPane("detail"); }} />

          <KnowledgeSplit mode={themeMode}>
            <div className={css.timelinePane} hidden={!themeHasTime || themeMode === "graph"}><KnowledgeTimeline key={retained.theme.id + ":" + retained.theme.revision} snapshot={retained.snapshot} headerAction={themeHasTime && themeHasGraph && <button className={css.themeInfo} aria-label={themeMode === "split" ? en ? "Close relation diagram" : "関係図を閉じる" : en ? "Show relation diagram" : "関係図を並べて表示"} title={themeMode === "split" ? "関係図を閉じる" : "関係図を並べて表示"} aria-pressed={themeMode === "split"} onClick={() => w.setThemeView(themeMode === "split" ? "timeline" : "split")}><Icon name="panel" /></button>} untimedInContext focusedRecordId={w.themeSelection?.kind === "record" ? w.themeSelection.id : null} onFocusRecord={(id) => w.setThemeSelection(id ? { kind: "record", id } : null)} onShowGraph={(id) => graphFromTimeline(id)} /></div>
            <div ref={themeGraphPane} hidden={!themeHasGraph || themeMode === "timeline"} className={`${css.canvasFrame} ${css.themeCanvas}`}><GraphCanvas key={retained.theme.id + ":" + retained.theme.revision} ref={themeCanvas} graph={themeState} content={themeContent} restoration={w.themeRestoration} onViewChange={scheduleCheckpoint} contentOnly fillHeight compactGuide selection={canvasSelection(w.themeSelection)} interactionBlocked={busy || !active} onEntity={(id) => w.setThemeSelection({ kind: "entity", id })} onEntityDoubleClick={(id) => { w.setThemeSelection({ kind: "entity", id }); setPane("detail"); }} onToggleEntity={(id) => { w.setThemeSelection({ kind: "entity", id }); setPane("detail"); }} onRelation={(id) => chooseRecord(id.replace(/^record:/,""))} /></div>
          </KnowledgeSplit>
        </section>}
      </div>
      <aside ref={detail} id="explorer-detail" className={`${base.panel} ${css.details}`} aria-label={en ? "Details and evidence" : "内容と根拠"}>
        <h2><Icon name="book" />{en ? "Details" : "詳細"}</h2>
        {selectedRecord ? <><KnowledgeRecordDetail dto={selectedRecord} onEntity={chooseEntity} /><Link className={css.editRecord} href={`/themes/records?record=${encodeURIComponent(selectedRecord.record.id)}&fromRevision=${selectedRecord.record.revision}`} onClick={() => checkpoint.current()}><Icon name="edit" />{en ? "Correct this record" : "この記録を訂正"}</Link></> : selectedEntity ? <><h2>{selectedEntity.content.name}</h2><p className={base.muted}>{selectedEntity.content.kind}</p>{selectedEntity.content.description && <p>{selectedEntity.content.description}</p>}
          {active ? <button onClick={() => startFrom(selectedEntity)} disabled={busy}><Icon name="arrow" />{en ? "Explore from this subject" : "この対象から探索する"}</button> : <div className={base.actions}><button onClick={() => void w.expandEntity(selectedEntity.id)} disabled={busy}><Icon name="graph" />{en ? "Expand connections" : "周囲の関係を広げる"}</button>{w.neighborPages[selectedEntity.id]?.hasMore && <button disabled={busy} onClick={() => void w.expandEntity(selectedEntity.id, w.neighborPages[selectedEntity.id]?.cursor)}>{en ? "More connections" : "関係の続きを追加"}</button>}</div>}
          {related.length > 0 && <section className={css.related}><h3>{en ? "Related themes" : "この対象のテーマ"}</h3>{related.map(themeButton)}</section>}
          <section className={css.related}><h3>{en ? "Records in this view" : "この表示の記録"}</h3>{records.filter(r => [r.record.content.subjectId,r.record.content.objectId].includes(selectedEntity.id)).map(r => <button key={r.record.id} className={css.result} onClick={() => chooseRecord(r.record.id)}>{r.record.content.assertion}</button>)}</section>
        </> : active ? <><h3>{active.theme.content.title}</h3><p className={base.muted}>{en ? "Saved composition" : "構成版"} {active.theme.revision}</p>{active.theme.content.description && <p>{active.theme.content.description}</p>}<p className={base.muted}>{en ? "Choose a timeline entry or a relation to read the same record and its evidence here." : "年表の記録や図の関係を選ぶと、対応する内容と根拠をここで読めます。"}</p></> : <p className={base.muted}>{en ? "Select a subject or relation in the graph." : "図の対象や関係を選ぶと、内容と根拠を読めます。"}</p>}
      </aside>
    </main>
  </div><SiteFooter /></>;
}
