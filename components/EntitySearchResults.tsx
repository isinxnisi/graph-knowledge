import type { EntityDetail, EntitySummary } from "../lib/domain/api";
import { searchLabels } from "../lib/i18n/entity-search";
import Icon from "./Icon";
import styles from "./DiscoverySearch.module.css";

export default function EntitySearchResults({ items, locale, onChoose, id }: { items: EntityDetail[]; locale: string; onChoose: (entity: EntitySummary) => void; id?: string }) {
  const text = searchLabels(locale);
  return <ul className={styles.results} id={id}>{items.map(entity => {
    const ambiguous = items.some(other => other.id !== entity.id && other.name === entity.name && other.kind === entity.kind && other.description === entity.description);
    return <li key={entity.id}><button type="button" onClick={() => onChoose(entity)} aria-label={`${entity.name} — ${entity.description ?? text.descriptionMissing} ／ ${text.kinds[entity.kind]}${entity.aliases.length ? ` ／ ${text.aliases}：${entity.aliases.join("・")}` : ""}${ambiguous ? ` ／ ID：${entity.id}` : ""}`}>
      <Icon name={entity.kind === "work" ? "book" : entity.kind === "organization" ? "organization" : entity.kind === "event" ? "event" : "person"} />
      <span className={styles.identity}><span className={styles.name}><strong>{entity.name}</strong><small>{text.kinds[entity.kind]}</small></span><span className={styles.description}>{entity.description ?? text.descriptionMissing}</span>{entity.aliases.length > 0 && <span className={styles.aliases}>{text.aliases}：{entity.aliases.join("・")}</span>}{ambiguous && <span className={styles.aliases}>ID：{entity.id}</span>}</span><Icon name="chevron" />
    </button></li>;
  })}</ul>;
}
