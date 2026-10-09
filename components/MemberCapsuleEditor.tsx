"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MemberCapsule } from "../lib/domain/member-capsule";
import { MEMBER_CAPSULE_LIMITS } from "../lib/domain/member-capsule";
import { memberDraftContent, memberDraftRequired, sameMemberContent, type MemberCapsuleDraft } from "../lib/client/member-capsule-edit";
import { memberReaderCapsule } from "../lib/client/member-api";
import { entityLabel } from "../lib/client/graph-presentation";
import { KIND_LABELS } from "../lib/client/format";
import { memberLabels } from "../lib/i18n/member";
import { capsuleLabels } from "../lib/i18n/capsules";
import { CapsuleReader, ClaimCaption } from "./CapsuleDialog";
import MemberReferencePicker from "./MemberReferencePicker";
import css from "./CapsuleDialog.module.css";

export default function MemberCapsuleEditor({ draft, current, busy, onChange, onSave, onCancel, onCheck }: {
  draft: MemberCapsuleDraft; current: MemberCapsule | null; busy: boolean;
  onChange: (draft: MemberCapsuleDraft) => void; onSave: () => void; onCancel: () => void; onCheck: () => void;
}) {
  const text = memberLabels(), captions = capsuleLabels();
  const [discarding, setDiscarding] = useState(false);
  const title = useRef<HTMLInputElement>(null);
  const latestReading = useMemo(() => current ? memberReaderCapsule(current, draft.content.dataset) : null, [current, draft.content.dataset]);
  useEffect(() => { title.current?.focus(); }, []);
  const required = memberDraftRequired(draft);
  const members = [...new Set([...draft.content.entityIds, ...required])];
  const unresolved = draft.content.claimIds.some(id => !draft.resolved.claims[id]);
  const changed = !sameMemberContent(draft.expected.content, { ...draft.content, entityIds: members });
  const conflict = !!current && current.revision !== draft.expected.revision;
  const matches = !!current && sameMemberContent(current.content, { ...draft.content, entityIds: members });
  let valid = false;
  try { memberDraftContent(draft); valid = true; } catch { /* Form keeps invalid input for correction. */ }
  function change(content: Partial<MemberCapsuleDraft["content"]>) { onChange({ ...draft, content: { ...draft.content, ...content } }); }
  return <section aria-label={text.editTitle}>
    <h2>{text.editTitle}</h2><p>{text.editHelp}</p><p>{text.draftMemory}</p><p>{captions.editVersion(draft.expected.revision)}</p>
    <button disabled={busy} onClick={() => changed ? setDiscarding(true) : onCancel()}>{captions.cancelEdit}</button>
    {discarding && <div role="alert"><p>{captions.draftExit}</p><button disabled={busy} onClick={onCancel}>{captions.discard}</button><button onClick={() => setDiscarding(false)}>{captions.continueEdit}</button></div>}
    {(draft.needsCheck || (!current && !busy)) && <div role="alert"><p>{text.editCheck}</p><button disabled={busy} onClick={onCheck}>{text.checkLatest}</button></div>}
    {conflict && current && latestReading && <div role="alert"><p>{text.editConflict}</p>
      <details><summary>{text.latestContent}</summary><CapsuleReader key={`${current.id}:${current.revision}`} capsule={latestReading} /></details>
      <p>{matches ? text.editMatched : text.replaceHelp}</p>
      <button disabled={busy || draft.needsCheck} onClick={() => matches ? onCancel() : onChange({ ...draft, expected: current })}>{matches ? text.finishMatched : text.useLatestRevision}</button>
    </div>}
    <form className={css.editor} onSubmit={event => { event.preventDefault(); if (current && valid && changed && !busy && !conflict && !draft.needsCheck) onSave(); }}>
      <label>{captions.name}<input ref={title} required maxLength={MEMBER_CAPSULE_LIMITS.title} disabled={busy} value={draft.content.title} onChange={event => change({ title: event.target.value })} /></label>
      <label>{captions.note}<textarea rows={6} maxLength={MEMBER_CAPSULE_LIMITS.note} disabled={busy} value={draft.content.note} onChange={event => change({ note: event.target.value })} /></label><p>{captions.noteHelp}</p>
      {unresolved && <p role="status">{captions.unresolvedEdit}</p>}
      <fieldset disabled={busy}><legend>{captions.entities}</legend>{[...new Set([...draft.base.content.entityIds, ...Object.keys(draft.resolved.entities)])].map(id => {
        const entity = draft.resolved.entities[id];
        return <label className={css.choice} key={id}><input type="checkbox" checked={members.includes(id)} disabled={required.has(id)} onChange={event => change({ entityIds: event.target.checked ? [...draft.content.entityIds, id] : draft.content.entityIds.filter(value => value !== id) })} /><span>{entity ? <>{entityLabel(entity, draft.resolved.entities).replace("\n", " / ")} · {KIND_LABELS[entity.kind]}</> : <>{captions.unresolvedReference} <code>{id}</code></>}{required.has(id) && <small>{unresolved ? captions.preserveEndpoint : captions.required}</small>}</span></label>;
      })}</fieldset>
      <fieldset disabled={busy}><legend>{captions.claims}</legend>{[...new Set([...draft.base.content.claimIds, ...Object.keys(draft.resolved.claims)])].map(id => {
        const claim = draft.resolved.claims[id];
        return <label className={css.choice} key={id}><input type="checkbox" checked={draft.content.claimIds.includes(id)} onChange={event => change({ claimIds: event.target.checked ? [...draft.content.claimIds, id] : draft.content.claimIds.filter(value => value !== id) })} /><span className={css.claimChoice}>{claim ? <ClaimCaption claim={claim} nodes={draft.resolved.entities} /> : <>{captions.unresolvedReference} <code>{id}</code></>}</span></label>;
      })}</fieldset>
      <p role="status">{captions.selected(members.length, draft.content.claimIds.length)}</p>
      {(members.length > MEMBER_CAPSULE_LIMITS.entities || draft.content.claimIds.length > MEMBER_CAPSULE_LIMITS.claims) && <p role="alert">{text.referenceLimit}</p>}
      <button disabled={!current || !valid || !changed || busy || conflict || draft.needsCheck}>{text.saveEdit}</button>
    </form>
    {!busy && <MemberReferencePicker draft={draft} onChange={onChange} />}
  </section>;
}
