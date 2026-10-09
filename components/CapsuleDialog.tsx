"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DatasetMode } from "../lib/domain/dataset";
import type { ClaimSummary, EntitySummary } from "../lib/domain/api";
import type { GraphState, Selection } from "../lib/client/graph-state";
import { CAPSULE_LIMITS, CapsuleError, capsuleGraph, capsulesKey, createCapsule, readCapsules, resolveCapsule, writeCapsule, type LocalCapsule, type ResolvedCapsule } from "../lib/client/local-capsules";
import { formatPeriod, KIND_LABELS, polarityLabel, qualificationLabel, relationLabel } from "../lib/client/format";
import { displayRelations, entityLabel } from "../lib/client/graph-presentation";
import { useDialogBackdrop } from "../lib/client/use-dialog-backdrop";
import { contributionLabels } from "../lib/i18n/contribution";
import { eventParticipationLabels } from "../lib/i18n/event-participation";
import { capsuleLabels } from "../lib/i18n/capsules";
import { ClaimCard } from "./ClaimDetails";
import GraphCanvas from "./GraphCanvas";
import styles from "./Explorer.module.css";
import css from "./CapsuleDialog.module.css";

function claimLabel(claim: ClaimSummary, nodes: Record<string, EntitySummary>) {
  return `${nodes[claim.subjectId]?.name ?? claim.subjectId} → ${relationLabel(claim)} → ${nodes[claim.objectId]?.name ?? claim.objectId}`;
}
function ClaimCaption({ claim, nodes }: { claim: ClaimSummary; nodes: Record<string, EntitySummary> }) {
  const scope = claim.contribution?.scope, contribution = contributionLabels();
  return <><strong>{claimLabel(claim, nodes)}</strong>{" "}<span>{[polarityLabel(claim), qualificationLabel(claim), formatPeriod(claim.period)].filter(Boolean).join(" / ")}</span>
    {scope && <span>{contribution.scope}：{scope.volumeLabel ?? contribution.volumeUnknown} / {scope.editionLabel ?? contribution.editionUnknown} / ISBN {scope.isbn13} / {scope.language}</span>}
    <small className={styles.muted}>ID: {claim.id}</small></>;
}

function CapsuleReader({ capsule }: { capsule: LocalCapsule }) {
  const text = capsuleLabels();
  const [resolved, setResolved] = useState<ResolvedCapsule | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const details = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    let active = true;
    void resolveCapsule(capsule, controller.signal).then(value => {
      if (active && !controller.signal.aborted) setResolved(value);
    }).catch(() => { if (active) setFailed(true); }).finally(() => clearTimeout(timer));
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [capsule, attempt]);
  const graph = useMemo(() => resolved ? capsuleGraph(resolved) : null, [resolved]);
  const relations = useMemo(() => graph ? displayRelations(graph.claims) : {}, [graph]);
  const selectedEntity = selection?.kind === "entity" ? resolved?.entities[selection.id] : null;
  const claimIds = selection?.kind === "claim" ? [selection.id] : selection?.kind === "relation" ? relations[selection.id]?.claimIds ?? [] : [];
  function inspect(value: Selection) {
    setSelection(value);
    // Let the selected content render before moving keyboard focus to it.
    requestAnimationFrame(() => { details.current?.focus({ preventScroll: true }); details.current?.scrollIntoView({ block: "nearest" }); });
  }
  return <section aria-label={text.content}>
    <h3 tabIndex={-1} data-capsule-focus>{capsule.title}</h3><p className={styles.muted}>{text.version(capsule.revision)} · {new Date(capsule.createdAt).toLocaleString("ja-JP")}</p>
    <h4>{text.note}</h4><p className={css.note}>{capsule.note || text.noNote}</p><p className={styles.muted}>{text.noteHelp}</p>
    <p>{text.current}</p>
    {!resolved && !failed && <p role="status">{text.reading}</p>}
    {failed && <p role="alert">{text.timeout}</p>}
    {(failed || resolved) && <button onClick={() => { setResolved(null); setFailed(false); setSelection(null); setAttempt(value => value + 1); }}>{text.retry}</button>}
    {resolved && graph && <>
      {!!resolved.issues.length && <div role="status"><p>{text.incomplete}</p><ul>{resolved.issues.map(issue => <li key={`${issue.kind}:${issue.id}`}>{text.item(issue.kind)} <code>{issue.id}</code>：{text[issue.reason]}</li>)}</ul></div>}
      <p>{text.displayed(Object.keys(graph.nodes).length, Object.keys(graph.claims).length)}</p>
      <p className={styles.muted}>{text.graphHelp}</p>
      <GraphCanvas contentOnly graph={graph} selection={selection} onEntity={id => inspect({ kind: "entity", id })} onRelation={id => inspect({ kind: "relation", id })} onToggleEntity={() => {}} />
      <h4>{text.entities}</h4><ul className={css.memberList}>{capsule.entityIds.map(id => <li key={id}>{resolved.entities[id] ? <button aria-pressed={selection?.kind === "entity" && selection.id === id} onClick={() => inspect({ kind: "entity", id })}>{entityLabel(resolved.entities[id], resolved.entities).replace("\n", " / ")} · {KIND_LABELS[resolved.entities[id].kind]}</button> : <code>{id}</code>}</li>)}</ul>
      <h4>{text.claims}</h4>{!capsule.claimIds.length && <p>{text.noClaims}</p>}
      <ul className={css.memberList}>{capsule.claimIds.map(id => <li key={id}>{resolved.claims[id] ? <button className={css.claimChoice} aria-pressed={claimIds.includes(id)} onClick={() => inspect({ kind: "claim", id })}><ClaimCaption claim={resolved.claims[id]} nodes={resolved.entities} /></button> : <code>{id}</code>}</li>)}</ul>
      <div ref={details} tabIndex={-1} className={css.details}>
        {selectedEntity && <><h4>{selectedEntity.name}</h4><p>{KIND_LABELS[selectedEntity.kind]}</p><p>{selectedEntity.description}</p><p>{selectedEntity.aliases.join(" / ")}</p>
          {selectedEntity.event && <><dl className={styles.claimFacts}><dt>{eventParticipationLabels().eventPeriod}</dt><dd>{formatPeriod(selectedEntity.event.period)}</dd></dl><p>{eventParticipationLabels().periodHelp}</p></>}
          <code>{selectedEntity.id}</code></>}
        {!claimIds.length && <p className={styles.muted}>{text.chooseClaim}</p>}
        {claimIds.map(id => resolved.claims[id] && <ClaimCard key={id} idPrefix="capsule-" title={text.selectedClaim} claim={resolved.claims[id]} nodes={resolved.entities} />)}
      </div>
    </>}
  </section>;
}

