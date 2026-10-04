"use client";

import { useEffect, useRef, useState } from "react";
import { CONTRIBUTION_ROLE_IDS } from "../lib/domain/contribution";
import { contributionLabels } from "../lib/i18n/contribution";
import { conditionSummary, entryLabels } from "../lib/i18n/exploration-entry";
import { normalizeContributionRoles, explorationKey, normalizePredicates, type ContributionRoleFilter, type PredicateFilter } from "../lib/domain/exploration";
import { PREDICATE_KEYS, type Predicate } from "../lib/domain/predicates";
import { explorationLabels } from "../lib/i18n/exploration";
import styles from "./Explorer.module.css";

function ConditionEditor({ value, roles, onApply, onCancel }: { value: PredicateFilter; roles: ContributionRoleFilter; onApply: (value: PredicateFilter, roles: ContributionRoleFilter) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<Predicate[]>(value ?? [...PREDICATE_KEYS]);
  const [draftRoles, setDraftRoles] = useState<ContributionRoleFilter>(roles);
  const [roleOpen, setRoleOpen] = useState(roles !== null);
  const dialog = useRef<HTMLDialogElement>(null);
  const text = entryLabels(), relations = explorationLabels(), roleText = contributionLabels();
  const normalized = normalizePredicates(draft);
  const normalizedRoles = normalizeContributionRoles(draftRoles, normalized);
  const dirty = explorationKey(normalized, normalizedRoles) !== explorationKey(value, roles);
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
    {draft.length === 0 && <p className={styles.empty}>{text.none}</p>}
    <p data-testid="draft-conditions"><strong>{text.draft}：</strong>{conditionSummary(normalized, normalizedRoles)}</p>
    <p className={styles.muted}>{text.restart}</p>
    <div className={styles.editorActions}><button onClick={cancel}>{text.cancel}</button><button disabled={!dirty} onClick={() => { dialog.current?.close(); onApply(normalized, normalizedRoles); }}>{text.apply}</button></div>
  </dialog>;
}

export default function RelationFilter({ value, roles = null, onApply }: { value: PredicateFilter; roles?: ContributionRoleFilter; onApply: (value: PredicateFilter, roles: ContributionRoleFilter) => void }) {
  const [editing, setEditing] = useState(false);
  const text = entryLabels(), relations = explorationLabels();
  return <div className={styles.conditionBar}>
    <p data-testid="active-predicates"><strong>{text.applied}：</strong>{conditionSummary(value, roles)}</p>
    <button aria-haspopup="dialog" aria-expanded={editing} onClick={() => setEditing(true)}>{text.edit}</button>
    {editing && <ConditionEditor value={value} roles={roles} onCancel={() => setEditing(false)} onApply={(predicates, nextRoles) => { onApply(predicates, nextRoles); setEditing(false); }} />}
    <span className={styles.srOnly}>{relations.help}</span>
  </div>;
}
