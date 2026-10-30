"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { z } from "zod";
import { useUiLocale } from "../lib/client/ui-locale";
import { contentMessage } from "../lib/i18n/content";
import type { MemberCapsule } from "../lib/domain/member-capsule";
import { capsuleShareIssuedSchema, capsuleShareStatusSchema, capsuleShareSchema, capsuleSharePath, type CapsuleShare } from "../lib/domain/capsule-sharing";
import { MemberClientError, memberRequest } from "../lib/client/member-api";
import { capsuleSharingLabels } from "../lib/i18n/capsule-sharing";
import { CommunityDialog } from "./CommunityDialog";
import Icon from "./Icon";
import CapsuleDiscussion, { useDiscussionDraft, type DiscussionDraftStore } from "./CapsuleDiscussion";
import css from "./CapsuleConversation.module.css";

export default function CapsuleShareControls({ capsule, userId, disabled, onUnauthorized, draftCache }: {
  capsule: MemberCapsule; userId: string; disabled: boolean; onUnauthorized: () => void; draftCache?: DiscussionDraftStore;
}) {
  const { locale } = useUiLocale(), text = capsuleSharingLabels(locale), fieldId = useId();
  const [blocked, setBlocked] = useState(false), [share, setShare] = useState<CapsuleShare | null>(null);
  const [known, setKnown] = useState(false), [busy, setBusy] = useState(true), [closed, setClosed] = useState(false);
  const [url, setUrl] = useState(""), [confirm, setConfirm] = useState<"issue" | "revoke" | null>(null);
  const [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null);
  const localDraft = useDiscussionDraft(), discussionDraft = draftCache ?? localDraft;
  const [commentVersion, setCommentVersion] = useState(0);
  const active = useRef<AbortController | null>(null), unauthorized = useRef(onUnauthorized), currentShare = useRef<string | null>(null);
  useEffect(() => { unauthorized.current = onUnauthorized; }, [onUnauthorized]);
  const path = `/api/member/capsules/${capsule.id}/share`;
  const run = useCallback(async (action: (signal: AbortSignal) => Promise<void>, mutation = false) => {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(null); setMessage(null);
    try { await action(controller.signal); }
    catch (cause) {
      if (controller.signal.aborted) return;
      if (mutation) { setKnown(false); setUrl(""); }
      if (cause instanceof MemberClientError && cause.status === 401) { setUrl(""); unauthorized.current(); return; }
      const labels = capsuleSharingLabels();
      setError(cause instanceof MemberClientError && cause.code === "SHARING_BLOCKED" ? labels.blocked : cause instanceof MemberClientError && cause.status === 409 ? labels.conflict : cause instanceof MemberClientError && cause.code === "SHARE_REVISION_LIMIT" ? labels.limit : labels.failed);
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }, []);
  const refresh = useCallback(() => { void run(async signal => {
    const result = await memberRequest(path, capsuleShareStatusSchema, { user: userId, signal });
    if (!signal.aborted) {
      const sameLink = currentShare.current === (result.share?.id ?? null);
      setUrl(previous => !result.share || result.blocked ? "" : result.token ? `${location.origin}${capsuleSharePath(result.token)}` : sameLink ? previous : "");
      currentShare.current = result.share?.id ?? null;
      setShare(result.share); setBlocked(result.blocked); setClosed(result.commentsClosed); setKnown(true); setCommentVersion(value => value + 1);
    }
  }); }, [path, run, userId]);
  useEffect(() => { const timer = setTimeout(refresh, 0); return () => { clearTimeout(timer); active.current?.abort(); }; }, [refresh]);
  function issue() {
    if (!known) return;
    setConfirm(null);
    void run(async signal => {
      const result = await memberRequest(path, capsuleShareIssuedSchema, { method: "POST", body: { expectedRevision: capsule.revision, expectedShareId: share?.id ?? null, commentsClosed: closed }, user: userId, signal });
      if (!signal.aborted) { currentShare.current = result.share.id; setShare(result.share); setKnown(true); setUrl(`${location.origin}${capsuleSharePath(result.token)}`); setMessage(text.issued); }
    }, true);
  }
  function publish() {
    if (!share || !known || discussionDraft.hasDraft()) return;
    void run(async signal => {
      const result = await memberRequest(path, z.object({share:capsuleShareSchema}), {method:"PATCH",body:{expectedShareId:share.id,expectedSharedRevision:share.revision,expectedRevision:capsule.revision},user:userId,signal});
      if (!signal.aborted) { setShare(result.share); setKnown(true); setMessage(text.published); setCommentVersion(value=>value+1); }
    },true);
  }
  function revoke() {
    if (!share || !known) return;
    setConfirm(null);
    void run(async signal => {
      await memberRequest(path, z.object({ revoked: z.literal(true) }), { method: "DELETE", body: { expectedShareId: share.id }, user: userId, signal });
      if (!signal.aborted) { currentShare.current = null; setShare(null); setUrl(""); setKnown(true); setMessage(text.revoked); }
    }, true);
  }
  function changeComments() {
    if (!share) { setClosed(value => !value); return; }
    void run(async signal => {
      const result = await memberRequest(`/api/capsules/${capsule.id}/discussion`, z.object({ closed: z.boolean() }), { method: "PATCH", body: { closed: !closed, expectedClosed: closed }, user: userId, signal });
      if (!signal.aborted) { setClosed(result.closed); setCommentVersion(value => value + 1); setMessage(result.closed ? text.commentsStopped : text.commentsStarted); }
    }, true);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); setMessage(text.copied); }
    catch { setMessage(text.copyFailed); }
  }
  return <section className={css.panel} aria-label={text.title} aria-busy={busy} data-capsule-draft={discussionDraft.hasDraft() ? "true" : undefined} data-capsule-pending={discussionDraft.hasPending() ? "true" : undefined}>
    <div className={css.heading}><div><h2>{text.title}</h2><span className={css.state} data-active={!!share}>{busy && !known ? text.checking : blocked ? text.blocked : share ? text.active(share.revision) : text.stopped}</span></div>
      <button className={`${css.button} ${css.quiet} ${css.iconButton}`} aria-label={text.refresh} title={text.refresh} disabled={busy || disabled} onClick={refresh}><Icon name="refresh" /></button></div>
    <div className={css.summary}><Icon name="capsule" /><div><strong>{capsule.content.title}</strong><span className={css.muted}>{text.current(capsule.revision)}</span></div></div>
    <p>{text.help}</p>
    {share && share.revision !== capsule.revision && <p className={css.feedback}>{text.olderVersion(share.revision, capsule.revision)}</p>}
    <div className={css.setting}><div><strong>{text.comments}</strong><p className={css.muted}>{closed ? text.commentsOff : text.commentsOn}</p></div>
      <button type="button" className={css.switch} role="switch" aria-label={text.comments} aria-checked={!closed} disabled={busy || disabled || !known || blocked} onClick={changeComments} /></div>
    {error && <p className={css.error} role="alert">{contentMessage(error, locale)}</p>}
    {message && <p className={css.feedback} role="status">{contentMessage(message, locale)}</p>}
    {share && known && !busy && !blocked && !url && <p className={css.feedback}>{text.unrecoverable}</p>}
    {url ? <div className={css.linkBox}><label htmlFor={fieldId}>{text.url}</label><div className={css.linkField}><input id={fieldId} readOnly value={url} onFocus={event => event.target.select()} />
      <button className={`${css.button} ${css.primary}`} onClick={() => void copy()}><Icon name="copy" />{text.copy}</button></div>
      <a className={`${css.button} ${css.quiet}`} href={url} target="_blank" rel="noopener noreferrer"><Icon name="external" />{text.preview}</a></div> : null}
    <div className={css.actions}>
      {share && share.revision !== capsule.revision && <button className={`${css.button} ${css.primary}`} disabled={busy || disabled || !known || blocked || discussionDraft.hasDraft()} onClick={publish}><Icon name="check" />{text.publish}</button>}
      {share && <button className={`${css.button} ${css.quiet}`} disabled={busy || disabled || !known} onClick={() => setConfirm("revoke")}>{text.revoke}</button>}
      {!share && <button className={`${css.button} ${css.primary}`} disabled={busy || disabled || !known || blocked} onClick={issue}><Icon name="link" />{text.issue}</button>}</div>
    {share && discussionDraft.hasDraft() && share.revision !== capsule.revision && <p className={css.muted}>{text.finishComment}</p>}
    {share && <details className={css.details}><summary>{text.rotate}</summary><p>{text.rotationHelp}</p><button className={css.button} disabled={busy || disabled || !known || blocked} onClick={() => setConfirm("issue")}>{text.rotate}</button></details>}
    <details className={css.details}><summary>{text.details}</summary><p>{text.linkRecovery}</p><p>{text.commentScope}</p></details>
    {capsule.content.document && share && !blocked && <CapsuleDiscussion key={`${capsule.id}:${share.revision}:${userId}`} capsuleId={capsule.id} revision={share.revision} userId={userId} draftCache={discussionDraft} onUnauthorized={onUnauthorized} showSettings={false} refreshVersion={commentVersion} revisionUrl={url ? revision => `${url}?revision=${revision}` : undefined} />}
    {confirm && <CommunityDialog className={css.dialog} title={confirm === "issue" ? text.rotate : text.revoke} onCancel={() => setConfirm(null)} busy={busy}>
      <p>{confirm === "issue" ? text.rotationHelp : text.revokeHelp}</p><div className={css.actions}>
        <button className={css.button} onClick={() => setConfirm(null)} autoFocus>{text.cancel}</button><button className={`${css.button} ${css.primary}`} disabled={busy || disabled} onClick={confirm === "issue" ? issue : revoke}>{confirm === "issue" ? text.confirmIssue : text.confirmRevoke}</button>
      </div></CommunityDialog>}
  </section>;
}
