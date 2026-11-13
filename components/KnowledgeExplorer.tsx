"use client";
import ExternalSourceLink from "./ExternalSourceLink";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "./NavigationLink";
import GraphCanvas, { type CanvasContent } from "./GraphCanvas";
import { emptyGraph, type Selection } from "../lib/client/graph-state";
import { themeTimeLabel } from "../lib/domain/theme-time";
import type { KnowledgePublishedRecord } from "../lib/domain/knowledge-publication";
import type { KnowledgeEntityVersion } from "../lib/domain/knowledge-foundation";
import { contributionLabels } from "../lib/i18n/contribution";
import KnowledgeSourceBibliography from "./KnowledgeSourceBibliography";
import css from "./KnowledgeExplorer.module.css";

type Page = { generation: string; records: KnowledgePublishedRecord[]; entities: KnowledgeEntityVersion[]; nextCursor: string | null; hasMore: boolean };
type Graph = { generation: string; records: KnowledgePublishedRecord[]; entities: KnowledgeEntityVersion[] };
type Status = { active: { id: string; publishedAt: string; recordCount: number } | null; changeToken: string; pending: boolean; lastFailure: { message: string } | null };
type Facets = { generation: string; concepts: { id: string; label: string }[] };
const roles = contributionLabels().roles;

async function read<T>(mode: string, args: Record<string, unknown> = {}): Promise<T> {
  const params = new URLSearchParams({ mode });
  for (const [key, value] of Object.entries(args)) if (value !== undefined && value !== "") params.set(key, String(value));
  const response = await fetch("/api/knowledge/public?" + params, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "公開データを読めませんでした。再試行できます。");
  return data;
}
const merge = (before: KnowledgePublishedRecord[], next: KnowledgePublishedRecord[]) => [...new Map([...before, ...next].map((r) => [r.record.id, r])).values()];
const endpoints = (records: KnowledgePublishedRecord[]) => [...new Map(records.flatMap((r) => r.entities).map((e) => [e.id, e])).values()];

function Detail({ dto, onEntity }: { dto: KnowledgePublishedRecord; onEntity: (id: string) => void }) {
  const r = dto.record.content, typed = dto.legacyTyped;
  const name = (id: string | null) => dto.entities.find((e) => e.id === id)?.content.name ?? "対象なし";
  return <article>
    <h2>{r.kind === "relation" ? `${name(r.subjectId)} → ${name(r.objectId)}` : "出来事・説明"}</h2>
    {dto.entities.length > 0 && <div className={css.actions} aria-label="図の対象から辿る">{dto.entities.map((e) => <button key={e.id} onClick={() => onEntity(e.id)}>{e.content.name}</button>)}</div>}
    <div className={css.meta}>内容版 {dto.record.revision} · {r.polarity === "affirmed" ? "肯定" : r.polarity === "denied" ? "否定" : "不確実"}</div>
    {r.relation && <p lang={r.textLanguages?.relation?.tag}><strong>{r.relation}</strong></p>}<p lang={r.textLanguages?.assertion?.tag}>{r.assertion}</p>
    {r.scope && <p>範囲：{r.scope}</p>}
    {r.times.map((t) => <p key={t.id}>{themeTimeLabel(t.time)}</p>)}
    {typed?.event && <p>開催期間：{typed.event.metadata.period.from?.value ?? "未記載"} 〜 {typed.event.metadata.period.to?.value ?? "未記載"}<br /><span className={css.meta}>人物の参加期間とは別の情報です。</span></p>}
    {dto.semantics.status === "current" && dto.semantics.concept && <p className={css.meta}>意味対応：{dto.semantics.concept.label}</p>}
    {dto.semantics.status === "stale" && <p className={css.meta}>意味対応は旧内容へのものです。現在の意味条件には含めません。</p>}
    {r.evidence.map((e) => { const s = dto.sources.find((s) => s.id === e.source.id && s.revision === e.source.revision); return <div className={css.source} key={e.id}>
      {s?.content.url ? <ExternalSourceLink href={s.content.url} label={s.content.title}/> : <strong>{s?.content.title ?? "資料"}</strong>}
      <div className={css.meta}>資料版 {e.source.revision} · {e.locator} · {({ support: "支持", refute: "反証", background: "背景" })[e.stance]}</div>
      {s?.content.bibliography && <KnowledgeSourceBibliography value={s.content.bibliography} className={css.meta}/>}
      {e.excerpt && <blockquote lang={e.textLanguages?.excerpt?.tag}>{e.excerpt}</blockquote>}
    </div>; })}
  </article>;
}

