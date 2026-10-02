"use client";

import { useEffect, useState } from "react";
import type { EntityDetail, EntitySummary } from "../lib/domain/api";
import type { Expansion } from "../lib/client/graph-state";
import { fetchEntity, errorMessage } from "../lib/client/api";
import { KIND_LABELS } from "../lib/client/format";
import styles from "./Explorer.module.css";

export default function EntityDetails({ entity, expansion, onExpand }: {
  entity: EntitySummary; expansion?: Expansion; onExpand: (more: boolean) => void;
}) {
  const [detail, setDetail] = useState<EntityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetchEntity(entity.id, controller.signal).then((result) => {
      if (!controller.signal.aborted) setDetail(result.entity);
    }).catch((error) => { if (!controller.signal.aborted) setError(errorMessage(error)); });
    return () => controller.abort();
  }, [entity.id, attempt]);
  return <section aria-label="Entity詳細">
    <h3>{entity.name}</h3><p className={styles.badge}>{KIND_LABELS[entity.kind]}</p>
    <p>{entity.description ?? "説明は未登録です。"}</p>
    {!detail && !error && <p role="status">Entity詳細を取得中…</p>}
    {detail && <p>別名：{detail.aliases.length ? detail.aliases.join("、") : "未登録"}</p>}
    {error && <div role="alert" className={styles.error}><p>{error}</p><button onClick={() => { setError(null); setDetail(null); setAttempt((value) => value + 1); }}>Entity詳細を再試行</button></div>}
    {expansion?.loading && <p role="status">{expansion.expanded ? "続きを取得中…" : "隣接関係を取得中…"}</p>}
    {expansion?.error && <div role="alert" className={styles.error}><p>{expansion.error}</p>
      {!expansion.blocked && <button onClick={() => onExpand(expansion.expanded)}>Graph取得を再試行</button>}
    </div>}
    {expansion?.expanded && !expansion.hasMore && <p className={styles.muted}>このEntityの近傍は取得済みです。</p>}
    {expansion?.hasMore && <button onClick={() => onExpand(true)} disabled={expansion.loading || expansion.blocked}>
      {expansion.loading ? "続きを取得中…" : "続きを表示"}
    </button>}
  </section>;
}
