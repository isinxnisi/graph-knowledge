"use client";
import { focusDestination } from "../lib/client/focus-destination";
import DialogCloseButton from "./DialogCloseButton";
import { useUiLocale } from "../lib/client/ui-locale";
import { contentMessage } from "../lib/i18n/content";
import { explorerLabels } from "../lib/i18n/explorer";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DatasetMode } from "../lib/domain/dataset";
import { dataReleaseLabels } from "../lib/i18n/data-release";
import type { ClaimDetail, ClaimSummary, EntitySummary } from "../lib/domain/api";
import type { GraphState, Selection } from "../lib/client/graph-state";
import { CAPSULE_LIMITS, CapsuleError, capsuleContentChanged, capsuleEditCandidates, capsuleGraph, capsulesKey, createCapsule, readCapsules, resolveCapsule, reviseCapsule, writeCapsule, type LocalCapsule, type ResolvedCapsule } from "../lib/client/local-capsules";
import { formatPeriod, polarityLabel, qualificationLabel, relationLabel } from "../lib/client/format";
import { displayRelations, entityLabel } from "../lib/client/graph-presentation";
import { useDialogBackdrop } from "../lib/client/use-dialog-backdrop";
import { contributionLabels } from "../lib/i18n/contribution";
import { eventParticipationLabels } from "../lib/i18n/event-participation";
import { readingHref } from "../lib/client/reading-reference";
import { memberLabels } from "../lib/i18n/member";
import { capsuleLabels } from "../lib/i18n/capsules";
import { ClaimCard } from "./ClaimDetails";
import GraphCanvas from "./GraphCanvas";
import {materializeLegacy} from "../lib/client/capsule-editor";
import CapsuleStudio from "./CapsuleStudio";
import styles from "./Explorer.module.css";
import css from "./CapsuleDialog.module.css";

function claimLabel(claim: ClaimSummary, nodes: Record<string, EntitySummary>, locale: string) {
  return `${nodes[claim.subjectId]?.name ?? claim.subjectId} → ${relationLabel(claim, locale)} → ${nodes[claim.objectId]?.name ?? claim.objectId}`;
}
const textMessages = capsuleLabels();
export function ClaimCaption({ claim, nodes }: { claim: ClaimSummary & { withdrawal?: ClaimDetail["withdrawal"] }; nodes: Record<string, EntitySummary> }) {
  const { locale } = useUiLocale();
  const scope = claim.contribution?.scope, contribution = contributionLabels(locale);
  return <>{claim.withdrawal && <strong>{dataReleaseLabels(locale).withdrawn} · </strong>}<strong>{claimLabel(claim, nodes, locale)}</strong>{" "}<span>{[polarityLabel(claim, locale), qualificationLabel(claim, locale), formatPeriod(claim.period, locale)].filter(Boolean).join(" / ")}</span>
    {scope && <span>{contribution.scope}：{scope.volumeLabel ?? contribution.volumeUnknown} / {scope.editionLabel ?? contribution.editionUnknown} / ISBN {scope.isbn13} / {scope.language}</span>}
    <small className={styles.muted}>ID: {claim.id}</small></>;
}

export function CapsuleReader(props: { capsule: LocalCapsule; byline?: import("react").ReactNode; onEditRequest?: (view:LocalCapsule)=>void; onEdit?: (resolved: ResolvedCapsule) => void; explorationLinks?: boolean; noteAttribution?: "self" | "author" }) {
  return props.capsule.document ? <CapsuleStudio capsule={props.capsule} readOnly byline={props.byline} onEditRequest={props.onEditRequest} /> : props.onEdit ? <LegacyCapsuleReader {...props} /> : <LegacyStudioReader {...props} />;
}

function LegacyStudioReader({capsule,byline,onEditRequest}:{capsule:LocalCapsule;byline?:import("react").ReactNode;onEditRequest?:(view:LocalCapsule)=>void}){
 const {locale}=useUiLocale(),en=locale==="en";
 const [ready,setReady]=useState<LocalCapsule|null>(null),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{const controller=new AbortController();let active=true;void resolveCapsule(capsule,controller.signal).then(value=>{if(active)setReady(materializeLegacy(capsule,value));}).catch(()=>{if(active)setFailed(true);});return()=>{active=false;controller.abort();};},[capsule,attempt]);
 return ready?<><p className={css.note}>{en?"Legacy Capsule: references are loaded from the current KG. Saving an edit records this snapshot.":"旧Capsuleの参照を現在のKGから表示しています。編集を保存すると、この断面を記録します。"}</p><CapsuleStudio capsule={ready} readOnly byline={byline} onEditRequest={onEditRequest}/></>:<p role={failed?"alert":"status"}>{failed?(en?"Could not load references.":"参照を取得できませんでした。"):(en?"Opening Capsule…":"Capsuleを開いています…")}{failed&&<button onClick={()=>{setFailed(false);setAttempt(v=>v+1);}}>{en?"Retry":"再試行"}</button>}</p>;
}

