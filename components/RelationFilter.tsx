"use client";

import { useState } from "react";
import { PREDICATE_KEYS, type Predicate } from "../lib/domain/predicates";
import { normalizePredicates, predicateKey, type PredicateFilter } from "../lib/domain/exploration";
import { explorationLabels } from "../lib/i18n/exploration";
import styles from "./Explorer.module.css";

export default function RelationFilter({ value, onApply }: { value: PredicateFilter; onApply: (value: PredicateFilter) => void }) {
  const [draft, setDraft] = useState<Predicate[]>(value ?? [...PREDICATE_KEYS]);
  const text = explorationLabels();
  const normalized = normalizePredicates(draft);
  return <fieldset className={styles.relationFilter}>
    <legend>{text.title}</legend>
    <div className={styles.filterChoices}>{PREDICATE_KEYS.map((predicate) => <label key={predicate}>
      <input type="checkbox" checked={draft.includes(predicate)} onChange={(event) =>
        setDraft(event.target.checked ? [...draft, predicate] : draft.filter((item) => item !== predicate))} />
      {text.predicates[predicate]}
    </label>)}</div>
    <div className={styles.actions}>
      <button onClick={() => setDraft([...PREDICATE_KEYS])}>{text.all}</button>
      <button onClick={() => setDraft([])}>{text.none}</button>
      <button disabled={predicateKey(normalized) === predicateKey(value)} onClick={() => onApply(normalized)}>{text.apply}</button>
    </div>
    <p className={styles.muted}>{text.help}</p>
    <p data-testid="active-predicates">{text.active}：{value === null ? text.allRelations : value.length ? value.map((predicate) => text.predicates[predicate]).join(" ／ ") : text.noRelations}</p>
  </fieldset>;
}
