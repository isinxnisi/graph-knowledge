"use client";
import Icon from "./Icon";
import { trackPublicEvent } from "../lib/client/public-events";
import { useUiLocale } from "../lib/client/ui-locale";
import { explorerMessage } from "../lib/i18n/explorer";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { EntitySearchResponse, EntitySummary } from "../lib/domain/api";
import { searchEntities, errorMessage } from "../lib/client/api";
import { SEARCH_KINDS, type SearchKind } from "../lib/domain/search";
import { searchLabels } from "../lib/i18n/entity-search";
import { discoverySearchLabels } from "../lib/i18n/discovery-search";
import type { DiscoveryCriteria } from "../lib/client/use-discovery-search";
import EntitySearchResults from "./EntitySearchResults";
import styles from "./Explorer.module.css";
import searchStyles from "./DiscoverySearch.module.css";
import panelStyles from "./SearchPanel.module.css";

export default function SearchPanel({ onChoose, onDiscover, placeholder = "例：青葉ハル" }: { placeholder?: string; onChoose: (entity: EntitySummary) => void; onDiscover?: (criteria: DiscoveryCriteria) => void }) {
  const { locale } = useUiLocale(), text = searchLabels(locale), discovery = discoverySearchLabels(locale);
  const [kind, setKind] = useState<SearchKind | null>(null), [q, setQ] = useState("");
  const [result, setResult] = useState<EntitySearchResponse | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null), [composing, setComposing] = useState(false);
  const hasKeyword = !!q.trim(), discoverMode = !hasKeyword && !!onDiscover;
  const pending = useRef<AbortController | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function clearSearch() {
    if (timer.current) clearTimeout(timer.current);
    pending.current?.abort(); pending.current = null;
    setLoading(false); setResult(null); setError(null);
  }
  const runSearch = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    pending.current?.abort(); setResult(null); setError(null);
    if (!q.trim()) { setLoading(false); setError(searchLabels("ja").emptyInput); return; }
    const controller = new AbortController(); pending.current = controller; setLoading(true);
    try { const response = await searchEntities(q, controller.signal, kind); if (!controller.signal.aborted) { setResult(response); trackPublicEvent("search"); } }
    catch (e) { if (!controller.signal.aborted) setError(errorMessage(e)); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [q, kind]);
  useEffect(() => {
    if (q.trim() && !composing) timer.current = setTimeout(() => void runSearch(), 250);
    return () => { if (timer.current) clearTimeout(timer.current); pending.current?.abort(); };
  }, [q, kind, composing, runSearch]);
  function submit(event: FormEvent) { event.preventDefault(); if (composing) return; if (!q.trim() && onDiscover) onDiscover({ q: "", kind: null, presentation: "explore" }); else void runSearch(); }
  return <section className={styles.panel} aria-labelledby="search-title">
    <h2 id="search-title"><Icon name="search" />{text.title}</h2>
    <form onSubmit={submit} className={`${styles.searchForm} ${panelStyles.form}`}>
      <label htmlFor="entity-search">{text.name}</label>
      <input id="entity-search" value={q} maxLength={100} aria-controls="entity-suggestions" onCompositionStart={() => { clearSearch(); setComposing(true); }} onCompositionEnd={() => setComposing(false)} onKeyDown={event => { if (event.key === "ArrowDown") { const first = document.querySelector<HTMLButtonElement>("#entity-suggestions button"); if (first) { event.preventDefault(); first.focus(); } } }} onChange={event => { clearSearch(); setQ(event.target.value); if (!event.target.value.trim()) setKind(null); }} placeholder={placeholder} autoComplete="off" />
      <div className={panelStyles.kindReveal} data-visible={hasKeyword} aria-hidden={!hasKeyword} inert={!hasKeyword}><div className={panelStyles.kindField}>
      <label htmlFor="search-kind">{text.kind}</label>
      <select id="search-kind" disabled={!hasKeyword} value={kind ?? ""} onChange={event => { clearSearch(); setKind(event.target.value === "" ? null : event.target.value as SearchKind); }}><option value="">{text.all}</option>{SEARCH_KINDS.map(value => <option key={value} value={value}>{text.kinds[value]}</option>)}</select>
      </div></div>
      <button type="submit" disabled={loading} aria-haspopup={discoverMode ? "dialog" : undefined} data-discovery-launch="search"><Icon name={discoverMode ? "graph" : "search"} />{loading ? text.submitting : discoverMode ? text.discoverConnections : text.searchByName}</button>
    </form>
    {error && <p role="alert" className={styles.error}>{explorerMessage(error, locale)}</p>}
    {loading && <p role="status">{text.loading}</p>}
    {!result && !loading && !error && <p className={styles.muted}>{text.help}</p>}
    {result && <><p role="status">{text.count(Math.min(result.items.length, onDiscover ? 5 : 10))}</p>
      <EntitySearchResults id="entity-suggestions" items={result.items.slice(0, onDiscover ? 5 : 10)} locale={locale} onChoose={onChoose} />
      {onDiscover ? <button data-discovery-launch="more" className={searchStyles.entry} onClick={() => onDiscover({ q, kind })}>{discovery.more}<Icon name="chevron" /></button> : result.hasMore && <p className={styles.muted}>{text.more}</p>}
    </>}
  </section>;
}