function LegacyCapsuleReader({ capsule, onEdit, explorationLinks = false, noteAttribution = "self" }: { capsule: LocalCapsule; byline?: import("react").ReactNode; onEditRequest?: (view:LocalCapsule)=>void; onEdit?: (resolved: ResolvedCapsule) => void; explorationLinks?: boolean; noteAttribution?: "self" | "author" }) {
  const { locale } = useUiLocale();
  const text = capsuleLabels(locale);
  const [resolved, setResolved] = useState<ResolvedCapsule | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const details = useRef<HTMLDivElement>(null);
  const overview = useRef<HTMLDivElement>(null);
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
  const relations = useMemo(() => graph ? displayRelations(graph.claims, locale) : {}, [graph, locale]);
  const selectedEntity = selection?.kind === "entity" ? resolved?.entities[selection.id] : null;
  const claimIds = selection?.kind === "claim" ? [selection.id] : selection?.kind === "relation" ? relations[selection.id]?.claimIds ?? [] : [];
  function inspect(value: Selection) {
    setSelection(value);
    // Let the selected content render before moving keyboard focus to it.
    requestAnimationFrame(() => { focusDestination(details.current); details.current?.scrollIntoView({ block: "nearest" }); });
  }
  return <section className={css.reader} aria-label={text.content}>
    <h3 tabIndex={-1} data-focus-destination data-capsule-focus>{capsule.title}</h3><p className={styles.muted}>{text.version(capsule.revision)} · {new Date(capsule.updatedAt ?? capsule.createdAt).toLocaleString(locale === "en" ? "en-GB" : "ja-JP")}</p>
    {onEdit && <button disabled={!resolved && !failed} onClick={() => onEdit(resolved ?? { entities: {}, claims: {}, issues: [] })}>{text.edit}</button>}
    <h4>{noteAttribution === "author" ? text.authorNote : text.note}</h4><p className={css.note}>{capsule.note || text.noNote}</p><p className={styles.muted}>{noteAttribution === "author" ? text.authorNoteHelp : text.noteHelp}</p>
    <p>{text.current}</p>
    {!resolved && !failed && <p role="status">{text.reading}</p>}
    {failed && <p role="alert">{text.timeout}</p>}
    {(failed || resolved) && <button onClick={() => { setResolved(null); setFailed(false); setSelection(null); setAttempt(value => value + 1); }}>{text.retry}</button>}
    {resolved && graph && <>
      {!!resolved.issues.length && <div role="status"><p>{text.incomplete}</p><ul>{resolved.issues.map(issue => <li key={`${issue.kind}:${issue.id}`}>{text.item(issue.kind)} <code>{issue.id}</code>：{text[issue.reason]}</li>)}</ul></div>}
      <p>{text.displayed(Object.keys(graph.nodes).length, Object.keys(graph.claims).length)}</p>
      <p className={styles.muted}>{text.graphHelp}</p>
      <div ref={overview} tabIndex={-1} data-focus-destination role="region" aria-label={text.overview} className={css.overview}>
        <GraphCanvas contentOnly graph={graph} selection={selection} onEntity={id => inspect({ kind: "entity", id })} onRelation={id => inspect({ kind: "relation", id })} onToggleEntity={() => {}} />
        <h4>{text.entities}</h4><ul className={css.memberList}>{capsule.entityIds.map(id => <li key={id}>{resolved.entities[id] ? <button aria-pressed={selection?.kind === "entity" && selection.id === id} onClick={() => inspect({ kind: "entity", id })}>{entityLabel(resolved.entities[id], resolved.entities, locale).replace("\n", " / ")} · {explorerLabels(locale).kinds[resolved.entities[id].kind]}</button> : <code>{id}</code>}</li>)}</ul>
        <h4>{text.claims}</h4>{!capsule.claimIds.length && <p>{text.noClaims}</p>}
        <ul className={css.memberList}>{capsule.claimIds.map(id => <li key={id}>{resolved.claims[id] ? <button className={css.claimChoice} aria-pressed={claimIds.includes(id)} onClick={() => inspect({ kind: "claim", id })}><ClaimCaption claim={resolved.claims[id]} nodes={resolved.entities} /></button> : <code>{id}</code>}</li>)}</ul>
      </div>
      <div ref={details} tabIndex={-1} data-focus-destination className={css.details}>
        {selectedEntity && <><h4>{selectedEntity.name}</h4><p>{explorerLabels(locale).kinds[selectedEntity.kind]}</p><p>{selectedEntity.description}</p><p>{selectedEntity.aliases.join(" / ")}</p>
          {selectedEntity.event && <><dl className={styles.claimFacts}><dt>{eventParticipationLabels(locale).eventPeriod}</dt><dd>{formatPeriod(selectedEntity.event.period, locale)}</dd></dl><p>{eventParticipationLabels(locale).periodHelp}</p></>}
          <code>{selectedEntity.id}</code>
          {explorationLinks && <p><a href={readingHref({ kind: "entity", dataset: capsule.dataset, id: selectedEntity.id })}>{memberLabels(locale).exploreEntity}</a></p>}</>}
        {!claimIds.length && <p className={styles.muted}>{text.chooseClaim}</p>}
        {claimIds.map(id => resolved.claims[id] && <ClaimCard referenceDataset={capsule.dataset} key={id} idPrefix="capsule-" title={text.selectedClaim} claim={resolved.claims[id]} nodes={resolved.entities} />)}
        {selection && <div className={css.readerNavigation}><button onClick={() => {
          focusDestination(overview.current);
          overview.current?.scrollIntoView({ block: "start" });
        }}>{text.backToOverview}</button></div>}
      </div>
    </>}
  </section>;
}

