"use client";
import Icon from "./Icon";
import { useUiLocale } from "../lib/client/ui-locale";
import { explorerMessage } from "../lib/i18n/explorer";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { EntitySearchResponse, EntitySummary } from "../lib/domain/api";
import { searchEntities, errorMessage } from "../lib/client/api";
import { SEARCH_KINDS, type SearchKind } from "../lib/domain/search";
import { searchLabels } from "../lib/i18n/entity-search";
import styles from "./Explorer.module.css";

export default function SearchPanel({ onChoose, placeholder = "例：青葉ハル" }: { placeholder?: string; onChoose: (entity: EntitySummary) => void }) {
  const { locale } = useUiLocale();
  const text = searchLabels(locale);
  const [kind, setKind] = useState<SearchKind | null>(null);
  const [q, setQ] = useState("");
  const [result, setResult] = useState<EntitySearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  function clearSearch() {
    pending.current?.abort();
    pending.current = null;
    setLoading(false); setResult(null); setError(null);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    pending.current?.abort();
    setResult(null); setError(null);
    if (!q.trim()) { setLoading(false); setError(searchLabels("ja").emptyInput); return; }
    const controller = new AbortController(); pending.current = controller;
    setLoading(true);
    try {
      const response = await searchEntities(q, controller.signal, kind);
      if (!controller.signal.aborted) setResult(response);
    } catch (error) { if (!controller.signal.aborted) setError(errorMessage(error)); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  return <section className={styles.panel} aria-labelledby="search-title">
    <h2 id="search-title"><Icon name="search" />{text.title}</h2>
    <form onSubmit={submit} className={styles.searchForm}>
      <label htmlFor="entity-search">{text.name}</label>
      <input id="entity-search" value={q} onChange={(event) => { clearSearch(); setQ(event.target.value); }} placeholder={placeholder} autoComplete="off" />
      <label htmlFor="search-kind">{text.kind}</label>
      <select id="search-kind" value={kind ?? ""} onChange={(event) => { clearSearch(); setKind(event.target.value === "" ? null : event.target.value as SearchKind); }}>
        <option value="">{text.all}</option>
        {SEARCH_KINDS.map((value) => <option key={value} value={value}>{text.kinds[value]}</option>)}
      </select>
      <button type="submit" disabled={loading}><Icon name="search" />{loading ? text.submitting : text.submit}</button>
    </form>
    {error && <p role="alert" className={styles.error}>{explorerMessage(error, locale)}</p>}
    {loading && <p role="status">{text.loading}</p>}
    {!result && !loading && !error && <p className={styles.muted}>{text.help}</p>}
    {result && <>
      <p role="status">{result.items.length ? text.count(result.items.length) : text.noResults}</p>
      <ul className={styles.results}>
        {result.items.map((entity) => {
          const ambiguous = result.items.some((other) => other.id !== entity.id && other.name === entity.name && other.kind === entity.kind && other.description === entity.description);
          return <li key={entity.id}>
            <button className={styles.resultButton} onClick={() => onChoose(entity)} aria-label={`${entity.name} — ${entity.description ?? text.descriptionMissing} ／ ${text.kinds[entity.kind as SearchKind]}${entity.aliases.length ? ` ／ ${text.aliases}：${entity.aliases.join("・")}` : ""}${ambiguous ? ` ／ ID：${entity.id}` : ""}`}>
              <span>{text.kinds[entity.kind as SearchKind]}</span><strong>{entity.name}</strong><span>{entity.description ?? text.descriptionMissing}</span>
              {entity.aliases.length > 0 && <span>{text.aliases}：{entity.aliases.join("・")}</span>}
              {ambiguous && <span>ID：{entity.id}</span>}
            </button>
          </li>;
        })}
      </ul>
      {result.hasMore && <p className={styles.muted}>{text.more}</p>}
    </>}
  </section>;
}
