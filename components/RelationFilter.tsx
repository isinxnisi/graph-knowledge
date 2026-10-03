"use client";
import { CONTRIBUTION_ROLE_IDS } from "../lib/domain/contribution";
import { contributionLabels } from "../lib/i18n/contribution";
import { normalizeContributionRoles, explorationKey, type ContributionRoleFilter } from "../lib/domain/exploration";

import { useState } from "react";
import { PREDICATE_KEYS, type Predicate } from "../lib/domain/predicates";
import { normalizePredicates, type PredicateFilter } from "../lib/domain/exploration";
import { explorationLabels } from "../lib/i18n/exploration";
import styles from "./Explorer.module.css";

export default function RelationFilter({ value, roles = null, onApply }: { value: PredicateFilter; roles?: ContributionRoleFilter; onApply: (value: PredicateFilter, roles: ContributionRoleFilter) => void }) {
  const [draft, setDraft] = useState<Predicate[]>(value ?? [...PREDICATE_KEYS]);
  const [draftRoles, setDraftRoles] = useState<ContributionRoleFilter>(roles);
  const roleText = contributionLabels();
  const text = explorationLabels();
  const normalized = normalizePredicates(draft);
  const normalizedRoles = normalizeContributionRoles(draftRoles, normalized);
  return <fieldset className={styles.relationFilter}>
    <legend>{text.title}</legend>
    <div className={styles.filterChoices}>{PREDICATE_KEYS.map((predicate) => <label key={predicate}>
      <input type="checkbox" checked={draft.includes(predicate)} onChange={(event) =>
        setDraft(event.target.checked ? [...draft, predicate] : draft.filter((item) => item !== predicate))} />
      {text.predicates[predicate]}
    </label>)}</div>
    <fieldset className={styles.roleFilter} disabled={!draft.includes("CONTRIBUTED_TO")}><legend>{roleText.title}</legend>
      <div className={styles.filterChoices}><label><input type="checkbox" checked={draftRoles === null} onChange={(event) => setDraftRoles(event.target.checked ? null : [])} />{roleText.all}</label>
      {CONTRIBUTION_ROLE_IDS.map((role) => <label key={role} ><input type="checkbox" checked={draftRoles?.includes(role) ?? false} onChange={(event) => setDraftRoles(event.target.checked ? [...(draftRoles ?? []), role] : (draftRoles ?? []).filter((item) => item !== role))} />{roleText.roles[role]}</label>)}</div>
      <p className={styles.muted}>{roleText.help}</p>
    </fieldset>
    <div className={styles.actions}>
      <button onClick={() => setDraft([...PREDICATE_KEYS])}>{text.all}</button>
      <button onClick={() => setDraft([])}>{text.none}</button>
      <button disabled={explorationKey(normalized, normalizedRoles) === explorationKey(value, roles)} onClick={() => onApply(normalized, normalizedRoles)}>{text.apply}</button>
    </div>
    <p className={styles.muted}>{text.help}</p>
    <p data-testid="active-predicates">{text.active}：{value === null ? text.allRelations : value.length ? value.map((predicate) => text.predicates[predicate]).join(" ／ ") : text.noRelations}</p>
  {roles !== null && <p data-testid="active-roles">{roles.length ? roles.map((role) => roleText.roles[role]).join(" ／ ") : roleText.emptyRoles}</p>}
  </fieldset>;
}