export default function KnowledgeExplorer() {
  const [page, setPage] = useState<Page | null>(null), [status, setStatus] = useState<Status | null>(null);
  const [query, setQuery] = useState(""), [predicate, setPredicate] = useState("");
  const [facets, setFacets] = useState<Facets | null>(null);
  const [graphRecords, setGraphRecords] = useState<KnowledgePublishedRecord[]>([]);
  const [extraEntities, setExtraEntities] = useState<KnowledgeEntityVersion[]>([]);
  const [selected, setSelected] = useState<KnowledgePublishedRecord | null>(null);
  const [entity, setEntity] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [view, setView] = useState("results"), [epoch, setEpoch] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [neighborPage, setNeighborPage] = useState<{ entityId: string; cursor: string | null } | null>(null);
  const [target, setTarget] = useState("");
  const applied = useRef<Record<string, unknown>>({});
  const request = useRef(0), generation = useRef<string | null>(null), visible = useRef<string[]>([]), resultIds = useRef<string[]>([]), accessToken = useRef<string | null>(null);
  const graphEntities = useMemo(() => [...new Map([...extraEntities, ...endpoints(graphRecords)].map((e) => [e.id, e])).values()], [graphRecords, extraEntities]);
  const canvas = useMemo<CanvasContent>(() => ({ nodes: graphEntities.map((e) => ({ id: e.id, label: e.content.name, kind: e.content.kind })), relations: Object.fromEntries(graphRecords.filter((r) => r.record.content.kind === "relation").map((r) => {
    const c = r.record.content, id = "record:" + r.record.id;
    const label = c.relation + (c.polarity === "denied" ? "（否定）" : c.polarity === "uncertain" ? "（不確実）" : "");
    return [id, { id, subjectId: c.subjectId!, objectId: c.objectId!, claimIds: [r.record.id], polarity: c.polarity, label, canvasLabel: label, badge: "" }];
  })) }), [graphRecords, graphEntities]);
  const canvasState = useMemo(() => emptyGraph(epoch), [epoch]);
  useEffect(() => { visible.current = graphRecords.map((r) => r.record.id); }, [graphRecords]);
  useEffect(() => { resultIds.current = page?.records.map((r) => r.record.id) ?? []; }, [page]);

  useEffect(() => {
    let alive = true, polling = false;
    const pendingRequest = request;
    async function poll() {
      if (polling) return;
      polling = true;
      const token = request.current;
      try {
        const s = await read<Status>("status"); if (!alive) return; setStatus(s);
        if (token !== request.current) return;
        if (s.active && !generation.current) {
          const [result, f] = await Promise.all([read<Page>("search"), read<Facets>("facets", { generation: s.active.id })]);
          if (!alive || token !== request.current) return;
          // Both requests must describe the same immutable generation.
          if (result.generation !== f.generation) return;
          generation.current = result.generation; setPage(result); setError("");
          setFacets(f);
          accessToken.current = s.changeToken;
          return;
        }
        if (s.changeToken !== accessToken.current && generation.current) {
          const current = generation.current;
          const ids = [...new Set([...resultIds.current, ...visible.current])];
          const capturedVisible = visible.current.join(","), capturedResults = resultIds.current.join(",");
          const [batches, f] = await Promise.all([Promise.all(Array.from({ length: Math.max(1, Math.ceil(ids.length / 200)) }, (_, i) => read<Graph>("graph", { generation: current, recordIds: ids.slice(i * 200, (i + 1) * 200).join(",") }))), read<Facets>("facets", { generation: current })]);
          const graph = { records: batches.flatMap((b) => b.records) };
          if (!alive || token !== request.current || generation.current !== current || visible.current.join(",") !== capturedVisible || resultIds.current.join(",") !== capturedResults) return;
          const allowed = new Set(graph.records.map((r) => r.record.id));
          const displayed = graph.records.filter((r) => capturedVisible.split(",").includes(r.record.id));
          // Access changes can remove content, but never replace a reader's search or diagram.
          setPage((old) => old ? { ...old, records: old.records.filter((r) => allowed.has(r.record.id)) } : old);
          setGraphRecords(displayed); setExtraEntities(endpoints(displayed)); setFacets(f);
          setSelected((old) => old && allowed.has(old.record.id) ? old : null);
          setEntity((old) => old && endpoints(displayed).some((e) => e.id === old) ? old : null);
        }
        accessToken.current = s.changeToken;
      } catch (e) {
        if (alive && token === request.current && !generation.current) setError(e instanceof Error ? e.message : "読取準備中です。再試行できます。");
      }
      finally { polling = false; }
    }
    void poll(); const timer = setInterval(() => { void poll(); }, 4000);
    return () => { alive = false; clearInterval(timer); pendingRequest.current++; };
  }, []);

  async function search(args: Record<string, unknown>, append = false, latest = false) {
    const token = ++request.current; setBusy(true); setError(""); setMessage("");
    try {
      const result = await read<Page>("search", { ...args, ...(!latest && generation.current ? { generation: generation.current } : {}) });
      if (token !== request.current) return;
      setPage((old) => append && old ? { ...result, records: merge(old.records, result.records) } : result);
      generation.current = result.generation;
      if (!append) { applied.current = args; setGraphRecords([]); setExtraEntities([]); setSelected(null); setEntity(null); setSelection(null); setNeighborPage(null); setEpoch((s) => s + 1); setView("results"); }
      const f = await read<Facets>("facets", { generation: result.generation }); if (token === request.current) setFacets(f);
    } catch (e) { if (token === request.current) setError(e instanceof Error ? e.message : "検索できませんでした"); } finally { if (token === request.current) setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const args: Record<string, unknown> = { q: query };
    for (const key of ["predicate", "roleId", "isbn13", "relationLabel", "polarity", "conceptId"]) { const value = form.get(key); if (value) args[key] = String(value); }
    void search(args);
  }
  async function choose(id: string) {
    const token = ++request.current; setBusy(true); setError(""); setMessage("");
    try {
      const result = await read<{ generation: string; record: KnowledgePublishedRecord }>("record", { generation: generation.current, recordId: id });
      if (token !== request.current) return;
      setSelected(result.record); setEntity(null); setSelection({ kind: "relation", id: "record:" + id });
      setGraphRecords((old) => merge(old, [result.record])); setView(result.record.record.content.kind === "relation" ? "graph" : "detail");
    } catch (e) { if (token === request.current) setError(e instanceof Error ? e.message : "記録を読めませんでした"); } finally { if (token === request.current) setBusy(false); }
  }
  async function expand(id: string, after?: string | null) {
    const token = ++request.current; setBusy(true); setError("");
    try {
      const result = await read<Page & { center: KnowledgeEntityVersion }>("neighbors", { generation: generation.current, entityId: id, cursor: after ?? undefined });
      if (token !== request.current) return;
      setGraphRecords((old) => merge(old, result.records)); setExtraEntities((old) => [...new Map([...old, result.center].map((e) => [e.id, e])).values()]);
      setNeighborPage({ entityId: id, cursor: result.nextCursor }); setMessage(result.records.length ? "関係を図へ追加しました。" : "この対象の表示できる関係はありません。");
      setView("graph");
    } catch (e) { if (token === request.current) setError(e instanceof Error ? e.message : "周囲を読めませんでした"); } finally { if (token === request.current) setBusy(false); }
  }
  async function findPath() {
    if (!entity || !target) return; const token = ++request.current; setBusy(true); setError("");
    try {
      const result = await read<{ records: KnowledgePublishedRecord[]; entities: KnowledgeEntityVersion[]; paths: { recordIds: string[] }[]; hasMore: boolean }>("paths", { generation: generation.current, from: entity, to: target });
      if (token !== request.current) return;
      setGraphRecords((old) => merge(old, result.records)); setExtraEntities((old) => [...new Map([...old, ...result.entities].map((e) => [e.id, e])).values()]);
      setMessage(result.paths.length ? `${result.paths.length}本の経路を表示しました${result.hasMore ? "（続きあり）" : ""}。経路は直接の関係や因果を意味しません。` : "3段以内の経路は見つかりませんでした。");
    } catch (e) { if (token === request.current) setError(e instanceof Error ? e.message : "経路を読めませんでした"); } finally { if (token === request.current) setBusy(false); }
  }
  function inspectEntity(id: string) {
    request.current++; setEntity(id); setSelected(null); setSelection({ kind: "entity", id }); setTarget(""); setView("graph");
  }

  const currentEntity = graphEntities.find((e) => e.id === entity);
  return <main className={css.shell}>
    <nav className={css.nav}><Link href="/themes/records">← 共通の記録</Link><span>このPCの確認用 · 公開した記録を読む</span></nav>
    <div className={css.intro}><h1>記録から、つながりを辿る</h1><p>名前や具体的な関係を探し、その記録と根拠を同じ図で読みます。</p></div>
    {status?.pending && <p className={css.notice}>{status.lastFailure ? "反映処理を再試行しています。いま読める版は維持しています。" : "記録の更新を探索へ反映しています。"}</p>}
    {status?.active && page && status.active.id !== page.generation && <div className={css.notice}>新しい公開版があります。<button disabled={busy} onClick={() => void search(applied.current, false, true)}>最新版を読む</button></div>}
    {error && <div className={`${css.notice} ${css.error}`} role="alert">{error}<button onClick={() => void search(applied.current, false, !page)} disabled={busy}>再試行</button></div>}
    <form onSubmit={submit}>
      <div className={css.search}><input aria-label="名前・関係・根拠を検索" placeholder="名前・関係・根拠を検索" value={query} onChange={(e) => setQuery(e.target.value)} /><button data-primary disabled={busy}>検索</button></div>
      <details className={css.filters}><summary>条件を絞る</summary><div className={css.fields}>
        <label>関係の分類<select name="predicate" value={predicate} onChange={(e) => setPredicate(e.target.value)}><option value="">すべて</option><option value="CONTRIBUTED_TO">制作クレジット</option><option value="AFFILIATED_WITH">所属・立場</option><option value="PARTICIPATED_IN">イベント参加</option><option value="INFLUENCED_BY">影響</option><option value="ASSISTANT_OF">アシスタント</option></select></label>
        {predicate === "CONTRIBUTED_TO" && <><label>役割<select name="roleId"><option value="">すべて</option>{Object.entries(roles).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>刊行物のISBN<input name="isbn13" maxLength={13} inputMode="numeric" /></label></>}
        <label>具体的な関係名<input name="relationLabel" placeholder="完全一致" /></label>
        <label>肯否<select name="polarity"><option value="">すべて</option><option value="affirmed">肯定</option><option value="denied">否定</option><option value="uncertain">不確実</option></select></label>
        <label>意味対応<select name="conceptId"><option value="">指定しない</option>{facets?.concepts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      </div><p className={css.hint}>分類・役割は対応のある記録だけを絞ります。言葉での検索は未整理の具体的な関係も対象です。</p></details>
    </form>
    {message && <p className={css.notice} role="status">{message}</p>}
    <div className={css.tabs}>{([['results','記録'],['graph','関係図'],['detail','内容と根拠']] as const).map(([id,label]) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}</div>
    <div className={css.layout} data-view={view}>
      <section className={`${css.panel} ${css.results}`} aria-label="検索結果"><h2>{page ? `${page.records.length}件を表示${page.hasMore ? '・続きあり' : ''}` : "読取準備中"}</h2>
        {page?.records.map((r) => <button key={r.record.id} className={css.result} aria-pressed={selected?.record.id === r.record.id} onClick={() => void choose(r.record.id)} disabled={busy}><strong>{r.record.content.assertion}</strong><span className={css.meta}>{r.record.content.relation || "出来事・説明"} · 内容版 {r.record.revision}</span></button>)}
        {page && !page.records.length && <p className={css.hint}>条件に合う記録はありません。</p>}
        {page?.hasMore && <button disabled={busy} onClick={() => void search({ ...applied.current, cursor: page.nextCursor }, true)}>続きを読む</button>}
      </section>
      <section className={`${css.panel} ${css.reader}`} aria-label="関係図と根拠">
        <div className={css.topline}><span>{graphEntities.length}対象・{graphRecords.filter((r) => r.record.content.kind === "relation").length}関係</span><span className={css.meta}>{busy ? "読み込み中…" : page ? "同じ公開版を読んでいます" : "公開版の準備待ち"}</span></div>
        <div className={css.graph}><GraphCanvas graph={canvasState} content={canvas} contentOnly fillHeight compactGuide selection={selection} interactionBlocked={busy} onEntity={inspectEntity} onToggleEntity={(id) => void expand(id)} onEntityDoubleClick={(id) => void expand(id)} onRelation={(id) => void choose(id.replace(/^record:/,""))} /></div>
        <div className={css.detail}>
          {currentEntity ? <><h2>{currentEntity.content.name}</h2><p className={css.meta}>{currentEntity.content.kind} · 対象版 {currentEntity.revision}</p><p>{currentEntity.content.description}</p><div className={css.actions}><button data-primary disabled={busy} onClick={() => void expand(currentEntity.id)}>周囲の関係を広げる</button>{neighborPage?.entityId === currentEntity.id && neighborPage.cursor && <button disabled={busy} onClick={() => void expand(currentEntity.id, neighborPage.cursor)}>関係の続きを追加</button>}</div><details className={css.details}><summary>表示中の別の対象まで辿る</summary><div className={css.fields}><label>行き先<select value={target} onChange={(e) => setTarget(e.target.value)}><option value="">選択</option>{graphEntities.filter((e) => e.id !== entity).map((e) => <option key={e.id} value={e.id}>{e.content.name}</option>)}</select></label></div><button disabled={busy || !target} onClick={() => void findPath()}>3段以内の経路を読む</button></details></> : selected ? <Detail dto={selected} onEntity={inspectEntity} /> : <p className={css.hint}>記録を選ぶと図と根拠を読めます。図の対象から周囲の関係も広げられます。</p>}
        </div>
      </section>
    </div>
  </main>;
}
