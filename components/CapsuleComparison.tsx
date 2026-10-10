"use client";
import { useEffect, useRef, useState } from "react";
import type { MemberCapsule } from "../lib/domain/member-capsule";
import { MemberClientError, memberItemSchema, memberReaderCapsule, memberRequest } from "../lib/client/member-api";
import { compareCapsuleContent, resolveComparisonReferences, type ComparisonReferences } from "../lib/client/capsule-comparison";
import { readingHref } from "../lib/client/reading-reference";
import type { ResolvedCapsule } from "../lib/client/local-capsules";
import { capsuleComparisonLabels } from "../lib/i18n/capsule-comparison";
import { ClaimCaption } from "./CapsuleDialog";
import css from "./MemberCapsules.module.css";

export default function CapsuleComparison({ snapshot, userId, disabled, onUnauthorized }: {
  snapshot: MemberCapsule; userId: string; disabled: boolean; onUnauthorized: () => void;
}) {
  const text = capsuleComparisonLabels();
  const [opened, setOpened] = useState(false), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState<MemberCapsule | null>(null);
  const [references, setReferences] = useState<ComparisonReferences | null>(null);
  const [referencesBusy, setReferencesBusy] = useState(false), [referencesFailed, setReferencesFailed] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); }, []);
  function close() { active.current?.abort(); setOpened(false); setCurrent(null); setReferences(null); }
  async function load() {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setOpened(true); setBusy(true); setFailed(false); setCurrent(null); setReferences(null); setReferencesFailed(false); setReferencesBusy(false);
    try {
      const result = await memberRequest(`/api/member/capsules/${snapshot.id}`, memberItemSchema, { user: userId, signal: controller.signal });
      memberReaderCapsule(result.capsule, snapshot.content.dataset);
      if (result.capsule.id !== snapshot.id || result.capsule.revision < snapshot.revision) throw new Error("Context mismatch");
      if (controller.signal.aborted) return;
      setCurrent(result.capsule); setBusy(false); setReferencesBusy(true);
      // A slow or unavailable KG must not erase the saved membership difference.
      const labelsController = new AbortController();
      const timer = window.setTimeout(() => labelsController.abort(), 60_000);
      try {
        const value = await resolveComparisonReferences(snapshot, result.capsule, AbortSignal.any([controller.signal, labelsController.signal]));
        if (!controller.signal.aborted) { setReferences(value); setReferencesFailed(!!(value.before.issues.length + value.after.issues.length)); }
      } catch { if (!controller.signal.aborted) setReferencesFailed(true); }
      finally { window.clearTimeout(timer); if (!controller.signal.aborted) setReferencesBusy(false); }
    } catch (error) {
      if (controller.signal.aborted) return;
      setFailed(true);
      if (error instanceof MemberClientError && error.status === 401) onUnauthorized();
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const diff = current ? compareCapsuleContent(snapshot.content, current.content) : null;
  const hasReferences = diff && !!(diff.entities.added.length + diff.entities.removed.length + diff.claims.added.length + diff.claims.removed.length);
  function referenceList(kind: "entity" | "claim", ids: string[], resolved: ResolvedCapsule | undefined) {
    return ids.length ? <ul className={css.posts}>{ids.map(id => <li key={id}>
      {kind === "entity" && resolved?.entities[id] ? <strong>{resolved.entities[id].name}</strong> :
        kind === "claim" && resolved?.claims[id] ? <ClaimCaption claim={resolved.claims[id]} nodes={resolved.entities} /> :
          <span>{!referencesBusy && text.referenceUnavailable}</span>}
      {!(kind === "claim" && resolved?.claims[id]) && <p className={css.muted}>ID: <code>{id}</code></p>}
      <a href={readingHref({ dataset: snapshot.content.dataset, kind, id })} target="_blank" rel="noopener noreferrer">{text.inspect}</a>
    </li>)}</ul> : <p>{text.none}</p>;
  }
  return <section className={css.sharing} aria-label={text.title}>
    <button disabled={disabled} aria-expanded={opened} onClick={() => opened ? close() : void load()}>{opened ? text.close : text.open}</button>
    {opened && <><h2>{text.title}</h2><p>{text.help}</p>
      {busy && <p role="status">{text.loading}</p>}{failed && <p role="alert">{text.failed}</p>}
      {current && diff && <>
        <h3>{text.direction(snapshot.revision, current.revision)}</h3>
        {!diff.changed ? <p role="status">{text.unchanged}</p> : <>
          {!diff.titleChanged && !diff.noteChanged && <p>{text.unchangedText}</p>}
          {(["title", "note"] as const).map(field => (field === "title" ? diff.titleChanged : diff.noteChanged) && <section key={field} aria-label={text[field === "title" ? "titleField" : "noteField"]}>
            <h4>{text[field === "title" ? "titleField" : "noteField"]}</h4><div className={css.comparisonColumns}>
              <div><h5>{text.before(snapshot.revision)}</h5><p className={css.postBody}>{snapshot.content[field] || text.noNote}</p></div>
              <div><h5>{text.after(current.revision)}</h5><p className={css.postBody}>{current.content[field] || text.noNote}</p></div>
            </div>
          </section>)}
        </>}
        {hasReferences && <p>{text.referencesHelp}</p>}
        {(["entity", "claim"] as const).map(kind => {
          const group = diff[kind === "entity" ? "entities" : "claims"];
          return <section key={kind} aria-label={text[kind === "entity" ? "entities" : "claims"]}>
            <h4>{text[kind === "entity" ? "entities" : "claims"]}</h4><p>{text.counts(group.added.length, group.removed.length, group.retained)}</p>
            {!!(group.added.length + group.removed.length) && <div className={css.comparisonColumns}>
              <div><h5>{text.removed}</h5>{referenceList(kind, group.removed, references?.before)}</div>
              <div><h5>{text.added}</h5>{referenceList(kind, group.added, references?.after)}</div>
            </div>}
          </section>;
        })}
        {hasReferences && <>{referencesBusy && <p role="status">{text.referencesLoading}</p>}{referencesFailed && <p role="status">{text.referencesFailed}</p>}</>}
      </>}
      <button disabled={disabled || busy} onClick={() => void load()}>{text.retry}</button>
    </>}
  </section>;
}
