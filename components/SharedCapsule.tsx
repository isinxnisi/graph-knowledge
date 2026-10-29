"use client";
import { useUiLocale } from "../lib/client/ui-locale";
import { contentMessage } from "../lib/i18n/content";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DatasetMode } from "../lib/domain/dataset";
import type { MemberCapsule } from "../lib/domain/member-capsule";
import { capsuleShareTokenSchema, sharedCapsuleSchema } from "../lib/domain/capsule-sharing";
import { memberReaderCapsule } from "../lib/client/member-api";
import { capsuleSharingLabels } from "../lib/i18n/capsule-sharing";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import { memberPostsLabels } from "../lib/i18n/member-posts";
import { CapsuleReader } from "./CapsuleDialog";
import CapsuleDiscussion, { useDiscussionDraft } from "./CapsuleDiscussion";
import Icon from "./Icon";
import conversationCss from "./CapsuleConversation.module.css";

const textMessages = capsuleSharingLabels();
export default function SharedCapsule({ dataset }: { dataset: DatasetMode }) {
  const { locale } = useUiLocale();
  const text = capsuleSharingLabels(locale);
  const [capsule, setCapsule] = useState<MemberCapsule | null>(null);
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(true);
  const active = useRef<AbortController | null>(null), authorizedToken = useRef<string | null>(null);
  const [discussionToken, setDiscussionToken] = useState<string | undefined>(undefined);
  const discussionDraft = useDiscussionDraft();
  const reading = useMemo(() => capsule ? memberReaderCapsule(capsule, dataset) : null, [capsule, dataset]);
  const refresh = useCallback(async (quiet = false) => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    if (!quiet) setBusy(true);
    setError(null);
    if (document.visibilityState === "hidden") return;
    const token = capsuleShareTokenSchema.safeParse(location.hash.slice(1));
    if (!token.success) { authorizedToken.current = null; setCapsule(null); setError(textMessages.unavailable); setBusy(false); return; }
    if (authorizedToken.current !== token.data) setCapsule(null);
    try {
      const response = await fetch("/api/shared/capsule", { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
        headers: { "X-Capsule-Token": token.data }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
      if (controller.signal.aborted) return;
      if (!response.ok) { if ([401, 403, 404].includes(response.status)) setCapsule(null); setError(response.status === 404 ? textMessages.unavailable : textMessages.readFailed); return; }
      const result = sharedCapsuleSchema.safeParse(await response.json());
      if (!result.success || result.data.capsule.content.dataset !== dataset) { setCapsule(null); setError(textMessages.readFailed); return; }
      memberReaderCapsule(result.data.capsule, dataset);
      if (!controller.signal.aborted) { authorizedToken.current = token.data; setDiscussionToken(token.data); setCapsule(previous => previous && JSON.stringify(previous) === JSON.stringify(result.data.capsule) ? previous : result.data.capsule); }
    } catch { if (!controller.signal.aborted) setError(textMessages.readFailed); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, [dataset]);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    const poll = setInterval(() => { if (document.visibilityState !== "hidden") void refresh(true); }, 30_000);
    const visibility = () => {
      if (document.visibilityState === "hidden") active.current?.abort();
      else void refresh(true);
    };
    const changed = () => void refresh();
    const restored = (event: PageTransitionEvent) => { if (event.persisted) void refresh(); };
    document.addEventListener("visibilitychange", visibility); window.addEventListener("hashchange", changed); window.addEventListener("pageshow", restored);
    return () => { clearTimeout(timer); clearInterval(poll); active.current?.abort(); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("hashchange", changed); window.removeEventListener("pageshow", restored); };
  }, [refresh]);
  return <><SiteHeader dataset={dataset} page="shared" /><main lang={locale} className={`${conversationCss.page} ${conversationCss.panel}`}>
    <header className={conversationCss.pageHeader}><div><h1>{text.readTitle}</h1><p>{text.readHelp}</p></div>
      <button className={`${conversationCss.button} ${conversationCss.quiet} ${conversationCss.iconButton}`} disabled={busy} aria-label={text.readRefresh} title={text.readRefresh} onClick={() => void refresh()}><Icon name="refresh" /></button></header>
    <section>
      {busy && !reading && <p role="status">{text.reading}</p>}{error && <p className={conversationCss.error} role="alert">{contentMessage(error, locale)}</p>}
      {reading && <><CapsuleReader key={`${reading.id}:${reading.revision}`} capsule={reading} explorationLinks noteAttribution="author" />
        <CapsuleDiscussion key={`discussion:${reading.id}:${reading.revision}`} capsuleId={reading.id} revision={reading.revision} token={discussionToken} draftCache={discussionDraft} /></>}
      <div className={conversationCss.pageFooter}><a href="/member#my-posts">{memberPostsLabels(locale).manageLink}</a><details className={conversationCss.details}><summary>{text.details}</summary><p>{text.lifecycle}</p></details></div>
    </section>
  </main><SiteFooter /></>;
}
