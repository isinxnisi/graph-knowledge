"use client";
import DialogCloseButton from "./DialogCloseButton";
import { useDialogDismiss } from "../lib/client/use-dialog-dismiss";
import Icon from "./Icon";
import { useUiLocale } from "../lib/client/ui-locale";

import { EVENT_ROLE_IDS } from "../lib/domain/event-participation";
import { eventParticipationLabels } from "../lib/i18n/event-participation";
import { ORGANIZATION_POSITION_IDS } from "../lib/domain/organization-participation";
import { organizationParticipationLabels } from "../lib/i18n/organization-participation";
import { useEffect, useRef, useState } from "react";
import { CONTRIBUTION_ROLE_IDS } from "../lib/domain/contribution";
import { contributionLabels } from "../lib/i18n/contribution";
import { conditionSummary, entryLabels } from "../lib/i18n/exploration-entry";
import { normalizeContributionRoles, normalizeOrganizationPositions, normalizeEventRoles, type EventRoleFilter, type OrganizationPositionFilter, type ContributionRoleFilter, type PredicateFilter } from "../lib/domain/exploration";
import { PREDICATE_KEYS } from "../lib/domain/predicates";
import { explorationLabels } from "../lib/i18n/exploration";
import { RELATION_FACET_CATALOG, selectionFromPredicates, resolveRelationSelection, changeSelectionMode, type RelationSelection } from "../lib/client/relation-facets";
import { relationFacetLabels } from "../lib/i18n/relation-facets";
import { useDialogBackdrop } from "../lib/client/use-dialog-backdrop";
import { normalizeRelationCondition, relationConditionKey, type RelationCondition } from "../lib/domain/relation-conditions";
import { legacyRelation } from "../lib/client/relation-state";
import { relationText, relationSummary } from "../lib/i18n/relation-condition";
import styles from "./Explorer.module.css";

type SharedEditorProps = { relation?: RelationCondition; patternAllowed?: boolean; onApplyRelation?: (relation: RelationCondition) => Promise<boolean>; onCancelRelation?: () => void };

