"use client";
import { useEffect, useRef, useState } from "react";
import { ADMIN_SORTS, type AdminEntity, type AdminIsland, type AdminResponse } from "../lib/domain/kg-admin";
import styles from "./KgAdmin.module.css";

type View = "overview" | "entities" | "islands";
type Filters = { q: string; kind: string; degree: string; min: string; max: string; sort: string; direction: string; second: string; secondDirection: string };
const empty: Filters = { q: "", kind: "", degree: "", min: "", max: "", sort: "name", direction: "asc", second: "", secondDirection: "asc" };
const words = {
  ja: { overview: "概況", entities: "Entity一覧", islands: "Island一覧", title: "KGデータ管理", search: "名前・別名・IDを検索", filter: "絞り込み・並び順", apply: "適用", reset: "リセット", name: "名前", kind: "種別", degree: "接続数", claimCount: "Claim数", islandSize: "Island規模", size: "Entity数", first: "第一ソート", second: "第二ソート", asc: "昇順", desc: "降順", none: "なし", all: "すべて", min: "最小", max: "最大", range: "Island規模（Entity数）", previous: "前へ", next: "次へ", graph: "Graphで探索 ↗", detail: "対象の詳細・根拠 ↗", members: "構成Entityを見る", reload: "最新に更新", loading: "取得中…", error: "取得できませんでした。認証・接続を確認して再試行してください。", changed: "KGが更新されました。最新に更新して先頭から確認してください。", empty: "条件に一致するデータはありません。", scope: "現行public-kgの全Entity。接続は肯定・公開・非デモの支持根拠があるClaimだけ。未公開・否定・支持根拠なしは接続から除外。", excluded: "接続対象外（未公開／否定／支持根拠なし）", isolated: "接続0", measured: "計測", readonly: "読み取り専用", menu: "メニュー", back: "一覧へ戻る", results: "件", distribution: "接続数の分布", metadata: "参照スコープと集計", close: "閉じる" },
  en: { overview: "Overview", entities: "Entities", islands: "Islands", title: "KG administration", search: "Search name, alias or ID", filter: "Filters & sorting", apply: "Apply", reset: "Reset", name: "Name", kind: "Kind", degree: "Neighbors", claimCount: "Claims", islandSize: "Island size", size: "Entities", first: "Primary sort", second: "Secondary sort", asc: "Ascending", desc: "Descending", none: "None", all: "All", min: "Minimum", max: "Maximum", range: "Island size (Entities)", previous: "Previous", next: "Next", graph: "Explore Graph ↗", detail: "Entity & evidence ↗", members: "View members", reload: "Refresh", loading: "Loading…", error: "Unable to load. Check authentication and connection, then retry.", changed: "The KG changed. Refresh to start from the first page.", empty: "No matching data.", scope: "All Entities in the current public-kg. Connections use affirmed, published Claims with supporting non-demo sources. Unpublished, denied and unsupported Claims do not connect Entities.", excluded: "Excluded connections (unpublished / denied / unsupported)", isolated: "Zero neighbors", measured: "Measured", readonly: "Read only", menu: "Menu", back: "Back to list", results: "results", distribution: "Neighbor distribution", metadata: "Scope & measurement", close: "Close" },
};
export default function KgAdmin({ locale }: { locale: "ja" | "en" }) {
  const t = words[locale], [view, setView] = useState<View>("entities");
  const [filters, setFilters] = useState<Filters>(empty), [draft, setDraft] = useState<Filters>(empty);
  const [offset, setOffset] = useState(0), [revision, setRevision] = useState<string>(), [island, setIsland] = useState<AdminIsland | null>(null);
  const [selected, setSelected] = useState<AdminEntity | null>(null), [data, setData] = useState<AdminResponse | null>(null);
  const [menu, setMenu] = useState(false), [expanded, setExpanded] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [reload, setReload] = useState(0), generation = useRef(0), menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const controller = new AbortController(), version = ++generation.current;
    const params = new URLSearchParams({ view, offset: String(offset) });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    if (revision) params.set("revision", revision);
    if (island) params.set("island", island.id);
    fetch(`/api/kg-admin?${params}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error(response.status === 409 ? t.changed : t.error);
      const result = await response.json() as AdminResponse;
      if (version === generation.current) { setData(result); setLoading(false); }
    }).catch(err => { if (!controller.signal.aborted && version === generation.current) { setData(null); setError(err instanceof Error ? err.message : t.error); setLoading(false); } });
    return () => controller.abort();
  }, [view, offset, filters, revision, island, reload, t]);
  const detailDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (selected) detailDialog.current?.showModal(); }, [selected]);
  const begin = () => { generation.current++; setLoading(true); setError(""); setData(null); setSelected(null); };
  const changeView = (next: View) => { begin(); setView(next); setFilters(empty); setDraft(empty); setOffset(0); setRevision(undefined); setIsland(null); setMenu(false); setExpanded(false); };
  const refresh = () => { begin(); setRevision(undefined); setIsland(null); setOffset(0); setReload(n => n + 1); };
  const field = (key: keyof Filters, value: string) => setDraft(old => ({ ...old, [key]: value }));
  const pills = (key: keyof Filters, values: string[], labels: string[]) => <div className={styles.pills}>{values.map((value, i) => <label key={value}><input type="radio" name={key} value={value} checked={draft[key] === value} onChange={() => field(key, value)} /><span>{draft[key] === value ? "◉" : "◯"} {labels[i]}</span></label>)}</div>;
  const sortKeys = ADMIN_SORTS[view === "islands" ? "islands" : "entities"];
  const sortLabel = (key: string) => t[key as keyof typeof t] ?? key;
  const publicBase = `https://plunode.net${locale === "en" ? "/en" : ""}`;
  const page = (next: number) => { if (!data) return; begin(); setRevision(data.revision); setOffset(next); };
  const openIsland = (item: AdminIsland) => { if (!data) return; begin(); setRevision(data.revision); setIsland(item); setView("entities"); setOffset(0); setFilters(empty); setDraft(empty); };
  return <div className={styles.shell}>
    <header className={styles.header}><a href="https://plunode.net" target="_blank" rel="noreferrer" className={styles.brand}>Plunode <small>ADMIN</small></a><span>{t.readonly}</span><a href={locale === "ja" ? "/en/kg-admin" : "/kg-admin"}>{locale === "ja" ? "EN" : "日本語"}</a><button ref={menuButton} className={styles.mobileMenu} aria-expanded={menu} onClick={() => setMenu(!menu)}>{t.menu}</button></header>
    <nav className={`${styles.nav} ${menu ? styles.open : ""}`} aria-label={t.menu} onKeyDown={e => { if (e.key === "Escape") { setMenu(false); menuButton.current?.focus(); } }}>
      <strong>{t.title}</strong>{(["overview", "entities", "islands"] as View[]).map(key => <button key={key} aria-current={view === key && !island ? "page" : undefined} onClick={() => changeView(key)}>{t[key]}</button>)}<a href="https://plunode.net/operations" target="_blank" rel="noreferrer">{locale === "ja" ? "サイト運営 ↗" : "Site operations ↗"}</a>
    </nav>
    <main className={styles.main}><div className={styles.heading}><h1>{island ? `${t.islands} · ${island.name}` : t[view]}</h1><button onClick={refresh}>{t.reload}</button></div>
      {island && <div className={styles.islandBar}><button onClick={() => changeView("islands")}>← {t.back}</button><span>{data?.island?.size ?? island.size} Entity · {data?.island?.claimCount ?? "…"} Claim</span></div>}
      {view !== "overview" && <form className={styles.filters} onSubmit={e => { e.preventDefault(); begin(); setFilters(draft); setOffset(0); setRevision(island ? revision : undefined); setExpanded(false); }}>
        <div className={styles.search}><input aria-label={t.search} placeholder={t.search} value={draft.q} onChange={e => field("q", e.target.value)} maxLength={100} /><button type="submit">{t.apply}</button><button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{t.filter}</button></div>
        {!expanded && <div className={styles.active}>{sortLabel(filters.sort)} {filters.direction === "asc" ? "↑" : "↓"}{filters.second && ` · ${sortLabel(filters.second)} ${filters.secondDirection === "asc" ? "↑" : "↓"}`}{filters.degree && ` · ${t.degree} ${filters.degree}`}{filters.kind && ` · ${filters.kind}`}{(filters.min || filters.max) && ` · ${t.range} ${filters.min || "0"}–${filters.max || "∞"}`}</div>}
        {expanded && <div className={styles.options}>
          <fieldset><legend>{t.kind}</legend>{data && data.kinds.length < 10 ? pills("kind", ["", ...data.kinds], [t.all, ...data.kinds]) : <input aria-label={t.kind} value={draft.kind} onChange={e => field("kind", e.target.value)} />}</fieldset>
          <fieldset><legend>{t.degree}</legend>{pills("degree", ["", "0", "1", "2", "3+"], [t.all, "0", "1", "2", "3+"])}</fieldset>
          <fieldset><legend>{t.range}</legend><div className={styles.range}><input aria-label={t.min} placeholder={t.min} type="number" min="0" step="1" value={draft.min} onChange={e => field("min", e.target.value)} /><span>—</span><input aria-label={t.max} placeholder={t.max} type="number" min="0" step="1" value={draft.max} onChange={e => field("max", e.target.value)} /></div></fieldset>
          <fieldset><legend>{t.first}</legend>{pills("sort", [...sortKeys], sortKeys.map(sortLabel))}{pills("direction", ["asc", "desc"], [t.asc, t.desc])}</fieldset>
          <fieldset><legend>{t.second}</legend>{pills("second", ["", ...sortKeys], [t.none, ...sortKeys.map(sortLabel)])}{pills("secondDirection", ["asc", "desc"], [t.asc, t.desc])}</fieldset>
          <div><button type="submit">{t.apply}</button> <button type="button" onClick={() => setDraft(empty)}>{t.reset}</button></div>
        </div>}
      </form>}
      {loading && <p role="status">{t.loading}</p>}{error && <p role="alert" className={styles.error}>{error}</p>}
      {data && !loading && <>
        {view === "overview" ? <><div className={styles.metrics}>{[[t.entities, data.summary.entityCount], [t.islands, data.summary.islandCount], [t.isolated, data.summary.isolatedCount], [t.claimCount, data.summary.claimCount]].map(([label, count]) => <div key={label}><span>{label}</span><strong>{count.toLocaleString(locale)}</strong></div>)}</div><h2>{t.distribution}</h2><table><thead><tr><th>{t.degree}</th><th>Entity</th></tr></thead><tbody>{data.summary.distribution.map((count, i) => <tr key={i}><td>{i === 3 ? "3+" : i}</td><td>{count}</td></tr>)}</tbody></table></> : <>
          <div className={styles.resultbar}><span>{data.total.toLocaleString(locale)} {t.results}{data.total > 0 && ` · ${offset + 1}–${Math.min(offset + 40, data.total)}`}</span><span>{t.readonly}</span></div>
          <div className={styles.tableWrap}><table><thead><tr><th>{t.name}</th>{view === "entities" ? <><th>{t.kind}</th><th>{t.degree}</th><th>{t.claimCount}</th><th>{t.islandSize}</th></> : <><th>{t.size}</th><th>{t.claimCount}</th><th>{t.kind}</th></>}</tr></thead><tbody>{data.items.map(item => "degree" in item ? <tr key={item.id}><td><button onClick={() => setSelected(item)}>{item.name}</button></td><td>{item.kind}</td><td>{item.degree}</td><td>{item.claimCount}</td><td><button onClick={() => openIsland({ id: item.islandId, name: item.name, size: item.islandSize, representativeId: item.id, claimCount: 0, kinds: {} })}>{item.islandSize} →</button></td></tr> : <tr key={item.id}><td><button onClick={() => openIsland(item)}>{item.name}</button></td><td>{item.size}</td><td>{item.claimCount}</td><td>{Object.entries(item.kinds).map(([kind, count]) => `${kind} ${count}`).join(" · ")}</td></tr>)}</tbody></table></div>
          {!data.items.length && <p>{t.empty}</p>}
          <div className={styles.pagination}><button disabled={!offset} onClick={() => page(Math.max(0, offset - 40))}>{t.previous}</button><button disabled={data.nextOffset === null} onClick={() => page(data.nextOffset!)}>{t.next}</button></div>
        </>}
        {selected && <dialog ref={detailDialog} className={styles.detail} aria-label={selected.name} onCancel={() => setSelected(null)}><div className={styles.heading}><h2>{selected.name}</h2><button onClick={() => setSelected(null)}>{t.close}</button></div><p>{selected.kind} · {selected.degree} {t.degree} · {selected.claimCount} Claim · {selected.islandSize} Entity / Island</p><code>{selected.id}</code><div><a href={`${publicBase}/?read=entity&dataset=public-kg&id=${selected.id}`} target="_blank" rel="noreferrer">{t.detail}</a> <a href={`${publicBase}/explore/${selected.id}`} target="_blank" rel="noreferrer">{t.graph}</a><button onClick={() => openIsland({ id: selected.islandId, name: selected.name, size: selected.islandSize, representativeId: selected.id, claimCount: 0, kinds: {} })}>{t.members}</button></div></dialog>}
        <details className={styles.metadata} open={view === "overview"}><summary>{t.metadata} · public-kg</summary><p>{t.scope}</p><p>{t.excluded}: {data.summary.excluded.unpublished} / {data.summary.excluded.denied} / {data.summary.excluded.unsupported}</p><p>{t.measured}: {data.measuredAt}<br />revision: <code>{data.revision}</code></p><p>{locale === "ja" ? "隣接数は異なるEntity数。多重Claimは別件。別経路の未受入・試験データは含みません。Graph側の表示・探索条件は別です。" : "Neighbors count distinct Entities; parallel Claims remain separate. Pending and trial datasets elsewhere are excluded. Graph has its own display and exploration rules."}</p></details>
      </>}
    </main>
  </div>;
}
