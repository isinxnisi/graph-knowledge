"use client";
import { useUiLocale } from "../lib/client/ui-locale";
import { contentMessage } from "../lib/i18n/content";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DatasetMode } from "../lib/domain/dataset";
import type { MemberCapsule } from "../lib/domain/member-capsule";
import { capsuleShareTokenSchema, capsuleSharePath, sharedCapsuleSchema } from "../lib/domain/capsule-sharing";
import { memberReaderCapsule } from "../lib/client/member-api";
import { capsuleSharingLabels } from "../lib/i18n/capsule-sharing";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import { memberPostsLabels } from "../lib/i18n/member-posts";
import { CapsuleReader } from "./CapsuleDialog";
import CapsuleDiscussion, { useDiscussionDraft } from "./CapsuleDiscussion";
import PersonIdentity from "./PersonIdentity";
import type {z} from "zod";
import Icon from "./Icon";
import conversationCss from "./CapsuleConversation.module.css";

const textMessages = capsuleSharingLabels();
export default function SharedCapsule({ dataset, linkToken, initialRevision }: { dataset: DatasetMode; linkToken?: string; initialRevision?: number }) {
  const { locale } = useUiLocale();
  const text = capsuleSharingLabels(locale);
  const [author,setAuthor]=useState<z.infer<typeof sharedCapsuleSchema>["author"]>(null);
  const [capsule, setCapsule] = useState<MemberCapsule | null>(null);
  const current = useRef<MemberCapsule | null>(null), pinnedRevision = useRef(initialRevision);
  const [availableRevision,setAvailableRevision] = useState<number | null>(null);
  const [revisions,setRevisions] = useState<{revision:number;publishedAt:string}[]>([]);
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(true);
  const active = useRef<AbortController | null>(null), authorizedToken = useRef<string | null>(null);
  const [discussionToken, setDiscussionToken] = useState<string | undefined>(undefined);
  const discussionDraft = useDiscussionDraft();
  const reading = useMemo(() => capsule ? memberReaderCapsule(capsule, dataset) : null, [capsule, dataset]);
  const refresh = useCallback(async (quiet = false, adopt = false) => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    if (!quiet) setBusy(true);
    setError(null);
    if (document.visibilityState === "hidden") return;
    const token = capsuleShareTokenSchema.safeParse(linkToken ?? location.hash.slice(1));
    if (!token.success) { authorizedToken.current = null; setCapsule(null); current.current=null; setAvailableRevision(null); setError(textMessages.unavailable); setBusy(false); return; }
    if (authorizedToken.current !== token.data) { setCapsule(null); current.current=null; setAvailableRevision(null); }
    try {
      const response = await fetch(`/api/shared/capsule${!adopt && pinnedRevision.current ? `?revision=${pinnedRevision.current}` : ""}`, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
        headers: { "X-Capsule-Token": token.data }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
      if (controller.signal.aborted) return;
      if (!response.ok) { if ([401, 403, 404].includes(response.status)) { setCapsule(null); current.current=null; setAvailableRevision(null); } setError(response.status === 404 ? textMessages.unavailable : textMessages.readFailed); return; }
      const result = sharedCapsuleSchema.safeParse(await response.json());
      if (!result.success || result.data.capsule.content.dataset !== dataset) { setCapsule(null); current.current=null; setAvailableRevision(null); setError(textMessages.readFailed); return; }
      memberReaderCapsule(result.data.capsule, dataset);
      if (!controller.signal.aborted) { authorizedToken.current = token.data; setDiscussionToken(token.data); setAuthor(result.data.author); setRevisions(result.data.revisions);
        const shown=current.current,latest=result.data.currentRevision??result.data.capsule.revision;
        // Poll validates the displayed snapshot too, including a version-specific
        // operator block. It must never replace an actively manipulated graph.
        if (shown && shown.revision!==result.data.capsule.revision && quiet) {
          const validity=await fetch(`/api/shared/capsule?revision=${shown.revision}`,{cache:"no-store",credentials:"omit",referrerPolicy:"no-referrer",headers:{"X-Capsule-Token":token.data},signal:controller.signal});
          if (controller.signal.aborted) return;
          if ([401,403,404].includes(validity.status)) { current.current=null; setCapsule(null); setError(textMessages.unavailable); return; }
          if (!validity.ok) throw new Error("Could not recheck displayed revision");
          setAvailableRevision(latest!==shown.revision?latest:null); return;
        }
        if (adopt) pinnedRevision.current=undefined;
        if (!shown || adopt || authorizedToken.current!==token.data) { current.current=result.data.capsule; setCapsule(result.data.capsule); }
        setAvailableRevision(latest!==current.current?.revision?latest:null); }
    } catch { if (!controller.signal.aborted) setError(textMessages.readFailed); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, [dataset,linkToken]);
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
      <button className={`${conversationCss.button} ${conversationCss.quiet} ${conversationCss.iconButton}`} disabled={busy} aria-label={text.readRefresh} title={text.readRefresh} onClick={() => void refresh(true)}><Icon name="refresh" /></button></header>
    <section>
      {busy && !reading && <p role="status">{text.reading}</p>}{error && <p className={conversationCss.error} role="alert">{contentMessage(error, locale)}</p>}
      {availableRevision && reading && <div className={conversationCss.feedback} role="status"><span>{locale === "en" ? `Version ${availableRevision} is available. Your current view is unchanged.` : `新しい共有内容（保存版 ${availableRevision}）があります。今の表示はそのままです。`}</span> <button className={conversationCss.button} disabled={busy || discussionDraft.hasDraft()} onClick={() => void refresh(false,true)}>{locale === "en" ? "Read updated graph" : "更新された図を読む"}</button>{discussionDraft.hasDraft() && <p>{locale === "en" ? "Post your comment first; it belongs to the graph you are viewing." : "入力中のコメントを投稿してから切り替えられます。今見ている図への投稿として残ります。"}</p>}</div>}
      {reading && <><div className={conversationCss.heading}><span className={conversationCss.muted}>{locale === "en" ? `Reading version ${reading.revision}` : `保存版 ${reading.revision} を閲覧中`}</span>{revisions.length>1 && <details className={conversationCss.details}><summary>{locale === "en" ? "Previously published" : "共有の履歴"}</summary><ul>{revisions.map(item=><li key={item.revision}><a href={capsuleSharePath(discussionToken!,item.revision)} target="_blank" rel="noopener noreferrer">{locale === "en" ? `Version ${item.revision}` : `保存版 ${item.revision}`}</a> · {new Date(item.publishedAt).toLocaleDateString(locale)}</li>)}</ul></details>}</div><CapsuleReader key={`${reading.id}:${reading.revision}`} capsule={reading} byline={author?<PersonIdentity person={author} showHandle quiet/>:undefined} explorationLinks noteAttribution="author" />
        <CapsuleDiscussion key={`discussion:${reading.id}:${reading.revision}`} capsuleId={reading.id} revision={reading.revision} token={discussionToken} draftCache={discussionDraft} revisionUrl={discussionToken ? revision=>capsuleSharePath(discussionToken,revision) : undefined} /></>}
      <div className={conversationCss.pageFooter}><a href="/member#my-posts">{memberPostsLabels(locale).manageLink}</a><details className={conversationCss.details}><summary>{text.details}</summary><p>{text.lifecycle}</p></details></div>
    </section>
  </main><SiteFooter /></>;
}