function ConditionEditor({ value, roles, positions, eventRoles, onApply, onCancel, relation, patternAllowed, onApplyRelation, onCancelRelation }: SharedEditorProps & { value: PredicateFilter; roles: ContributionRoleFilter; positions: OrganizationPositionFilter; eventRoles: EventRoleFilter; onApply: (value: PredicateFilter, roles: ContributionRoleFilter, positions: OrganizationPositionFilter, eventRoles: EventRoleFilter) => void; onCancel: () => void }) {
  const initial = relation ?? legacyRelation({ predicates: value, contributionRoles: roles, organizationPositions: positions, eventRoles });
  const [mode, setMode] = useState(initial.type);
  const [polarity, setPolarity] = useState(initial.polarity);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(false);
  const [draftEventRoles, setDraftEventRoles] = useState<EventRoleFilter>(eventRoles);
  const { locale } = useUiLocale();
  const [eventOpen, setEventOpen] = useState(eventRoles !== null);
  const eventText = eventParticipationLabels(locale);
  const [selection, setSelection] = useState<RelationSelection>(() => relation?.type === "adjacent" && relation.predicates?.length === PREDICATE_KEYS.length ? { mode: "custom", predicates: relation.predicates } : selectionFromPredicates(value));
  const facetText = relationFacetLabels(locale);
  const [draftRoles, setDraftRoles] = useState<ContributionRoleFilter>(roles);
  const [draftPositions, setDraftPositions] = useState<OrganizationPositionFilter>(positions);
  const [positionOpen, setPositionOpen] = useState(positions !== null);
  const positionText = organizationParticipationLabels(locale);
  const [roleOpen, setRoleOpen] = useState(roles !== null);
  const dialog = useRef<HTMLDialogElement>(null);
  const text = entryLabels(locale), relations = explorationLabels(locale), roleText = contributionLabels(locale);
  const sharedText = relationText(locale);
  const normalized = mode === "pattern" ? ["CONTRIBUTED_TO"] as PredicateFilter : onApplyRelation && selection.mode === "custom" ? [...selection.predicates].sort() : resolveRelationSelection(selection);
  const draft = normalized ?? [...PREDICATE_KEYS];
  const normalizedRoles = normalizeContributionRoles(draftRoles, normalized);
  const normalizedPositions = normalizeOrganizationPositions(draftPositions, normalized);
  const normalizedEventRoles = normalizeEventRoles(draftEventRoles, normalized);
  const nextRelation = normalizeRelationCondition(mode === "pattern" ? { version: 1, type: "pattern", pattern: { id: "other-works", revision: 1 }, polarity: "affirmed", contributionRoles: draftRoles } : { version: 1, type: "adjacent", traversal: "either", polarity, predicates: normalized, contributionRoles: normalizedRoles, organizationPositions: normalizedPositions, eventRoles: normalizedEventRoles });
  const dirty = relationConditionKey(nextRelation) !== relationConditionKey(initial);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const cancel = useDialogDismiss(dialog, () => { onCancelRelation?.(); dialog.current?.close(); onCancel(); });
  const backdrop = useDialogBackdrop(cancel);
  return <dialog ref={dialog} className={`${styles.conditionDialog} ${styles.conditionEditor}`} aria-labelledby="condition-title" onCancel={(event) => { event.preventDefault(); cancel(); }} {...backdrop}>
    <header className={styles.conditionHeader}>
      <div className={styles.conditionTitle}><h2 id="condition-title">{text.title}</h2><DialogCloseButton label={text.closeEditor} onClick={cancel} /></div>
      <p className={styles.muted}>{text.scope}</p>
      <p className={styles.draftNotice}>{dirty ? text.draft : text.unchanged}</p>
    </header>
    <div className={styles.conditionBody}>
    {onApplyRelation && <fieldset className={styles.relationFilter}><legend>{sharedText.mode}</legend><div className={styles.selectionModes}>
      <label><input type="radio" name="execution-mode" checked={mode === "adjacent"} disabled={busy} onChange={() => { setMode("adjacent"); if (initial.type === "pattern") { setSelection(selectionFromPredicates(["CONTRIBUTED_TO"])); setPolarity("affirmed"); } }} />{sharedText.adjacent}</label>
      <label><input type="radio" name="execution-mode" checked={mode === "pattern"} disabled={busy || !patternAllowed} onChange={() => { setMode("pattern"); setRoleOpen(true); }} />{sharedText.pattern}</label>
    </div>{!patternAllowed && <p className={styles.muted}>{sharedText.incompatible}</p>}</fieldset>}
    {mode === "pattern" && <><p>{sharedText.help}</p>{initial.type === "adjacent" && <p className={styles.muted}>{locale === "en" ? "Applying replaces single-relation, affiliation and event-role settings with this pattern. Production roles are retained." : "適用すると、一段の関係・所属区分・参加Roleをこのパターンへ置き換えます。制作Roleは引き継ぎます。"}</p>}</>}
    <div inert={busy}>
    {mode === "adjacent" && <fieldset className={styles.relationFilter}><legend>{relations.title}</legend>
      <div className={styles.selectionModes}>
        {(["all", "facets", "custom"] as const).map(mode => <label key={mode}>
          <input type="radio" name="relation-selection" checked={selection.mode === mode} onChange={() => setSelection(changeSelectionMode(selection, mode))} />{facetText[mode]}
        </label>)}
      </div>
      {selection.mode === "facets" && <>
        <div className={styles.facetChoices}>{RELATION_FACET_CATALOG.items.map(facet => <label key={facet.id}>
          <input type="checkbox" aria-label={facetText.items[facet.id].name} checked={selection.ids.includes(facet.id)} onChange={event => setSelection({ mode: "facets", ids: event.target.checked ? [...selection.ids, facet.id] : selection.ids.filter(id => id !== facet.id) })} />
          <span><strong>{facetText.items[facet.id].name}</strong><span className={styles.facetDescription}>{facetText.items[facet.id].description}</span></span>
        </label>)}</div>
        <p className={styles.muted}>{facetText.help}</p>
      </>}
      {selection.mode === "custom" && <>
        <div className={styles.filterChoices}>{PREDICATE_KEYS.map(predicate => <label key={predicate}>
          <input type="checkbox" checked={selection.predicates.includes(predicate)} onChange={event => setSelection({ mode: "custom", predicates: event.target.checked ? [...selection.predicates, predicate] : selection.predicates.filter(item => item !== predicate) })} />{relations.predicates[predicate]}
        </label>)}</div>
        <p className={styles.muted}>{facetText.replaceHelp}</p>
      </>}
      <div className={styles.actions}><button onClick={() => setSelection(selection.mode === "facets" ? { mode: "facets", ids: RELATION_FACET_CATALOG.items.map(item => item.id) } : { mode: "all" })}>{selection.mode === "facets" ? facetText.selectAllFacets : relations.all}</button><button onClick={() => setSelection(selection.mode === "facets" ? { mode: "facets", ids: [] } : { mode: "custom", predicates: [] })}>{relations.none}</button></div>
    </fieldset>}
    {mode === "adjacent" && onApplyRelation && <label className={styles.filterChoices}><input type="checkbox" checked={polarity === "affirmed"} onChange={e => setPolarity(e.target.checked ? "affirmed" : "all-records")} />{sharedText.affirmed}</label>}
    {draft.some(predicate => ["CONTRIBUTED_TO", "AFFILIATED_WITH", "PARTICIPATED_IN"].includes(predicate)) && <h3 className={styles.preciseTitle}>{facetText.precise}</h3>}
    {draft.includes("CONTRIBUTED_TO") && <section className={styles.roleSettings}>
      <button aria-expanded={roleOpen} aria-controls="role-editor" onClick={() => setRoleOpen(!roleOpen)}>{text.roleEdit}<span aria-hidden="true" className={styles.conditionChevron}><Icon name="chevron" /></span></button>
      {roleOpen && <fieldset id="role-editor" className={styles.roleFilter}><legend>{roleText.title}</legend>
        <div className={styles.filterChoices}>
          <label><input type="radio" name="role-mode" checked={draftRoles === null} onChange={() => setDraftRoles(null)} />{text.noRole}</label>
          <label><input type="radio" name="role-mode" checked={draftRoles !== null} onChange={() => setDraftRoles([])} />{text.specifyRole}</label>
        </div>
        {draftRoles !== null ? <><div className={styles.filterChoices}>{CONTRIBUTION_ROLE_IDS.map((role) => <label key={role}>
          <input type="checkbox" checked={draftRoles.includes(role)} onChange={(event) => setDraftRoles(event.target.checked ? [...draftRoles, role] : draftRoles.filter((item) => item !== role))} />{roleText.roles[role]}
        </label>)}</div><p className={styles.muted}>{mode === "pattern" || polarity === "affirmed" ? (locale === "en" ? "Only affirmed claims matching a selected role are included. Claims without a role are excluded." : "選んだRoleに一致する肯定記録のみを表示します。Role未指定の記録は対象外です。") : text.roleHelp}</p>{draftRoles.length === 0 && <p className={styles.empty}>{mode === "pattern" ? sharedText.empty : text.noContribution}</p>}</> : <p className={styles.muted}>{text.broadHelp}</p>}
      </fieldset>}
    </section>}
    {mode === "adjacent" && draft.includes("AFFILIATED_WITH") && <section className={styles.roleSettings}>
      <button aria-expanded={positionOpen} aria-controls="position-editor" onClick={() => setPositionOpen(!positionOpen)}>{positionText.edit}<span aria-hidden="true" className={styles.conditionChevron}><Icon name="chevron" /></span></button>
      {positionOpen && <fieldset id="position-editor" className={styles.roleFilter}><legend>{positionText.title}</legend>
        <div className={styles.filterChoices}>
          <label><input type="radio" name="position-mode" checked={draftPositions === null} onChange={() => setDraftPositions(null)} />{positionText.noPosition}</label>
          <label><input type="radio" name="position-mode" checked={draftPositions !== null} onChange={() => setDraftPositions([])} />{positionText.specify}</label>
        </div>
        {draftPositions !== null ? <><div className={styles.filterChoices}>{ORGANIZATION_POSITION_IDS.map(position => <label key={position}>
          <input type="checkbox" checked={draftPositions.includes(position)} onChange={event => setDraftPositions(event.target.checked ? [...draftPositions, position] : draftPositions.filter(item => item !== position))} />{positionText.positions[position]}
        </label>)}</div><p className={styles.muted}>{positionText.help}</p>{draftPositions.length === 0 && <p className={styles.empty}>{positionText.empty}</p>}</> : <p className={styles.muted}>{positionText.broad}</p>}
        <p className={styles.muted}>{positionText.limitation}</p>
      </fieldset>}
    </section>}
    {mode === "adjacent" && draft.includes("PARTICIPATED_IN") && <section className={styles.roleSettings}>
      <button aria-expanded={eventOpen} aria-controls="event-role-editor" onClick={() => setEventOpen(!eventOpen)}>{eventText.edit}<span aria-hidden="true" className={styles.conditionChevron}><Icon name="chevron" /></span></button>
      {eventOpen && <fieldset id="event-role-editor" className={styles.roleFilter}><legend>{eventText.title}</legend>
        <div className={styles.filterChoices}>
          <label><input type="radio" name="event-role-mode" checked={draftEventRoles === null} onChange={() => setDraftEventRoles(null)} />{eventText.noRole}</label>
          <label><input type="radio" name="event-role-mode" checked={draftEventRoles !== null} onChange={() => setDraftEventRoles([])} />{eventText.specify}</label>
        </div>
        {draftEventRoles !== null ? <><div className={styles.filterChoices}>{EVENT_ROLE_IDS.map(role => <label key={role}>
          <input type="checkbox" checked={draftEventRoles.includes(role)} onChange={event => setDraftEventRoles(event.target.checked ? [...draftEventRoles, role] : draftEventRoles.filter(item => item !== role))} />{eventText.roles[role]}
        </label>)}</div><p className={styles.muted}>{eventText.help}</p>{draftEventRoles.length === 0 && <p className={styles.empty}>{eventText.empty}</p>}</> : <p className={styles.muted}>{eventText.broad}</p>}
        <p className={styles.muted}>{eventText.limitation}</p>
      </fieldset>}
    </section>}
    {draft.length === 0 && <p className={styles.empty}>{text.none}</p>}
    <div className={styles.draftSummary}><p data-testid="draft-conditions"><strong>{text.draft}：</strong>{relationSummary(nextRelation, locale)}</p><p className={styles.muted}>{text.restart}</p></div>
    </div></div>
    {busy && <p role="status">{sharedText.applying}</p>}{failure && <p role="alert" className={styles.error}>{sharedText.failed}</p>}
    <footer className={`${styles.editorActions} ${styles.conditionFooter}`}><button onClick={cancel}>{text.cancel}</button><button disabled={!dirty || busy || mode === "pattern" && !patternAllowed} onClick={async () => {
      if (onApplyRelation) { setBusy(true); setFailure(false); try { if (await onApplyRelation(nextRelation)) onCancel(); else setFailure(true); } catch { setFailure(true); } finally { setBusy(false); } }
      else { dialog.current?.close(); onApply(normalized, normalizedRoles, normalizedPositions, normalizedEventRoles); }
    }}>{text.apply}</button></footer>
  </dialog>;
}

