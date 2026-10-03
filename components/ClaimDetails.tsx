"use client";

import { matchesPredicate, type PredicateFilter } from "../lib/domain/exploration";
import { explorationLabels } from "../lib/i18n/exploration";
import { useEffect, useState } from "react";
import type { ClaimDetail, ClaimResponse, EntitySummary, SourceDetail } from "../lib/domain/api";
import { fetchClaim, errorMessage } from "../lib/client/api";
import { formatDate, formatPeriod, polarityLabel } from "../lib/client/format";
import { entityLabel } from "../lib/client/graph-presentation";
import { PREDICATES } from "../lib/domain/predicates";
import styles from "./Explorer.module.css";

const SOURCE_KINDS = { book: "書籍", interview: "インタビュー", magazine: "雑誌", web: "ウェブ", paper: "論文" };
function usableUrl(source: SourceDetail): boolean {
  if (!source.url || source.isDemo) return false;
  try { const url = new URL(source.url); return ["http:", "https:"].includes(url.protocol) && !url.hostname.endsWith(".invalid"); }
  catch { return false; }
}

export function ClaimCard({ claim, nodes, title }: { claim: ClaimDetail; nodes: Record<string, EntitySummary>; title: string }) {
  return <article className={styles.claimCard} data-testid={`claim-card-${claim.id}`}>
    <h4>{title}</h4>
    <span className={styles.muted}>関係についての主張</span>
    <p><strong>{nodes[claim.subjectId] ? entityLabel(nodes[claim.subjectId], nodes).replace("\n", " / ") : "主体"} → {PREDICATES[claim.predicate].label} → {nodes[claim.objectId] ? entityLabel(nodes[claim.objectId], nodes).replace("\n", " / ") : "対象"}</strong></p>
    <p className={claim.polarity === "denied" ? styles.denied : styles.badge}>{polarityLabel(claim)}する主張</p>
    <dl className={styles.claimFacts}><dt>関係の期間</dt><dd>{formatPeriod(claim.period)}</dd></dl>
    <p>{claim.sourceCount ? `出典 ${claim.sourceCount}件` : "出典未確認"}</p>
    {!claim.citations.length && <p className={styles.muted}>この主張の出典はまだ登録されていません。</p>}
    {!!claim.citations.length && <h5 className={styles.evidenceTitle}>根拠となる出典と参照箇所</h5>}
    {claim.citations.map((citation, index) => <section key={citation.id} className={styles.citation} aria-label="出典と参照箇所">
      <p className={styles.muted}>出典 {index + 1} · {SOURCE_KINDS[citation.source.kind]}</p>
      <h5>{citation.source.title}</h5>
      <p>{SOURCE_KINDS[citation.source.kind]} · {citation.stance === "support" ? "この主張を支持" : citation.stance === "refute" ? "この主張への反証" : "背景資料"}</p>
      <p><strong>参照箇所：{citation.locator}</strong></p>
      <p>公開日：{formatDate(citation.source.publishedAt)}</p>
      <p>著者：{citation.source.authors.length ? citation.source.authors.join("、") : "不明"}</p>
      {citation.source.publisher && <p>発行者：{citation.source.publisher}</p>}
      {citation.source.edition && <p>版・号：{citation.source.edition}</p>}
      {citation.source.url && <p>{usableUrl(citation.source)
        ? <a href={citation.source.url} target="_blank" rel="noopener noreferrer">出典のURLを開く</a>
        : <span>デモURL（リンク無効）：{citation.source.url}</span>}</p>}
      {citation.accessedAt && <p>アクセス日：{formatDate({ value: citation.accessedAt, precision: "day" })}</p>}
      {citation.note && <p>{citation.note}</p>}{citation.source.note && <p className={styles.muted}>{citation.source.note}</p>}
    </section>)}
  </article>;
}

export default function ClaimDetails({ id, nodes, mode = "claim", visibleClaimIds, predicates = null }: { id: string; nodes: Record<string, EntitySummary>; mode?: "claim" | "relation"; visibleClaimIds?: string[]; predicates?: PredicateFilter }) {
  const [primary, setPrimary] = useState<ClaimResponse | null>(null);
  const [related, setRelated] = useState<ClaimDetail[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [relatedError, setRelatedError] = useState<string | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const result = await fetchClaim(id, controller.signal);
        if (controller.signal.aborted) return;
        setPrimary(result); setRelatedLoading(result.relatedClaimIds.length > 0);
        const responses = await Promise.allSettled(result.relatedClaimIds.map((relatedId) => fetchClaim(relatedId, controller.signal)));
        if (controller.signal.aborted) return;
        setRelated(responses.flatMap((response) => response.status === "fulfilled" ? [response.value.claim] : []));
        if (responses.some((response) => response.status === "rejected")) setRelatedError("他の主張の一部を取得できませんでした。");
        setRelatedLoading(false);
      } catch (error) { if (!controller.signal.aborted) setError(errorMessage(error)); }
    }
    void load(); return () => controller.abort();
  }, [id, attempt]);
  function retry() {
    setPrimary(null); setRelated([]); setError(null); setRelatedError(null); setRelatedLoading(false); setAttempt((value) => value + 1);
  }
  return <section aria-label="Claim詳細">
    <h3>{mode === "relation" ? "関係に含まれる主張と出典" : "主張と出典"}</h3>
    {!primary && !error && <p role="status">主張の詳細を取得中…</p>}
    {error && <div className={styles.error} role="alert"><p>{error}</p><button onClick={retry}>主張の取得を再試行</button></div>}
    {primary && <>
      {mode === "relation" ? <>
        <p className={styles.muted}>肯否・期間・出典を個別に比較できます。表示順は正しさや信頼度を表しません。</p>
        {[primary.claim, ...related].sort((a, b) => a.id.localeCompare(b.id)).map((claim, index) =>
          <div key={claim.id}>{visibleClaimIds && <p className={styles.muted}>{!matchesPredicate(claim.predicate, predicates) ? explorationLabels().outside : visibleClaimIds.includes(claim.id) ? explorationLabels().shown : explorationLabels().unseen}</p>}<ClaimCard claim={claim} nodes={nodes} title={`主張 ${index + 1}`} /></div>)}
      </> : <>
      <ClaimCard claim={primary.claim} nodes={nodes} title="選択した主張" />
      <h3>同じ関係についての他の主張</h3>
      <p className={styles.muted}>肯否・期間・出典をそれぞれ確認できます。表示順は正しさや信頼度を表しません。</p>
      {relatedLoading && <p role="status">他の主張を取得中…</p>}
      {!primary.relatedClaimIds.length && <p className={styles.muted}>他の主張は登録されていません。</p>}
      {related.map((claim) => <div key={claim.id}>{!matchesPredicate(claim.predicate, predicates) && <p className={styles.muted}>{explorationLabels().outside}</p>}<ClaimCard claim={claim} nodes={nodes} title="他の主張" /></div>)}
      </>}
      {mode === "relation" && relatedLoading && <p role="status">同じ関係の主張を取得中…</p>}
      {relatedError && <div className={styles.error} role="alert"><p>{relatedError}</p><button onClick={retry}>他の主張を再試行</button></div>}
    </>}
  </section>;
}
