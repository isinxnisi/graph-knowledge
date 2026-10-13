"use client";
import { useUiLocale } from "../lib/client/ui-locale";
import { contentMessage } from "../lib/i18n/content";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { MemberClientError, memberRequest, type MemberUser } from "../lib/client/member-api";
import { memberLabels } from "../lib/i18n/member";
import css from "./MemberCapsules.module.css";

export default function MemberAccountDeletion({ user, disabled, onDeleted, onUnauthorized }: {
  user: MemberUser; disabled: boolean; onDeleted: () => void; onUnauthorized: () => void;
}) {
  const { locale } = useUiLocale();
  const text = memberLabels(locale);
  const [confirm, setConfirm] = useState(false), [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); }, []);
  async function remove() {
    if (!accepted || busy || disabled) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(null);
    try {
      await memberRequest("/api/member/profile", z.object({ deleted: z.literal(true) }), {
        method: "DELETE", body: { confirmation: "delete-account" }, user: user.id, signal: controller.signal,
      });
      if (!controller.signal.aborted) onDeleted();
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof MemberClientError && cause.status === 401) { onUnauthorized(); return; }
      setError(cause instanceof MemberClientError && cause.code === "RECENT_LOGIN_REQUIRED" ? text.deleteReauthenticate : text.deleteFailed);
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <section className={css.card} aria-label={text.deleteAccount}>
    <h2>{text.deleteAccount}</h2>
    {!confirm ? <button disabled={disabled} onClick={() => { setConfirm(true); setAccepted(false); }}>{text.deleteAccountReview}</button> : <div className={css.source}>
      <p><strong>{user.name}</strong> {text.deleteAccountHelp}</p>
      <p className={css.muted}>{text.deleteAccountBoundary}</p>
      <label><input type="checkbox" checked={accepted} disabled={busy || disabled} onChange={event => setAccepted(event.target.checked)} />{text.deleteAccountAcknowledgement}</label>
      <div><button disabled={!accepted || busy || disabled} onClick={() => void remove()}>{text.deleteAccountConfirm}</button>
        <button disabled={busy} onClick={() => { setConfirm(false); setAccepted(false); setError(null); }}>{text.cancel}</button></div>
      {busy && <p role="status">{text.busy}</p>}{error && <p role="alert">{contentMessage(error, locale)}</p>}
    </div>}
  </section>;
}
