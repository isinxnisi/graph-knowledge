import type { PublicSubject } from "../lib/server/public-discovery";
import type { PublicLocale } from "../lib/domain/public-routes";
import { localizedPublicHref } from "../lib/domain/public-routes";
import { discoveryLabels } from "../lib/i18n/public-discovery";
import { displayRelations } from "../lib/client/graph-presentation";
import PublicPageLanguages from "./PublicPageLanguages";
import styles from "./PublicDiscovery.module.css";
export default function PublicDiscovery({ locale, subject, examples = [] }: { locale: PublicLocale; subject?: PublicSubject; examples?: PublicSubject[] }) {
  const text = discoveryLabels(locale), href = (id: string) => localizedPublicHref(`/explore/${id}`, locale);
  const records = subject?.records.map(r => r.claim) ?? [];
  const sources = [...new Map(records.flatMap(r => r.citations.map(c => [c.source.id, c.source] as const))).values()];
  const nodes = Object.fromEntries((subject?.neighbors.nodes ?? []).map(n => [n.id, n]));
  const relations = Object.values(displayRelations(Object.fromEntries(records.map(r => [r.id, r])), locale));
  return <section className={styles.overview} lang={locale} aria-labelledby="public-discovery-title" data-testid="public-discovery">
    <header><p className={styles.eyebrow}>{subject ? text.about : "Plunode · Knowledge graph"}</p><h2 id="public-discovery-title">{subject ? subject.entity.name : text.heading}</h2>
      <p>{subject ? text.entityDescription(subject.entity.name, text.kinds[subject.entity.kind]) : text.introduction}</p>
      <div className={styles.languages}><PublicPageLanguages path={subject ? `/explore/${subject.entity.id}` : "/"} label={locale === "en" ? "Page language" : "ページの言語"} /></div>
    </header>
    {subject ? <>
      <p className={styles.note}>{text.original}</p>{subject.entity.description && <p lang="und">{subject.entity.description}</p>}
      {!!subject.entity.aliases.length && <p lang="und"><span className={styles.note}>{text.aliases}: </span>{subject.entity.aliases.join(" · ")}</p>}
      <div className={styles.columns}><section><h3>{text.relations}</h3><ul>{relations.map(r => <li key={r.id}><a href={href(r.subjectId)}>{nodes[r.subjectId].name}</a><span className={styles.relation}>{r.label.replaceAll("\n", " · ")}</span><a href={href(r.objectId)}>{nodes[r.objectId].name}</a></li>)}</ul></section>
      <section><h3>{text.sources}</h3><ul>{sources.map(s => <li key={s.id}>{s.url && /^https?:\/\//.test(s.url) ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> : s.title}</li>)}</ul></section></div><p className={styles.note}>{text.scope}</p>
    </> : <section><h3>{text.examples}</h3><ul className={styles.examples}>{examples.map(({entity}) => <li key={entity.id}><a href={href(entity.id)}><span>{entity.name}</span><small>{text.kinds[entity.kind]}</small></a></li>)}</ul></section>}
  </section>;
}
