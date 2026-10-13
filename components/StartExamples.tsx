import { useUiLocale } from "../lib/client/ui-locale";
import type { EntitySummary } from "../lib/domain/api";
import type { DatasetMode } from "../lib/domain/dataset";
import { START_EXAMPLES } from "../lib/client/start-examples";
import { startExampleLabels } from "../lib/i18n/start-examples";
import { searchLabels } from "../lib/i18n/entity-search";
import styles from "./Explorer.module.css";

export default function StartExamples({ dataset, onChoose }: { dataset: DatasetMode; onChoose: (entity: EntitySummary) => void }) {
  const { locale } = useUiLocale();
  const text = startExampleLabels(locale);
  const kinds = searchLabels(locale).kinds;
  const examples = START_EXAMPLES[dataset];
  return <section className={styles.startExamples} aria-labelledby="start-examples-title">
    <h3 id="start-examples-title">{text.title}</h3>
    <p className={styles.muted}>{text.help}</p>
    <ul className={styles.results}>
      {examples.map((entity) => <li key={entity.id}>
        <button type="button" className={styles.resultButton} aria-label={text.start(entity.name) + (examples.some((other) => other.id !== entity.id && other.name === entity.name) ? ` — ${entity.description}` : "")} onClick={() => onChoose(entity)}>
          <strong>{entity.name}</strong><span>{kinds[entity.kind as keyof typeof kinds]}{examples.some((other) => other.id !== entity.id && other.name === entity.name) ? ` ／ ${entity.description}` : ""}</span>
        </button>
      </li>)}
    </ul>
  </section>;
}
