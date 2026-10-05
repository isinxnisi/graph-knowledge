"use client";

import { EVENT_ROLE_IDS } from "../lib/domain/event-participation";
import { eventParticipationLabels } from "../lib/i18n/event-participation";
import { ORGANIZATION_POSITION_IDS } from "../lib/domain/organization-participation";
import { organizationParticipationLabels } from "../lib/i18n/organization-participation";
import { useEffect, useRef, useState } from "react";
import { CONTRIBUTION_ROLE_IDS } from "../lib/domain/contribution";
import { contributionLabels } from "../lib/i18n/contribution";
import { conditionSummary, entryLabels } from "../lib/i18n/exploration-entry";
import { normalizeContributionRoles, normalizeOrganizationPositions, normalizeEventRoles, type EventRoleFilter, type OrganizationPositionFilter, explorationKey, normalizePredicates, type ContributionRoleFilter, type PredicateFilter } from "../lib/domain/exploration";
import { PREDICATE_KEYS, type Predicate } from "../lib/domain/predicates";
import { explorationLabels } from "../lib/i18n/exploration";
import styles from "./Explorer.module.css";

function ConditionEditor({ value, roles, positions, eventRoles, onApply, onCancel }: { value: PredicateFilter; roles: ContributionRoleFilter; positions: OrganizationPositionFilter; eventRoles: EventRoleFilter; onApply: (value: PredicateFilter, roles: ContributionRoleFilter, positions: OrganizationPositionFilter, eventRoles: EventRoleFilter) => void; onCancel: () => void }) {
  const [draftEventRoles, setDraftEventRoles] = useState<EventRoleFilter>(eventRoles);
  const [eventOpen, setEventOpen] = useState(eventRoles !== null);
  const eventText = eventParticipationLabels();
  const [draft, setDraft] = useState<Predicate[]>(value ?? [...PREDICATE_KEYS]);
  const [draftRoles, setDraftRoles] = useState<ContributionRoleFilter>(roles);
  const [draftPositions, setDraftPositions] = useState<OrganizationPositionFilter>(positions);
  const [positionOpen, setPositionOpen] = useState(positions !== null);
  const positionText = organizationParticipationLabels();
  const [roleOpen, setRoleOpen] = useState(roles !== null);
  const dialog = useRef<HTMLDialogElement>(null);
  const text = entryLabels(), relations = explorationLabels(), roleText = contributionLabels();
  const normalized = normalizePredicates(draft);
  const normalizedRoles = normalizeContributionRoles(draftRoles, normalized);
  const normalizedPositions = normalizeOrganizationPositions(draftPositions, normalized);
  const normalizedEventRoles = normalizeEventRoles(draftEventRoles, normalized);
  const dirty = explorationKey(normalized, normalizedRoles, normalizedPositions, normalizedEventRoles) !== explorationKey(value, roles, positions, eventRoles);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const cancel = () => { dialog.current?.close(); onCancel(); };
  return <dialog ref={dialog} className={styles.conditionDialog} aria-labelledby="condition-title" onCancel={(event) => { event.preventDefault(); cancel(); }}>
    <h2 id="condition-title">{text.title}</h2>
    <p className={styles.muted}>{text.scope}</p>
    <p className={styles.draftNotice}>{dirty ? text.draft : text.unchanged}</p>
    <fieldset className={styles.relationFilter}><legend>{relations.title}</legend>
      <div className={styles.filterChoices}>{PREDICATE_KEYS.map((predicate) => <label key={predicate}>
        <input type="checkbox" checked={draft.includes(predicate)} onChange={(event) => setDraft(event.target.checked ? [...draft, predicate] : draft.filter((item) => item !== predicate))} />{relations.predicates[predicate]}
      </label>)}</div>
      <div className={styles.actions}><button onClick={() => setDraft([...PREDICATE_KEYS])}>{relations.all}</button><button onClick={() => setDraft([])}>{relations.none}</button></div>
    </fieldset>
    {draft.includes("CONTRIBUTED_TO") && <section className={styles.roleSettings}>
      <button aria-expanded={roleOpen} aria-controls="role-editor" onClick={() => setRoleOpen(!roleOpen)}>{text.roleEdit}</button>
      {roleOpen && <fieldset id="role-editor" className={styles.roleFilter}><legend>{roleText.title}</legend>
        <div className={styles.filterChoices}>
          <label><input type="radio" name="role-mode" checked={draftRoles === null} onChange={() => setDraftRoles(null)} />{text.noRole}</label>
          <label><input type="radio" name="role-mode" checked={draftRoles !== null} onChange={() => setDraftRoles([])} />{text.specifyRole}</label>
        </div>
        {draftRoles !== null ? <><div className={styles.filterChoices}>{CONTRIBUTION_ROLE_IDS.map((role) => <label key={role}>
          <input type="checkbox" checked={draftRoles.includes(role)} onChange={(event) => setDraftRoles(event.target.checked ? [...draftRoles, role] : draftRoles.filter((item) => item !== role))} />{roleText.roles[role]}
        </label>)}</div><p className={styles.muted}>{text.roleHelp}</p>{draftRoles.length === 0 && <p className={styles.empty}>{text.noContribution}</p>}</> : <p className={styles.muted}>{text.broadHelp}</p>}
      </fieldset>}
    </section>}
    {draft.includes("AFFILIATED_WITH") && <section className={styles.roleSettings}>
      <button aria-expanded={positionOpen} aria-controls="position-editor" onClick={() => setPositionOpen(!positionOpen)}>{positionText.edit}</button>
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
    {draft.includes("PARTICIPATED_IN") && <section className={styles.roleSettings}>
      <button aria-expanded={eventOpen} aria-controls="event-role-editor" onClick={() => setEventOpen(!eventOpen)}>{eventText.edit}</button>
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
    <p data-testid="draft-conditions"><strong>{text.draft}：</strong>{conditionSummary(normalized, normalizedRoles, "ja", normalizedPositions, normalizedEventRoles)}</p>
    <p className={styles.muted}>{text.restart}</p>
    <div className={styles.editorActions}><button onClick={cancel}>{text.cancel}</button><button disabled={!dirty} onClick={() => { dialog.current?.close(); onApply(normalized, normalizedRoles, normalizedPositions, normalizedEventRoles); }}>{text.apply}</button></div>
  </dialog>;
}

export default function RelationFilter({ value, roles = null, positions = null, eventRoles = null, onApply }: { value: PredicateFilter; roles?: ContributionRoleFilter; positions?: OrganizationPositionFilter; eventRoles?: EventRoleFilter; onApply: (value: PredicateFilter, roles: ContributionRoleFilter, positions: OrganizationPositionFilter, eventRoles: EventRoleFilter) => void }) {
  const [editing, setEditing] = useState(false);
  const text = entryLabels(), relations = explorationLabels();
  return <div className={styles.conditionBar}>
    <p data-testid="active-predicates"><strong>{text.applied}：</strong>{conditionSummary(value, roles, "ja", positions, eventRoles)}</p>
    <button aria-haspopup="dialog" aria-expanded={editing} onClick={() => setEditing(true)}>{text.edit}</button>
    {editing && <ConditionEditor value={value} roles={roles} positions={positions} eventRoles={eventRoles} onCancel={() => setEditing(false)} onApply={(predicates, nextRoles, nextPositions, nextEventRoles) => { onApply(predicates, nextRoles, nextPositions, nextEventRoles); setEditing(false); }} />}
    <span className={styles.srOnly}>{relations.help}</span>
  </div>;
}
