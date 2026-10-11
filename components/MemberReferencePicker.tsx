"use client";

import { useEffect, useRef, useState } from "react";
import type { MemberCapsuleDraft } from "../lib/client/member-capsule-edit";
import { addMemberReference, loadMemberReference, parseMemberReferenceLink, type MemberReferenceAddition } from "../lib/client/member-reference-addition";
import { memberLabels } from "../lib/i18n/member";
import { KIND_LABELS } from "../lib/client/format";
import { ClaimCard } from "./ClaimDetails";
import css from "./CapsuleDialog.module.css";

export default function MemberReferencePicker({ draft, onChange }: {
  draft: MemberCapsuleDraft; onChange: (draft: MemberCapsuleDraft) => void;
}) {
  const text = memberLabels();
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<MemberReferenceAddition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  function reset() {
    active.current?.abort(); active.current = null;
    setPreview(null); setLoading(false); setError(null); setMessage(null);
  }
  async function inspect() {
    reset();
    const reference = parseMemberReferenceLink(link, location.origin, draft.content.dataset);
    if (!reference) { setError(text.referenceInvalid); return; }
    const controller = new AbortController(); active.current = controller; setLoading(true);
    try {
      const result = await loadMemberReference(reference, controller.signal);
      if (!controller.signal.aborted) setPreview(result);
    } catch { if (!controller.signal.aborted) setError(text.referenceFailed); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  function confirm() {
    if (!preview) return;
    try {
      const next = addMemberReference(draft, preview);
      onChange(next); reset(); setLink(""); setMessage(text.referenceAdded); input.current?.focus();
    } catch { setError(text.referenceLimit); }
  }
  return <section aria-label={text.addReference}>
    <h3>{text.addReference}</h3><p>{text.referenceHelp}</p>
    <form className={css.editor} onSubmit={event => { event.preventDefault(); void inspect(); }}>
      <label>{text.referenceLink}<input ref={input} type="text" inputMode="url" maxLength={2048} value={link} onChange={event => { reset(); setLink(event.target.value); }} /></label>
      <button disabled={loading || !link.trim()}>{text.referencePreview}</button>
    </form>
    {loading && <p role="status">{text.referenceLoading}</p>}
    {(loading || preview) && <button type="button" onClick={reset}>{text.referenceCancel}</button>}
    {preview && <div>
      <ul>{preview.entities.map(entity => <li key={entity.id}><strong>{entity.name} · {KIND_LABELS[entity.kind]}</strong>{entity.description && <p>{entity.description}</p>}<code>{entity.id}</code></li>)}</ul>
      {preview.claim ? <><p>{text.referenceNote}</p><ClaimCard referenceDataset={preview.reference.dataset} claim={preview.claim} nodes={Object.fromEntries(preview.entities.map(entity => [entity.id, entity]))} title={text.referenceClaimTitle} idPrefix="member-addition-" /></> : <p>{text.referenceEntityNote}</p>}
      <button type="button" onClick={confirm}>{text.referenceConfirm}</button>
    </div>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
