"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ownDiscussionPostsSchema, type OwnDiscussionPosts } from "../lib/domain/capsule-discussion";
import { MemberClientError, memberRequest } from "../lib/client/member-api";
import { memberPostsLabels } from "../lib/i18n/member-posts";
import { capsuleDiscussionLabels } from "../lib/i18n/capsule-discussion";
import css from "./MemberCapsules.module.css";

export default function MemberPosts({ userId, onUnauthorized }: { userId: string; onUnauthorized: () => void }) {
  const text = memberPostsLabels(), discussion = capsuleDiscussionLabels();
  const [opened, setOpened] = useState(false), [data, setData] = useState<OwnDiscussionPosts | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null), [cursor, setCursor] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null), mutating = useRef(false);
  const currentCursor = useRef<string | null>(null);
  const unauthorized = useRef(onUnauthorized);
  useEffect(() => { unauthorized.current = onUnauthorized; }, [onUnauthorized]);
  const failed = useCallback((cause: unknown, fallback: string) => {
    setData(null); setConfirm(null);
    if (cause instanceof MemberClientError && cause.status === 401) { setError(text.expired); unauthorized.current(); }
    else setError(fallback);
  }, [text]);
  const refresh = useCallback(async (pageCursor: string | null) => {
    if (mutating.current || document.visibilityState === "hidden") return;
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(null); setConfirm(null); setData(null);
    try {
      const result = await memberRequest(`/api/member/posts${pageCursor ? `?cursor=${encodeURIComponent(pageCursor)}` : ""}`, ownDiscussionPostsSchema, { user: userId, signal: controller.signal });
      if (!controller.signal.aborted) { setData(result); currentCursor.current = pageCursor; setCursor(pageCursor); }
    } catch (cause) { if (!controller.signal.aborted) failed(cause, text.failed); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, [userId, failed, text]);
  useEffect(() => {
    if (!opened) return;
    const initial = setTimeout(() => void refresh(currentCursor.current), 0);
    const poll = setInterval(() => void refresh(currentCursor.current), 30_000);
    const invalidate = () => {
      active.current?.abort(); mutating.current = false; setData(null); setConfirm(null); setError(null); setMessage(null);
      if (document.visibilityState !== "hidden") void refresh(currentCursor.current);
    };
    const storage = (event: StorageEvent) => { if (event.key === null || event.key === "graph-knowledge:member-session-changed") invalidate(); };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) invalidate(); };
    document.addEventListener("visibilitychange", invalidate); window.addEventListener("storage", storage); window.addEventListener("pageshow", restored);
    return () => { clearTimeout(initial); clearInterval(poll); active.current?.abort(); document.removeEventListener("visibilitychange", invalidate); window.removeEventListener("storage", storage); window.removeEventListener("pageshow", restored); };
  }, [opened, refresh]);
  async function withdraw() {
    const post = data?.posts.find(value => value.id === confirm);
    if (!post || busy) return;
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    mutating.current = true; setBusy(true); setError(null); setMessage(null);
    try {
      await memberRequest(`/api/capsules/${post.capsuleId}/discussion`, z.object({ withdrawn: z.literal(true) }), {
        method: "DELETE", body: { postId: post.id }, user: userId, signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setConfirm(null); setMessage(text.done); mutating.current = false; await refresh(cursor);
    } catch (cause) {
      if (!controller.signal.aborted) failed(cause, cause instanceof MemberClientError && cause.status === 404 ? text.gone : text.uncertain);
    } finally { if (active.current === controller) mutating.current = false; if (!controller.signal.aborted) setBusy(false); }
  }
  return <section id="my-posts" className={css.card} aria-label={text.title}>
    <h2>{text.title}</h2><p>{text.help}</p>
    {!opened ? <button onClick={() => setOpened(true)}>{text.open}</button> : <>
      <p className={css.muted}>{text.boundary}</p>
      <button disabled={busy} onClick={() => { setMessage(null); void refresh(cursor); }}>{text.refresh}</button>
      <button onClick={() => { active.current?.abort(); mutating.current = false; setOpened(false); setData(null); setConfirm(null); setMessage(null); setError(null); currentCursor.current = null; setCursor(null); }}>{text.hide}</button>
      {busy && <p role="status">{text.loading}</p>}{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      {data && <>
        {!data.posts.length && <p>{text.empty}</p>}
        <ol className={css.posts}>{data.posts.map(post => <li key={post.id}>
          <p><strong>{text.context(post.revision)}</strong> · <time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString("ja-JP")}</time></p>
          <p className={css.postBody}>{post.body ?? (post.withdrawnAt ? text.withdrawn : text.hidden)}</p>
          {post.withdrawnAt && <p className={css.muted}><time dateTime={post.withdrawnAt}>{new Date(post.withdrawnAt).toLocaleString("ja-JP")}</time></p>}
          <details className={css.muted}><summary>{text.target}</summary><p>{text.capsule}: {post.capsuleId}<br />{text.post}: {post.id}</p></details>
          {!post.withdrawnAt && <button disabled={busy} onClick={() => setConfirm(post.id)}>{discussion.withdraw}</button>}
          {confirm === post.id && <div role="alert"><p>{discussion.withdrawHelp}</p><button disabled={busy} onClick={() => void withdraw()}>{discussion.confirmWithdraw}</button><button disabled={busy} onClick={() => setConfirm(null)}>{discussion.cancel}</button></div>}
        </li>)}</ol>
        {data.nextCursor && <button disabled={busy} onClick={() => { setMessage(null); void refresh(data.nextCursor); }}>{text.next}</button>}
      </>}
      {cursor && <button disabled={busy} onClick={() => { setMessage(null); void refresh(null); }}>{text.newest}</button>}
    </>}
  </section>;
}