export default function CapsuleDialog({ dataset, graph, onClose }: { dataset: DatasetMode; graph: GraphState; onClose: () => void }) {
  const text = capsuleLabels();
  const dialog = useRef<HTMLDialogElement>(null);
  // Freeze the candidate set for this authoring session, even if Explorer's
  // outstanding request finishes behind the modal.
  const [candidates] = useState(graph);
  const [mode, setMode] = useState<"library" | "create">("library");
  const [capsules, setCapsules] = useState<LocalCapsule[]>([]);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<LocalCapsule | null>(null);
  const [removing, setRemoving] = useState<LocalCapsule | null>(null);
  const removalPrompt = useRef<HTMLElement>(null);
  useEffect(() => {
    if (removing) { removalPrompt.current?.focus({ preventScroll: true }); removalPrompt.current?.scrollIntoView({ block: "nearest" }); }
  }, [removing]);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [entityIds, setEntityIds] = useState<string[]>([]);
  const [claimIds, setClaimIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<"close" | "library" | null>(null);
  const screenKey = leaving ? `confirm:${leaving}` : mode === "create" ? "create" : selected?.id ?? "library";
  const previousScreen = useRef(screenKey);
  useEffect(() => {
    if (previousScreen.current === screenKey) return;
    previousScreen.current = screenKey;
    if (dialog.current) {
      dialog.current.scrollTop = 0;
      dialog.current.querySelector<HTMLElement>("[data-capsule-focus]")?.focus({ preventScroll: true });
    }
  }, [screenKey]);
  const required = new Set(claimIds.flatMap(id => [candidates.claims[id].subjectId, candidates.claims[id].objectId]));
  const members = [...new Set([...entityIds, ...required])];
  const dirty = mode === "create" && !!(title || note || members.length || claimIds.length);
  function fail(error: unknown) { setMessage(null); setError(text[error instanceof CapsuleError ? error.reason : "storage"]); }
  function reload() {
    try { setCapsules(readCapsules(window.localStorage, dataset)); setReady(true); setError(null); }
    catch (error) { setReady(false); fail(error); }
  }
  useEffect(() => {
    dialog.current?.showModal();
    const read = () => {
      try { setCapsules(readCapsules(window.localStorage, dataset)); setReady(true); setError(null); }
      catch (error) { setReady(false); setError(text[error instanceof CapsuleError ? error.reason : "storage"]); }
    };
    read();
    const changed = (event: StorageEvent) => { if (event.key === null || event.key === capsulesKey(dataset)) read(); };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [dataset, text]);
  function exit(destination: "close" | "library", force = false) {
    if (dirty && !force) { setLeaving(destination); return; }
    setLeaving(null);
    if (destination === "close") { dialog.current?.close(); onClose(); }
    else { setMode("library"); setSelected(null); setRemoving(null); setTitle(""); setNote(""); setEntityIds([]); setClaimIds([]); setMessage(null); }
  }
  const backdrop = useDialogBackdrop(() => exit("close"));
  function save() {
    try {
      const capsule = createCapsule(dataset, title, note, members, claimIds, candidates);
      setCapsules(writeCapsule(window.localStorage, dataset, { add: capsule }));
      setMode("library"); setSelected(capsule); setError(null); setMessage(text.saved); setTitle(""); setNote(""); setEntityIds([]); setClaimIds([]);
    } catch (error) { fail(error); }
  }
  const overLimit = members.length > CAPSULE_LIMITS.entities || claimIds.length > CAPSULE_LIMITS.claims;
  return <dialog ref={dialog} className={`${styles.conditionDialog} ${css.dialog}`} aria-labelledby="capsule-title" onCancel={event => { event.preventDefault(); exit("close"); }} {...backdrop}>
    <div className={css.title}><h2 id="capsule-title">{text.title}</h2><button onClick={() => exit("close")}>{text.close}</button></div>
    <p>{text.help}</p><p className={styles.muted}>{text.local}</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}{message && <p role="status">{message}</p>}
    {!ready && <button onClick={reload}>{text.reload}</button>}
    {leaving ? <section role="alert"><p>{text.draftExit}</p><button onClick={() => exit(leaving, true)}>{text.discard}</button><button data-capsule-focus onClick={() => setLeaving(null)}>{text.continue}</button></section> : <>
      {mode === "create" ? <>
        <button onClick={() => exit("library")}>{text.library}</button>
        <form className={css.editor} onSubmit={event => { event.preventDefault(); save(); }}>
          <label>{text.name}<input data-capsule-focus required maxLength={CAPSULE_LIMITS.title} value={title} onChange={event => setTitle(event.target.value)} /></label>
          <label>{text.note}<textarea rows={5} maxLength={CAPSULE_LIMITS.note} value={note} onChange={event => setNote(event.target.value)} /></label><p className={styles.muted}>{text.noteHelp}</p>
          <p>{text.selectionHelp}</p><p>{text.limits}</p>
          <fieldset><legend>{text.entities}</legend>{Object.values(candidates.nodes).map(entity => <label className={css.choice} key={entity.id}><input type="checkbox" checked={members.includes(entity.id)} disabled={required.has(entity.id)} onChange={event => setEntityIds(ids => event.target.checked ? [...ids, entity.id] : ids.filter(id => id !== entity.id))} /><span>{entityLabel(entity, candidates.nodes).replace("\n", " / ")} · {KIND_LABELS[entity.kind]}{required.has(entity.id) && <small>{text.required}</small>}</span></label>)}</fieldset>
          <fieldset><legend>{text.claims}</legend>{Object.values(candidates.claims).map(claim => <label className={css.choice} key={claim.id}><input type="checkbox" checked={claimIds.includes(claim.id)} onChange={event => setClaimIds(ids => event.target.checked ? [...ids, claim.id] : ids.filter(id => id !== claim.id))} /><span className={css.claimChoice}><ClaimCaption claim={claim} nodes={candidates.nodes} /></span></label>)}</fieldset>
          <p role="status" className={overLimit ? styles.error : undefined}>{text.selected(members.length, claimIds.length)}</p>
          <button disabled={!ready || overLimit || !members.length || !title.trim() || capsules.length >= CAPSULE_LIMITS.count}>{text.create}</button>
        </form>
      </> : selected ? <>
        <button onClick={() => { setSelected(null); setMessage(null); }}>{text.library}</button>
        <CapsuleReader key={selected.id} capsule={selected} />
      </> : <>
        <h3 tabIndex={-1} data-capsule-focus>{text.libraryTitle}</h3>
        <button disabled={!Object.keys(candidates.nodes).length || !ready || capsules.length >= CAPSULE_LIMITS.count} onClick={() => { setMode("create"); setMessage(null); setRemoving(null); }}>{text.new}</button>
        {!Object.keys(candidates.nodes).length && <p>{text.noGraph}</p>}
        <p>{capsules.length} / {CAPSULE_LIMITS.count}件</p>{capsules.length >= CAPSULE_LIMITS.count && <p>{text.limit}</p>}
        {ready && !capsules.length && <p>{text.empty}</p>}
        <ul className={css.library}>{capsules.map(capsule => <li key={capsule.id}><h3>{capsule.title}</h3><p>{text.selected(capsule.entityIds.length, capsule.claimIds.length)} · {text.version(capsule.revision)}</p><p className={styles.muted}>{new Date(capsule.createdAt).toLocaleString("ja-JP")}</p><button onClick={() => { setSelected(capsule); setRemoving(null); }}>{text.read}</button><button data-capsule-remove={capsule.id} onClick={() => setRemoving(capsule)}>{text.remove}</button></li>)}</ul>
        {removing && <section ref={removalPrompt} tabIndex={-1} role="alert"><p>{text.removeHelp(removing.title)}</p><button onClick={() => {
          try { setCapsules(writeCapsule(window.localStorage, dataset, { remove: removing })); setRemoving(null); setError(null); requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>("[data-capsule-focus]")?.focus()); }
          catch (error) { fail(error); }
        }}>{text.confirmRemove}</button><button onClick={() => { const id = removing.id; setRemoving(null); requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>(`[data-capsule-remove="${id}"]`)?.focus()); }}>{text.keep}</button></section>}
        {ready && <button onClick={reload}>{text.reload}</button>}
      </>}
    </>}
  </dialog>;
}
