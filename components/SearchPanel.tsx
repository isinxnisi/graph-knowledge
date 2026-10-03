"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { EntitySearchResponse, EntitySummary } from "../lib/domain/api";
import { searchPeople, errorMessage } from "../lib/client/api";
import styles from "./Explorer.module.css";

export default function SearchPanel({ onChoose, placeholder = "例：青葉ハル" }: { placeholder?: string; onChoose: (entity: EntitySummary) => void }) {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<EntitySearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    pending.current?.abort();
    setResult(null); setError(null);
    if (!q.trim()) { setLoading(false); setError("人物名を入力してください。"); return; }
    const controller = new AbortController(); pending.current = controller;
    setLoading(true);
    try {
      const response = await searchPeople(q, controller.signal);
      if (!controller.signal.aborted) setResult(response);
    } catch (error) { if (!controller.signal.aborted) setError(errorMessage(error)); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  return <section className={styles.panel} aria-labelledby="search-title">
    <h2 id="search-title">人物を検索</h2>
    <form onSubmit={submit} className={styles.searchForm}>
      <label htmlFor="person-search">人物名・別名</label>
      <input id="person-search" value={q} onChange={(event) => setQ(event.target.value)} placeholder={placeholder} autoComplete="off" />
      <button type="submit" disabled={loading}>{loading ? "検索中…" : "検索"}</button>
    </form>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {loading && <p role="status">検索結果を取得中…</p>}
    {!result && !loading && !error && <p className={styles.muted}>人物を選んで、関係とその出典を辿ってください。</p>}
    {result && <>
      <p role="status">{result.items.length ? `${result.items.length}件の候補` : "検索結果はありません。別の名前で検索してください。"}</p>
      <ul className={styles.results}>
        {result.items.map((entity) => <li key={entity.id}>
          <button className={styles.resultButton} onClick={() => onChoose(entity)} aria-label={`${entity.name} — ${entity.description ?? "説明なし"}`}>
            <strong>{entity.name}</strong><span>{entity.description ?? "説明なし"}</span>
          </button>
        </li>)}
      </ul>
      {result.hasMore && <p className={styles.muted}>他にも候補があります。検索語を絞り込んでください。</p>}
    </>}
  </section>;
}
