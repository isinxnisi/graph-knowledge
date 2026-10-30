"use client";
import { useUiLocale } from "../lib/client/ui-locale";
import { contentMessage } from "../lib/i18n/content";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { DISCUSSION_LIMITS, discussionSchema, type CapsuleDiscussion as Discussion } from "../lib/domain/capsule-discussion";
import { MemberClientError } from "../lib/client/member-api";
import { memberSessionEvent } from "../lib/client/account-navigation";
import { capsuleDiscussionLabels } from "../lib/i18n/capsule-discussion";
import { CommunityDialog } from "./CommunityDialog";
import PersonIdentity from "./PersonIdentity";
import Icon from "./Icon";
import css from "./CapsuleConversation.module.css";

export type DiscussionDraft = { key: string; body: string; requestId: string | null };
export type DiscussionDraftStore = { get: (key: string) => DiscussionDraft | null; set: (draft: DiscussionDraft) => void; remove: (key: string) => void; hasDraft: () => boolean; hasPending: () => boolean; clear: () => void };
export function useDiscussionDraft(): DiscussionDraftStore {
  const values = useRef(new Map<string, DiscussionDraft>());
  const [, setHasDraft] = useState(false);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!values.current.size) return;
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  return useMemo(() => ({
    get: (key: string) => values.current.get(key) ?? null,
    set: (draft: DiscussionDraft) => { if (draft.body || draft.requestId) values.current.set(draft.key, draft); else values.current.delete(draft.key); setHasDraft(values.current.size > 0); },
    remove: (key: string) => { values.current.delete(key); setHasDraft(values.current.size > 0); },
    hasDraft: () => values.current.size > 0,
    hasPending: () => [...values.current.values()].some(draft => draft.requestId !== null),
    clear: () => { values.current.clear(); setHasDraft(false); },
  }), []);
}
const textMessages = capsuleDiscussionLabels();
export default function CapsuleDiscussion({ capsuleId, revision, token, userId, draftCache, onUnauthorized, showSettings = true, refreshVersion = 0, revisionUrl }: {
  capsuleId: string; revision: number; token?: string; userId?: string; draftCache?: DiscussionDraftStore; onUnauthorized?: () => void; showSettings?: boolean; refreshVersion?: number; revisionUrl?: (revision: number) => string;
}) {
  const { locale } = useUiLocale();
  const text = capsuleDiscussionLabels(locale);
  const ownCache = useDiscussionDraft(), cache = draftCache ?? ownCache;
  const [data, setData] = useState<Discussion | null>(null), [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null);
  const [body, setBody] = useState(""), [pending, setPending] = useState(false), [confirm, setConfirm] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null), mutating = useRef(false), composing = useRef(false);
  const previousRefresh = useRef(refreshVersion);
  const unauthorized = useRef(onUnauthorized);
  useEffect(() => { unauthorized.current = onUnauthorized; }, [onUnauthorized]);
  const path = `/api/capsules/${capsuleId}/discussion`;
  const request = useCallback(async <T,>(schema: z.ZodType<T>, signal: AbortSignal, method = "GET", payload?: unknown, expectedUser?: string) => {
    const response = await fetch(method === "GET" ? `${path}?revision=${revision}` : path, {
      method, cache: "no-store", credentials: "same-origin", referrerPolicy: "no-referrer",
      headers: { ...(token ? { "X-Capsule-Token": token } : {}), ...(expectedUser ? { "X-Member-User": expectedUser } : {}), ...(payload === undefined ? {} : { "Content-Type": "application/json" }) },
      body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
    if (!response.ok) { const value = await response.json().catch(() => null); throw new MemberClientError(response.status, value?.error?.code ?? "REQUEST_FAILED"); }
    return schema.parse(await response.json());
  }, [path, revision, token]);
  const failure = useCallback((cause: unknown) => {
    if (cause instanceof MemberClientError) {
      if (cause.status === 401) return textMessages.expired;
      if (cause.status === 404) return textMessages.unavailable;
      if (cause.status === 409) return textMessages.conflict;
      if (cause.code === "THREAD_CLOSED") return textMessages.closed;
      if (cause.code === "POST_RATE_LIMIT") return textMessages.rate;
      if (cause.code === "THREAD_LIMIT") return textMessages.full;
    }
    return textMessages.failed;
  }, []);
  const refresh = useCallback(async () => {
    if (mutating.current || document.visibilityState === "hidden") return;
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setLoading(true); setError(null);
    try {
      const result = await request(discussionSchema, controller.signal, "GET", undefined, userId);
      if (controller.signal.aborted) return;
      if (result.capsuleId !== capsuleId || result.revision !== revision) throw new Error("Context mismatch");
      setData(result);
      const key = `${capsuleId}:${revision}:${result.viewer?.id}`;
      const draft = cache.get(key);
      setBody(draft?.key === key ? draft.body : ""); setPending(draft?.key === key && draft.requestId !== null);
    } catch (cause) { if (!controller.signal.aborted) {
      // A temporary network error must not tear down the composer or its focus.
      // An authoritative denial (or invalid response) does remove the old view.
      if (cause instanceof z.ZodError || cause instanceof MemberClientError && [401, 404].includes(cause.status)) { setData(null); setBody(""); setPending(false); setConfirm(null); }
      setError(failure(cause));
      if (cause instanceof MemberClientError && cause.status === 401) unauthorized.current?.();
    } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [request, userId, capsuleId, revision, cache, failure, setConfirm]);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0), poll = setInterval(() => void refresh(), 30_000);
    const invalidate = () => {
      // A shared reader remains mounted across account changes. Hide the old
      // viewer's draft immediately, including while reauthorization is pending.
      active.current?.abort(); mutating.current = false;
      setData(null); setBody(""); setPending(false); setConfirm(null); setError(null); setMessage(null); setBusy(false);
      if (document.visibilityState !== "hidden") void refresh();
    };
    const storage = (event: StorageEvent) => { if (event.key === null || event.key === "graph-knowledge:member-session-changed") invalidate(); };
    const visibility = () => { if (document.visibilityState !== "hidden") void refresh(); };
    document.addEventListener("visibilitychange", visibility); window.addEventListener("storage", storage); window.addEventListener(memberSessionEvent, invalidate);
    return () => { clearTimeout(initial); clearInterval(poll); active.current?.abort(); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("storage", storage); window.removeEventListener(memberSessionEvent, invalidate); };
  }, [refresh]);
  useEffect(() => {
    if (previousRefresh.current === refreshVersion) return;
    previousRefresh.current = refreshVersion;
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refreshVersion, refresh]);
  function edit(value: string) {
    if (!data?.viewer) return;
    setBody(value); cache.set({ key: `${capsuleId}:${revision}:${data.viewer.id}`, body: value, requestId: null });
  }
  async function mutate(kind: "post" | "close" | "withdraw") {
    if (!data?.viewer || busy || mutating.current) return;
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    mutating.current = true; setBusy(true); setError(null); setMessage(null);
    const expectedUser = data.viewer.id;
    const retrying = kind === "post" && pending;
    try {
      if (kind === "post") {
        const key = `${capsuleId}:${revision}:${expectedUser}`;
        const stored = cache.get(key);
        const previous = stored?.key === key ? stored : null;
        const draft = { key, body, requestId: previous?.requestId ?? crypto.randomUUID() };
        cache.set(draft); setPending(true);
        await request(z.object({ postId: z.uuidv4(), replayed: z.boolean() }), controller.signal, "POST", { requestId: draft.requestId, revision, body: draft.body }, expectedUser);
        if (controller.signal.aborted) return;
        cache.remove(key); setBody(""); setPending(false); setMessage(text.posted);
      } else if (kind === "close") {
        await request(z.object({ closed: z.boolean() }), controller.signal, "PATCH", { closed: !data.closed, expectedClosed: data.closed }, expectedUser);
        if (controller.signal.aborted) return;
        setMessage(text.stopped);
      } else {
        await request(z.object({ withdrawn: z.literal(true) }), controller.signal, "DELETE", { postId: confirm }, expectedUser);
        if (controller.signal.aborted) return;
        setConfirm(null);
      }
      mutating.current = false; setBusy(false); await refresh();
    } catch (cause) {
      if (controller.signal.aborted) return;
      // A rejection of a retry cannot disprove the earlier ambiguous commit.
      // Keep its key/body until a successful receipt, even across re-login.
      if (kind === "post" && !retrying && cause instanceof MemberClientError && cause.status < 500) {
        const stored = cache.get(`${capsuleId}:${revision}:${expectedUser}`);
        if (stored) cache.set({ ...stored, requestId: null });
        setPending(false);
      }
      if (cause instanceof MemberClientError && [401, 404].includes(cause.status)) { setData(null); setBody(""); setConfirm(null); }
      if (cause instanceof MemberClientError && cause.code === "THREAD_CLOSED") setData(previous => previous ? { ...previous, closed: true } : null);
      setError(failure(cause));
      if (cause instanceof MemberClientError && cause.status === 401) unauthorized.current?.();
    } finally { if (active.current === controller) mutating.current = false; if (!controller.signal.aborted) setBusy(false); }
  }
  return <section className={`${css.panel} ${css.discussion}`} aria-label={text.title} aria-busy={busy} data-capsule-draft={cache.hasDraft() ? "true" : undefined} data-capsule-pending={cache.hasPending() ? "true" : undefined}>
    <div className={css.heading}><div><h2>{text.title}{data && data.posts.length > 0 ? ` · ${data.posts.length}` : ""}</h2><p className={css.muted}>{text.context(revision)}</p></div>
      <button className={`${css.button} ${css.quiet} ${css.iconButton}`} disabled={busy || loading} aria-label={text.refresh} title={text.refresh} onClick={() => void refresh()}><Icon name="refresh" /></button></div>
    {loading && !data && <p className={css.empty} role="status">{text.loading}</p>}
    {error && <p className={css.error} role="alert">{contentMessage(error, locale)}</p>}
    {message && <p className={css.feedback} role="status">{contentMessage(message, locale)}</p>}
    {data && <>
      {data.canManage && showSettings && <div className={css.setting}><div><strong>{text.acceptComments}</strong><p className={css.muted}>{data.closed ? text.acceptOff : text.acceptOn}</p></div>
        <button className={css.switch} role="switch" aria-label={text.acceptComments} aria-checked={!data.closed} title={data.closed ? text.reopen : text.close} disabled={busy} onClick={() => void mutate("close")} /></div>}
      {data.posts.length === 0 ? <div className={css.empty}><p>{text.empty}</p>{!data.closed && <p>{text.invitation}</p>}</div> :
        <ol className={css.posts}>{data.posts.map(post => <li className={css.post} key={post.id}>
          <div className={css.postHeader}><PersonIdentity person={post.author} label={post.authorName??undefined} quiet/><time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString(locale === "en" ? "en-GB" : "ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>

          <p className={css.postBody}>{post.body ?? (post.withdrawnAt ? text.withdrawn : text.hidden)}</p>
          <div className={css.postFooter}><div className={css.muted}>{revisionUrl ? <a href={revisionUrl(post.revision)} target="_blank" rel="noopener noreferrer">{locale === "en" ? `View version ${post.revision}` : `投稿時の図 · 保存版 ${post.revision}`}</a> : <span>{locale === "en" ? `Version ${post.revision}` : `保存版 ${post.revision} へのコメント`}</span>}</div>{post.own && !post.withdrawnAt && <button className={`${css.button} ${css.quiet}`} disabled={busy} onClick={() => setConfirm(post.id)}>{text.withdraw}</button>}</div>
        </li>)}</ol>}
      {data.closed && <p className={css.empty}>{text.closed}</p>}
      {!data.viewer ? <div className={css.login}><p>{text.loginPrompt}</p><a className={css.button} href="/member" target="_blank" rel="noopener noreferrer"><Icon name="person" />{text.login}</a></div> :
        (!data.closed || pending) && <form className={css.composer} onSubmit={event => { event.preventDefault(); if (!composing.current) void mutate("post"); }}>
          <label>{text.body}<textarea value={body} placeholder={text.placeholder} maxLength={DISCUSSION_LIMITS.body} disabled={busy || pending} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onChange={event => edit(event.target.value)} rows={3} /></label>
          <div className={css.composerFooter}><span className={css.composerStatus}>{text.as(data.viewer.name)} · {body.length}/{DISCUSSION_LIMITS.body}</span>
            <button className={`${css.button} ${css.primary}`} disabled={busy || !body.trim()} type="submit"><Icon name="arrow" />{busy ? text.posting : pending ? text.retry : text.submit}</button></div>
          {pending && <p className={css.feedback} role="status">{text.pending}</p>}
        </form>}
      <details className={css.details}><summary>{text.about}</summary><p>{text.help}</p><p>{text.savedDraft}</p>{data.canManage && <p>{text.manageHelp}</p>}</details>
    </>}
    {confirm && <CommunityDialog className={css.dialog} title={text.withdraw} onCancel={() => setConfirm(null)} busy={busy}><p>{text.withdrawHelp}</p><div className={css.actions}>
      <button className={css.button} onClick={() => setConfirm(null)} autoFocus>{text.cancel}</button><button className={`${css.button} ${css.primary}`} disabled={busy} onClick={() => void mutate("withdraw")}>{text.confirmWithdraw}</button>
    </div></CommunityDialog>}
  </section>;
}
