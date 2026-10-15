"use client";
import type { DiscoveryFeature, DiscoveryHomeData } from "../lib/domain/discovery-home";
import { localizedPublicHref } from "../lib/domain/public-routes";
import { useUiLocale } from "../lib/client/ui-locale";
import { displayRelations } from "../lib/client/graph-presentation";
import { readingHref } from "../lib/client/reading-reference";
import { trackPublicEvent } from "../lib/client/public-events";
import { discoveryHomeLabels } from "../lib/i18n/discovery-home";
import { searchLabels } from "../lib/i18n/entity-search";
import Icon from "./Icon";
import styles from "./DiscoveryHome.module.css";

function FeatureMap({ feature, locale }: { feature: DiscoveryFeature; locale: string }) {
  const nodes = Object.fromEntries(feature.nodes.map(n => [n.id, n]));
  const relations = Object.values(displayRelations(Object.fromEntries(feature.claims.map(c => [c.id, c])), locale));
  const seen = new Set<string>();
  const people = relations.filter(r => {
    const id = r.subjectId === feature.entity.id ? r.objectId : r.subjectId;
    if (nodes[id]?.kind !== "person" || seen.has(id)) return false;
    seen.add(id); return true;
  }).slice(0, 3);
  if (!people.length) return null;
  return <figure className={styles.featureVisual} data-testid="featured-connections">
    <div className={styles.constellation} aria-hidden="true">
      <svg viewBox="0 0 180 124" fill="none" focusable="false">
        <circle className={styles.halo} cx="59" cy="62" r="36" /><circle className={styles.halo} cx="59" cy="62" r="49" />
        {people.map((r, i) => <g key={r.id}><path d={`M59 62 Q${106 + i * 5} ${18 + i * 43} 151 ${18 + i * 43}`} /><circle cx="151" cy={18 + i * 43} r="5" /></g>)}
        <circle className={styles.visualRoot} cx="59" cy="62" r="20" /><circle cx="59" cy="62" r="5" />
      </svg><strong>{feature.entity.name}</strong>
    </div>
    <figcaption><p className={styles.creditsLabel}>{discoveryHomeLabels(locale).connected}</p><ul className={styles.credits}>
      {people.map(r => {
        const id = r.subjectId === feature.entity.id ? r.objectId : r.subjectId;
        return <li key={id} data-testid="featured-credit"><span className={styles.creditDot} aria-hidden="true" /><div><strong>{nodes[id].name}</strong><span>{r.canvasLabel.replaceAll("\n", " · ")}</span></div></li>;
      })}
    </ul></figcaption>
  </figure>;
}

export default function DiscoveryHome({ data, onSearch }: { data: DiscoveryHomeData; onSearch: () => void }) {
  const { locale } = useUiLocale(), text = discoveryHomeLabels(locale), kinds = searchLabels(locale).kinds;
  const href = (id: string) => localizedPublicHref(`/explore/${id}`, locale);
  const explore = () => trackPublicEvent("explore_start");
  const featured = data.features.find(f => f.entity.name === "PLUTO") ?? data.features[0];
  return <section className={styles.home} aria-labelledby="discovery-home-title" data-testid="discovery-home" lang={locale}>
    <header className={styles.introduction} data-discovery-reveal><p className={styles.eyebrow}>{text.eyebrow}</p><h2 id="discovery-home-title">{text.title}</h2><p>{text.introduction}</p>
      <div className={styles.introMeta}><span>{text.access}</span>{data.counts && <span>{text.knowledge(data.counts.entities.toLocaleString(locale), data.counts.claims.toLocaleString(locale))}</span>}</div>
    </header>
    {data.unavailable && <p role="status">{text.unavailable}</p>}
    {featured && <a className={styles.featured} href={href(featured.entity.id)} onClick={explore} data-testid="discovery-featured" data-discovery-reveal>
      <p className={styles.eyebrow}>{text.featured}</p><h3>{featured.entity.name === "PLUTO" ? text.featureTitle : featured.entity.name}</h3>
      {featured.entity.name === "PLUTO" && <p className={styles.featureDescription}>{text.featureDescription}</p>}
      <FeatureMap feature={featured} locale={locale} /><span className={styles.start}><Icon name="graph" />{text.explore(featured.entity.name)}<Icon name="arrow" /></span>
    </a>}
    {!!data.features.filter(f => f !== featured).length && <section className={styles.fields} aria-labelledby="discovery-fields-title" data-discovery-reveal><h3 id="discovery-fields-title">{text.fields}</h3><div className={styles.fieldGrid}>
      {data.features.filter(f => f !== featured).map(f => <a key={f.entity.id} href={href(f.entity.id)} onClick={explore} data-testid="discovery-field"><Icon name={f.entity.kind === "event" ? "event" : f.entity.kind === "organization" ? "organization" : "person"} /><span><small>{f.entity.kind === "event" ? text.event : f.entity.kind === "organization" ? text.science : text.manga}</small><strong>{f.entity.name}</strong><span>{f.entity.kind === "event" ? text.eventDescription : f.entity.kind === "organization" ? text.scienceDescription : text.mangaDescription}</span></span><Icon name="arrow" /></a>)}
    </div></section>}
    <section className={styles.recent} aria-labelledby="discovery-recent-title" data-discovery-reveal><h3 id="discovery-recent-title">{text.recent}</h3>
      <h4>{text.entities}</h4><ul>{data.recentEntities.map(({ entity, addedAt }) => <li key={entity.id}><a href={href(entity.id)} onClick={explore}><strong>{entity.name}</strong><span>{kinds[entity.kind]}</span></a><time dateTime={addedAt}>{addedAt.slice(0, 10)}</time></li>)}</ul>
      <h4>{text.claims}</h4><ul>{data.recentClaims.map(({ claim, subject, object, addedAt }) => {
        const relation = Object.values(displayRelations({ [claim.id]: claim }, locale))[0];
        return <li key={claim.id} className={styles.recentClaim}><div><a href={href(subject.id)} onClick={explore}>{subject.name}</a><span className={styles.relation}>{relation.label.replaceAll("\n", " · ")}</span><a href={href(object.id)} onClick={explore}>{object.name}</a><small><a href={localizedPublicHref("/", locale) + readingHref({ kind: "claim", dataset: "public-kg", id: claim.id }).slice(1)}>{text.evidence}</a></small></div><time dateTime={addedAt}>{addedAt.slice(0, 10)}</time></li>;
      })}</ul>
      {!data.recentEntities.length && !data.recentClaims.length && !data.unavailable && <p>{text.noRecent}</p>}<p className={styles.note}>{text.dateNote}</p>
    </section>
    <section className={styles.search} data-discovery-reveal><div><h3>{text.searchTitle}</h3><p>{text.searchHint}</p></div><button onClick={onSearch}><Icon name="search" />{text.search}<Icon name="arrow" /></button></section>
  </section>;
}
