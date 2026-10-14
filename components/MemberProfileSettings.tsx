"use client";
import { useUiLocale } from "../lib/client/ui-locale";
import { contentMessage } from "../lib/i18n/content";

import { useEffect, useRef, useState } from "react";
import { memberProfileUpdateSchema } from "../lib/domain/member-profile";
import { MemberClientError, memberProfileSchema, memberRequest, type MemberUser } from "../lib/client/member-api";
import { memberLabels } from "../lib/i18n/member";
import css from "./MemberCapsules.module.css";

export default function MemberProfileSettings({ user, value, disabled, onChange, onSaved, onUnauthorized }: {
  user: MemberUser; value: string; disabled: boolean; onChange: (name: string | null) => void;
  onSaved: (user: MemberUser) => void; onUnauthorized: () => void;
}) {
  const { locale } = useUiLocale();
  const text = memberLabels(locale);
  const active = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [saved, setSaved] = useState(false);
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === "hidden") active.current?.abort(); };
    document.addEventListener("visibilitychange", hidden);
    return () => { active.current?.abort(); document.removeEventListener("visibilitychange", hidden); };
  }, []);
  const parsed = memberProfileUpdateSchema.safeParse({ name: value });
  async function save() {
    if (!parsed.success || busy || disabled || parsed.data.name === user.name) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(null); setSaved(false);
    try {
      const result = await memberRequest("/api/member/profile", memberProfileSchema, { method: "PUT", body: parsed.data, user: user.id, signal: controller.signal });
      if (controller.signal.aborted) return;
      if (result.user.id !== user.id) throw new Error("Profile mismatch");
      onSaved(result.user); setSaved(true);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof MemberClientError && cause.status === 401) { onUnauthorized(); return; }
      setError(cause instanceof MemberClientError && cause.status === 503 ? text.unavailable : text.profileFailed);
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <section id="account-settings" className={css.card} aria-label={text.settings}>
    <h2 id="account-settings-title">{text.displayName}</h2>
    <form className={css.source} onSubmit={event => { event.preventDefault(); void save(); }}>
      <label htmlFor="member-display-name">{text.displayName}</label>
      <input id="member-display-name" value={value} maxLength={80} autoComplete="nickname" disabled={busy || disabled}
        aria-describedby="member-display-name-help" onChange={event => { onChange(event.target.value); setSaved(false); setError(null); }} />
      <p id="member-display-name-help" className={css.muted}>{text.displayNameHelp}</p>
      {!parsed.success && <p role="status">{text.profileInvalid}</p>}
      <div><button data-variant="primary" type="submit" disabled={busy || disabled || !parsed.success || parsed.data.name === user.name}>{text.saveProfile}</button>
        {value !== user.name && <button type="button" disabled={busy} onClick={() => { onChange(null); setError(null); setSaved(false); }}>{text.cancel}</button>}</div>
      {busy && <p role="status">{text.busy}</p>}{error && <p role="alert">{contentMessage(error, locale)}</p>}{saved && <p role="status">{text.profileSaved}</p>}
    </form>
  </section>;
}
