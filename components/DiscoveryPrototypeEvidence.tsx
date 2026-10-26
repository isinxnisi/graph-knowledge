"use client";
import { useEffect, useState } from "react";
import { claimDetailSchema, type ClaimDetail, type EntitySummary } from "../lib/domain/api";
import { fetchClaim } from "../lib/client/api";
import { useUiLocale } from "../lib/client/ui-locale";
import { readingHref } from "../lib/client/reading-reference";
import { ClaimCard } from "./ClaimDetails";

export default function DiscoveryPrototypeEvidence({ id, revision, nodes }: { id: string; revision: string; nodes: EntitySummary[] }) {
  const { locale } = useUiLocale(), en = locale === "en";
  const [state, setState] = useState<{ claim?: ClaimDetail; error?: boolean }>({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetchClaim(id, controller.signal, revision).then(response => {
      const claim = claimDetailSchema.parse(response.claim);
      if (claim.id !== id || response.revision !== revision || claim.withdrawal) throw new Error("Changed record");
      if (!controller.signal.aborted) setState({ claim });
    }).catch(() => { if (!controller.signal.aborted) setState({ error: true }); });
    return () => controller.abort();
  }, [id, revision, attempt]);
  if (state.error) return <p role="alert">{en ? "The record could not be verified for this revision. Refresh results if the dataset changed." : "この版の記録を確認できませんでした。公開KGが更新された場合は結果を再取得してください。"} <button onClick={() => { setState({}); setAttempt(n => n + 1); }}>{en ? "Retry evidence" : "根拠を再取得"}</button></p>;
  if (!state.claim) return <p role="status">{en ? "Loading evidence…" : "根拠を読み込み中…"}</p>;
  return <><ClaimCard claim={state.claim} nodes={Object.fromEntries(nodes.map(node => [node.id, node]))} title={en ? "Claim and evidence" : "主張と根拠"} idPrefix="prototype-" /><a href={readingHref({ dataset: "public-kg", kind: "claim", id })}>{en ? "Open the full record" : "この記録の詳細ページへ"}</a></>;
}
