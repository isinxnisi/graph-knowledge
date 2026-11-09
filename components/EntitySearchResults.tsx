import { entityDisplayName } from "../lib/domain/entity-display";
import type { EntityDetail, EntitySummary } from "../lib/domain/api";
import { searchLabels } from "../lib/i18n/entity-search";
import Icon from "./Icon";
import styles from "./DiscoverySearch.module.css";

export default function EntitySearchResults({ items, locale, onChoose, id }: { items: EntityDetail[]; locale: string; onChoose: (entity: EntitySummary) => void; id?: string }) {
  const text = searchLabels(locale);
  return <ul className={styles.results} id={id}>{items.map(entity => {
    const aliases = [...new Set([...(entityDisplayName(entity,locale)!==entity.name?[entity.name]:[]),...entity.aliases])].filter(n=>n!==entityDisplayName(entity,locale));
    const ambiguous = items.some(other => other.id !== entity.id && entityDisplayName(other,locale) === entityDisplayName(entity,locale) && other.kind === entity.kind && other.description === entity.description);
    return <li key={entity.id}><button type="button" onClick={() => onChoose(entity)} aria-label={`${entityDisplayName(entity,locale)} — ${entity.description ?? text.descriptionMissing} ／ ${text.kinds[entity.kind]}${aliases.length ? ` ／ ${text.aliases}：${aliases.join("・")}` : ""}${ambiguous ? ` ／ ID：${entity.id}` : ""}`}>
      <Icon name={entity.kind === "work" ? "book" : entity.kind === "organization" ? "organization" : entity.kind === "event" ? "event" : "person"} />
      <span className={styles.identity}><span className={styles.name}><strong>{entityDisplayName(entity,locale)}</strong><small>{text.kinds[entity.kind]}</small></span><span className={styles.description}>{entity.description ?? text.descriptionMissing}</span>{aliases.length > 0 && <span className={styles.aliases}>{text.aliases}：{aliases.join("・")}</span>}{ambiguous && <span className={styles.aliases}>ID：{entity.id}</span>}</span><Icon name="chevron" />
    </button></li>;
  })}</ul>;
}
