"use client";
import { useEffect, useRef, useState } from "react";
import type { EntitySummary } from "../lib/domain/api";
import { PREDICATE_KEYS, type Predicate } from "../lib/domain/predicates";
import type { PredicateFilter } from "../lib/domain/exploration";
import { DISCOVERY_THEMES, type DiscoveryTheme } from "../lib/domain/discovery";
import AnimatedDetails from "./AnimatedDetails";
import { SEARCH_KINDS } from "../lib/domain/search";
import { useUiLocale } from "../lib/client/ui-locale";
import { useDiscoverySearch, type DiscoveryCriteria } from "../lib/client/use-discovery-search";
import { focusDestination } from "../lib/client/focus-destination";
import { useDialogDismiss } from "../lib/client/use-dialog-dismiss";
import { useDialogBackdrop } from "../lib/client/use-dialog-backdrop";
import { discoverySearchLabels } from "../lib/i18n/discovery-search";
import { searchLabels } from "../lib/i18n/entity-search";
import { explorerMessage } from "../lib/i18n/explorer";
import DialogCloseButton from "./DialogCloseButton";
import EntitySearchResults from "./EntitySearchResults";
import Icon from "./Icon";
import styles from "./DiscoverySearch.module.css";

export default function DiscoverySearch({ initial, onClose, onChoose }: { initial: DiscoveryCriteria; onClose: () => void; onChoose: (entity: EntitySummary, predicates?: PredicateFilter) => void }) {
  const { locale, setLocale } = useUiLocale(), text = discoverySearchLabels(locale), search = searchLabels(locale);
  const [criteria, setCriteria] = useState(initial), [cursors, setCursors] = useState<(string | null)[]>([null]), [composing, setComposing] = useState(false);
  const { result, previous, resultKey, starts, error, loading, retry } = useDiscoverySearch(criteria, cursors.at(-1)!, composing);
  const dialog = useRef<HTMLDialogElement>(null), selected = useRef(false);
  const changed = (value: DiscoveryCriteria) => { setCriteria(value); setCursors([null]); };
  const dismiss = useDialogDismiss(dialog, () => window.history.back());
  const backdrop = useDialogBackdrop(dismiss);
  useEffect(() => {
    if (window.history.state?.plunodeDiscovery) window.history.replaceState({ ...window.history.state, plunodeDiscovery: criteria }, "", window.location.href);
  }, [criteria]);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current!; element.showModal();
    if (!window.history.state?.plunodeDiscovery) window.history.pushState({ ...window.history.state, plunodeDiscovery: initial }, "", window.location.href);
    focusDestination(element.querySelector<HTMLElement>("#discovery-search-title"));
    const pop = () => onClose();
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("popstate", pop); element.close();
      if (!selected.current && previousFocus?.isConnected) focusDestination(previousFocus);
    };
  }, [onClose, initial]);
  const choose = (entity: EntitySummary) => {
    // Consume the search history entry before a real Graph route is pushed.
    selected.current = true;
    const afterBack = () => { onChoose(entity, criteria.predicates); requestAnimationFrame(() => focusDestination(document.getElementById("explorer-graph"))); };
    window.addEventListener("popstate", afterBack, { once: true });
    window.history.back();
  };
  const displayed = result ?? previous;
  const blocked = loading || !!error;
  const counts = new Map((displayed?.facets ?? []).map(f => [f.predicate, f.count]));
  const cuts = PREDICATE_KEYS.filter(p => (counts.get(p) ?? 0) > 0 || criteria.predicates?.includes(p));
  const toggleCut = (predicate: Predicate) => {
    const next = PREDICATE_KEYS.filter(p => p === predicate ? !criteria.predicates?.includes(p) : criteria.predicates?.includes(p));
    changed({ ...criteria, predicates: next.length ? next : null });
  };
  const themes = displayed?.themes ?? [];
  const chooseTheme = (theme: DiscoveryTheme) => changed({ ...criteria, theme: criteria.theme === theme ? undefined : theme, around: undefined });
  const chips = [
    ...(criteria.theme ? [{ id: "theme", label: text.themes[criteria.theme].title, remove: () => changed({ ...criteria, theme: undefined }) }] : []),
    ...(criteria.predicates ?? []).map(p => ({ id: p, label: text.cuts[p], remove: () => toggleCut(p) })),
    ...(criteria.kind ? [{ id: "kind", label: search.kinds[criteria.kind], remove: () => changed({ ...criteria, kind: null }) }] : []),
    ...(criteria.around ? [{ id: "around", label: text.around(starts.find(e => e.id === criteria.around)?.name ?? "…"), remove: () => changed({ ...criteria, around: undefined }) }] : []),
  ];
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="discovery-search-title" onCancel={e => { e.preventDefault(); dismiss(); }} {...backdrop}>
    <header className={styles.header}><div><span className={styles.eyebrow}>DISCOVER / PLUNODE</span><h2 id="discovery-search-title" tabIndex={-1} data-focus-destination>{text.title}</h2></div><div className={styles.headerActions}><select aria-label={text.language} value={locale} onChange={e => setLocale(e.target.value as "ja" | "en")}><option value="ja">日本語</option><option value="en">English</option></select><DialogCloseButton label={text.close} onClick={dismiss} /></div></header>
    <div className={styles.body}>
      <section className={styles.discoveryBoard} aria-labelledby="discovery-worlds">
        <div className={styles.sectionHeading}><h3 id="discovery-worlds">{text.themesTitle}</h3><button className={styles.quiet} type="button" aria-pressed={!criteria.theme} onClick={() => changed({ ...criteria, theme: undefined, around: undefined })}>{text.openAll}<Icon name="arrow" /></button></div>
        <div className={styles.themeRail}>{DISCOVERY_THEMES.filter(t => themes.includes(t)).map(theme => <button type="button" key={theme} className={styles.theme} data-theme={theme} aria-pressed={criteria.theme === theme} onClick={() => chooseTheme(theme)}>
          <span><small>{theme === "manga" ? "01 / CULTURE" : theme === "science" ? "02 / SCIENCE" : "03 / HISTORY"}</small><strong>{text.themes[theme].title}</strong><span>{text.themes[theme].detail}</span></span>
          <svg viewBox="0 0 92 76" fill="none" aria-hidden="true"><path d="M18 49Q34 26 61 19M18 49Q47 45 77 57M61 19Q73 32 77 57"/><circle cx="18" cy="49" r="9"/><circle cx="61" cy="19" r="5"/><circle cx="77" cy="57" r="7"/><circle className={styles.themeOrbit} cx="18" cy="49" r="16"/></svg>
        </button>)}{!themes.length && loading && <div className={styles.themePlaceholder} aria-hidden="true" />}</div>
        <section className={styles.cuts} aria-labelledby="discovery-cuts-title"><div className={styles.sectionHeading}><h3 id="discovery-cuts-title">{text.cutsTitle}</h3><span>{text.cutsHint}</span></div>
          <div className={styles.cutChoices} key={`${criteria.theme ?? "all"}:${cuts.join(",")}`} data-testid="discovery-cuts">
            {cuts.map(p => <button key={p} type="button" className={styles.cut} aria-pressed={!!criteria.predicates?.includes(p)} title={text.relationCount(counts.get(p) ?? 0)} onClick={() => toggleCut(p)}><Icon name={p === "CONTRIBUTED_TO" ? "book" : p === "PARTICIPATED_IN" ? "event" : p === "AFFILIATED_WITH" ? "organization" : "person"}/><span>{text.cuts[p]}</span><Icon name="plus" /></button>)}
            {!cuts.length && !loading && <p className={styles.muted}>{text.noCuts}</p>}
          </div>
        </section>
        <AnimatedDetails className={styles.refinements} summary={<><Icon name="settings"/><span>{text.refine}</span></>}>
          <div className={styles.refinementBody}><fieldset className={styles.kinds}><legend>{search.kind}</legend>{([null, ...SEARCH_KINDS] as const).map(kind => <button type="button" key={kind ?? "all"} aria-pressed={criteria.kind === kind} onClick={() => changed({ ...criteria, kind: criteria.kind === kind ? null : kind })}>{kind ? search.kinds[kind] : search.all}</button>)}</fieldset>
          <div className={styles.connections}><h3>{text.connections}</h3><div className={styles.connectionChoices}><button type="button" aria-pressed={!criteria.around} onClick={() => changed({ ...criteria, around: undefined })}>{text.all}</button>{starts.map(entity => <button key={entity.id} type="button" aria-pressed={criteria.around === entity.id} onClick={() => changed({ ...criteria, around: criteria.around === entity.id ? undefined : entity.id })}>{text.around(entity.name)}</button>)}</div></div></div>
        </AnimatedDetails>
        <div className={styles.selectionRail} aria-label={text.selected}>{chips.map(chip => <button key={chip.id} type="button" className={styles.selection} aria-label={text.remove(chip.label)} onClick={chip.remove}>{chip.label}<Icon name="close"/></button>)}{!chips.length && <span>{text.introduction}</span>}{chips.length > 0 && <button type="button" className={styles.quiet} onClick={() => changed({ q: "", kind: null, predicates: null })}>{text.reset}</button>}</div>
      </section>
      <section className={styles.matches} aria-label={text.title} aria-busy={loading}>
        <form className={styles.form} data-testid="discovery-keyword" onSubmit={e => { e.preventDefault(); retry(); }}>
          <label htmlFor="discovery-name">{text.keyword}</label><div className={styles.inputRow}><Icon name="search"/><input id="discovery-name" aria-label={search.name} value={criteria.q} placeholder={text.placeholder} autoComplete="off" maxLength={100} onChange={e => changed({ ...criteria, q: e.target.value })} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} />{criteria.q && <button type="button" className={styles.clearKeyword} aria-label={text.remove(search.name)} onClick={() => changed({ ...criteria, q: "" })}><Icon name="close"/></button>}<button type="submit" className={styles.quiet}>{search.submit}<Icon name="arrow"/></button></div>
        </form>
        <div className={styles.resultHeading}><p role="status" aria-live="polite">{loading ? text.updating : result ? text.resultCount(result.items.length, result.total ?? result.items.length) : ""}</p><small>{text.page(cursors.length)}</small>{loading && <span className={styles.progressLine} aria-hidden="true"/>}</div>
        {error && <div role="alert"><p>{explorerMessage(error, locale)}</p><button onClick={() => { setCursors([null]); retry(); }}>{text.retry}</button></div>}
        <div className={styles.resultStage} data-updating={blocked || undefined} data-testid="discovery-results">
          {displayed ? <div className={styles.resultEntrance} key={resultKey} inert={blocked} aria-hidden={blocked || undefined}>
            {!displayed.items.length && <div className={styles.empty}><Icon name="graph"/><p>{text.empty}</p><button onClick={() => changed({ q: "", kind: null, predicates: null })}>{text.clear}</button></div>}
            <EntitySearchResults items={displayed.items} locale={locale} onChoose={choose}/>
          </div> : <div className={styles.skeletons} aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <span key={i}/>)}</div>}
        </div>
        <nav className={styles.pagination} aria-label={locale === "en" ? "Result pages" : "結果のページ"}><button disabled={blocked || cursors.length === 1} onClick={() => setCursors(v => v.slice(0, -1))}>{text.previous}</button><span>{criteria.predicates?.length ? text.carry : text.hint}</span><button disabled={blocked || !result?.nextCursor} onClick={() => { setCursors(v => [...v, result!.nextCursor]); dialog.current?.querySelector("[data-testid=discovery-keyword]")?.scrollIntoView({ block: "start" }); }}>{text.next}</button></nav>
        <p className={styles.scopeNote}>{text.themeScope}</p>
      </section>
    </div>
  </dialog>;
}
