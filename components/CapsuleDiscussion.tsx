"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { DISCUSSION_LIMITS, discussionSchema, type CapsuleDiscussion as Discussion } from "../lib/domain/capsule-discussion";
import { MemberClientError } from "../lib/client/member-api";
import { capsuleDiscussionLabels } from "../lib/i18n/capsule-discussion";
import css from "./MemberCapsules.module.css";

export type DiscussionDraft = { key: string; body: string; requestId: string | null };
export type DiscussionDraftStore = { get: () => DiscussionDraft | null; set: (draft: DiscussionDraft | null) => void };
export function useDiscussionDraft(): DiscussionDraftStore {
  const value = useRef<DiscussionDraft | null>(null);
  return useMemo(() => ({ get: () => value.current, set: (draft: DiscussionDraft | null) => { value.current = draft; } }), []);
}
export default function CapsuleDiscussion({ capsuleId, revision, token, userId, draftCache, onUnauthorized }: {
  capsuleId: string; revision: number; token?: string; userId?: string; draftCache?: DiscussionDraftStore; onUnauthorized?: () => void;
}) {
  const text = capsuleDiscussionLabels();
  const ownCache = useDiscussionDraft(), cache = draftCache ?? ownCache;
  const [opened, setOpened] = useState(false), [data, setData] = useState<Discussion | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null);
  const [body, setBody] = useState(""), [pending, setPending] = useState(false), [confirm, setConfirm] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null), mutating = useRef(false);
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
      if (cause.status === 401) return text.expired;
      if (cause.status === 404) return text.unavailable;
      if (cause.status === 409) return text.conflict;
      if (cause.code === "THREAD_CLOSED") return text.closed;
      if (cause.code === "POST_RATE_LIMIT") return text.rate;
      if (cause.code === "THREAD_LIMIT") return text.full;
    }
    return text.failed;
  }, [text]);
  const refresh = useCallback(async () => {
    if (mutating.current || document.visibilityState === "hidden") return;
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(null);
    try {
      const result = await request(discussionSchema, controller.signal, "GET", undefined, userId);
      if (controller.signal.aborted) return;
      if (result.capsuleId !== capsuleId || result.revision !== revision) throw new Error("Context mismatch");
      setData(result);
      const draft = cache.get();
      const key = `${capsuleId}:${revision}:${result.viewer?.id}`;
      setBody(draft?.key === key ? draft.body : ""); setPending(draft?.key === key && draft.requestId !== null);
    } catch (cause) { if (!controller.signal.aborted) { setData(null); setBody(""); setPending(false); setError(failure(cause));
      if (cause instanceof MemberClientError && cause.status === 401) unauthorized.current?.();
    } }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, [request, userId, capsuleId, revision, cache, failure]);
  useEffect(() => {
    if (!opened) return;
    const initial = setTimeout(() => void refresh(), 0), poll = setInterval(() => void refresh(), 30_000);
    const visibility = () => {
      if (document.visibilityState === "hidden") { active.current?.abort(); setData(null); setBody(""); setConfirm(null); setError(null); setMessage(null); }
      else void refresh();
    };
    const storage = (event: StorageEvent) => { if (event.key === null || event.key === "graph-knowledge:member-session-changed") void refresh(); };
    document.addEventListener("visibilitychange", visibility); window.addEventListener("storage", storage);
    return () => { clearTimeout(initial); clearInterval(poll); active.current?.abort(); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("storage", storage); };
  }, [opened, refresh]);
  useEffect(() => {
    if (!body) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [body]);
  function edit(value: string) {
    if (!data?.viewer) return;
    setBody(value); cache.set({ key: `${capsuleId}:${revision}:${data.viewer.id}`, body: value, requestId: null });
  }
  async function mutate(kind: "post" | "close" | "withdraw") {
    if (!data?.viewer || busy) return;
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    mutating.current = true; setBusy(true); setError(null); setMessage(null);
    const expectedUser = data.viewer.id;
    const retrying = kind === "post" && pending;
    try {
      if (kind === "post") {
        const key = `${capsuleId}:${revision}:${expectedUser}`;
        const stored = cache.get();
        const previous = stored?.key === key ? stored : null;
        const draft = { key, body, requestId: previous?.requestId ?? crypto.randomUUID() };
        cache.set(draft); setPending(true);
        await request(z.object({ postId: z.uuidv4(), replayed: z.boolean() }), controller.signal, "POST", { requestId: draft.requestId, revision, body: draft.body }, expectedUser);
        if (controller.signal.aborted) return;
        cache.set(null); setBody(""); setPending(false); setMessage(text.posted);
      } else if (kind === "close") {
        await request(z.object({ closed: z.boolean() }), controller.signal, "PATCH", { closed: !data.closed, expectedClosed: data.closed }, expectedUser);
        if (controller.signal.aborted) return;
        setMessage(text.stopped);
      } else {
        await request(z.object({ withdrawn: z.literal(true) }), controller.signal, "DELETE", { postId: confirm }, expectedUser);
        if (controller.signal.aborted) return;
        setConfirm(null);
      }
      mutating.current = false; await refresh();
    } catch (cause) {
      if (controller.signal.aborted) return;
      // A rejection of a retry cannot disprove the earlier ambiguous commit.
      // Keep its key/body until a successful receipt, even across re-login.
      if (kind === "post" && !retrying && cause instanceof MemberClientError && cause.status < 500) {
        const stored = cache.get();
        if (stored) cache.set({ ...stored, requestId: null });
        setPending(false);
      }
      if (cause instanceof MemberClientError && [401, 404].includes(cause.status)) { setData(null); setBody(""); setConfirm(null); }
      setError(failure(cause));
      if (cause instanceof MemberClientError && cause.status === 401) unauthorized.current?.();
    } finally { mutating.current = false; if (!controller.signal.aborted) setBusy(false); }
  }
  return <section className={css.discussion} aria-label={text.title}>
    <h2>{text.title}</h2><p>{text.context(revision)}</p><p className={css.muted}>{text.help}</p>
    {!opened ? <button onClick={() => setOpened(true)}>{text.open}</button> : <>
      <button disabled={busy} onClick={() => void refresh()}>{text.refresh}</button>
      {busy && <p role="status">{text.loading}</p>}{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      {data && <>
        {data.posts.length === 0 && <p>{text.empty}</p>}
        <ol className={css.posts}>{data.posts.map(post => <li key={post.id}>
          <p className={css.muted}>{post.authorName ?? ""} · <time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString("ja-JP")}</time></p>
          <p className={css.postBody}>{post.body ?? (post.withdrawnAt ? text.withdrawn : text.hidden)}</p>
          {post.own && !post.withdrawnAt && <button disabled={busy} onClick={() => setConfirm(post.id)}>{text.withdraw}</button>}
          {confirm === post.id && <div role="alert"><p>{text.withdrawHelp}</p><button disabled={busy} onClick={() => void mutate("withdraw")}>{text.confirmWithdraw}</button><button onClick={() => setConfirm(null)}>{text.cancel}</button></div>}
        </li>)}</ol>
        {data.closed && <p>{text.closed}</p>}
        {data.canManage && <button disabled={busy} onClick={() => void mutate("close")}>{data.closed ? text.reopen : text.close}</button>}
        {!data.viewer ? <p><a href="/member" target="_blank" rel="noopener noreferrer">{text.login}</a><br />{text.loginHelp}</p> : <>
          <p>{text.as(data.viewer.name)}</p>
          {(!data.closed || pending) && <form onSubmit={event => { event.preventDefault(); void mutate("post"); }}>
            <label className={css.source}>{text.body}<textarea value={body} maxLength={DISCUSSION_LIMITS.body} disabled={busy || pending} onChange={event => edit(event.target.value)} rows={4} /></label>
            <p className={css.muted}>{text.limit}<br />{text.savedDraft}</p>{pending && <p role="status">{text.pending}</p>}
            <button disabled={busy || !body.trim()} type="submit">{pending ? text.retry : text.submit}</button>
          </form>}
        </>}
      </>}
    </>}
  </section>;
}
