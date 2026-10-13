"use client";
import { useUiLocale } from "../lib/client/ui-locale";
import { contentMessage } from "../lib/i18n/content";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { MemberCapsule } from "../lib/domain/member-capsule";
import { capsuleShareIssuedSchema, capsuleShareStatusSchema, type CapsuleShare } from "../lib/domain/capsule-sharing";
import { MemberClientError, memberRequest } from "../lib/client/member-api";
import { capsuleSharingLabels } from "../lib/i18n/capsule-sharing";
import css from "./MemberCapsules.module.css";

const textMessages = capsuleSharingLabels();
export default function CapsuleShareControls({ capsule, userId, disabled, onUnauthorized }: {
  capsule: MemberCapsule; userId: string; disabled: boolean; onUnauthorized: () => void;
}) {
  const { locale } = useUiLocale();
  const text = capsuleSharingLabels(locale);
  const [blocked, setBlocked] = useState(false);
  const [share, setShare] = useState<CapsuleShare | null>(null);
  const [known, setKnown] = useState(false), [busy, setBusy] = useState(true);
  const [url, setUrl] = useState("");
  const [confirm, setConfirm] = useState<"issue" | "revoke" | null>(null);
  const [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const unauthorized = useRef(onUnauthorized);
  useEffect(() => { unauthorized.current = onUnauthorized; }, [onUnauthorized]);
  const path = `/api/member/capsules/${capsule.id}/share`;
  const run = useCallback(async (action: (signal: AbortSignal) => Promise<void>) => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(null); setMessage(null); setConfirm(null); setUrl("");
    try { await action(controller.signal); }
    catch (cause) {
      if (controller.signal.aborted) return;
      setKnown(false);
      if (cause instanceof MemberClientError && cause.status === 401) { unauthorized.current(); return; }
      setError(cause instanceof MemberClientError && cause.code === "SHARING_BLOCKED" ? textMessages.blocked : cause instanceof MemberClientError && cause.status === 409 ? textMessages.conflict : cause instanceof MemberClientError && cause.code === "SHARE_REVISION_LIMIT" ? textMessages.limit : textMessages.failed);
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }, []);
  const refresh = useCallback(() => { void run(async signal => {
    const result = await memberRequest(path, capsuleShareStatusSchema, { user: userId, signal });
    if (!signal.aborted) { setShare(result.share); setBlocked(result.blocked); setKnown(true); }
  }); }, [path, run, userId]);
  useEffect(() => {
    const timer = setTimeout(refresh, 0);
    return () => { clearTimeout(timer); active.current?.abort(); };
  }, [refresh]);
  function issue() {
    if (!known) return;
    void run(async signal => {
      const result = await memberRequest(path, capsuleShareIssuedSchema, { method: "POST", body: { expectedRevision: capsule.revision, expectedShareId: share?.id ?? null }, user: userId, signal });
      if (!signal.aborted) { setShare(result.share); setKnown(true); setUrl(`${location.origin}/shared#${result.token}`); setMessage(text.issued); }
    });
  }
  function revoke() {
    if (!share || !known) return;
    void run(async signal => {
      await memberRequest(path, z.object({ revoked: z.literal(true) }), { method: "DELETE", body: { expectedShareId: share.id }, user: userId, signal });
      if (!signal.aborted) { setShare(null); setKnown(true); setMessage(text.revoked); }
    });
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); setMessage(text.copied); }
    catch { setMessage(text.copyFailed); }
  }
  return <section className={css.sharing} aria-label={text.title}>
    <h2>{text.title}</h2><p>{text.help}</p>
    {busy && <p role="status">{text.checking}</p>}
    {known && <p>{blocked ? text.blocked : share ? text.active(share.revision) : text.stopped}</p>}
    {error && <p role="alert">{contentMessage(error, locale)}</p>}{message && <p role="status">{contentMessage(message, locale)}</p>}
    <button disabled={busy || disabled} onClick={refresh}>{text.refresh}</button>
    <button disabled={busy || disabled || !known || blocked} onClick={() => setConfirm("issue")}>{share ? text.rotate : text.issue}</button>
    {share && <button disabled={busy || disabled || !known} onClick={() => setConfirm("revoke")}>{text.revoke}</button>}
    {confirm && <div role="alert"><p>{confirm === "issue" ? text.current(capsule.revision) : text.revokeHelp}</p>
      {confirm === "issue" && share && <p>{text.rotationHelp}</p>}
      <button disabled={busy || disabled} onClick={confirm === "issue" ? issue : revoke}>{confirm === "issue" ? text.confirmIssue : text.confirmRevoke}</button>
      <button onClick={() => setConfirm(null)}>{text.cancel}</button>
    </div>}
    {url && <div className={css.source}><label htmlFor="capsule-share-url">{text.url}</label><input id="capsule-share-url" readOnly value={url} onFocus={event => event.target.select()} />
      <p>{text.oneTime}</p><button onClick={() => void copy()}>{text.copy}</button><a href={url} target="_blank" rel="noopener noreferrer">{text.preview}</a>
    </div>}
  </section>;
}