export default function RelationFilter({ value, roles = null, positions = null, eventRoles = null, onApply, relation, patternAllowed, onApplyRelation, onCancelRelation }: SharedEditorProps & { value: PredicateFilter; roles?: ContributionRoleFilter; positions?: OrganizationPositionFilter; eventRoles?: EventRoleFilter; onApply: (value: PredicateFilter, roles: ContributionRoleFilter, positions: OrganizationPositionFilter, eventRoles: EventRoleFilter) => void }) {
  const { locale } = useUiLocale();
  const [editing, setEditing] = useState(false);
  const text = entryLabels(locale), relations = explorationLabels(locale);
  return <div className={styles.conditionBar}>
    <p data-testid="active-predicates"><strong>{text.applied}：</strong>{relation ? relationSummary(relation, locale) : conditionSummary(value, roles, locale, positions, eventRoles)}</p>
    <button aria-label={text.edit} title={text.edit} aria-haspopup="dialog" aria-expanded={editing} onClick={() => setEditing(true)}><Icon name="settings" /><span>{text.edit}</span></button>
    {editing && <ConditionEditor relation={relation} patternAllowed={patternAllowed} onApplyRelation={onApplyRelation} onCancelRelation={onCancelRelation} value={value} roles={roles} positions={positions} eventRoles={eventRoles} onCancel={() => setEditing(false)} onApply={(predicates, nextRoles, nextPositions, nextEventRoles) => { onApply(predicates, nextRoles, nextPositions, nextEventRoles); setEditing(false); }} />}
    <span className={styles.srOnly}>{relations.help}</span>
  </div>;
}
