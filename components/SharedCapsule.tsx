"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DatasetMode } from "../lib/domain/dataset";
import type { MemberCapsule } from "../lib/domain/member-capsule";
import { capsuleShareTokenSchema, sharedCapsuleSchema } from "../lib/domain/capsule-sharing";
import { memberReaderCapsule } from "../lib/client/member-api";
import { capsuleSharingLabels } from "../lib/i18n/capsule-sharing";
import SiteHeader from "./SiteHeader";
import { memberPostsLabels } from "../lib/i18n/member-posts";
import { CapsuleReader } from "./CapsuleDialog";
import css from "./MemberCapsules.module.css";
import CapsuleDiscussion, { useDiscussionDraft } from "./CapsuleDiscussion";

export default function SharedCapsule({ dataset }: { dataset: DatasetMode }) {
  const text = capsuleSharingLabels();
  const [capsule, setCapsule] = useState<MemberCapsule | null>(null);
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(true);
  const active = useRef<AbortController | null>(null);
  const discussionDraft = useDiscussionDraft();
  const reading = useMemo(() => capsule ? memberReaderCapsule(capsule, dataset) : null, [capsule, dataset]);
  const refresh = useCallback(async (quiet = false) => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    if (!quiet) { setCapsule(null); setBusy(true); }
    setError(null);
    if (document.visibilityState === "hidden") { setCapsule(null); setBusy(true); return; }
    const token = capsuleShareTokenSchema.safeParse(location.hash.slice(1));
    if (!token.success) { setCapsule(null); setError(text.unavailable); setBusy(false); return; }
    try {
      const response = await fetch("/api/shared/capsule", { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
        headers: { "X-Capsule-Token": token.data }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
      if (controller.signal.aborted) return;
      if (!response.ok) { setCapsule(null); setError(response.status === 404 ? text.unavailable : text.readFailed); return; }
      const result = sharedCapsuleSchema.parse(await response.json());
      memberReaderCapsule(result.capsule, dataset);
      if (!controller.signal.aborted) setCapsule(previous => previous && JSON.stringify(previous) === JSON.stringify(result.capsule) ? previous : result.capsule);
    } catch { if (!controller.signal.aborted) { setCapsule(null); setError(text.readFailed); } }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, [dataset, text]);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    const poll = setInterval(() => { if (document.visibilityState !== "hidden") void refresh(true); }, 30_000);
    const visibility = () => {
      if (document.visibilityState === "hidden") { active.current?.abort(); setCapsule(null); setBusy(true); setError(null); }
      else void refresh();
    };
    const changed = () => void refresh();
    const restored = (event: PageTransitionEvent) => { if (event.persisted) void refresh(); };
    document.addEventListener("visibilitychange", visibility); window.addEventListener("hashchange", changed); window.addEventListener("pageshow", restored);
    return () => { clearTimeout(timer); clearInterval(poll); active.current?.abort(); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("hashchange", changed); window.removeEventListener("pageshow", restored); };
  }, [refresh]);
  return <><SiteHeader dataset={dataset} page="shared" /><main lang="ja" className={css.page}>
    <header className={css.pageHeader}><p className={css.eyebrow}>{text.title}</p><h1>{text.readTitle}</h1><p>{text.readHelp}</p>
      <p className={css.muted}>{text.returnHelp}</p>
    </header>
    <section className={css.card}>
      <button disabled={busy} onClick={() => void refresh()}>{text.readRefresh}</button>
      {busy && <p role="status">{text.reading}</p>}{error && <p role="alert">{error}</p>}
      {reading && <><CapsuleReader key={`${reading.id}:${reading.revision}`} capsule={reading} explorationLinks noteAttribution="author" />
        <CapsuleDiscussion key={`discussion:${reading.id}:${reading.revision}`} capsuleId={reading.id} revision={reading.revision} token={location.hash.slice(1)} draftCache={discussionDraft} /></>}
      <p className={css.muted}>{text.lifecycle}</p>
      <a href="/member#my-posts" target="_blank" rel="noopener noreferrer">{memberPostsLabels().manageLink}</a>
    </section>
  </main></>;
}
