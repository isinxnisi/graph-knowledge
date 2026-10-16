"use client";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { EntitySummary } from "../lib/domain/api";
import { SEARCH_KINDS } from "../lib/domain/search";
import { DISCOVERY_THEMES } from "../lib/domain/discovery";
import { PREDICATE_KEYS, type Predicate } from "../lib/domain/predicates";
import type { PredicateFilter } from "../lib/domain/exploration";
import { useDiscoverySearch, type DiscoveryCriteria } from "../lib/client/use-discovery-search";
import { useUiLocale } from "../lib/client/ui-locale";
import { discoverySearchLabels } from "../lib/i18n/discovery-search";
import { searchLabels } from "../lib/i18n/entity-search";
import { explorerMessage } from "../lib/i18n/explorer";
import EntitySearchResults from "./EntitySearchResults";
import Icon from "./Icon";
import styles from "./DiscoveryExplorer.module.css";

// Entity-list conditions remain separate from the subject's relation exploration.
export default function DiscoveryListPanel({ criteria, cursors, onChange, onPage, onChoose }: {
  criteria: DiscoveryCriteria; cursors: (string | null)[];
  onChange: (criteria: DiscoveryCriteria) => void; onPage: Dispatch<SetStateAction<(string | null)[]>>;
  onChoose: (entity: EntitySummary, predicates?: PredicateFilter) => void;
}) {
  const { locale } = useUiLocale(), en = locale === "en", text = discoverySearchLabels(locale), search = searchLabels(locale);
  const [composing, setComposing] = useState(false);
  const query = useDiscoverySearch(criteria, cursors.at(-1)!, composing);
  const displayed = query.result ?? query.previous, blocked = query.loading || !!query.error;
  const counts = new Map((displayed?.facets ?? []).map(f => [f.predicate, f.count]));
  const cuts = PREDICATE_KEYS.filter(predicate => (counts.get(predicate) ?? 0) > 0 || criteria.predicates?.includes(predicate));
  const toggleCut = (predicate: Predicate) => {
    const next = PREDICATE_KEYS.filter(p => p === predicate ? !criteria.predicates?.includes(p) : criteria.predicates?.includes(p));
    onChange({ ...criteria, predicates: next.length ? next : null });
  };
  const clear = () => onChange({ q: "", kind: null, predicates: null, presentation: "list" });
  return <div id="discovery-list-panel" role="tabpanel" aria-labelledby="prototype-tab-list" className={styles.listWorkspace}>
    <aside className={styles.listFilters}>
      <div className={styles.sectionHeading}><h3>{en ? "List filters" : "一覧の条件"}</h3><button className={styles.clearAll} onClick={clear}>{text.clear}</button></div>
      <div className={styles.listGroup} role="group" aria-label={search.kind}><span className={styles.fieldLabel}>{search.kind}</span><div className={styles.listOptions}>
        {([null, ...SEARCH_KINDS] as const).map(kind => <button key={kind ?? "all"} aria-pressed={criteria.kind === kind} onClick={() => onChange({ ...criteria, kind: criteria.kind === kind ? null : kind })}>{kind ? search.kinds[kind] : search.all}</button>)}
      </div></div>
      <div className={styles.listGroup} role="group" aria-label={en ? "Published scope" : "収録済みの範囲"}><span className={styles.fieldLabel}>{en ? "Scope" : "収録範囲"}</span><div className={styles.listOptions}>
        <button aria-pressed={!criteria.theme} onClick={() => onChange({ ...criteria, theme: undefined })}>{en ? "All" : "全体"}</button>
        {DISCOVERY_THEMES.filter(theme => displayed?.themes?.includes(theme) || criteria.theme === theme).map(theme => <button key={theme} data-theme={theme} aria-pressed={criteria.theme === theme} onClick={() => onChange({ ...criteria, theme: criteria.theme === theme ? undefined : theme, around: undefined })}>{text.themes[theme].title}</button>)}
      </div><small>{en ? "Around published starting points, up to two steps. These are not world classifications." : "実在する紹介対象から2段階までの範囲。世界の分類条件とは異なります。"}</small></div>
      <div className={styles.listGroup} role="group" aria-label={text.cutsTitle}><span className={styles.fieldLabel}>{en ? "Relations" : "関係"}</span><div className={styles.listOptions} data-testid="discovery-cuts">
        {cuts.map(predicate => <button key={predicate} aria-pressed={!!criteria.predicates?.includes(predicate)} title={text.relationCount(counts.get(predicate) ?? 0)} onClick={() => toggleCut(predicate)}>{text.cuts[predicate]}</button>)}
      </div><small>{text.cutsHint}</small></div>
      <div className={styles.listGroup} role="group" aria-label={text.connections}><span className={styles.fieldLabel}>{en ? "Around" : "周辺"}</span><div className={styles.listOptions}>
        <button aria-pressed={!criteria.around} onClick={() => onChange({ ...criteria, around: undefined })}>{text.all}</button>
        {query.starts.map(entity => <button key={entity.id} aria-pressed={criteria.around === entity.id} onClick={() => onChange({ ...criteria, around: criteria.around === entity.id ? undefined : entity.id })}>{text.around(entity.name)}</button>)}
      </div><small>{text.scope}</small></div>
    </aside>
    <section className={styles.matches} aria-label={en ? "Entity list" : "対象の一覧"} aria-busy={query.loading}>
      <form className={styles.keyword} data-testid="discovery-keyword" onSubmit={event => { event.preventDefault(); query.retry(); }}>
        <div className={styles.keywordLabel}><label htmlFor="discovery-name">{en ? "Name or alias · optional" : "名前・別名（空欄でも検索）"}</label></div>
        <div className={styles.inputRow}><Icon name="search"/><input id="discovery-name" aria-label={search.name} value={criteria.q} placeholder={text.placeholder} autoComplete="off" maxLength={100} onChange={event => onChange({ ...criteria, q: event.target.value })} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}/>
          {criteria.q && <button type="button" aria-label={text.remove(search.name)} onClick={() => onChange({ ...criteria, q: "" })}><Icon name="close"/></button>}
          <button type="submit" className={styles.searchSubmit}>{search.submit}<Icon name="arrow"/></button>
        </div>
      </form>
      <div className={styles.resultHeading}><div><h3>{en ? "Entities" : "対象の一覧"}</h3><span role="status">{query.loading ? text.updating : query.result ? text.resultCount(query.result.items.length, query.result.total ?? query.result.items.length) : ""}</span></div><small>{text.page(cursors.length)}</small></div>
      {query.error && <div role="alert" className={styles.unavailable}><p>{explorerMessage(query.error, locale)}</p><button onClick={() => { onPage([null]); query.retry(); }}>{text.retry}</button></div>}
      <div className={styles.resultStage} data-updating={blocked || undefined} data-testid="discovery-results">
        {displayed ? <div inert={blocked} aria-hidden={blocked || undefined}>
          {!displayed.items.length && <div className={styles.empty}><p>{text.empty}</p><button onClick={clear}>{text.clear}</button></div>}
          <EntitySearchResults items={displayed.items} locale={locale} onChoose={entity => onChoose(entity, criteria.predicates)}/>
        </div> : <div className={styles.skeleton} aria-hidden="true"/>}
      </div>
      <nav className={styles.pagination} aria-label={en ? "Result pages" : "結果のページ"}>
        <button disabled={blocked || cursors.length === 1} onClick={() => onPage(v => v.slice(0, -1))}>{text.previous}</button>
        <span>{criteria.predicates?.length ? text.carry : text.hint}</span>
        <button disabled={blocked || !query.result?.nextCursor} onClick={() => { onPage(v => [...v, query.result!.nextCursor]); document.getElementById("discovery-name")?.closest("form")?.scrollIntoView({ block: "start" }); }}>{text.next}</button>
      </nav>
      <p className={styles.scopeNote}>{en ? "These filters search the entity list. Your connection and world selections are kept in their entrances." : "この条件は対象一覧の検索に使います。接点・知識世界で選んだ条件は、それぞれの入口に保持しています。"}</p>
    </section>
  </div>;
}