export default function CapsuleDialog({ dataset, graph, onClose, onBeforeAccountNavigation }: { onBeforeAccountNavigation?: () => boolean; dataset: DatasetMode; graph: GraphState; onClose: () => void }) {
  const { locale } = useUiLocale();
  const text = capsuleLabels(locale);
  const dialog = useRef<HTMLDialogElement>(null);
  // Freeze the candidate set for this authoring session, even if Explorer's
  // outstanding request finishes behind the modal.
  const [visible] = useState(graph);
  const [candidates, setCandidates] = useState(graph);
  const [editing, setEditing] = useState<LocalCapsule | null>(null);
  const [mode, setMode] = useState<"library" | "create">("library");
  const [capsules, setCapsules] = useState<LocalCapsule[]>([]);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<LocalCapsule | null>(null);
  const [removing, setRemoving] = useState<LocalCapsule | null>(null);
  const removalPrompt = useRef<HTMLElement>(null);
  useEffect(() => {
    if (removing) { focusDestination(removalPrompt.current); removalPrompt.current?.scrollIntoView({ block: "nearest" }); }
  }, [removing]);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [entityIds, setEntityIds] = useState<string[]>([]);
  const [claimIds, setClaimIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<"close" | "library" | "reader" | null>(null);
  const screenKey = leaving ? `confirm:${leaving}` : mode === "create" ? "create" : selected ? `${selected.id}:${selected.revision}` : "library";
  const previousScreen = useRef(screenKey);
  useEffect(() => {
    if (previousScreen.current === screenKey) return;
    previousScreen.current = screenKey;
    if (dialog.current) {
      dialog.current.scrollTop = 0;
      focusDestination(dialog.current.querySelector<HTMLElement>("[data-capsule-focus]"));
    }
  }, [screenKey]);
  const unresolvedClaims = claimIds.some(id => !candidates.claims[id]);
  const required = new Set(claimIds.flatMap(id => {
    const claim = candidates.claims[id];
    return claim ? [claim.subjectId, claim.objectId] : editing?.entityIds ?? [];
  }));
  const members = [...new Set([...entityIds, ...required])];
  const dirty = mode === "create" && (editing ? capsuleContentChanged(editing, title, note, members, claimIds) : !!(title || note || members.length || claimIds.length));
  const entityChoices = [...new Set([...(editing?.entityIds ?? []), ...Object.keys(candidates.nodes)])];
  const claimChoices = [...new Set([...(editing?.claimIds ?? []), ...Object.keys(candidates.claims)])];
  const stale = !!editing && ready && JSON.stringify(capsules.find(item => item.id === editing.id)) !== JSON.stringify(editing);
  function fail(error: unknown) { setMessage(null); setError(text[error instanceof CapsuleError ? error.reason : "storage"]); }
  function reload() {
    try { setCapsules(readCapsules(window.localStorage, dataset)); setReady(true); setError(null); }
    catch (error) { setReady(false); fail(error); }
  }
  useEffect(() => {
    dialog.current?.showModal();
    const read = () => {
      try { setCapsules(readCapsules(window.localStorage, dataset)); setReady(true); setError(null); }
      catch (error) { setReady(false); setError(textMessages[error instanceof CapsuleError ? error.reason : "storage"]); }
    };
    read();
    const changed = (event: StorageEvent) => { if (event.key === null || event.key === capsulesKey(dataset)) read(); };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [dataset]);
  function exit(destination: "close" | "library" | "reader", force = false) {
    if (dirty && !force) { setLeaving(destination); return; }
    setLeaving(null);
    if (destination === "close") { dialog.current?.close(); onClose(); }
    else { setMode("library"); if (destination === "library") setSelected(null); setEditing(null); setRemoving(null); setTitle(""); setNote(""); setEntityIds([]); setClaimIds([]); setMessage(null); setError(null); }
  }
  const backdrop = useDialogBackdrop(() => exit("close"));
  function save() {
    try {
      const capsule = editing ? reviseCapsule(editing, title, note, members, claimIds, candidates) : createCapsule(dataset, title, note, members, claimIds, candidates);
      if (capsule === editing) { exit("reader"); return; }
      setCapsules(writeCapsule(window.localStorage, dataset, editing ? { replace: capsule, expected: editing } : { add: capsule }));
      setMode("library"); setSelected(capsule); setEditing(null); setError(null); setMessage(text.saved); setTitle(""); setNote(""); setEntityIds([]); setClaimIds([]);
    } catch (error) {
      if (error instanceof CapsuleError && error.reason === "conflict") reload();
      fail(error);
    }
  }
  const overLimit = members.length > CAPSULE_LIMITS.entities || claimIds.length > CAPSULE_LIMITS.claims;
  return <dialog lang={locale} ref={dialog} className={`${styles.conditionDialog} ${css.dialog}`} aria-labelledby="capsule-title" onCancel={event => { event.preventDefault(); exit("close"); }} {...backdrop}>
    <div className={css.title}><h2 id="capsule-title">{text.title}</h2><DialogCloseButton label={text.close} onClick={() => exit("close")} /></div>
    <p>{text.help}</p><p className={styles.muted}>{text.local}</p>
    {mode !== "create" && <p><a href="/member" onClick={event => { if (onBeforeAccountNavigation && !onBeforeAccountNavigation()) event.preventDefault(); }}>{memberLabels(locale).launch}</a></p>}
    {error && <p role="alert" className={styles.error}>{contentMessage(error, locale)}</p>}{message && <p role="status">{contentMessage(message, locale)}</p>}
    {!ready && <button onClick={reload}>{text.reload}</button>}
    {leaving ? <section role="alert"><p>{text.draftExit}</p><button onClick={() => exit(leaving, true)}>{text.discard}</button><button data-capsule-focus onClick={() => setLeaving(null)}>{editing ? text.continueEdit : text.continue}</button></section> : <>
      {mode === "create" ? <>
        <button onClick={() => exit("library")}>{text.library}</button>
        {editing && <><button onClick={() => exit("reader")}>{text.cancelEdit}</button><p>{text.editHelp}</p><p>{text.editVersion(editing.revision)}</p></>}
        {stale && <p role="alert" className={styles.error}>{text.editConflict}</p>}
        <form className={css.editor} onSubmit={event => { event.preventDefault(); save(); }}>
          <label>{text.name}<input data-capsule-focus required maxLength={CAPSULE_LIMITS.title} value={title} onChange={event => setTitle(event.target.value)} /></label>
          <label>{text.note}<textarea rows={5} maxLength={CAPSULE_LIMITS.note} value={note} onChange={event => setNote(event.target.value)} /></label><p className={styles.muted}>{text.noteHelp}</p>
          <p>{text.selectionHelp}</p><p>{text.limits}</p>
          {editing && unresolvedClaims && <p role="status">{text.unresolvedEdit}</p>}
          <fieldset><legend>{text.entities}</legend>{entityChoices.map(id => {
            const entity = candidates.nodes[id];
            return <label className={css.choice} key={id}><input type="checkbox" checked={members.includes(id)} disabled={required.has(id)} onChange={event => setEntityIds(ids => event.target.checked ? [...ids, id] : ids.filter(value => value !== id))} /><span>{entity ? <>{entityLabel(entity, candidates.nodes, locale).replace("\n", " / ")} · {explorerLabels(locale).kinds[entity.kind]}</> : <>{text.unresolvedReference} <code>{id}</code></>}{required.has(id) && <small>{unresolvedClaims && editing?.entityIds.includes(id) ? text.preserveEndpoint : text.required}</small>}</span></label>;
          })}</fieldset>
          <fieldset><legend>{text.claims}</legend>{claimChoices.map(id => {
            const claim = candidates.claims[id];
            return <label className={css.choice} key={id}><input type="checkbox" checked={claimIds.includes(id)} onChange={event => setClaimIds(ids => event.target.checked ? [...ids, id] : ids.filter(value => value !== id))} /><span className={css.claimChoice}>{claim ? <ClaimCaption claim={claim} nodes={candidates.nodes} /> : <>{text.unresolvedReference} <code>{id}</code></>}</span></label>;
          })}</fieldset>
          <p role="status" className={overLimit ? styles.error : undefined}>{text.selected(members.length, claimIds.length)}</p>
          <button disabled={!ready || stale || overLimit || !members.length || !title.trim() || (editing ? !dirty : capsules.length >= CAPSULE_LIMITS.count)}>{editing ? text.saveEdit : text.create}</button>
        </form>
      </> : selected ? <>
        <button onClick={() => { setSelected(null); setMessage(null); }}>{text.library}</button>
        <p><a href={`/member?import=${selected.id}`} onClick={event => { if (onBeforeAccountNavigation && !onBeforeAccountNavigation()) event.preventDefault(); }}>{memberLabels(locale).importLaunch}</a></p>
        <CapsuleReader key={`${selected.id}:${selected.revision}`} capsule={selected} onEdit={resolved => {
          setEditing(selected); setCandidates(capsuleEditCandidates(selected, resolved, visible)); setTitle(selected.title); setNote(selected.note); setEntityIds(selected.entityIds); setClaimIds(selected.claimIds); setMode("create"); setMessage(null); setError(null);
        }} />
      </> : <>
        <h3 tabIndex={-1} data-focus-destination data-capsule-focus>{text.libraryTitle}</h3>
        <button disabled={!Object.keys(visible.nodes).length || !ready || capsules.length >= CAPSULE_LIMITS.count} onClick={() => { setCandidates(visible); setEditing(null); setMode("create"); setMessage(null); setRemoving(null); }}>{text.new}</button>
        {!Object.keys(visible.nodes).length && <p>{text.noGraph}</p>}
        <p>{capsules.length} / {CAPSULE_LIMITS.count}</p>{capsules.length >= CAPSULE_LIMITS.count && <p>{text.limit}</p>}
        {ready && !capsules.length && <p>{text.empty}</p>}
        <ul className={css.library}>{capsules.map(capsule => <li key={capsule.id}><h3>{capsule.title}</h3><p>{text.selected(capsule.entityIds.length, capsule.claimIds.length)} · {text.version(capsule.revision)}</p><p className={styles.muted}>{new Date(capsule.updatedAt ?? capsule.createdAt).toLocaleString(locale === "en" ? "en-GB" : "ja-JP")}</p><button onClick={() => { setSelected(capsule); setRemoving(null); }}>{text.read}</button><button data-capsule-remove={capsule.id} onClick={() => setRemoving(capsule)}>{text.remove}</button></li>)}</ul>
        {removing && <section ref={removalPrompt} tabIndex={-1} data-focus-destination role="alert"><p>{text.removeHelp(removing.title)}</p><button onClick={() => {
          try { setCapsules(writeCapsule(window.localStorage, dataset, { remove: removing })); setRemoving(null); setError(null); requestAnimationFrame(() => focusDestination(dialog.current?.querySelector<HTMLElement>("[data-capsule-focus]"), {})); }
          catch (error) { fail(error); }
        }}>{text.confirmRemove}</button><button onClick={() => { const id = removing.id; setRemoving(null); requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>(`[data-capsule-remove="${id}"]`)?.focus()); }}>{text.keep}</button></section>}
        {ready && <button onClick={reload}>{text.reload}</button>}
      </>}
    </>}
  </dialog>;
}
