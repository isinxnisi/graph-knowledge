"use client";
import { useEffect, useRef, useState } from "react";
import type { EntitySummary } from "../lib/domain/api";
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

export default function DiscoverySearch({ initial, onClose, onChoose }: { initial: DiscoveryCriteria; onClose: () => void; onChoose: (entity: EntitySummary) => void }) {
  const { locale, setLocale } = useUiLocale(), text = discoverySearchLabels(locale), search = searchLabels(locale);
  const [criteria, setCriteria] = useState(initial), [cursors, setCursors] = useState<(string | null)[]>([null]), [composing, setComposing] = useState(false);
  const { result, starts, error, loading, retry } = useDiscoverySearch(criteria, cursors.at(-1)!, composing);
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
    if (matchMedia("(min-width: 801px)").matches) element.querySelector<HTMLInputElement>("#discovery-name")?.focus({ preventScroll: true });
    else focusDestination(element.querySelector<HTMLElement>("#discovery-search-title"));
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
    const afterBack = () => { onChoose(entity); requestAnimationFrame(() => focusDestination(document.getElementById("explorer-graph"))); };
    window.addEventListener("popstate", afterBack, { once: true });
    window.history.back();
  };
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="discovery-search-title" onCancel={e => { e.preventDefault(); dismiss(); }} {...backdrop}>
    <header className={styles.header}><div><span className={styles.eyebrow}>DISCOVER</span><h2 id="discovery-search-title" tabIndex={-1} data-focus-destination>{text.title}</h2></div><div className={styles.headerActions}><select aria-label={text.language} value={locale} onChange={e => setLocale(e.target.value as "ja" | "en")}><option value="ja">日本語</option><option value="en">English</option></select><DialogCloseButton label={text.close} onClick={dismiss} /></div></header>
    <div className={styles.body}>
      <p className={styles.introduction}>{text.introduction}</p>
      <form className={styles.form} onSubmit={e => { e.preventDefault(); retry(); }}>
        <label htmlFor="discovery-name">{search.name}</label><div className={styles.inputRow}><Icon name="search" /><input id="discovery-name" value={criteria.q} placeholder={text.placeholder} autoComplete="off" maxLength={100} onChange={e => changed({ ...criteria, q: e.target.value })} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} /><button type="submit">{search.submit}</button></div>
        <fieldset className={styles.kinds}><legend>{search.kind}</legend>{([null, ...SEARCH_KINDS] as const).map(kind => <button type="button" key={kind ?? "all"} aria-pressed={criteria.kind === kind} onClick={() => changed({ ...criteria, kind })}>{kind ? search.kinds[kind] : search.all}</button>)}</fieldset>
      </form>
      <div className={styles.layout}><aside className={styles.connections}><h3>{text.connections}</h3><div className={styles.connectionChoices}><button type="button" aria-pressed={!criteria.around} onClick={() => changed({ ...criteria, around: undefined })}>{text.all}</button>{starts.map(entity => <button key={entity.id} type="button" aria-pressed={criteria.around === entity.id} onClick={() => changed({ ...criteria, around: entity.id })}>{text.around(entity.name)}</button>)}</div><p>{text.scope}</p></aside>
        <section className={styles.matches} aria-label={text.title} aria-busy={loading}>
          <div className={styles.resultHeading}><p role="status">{loading ? search.loading : result ? search.count(result.items.length) : ""}</p><small>{text.page(cursors.length)}</small></div>
          {error && <div role="alert"><p>{explorerMessage(error, locale)}</p><button onClick={() => { setCursors([null]); retry(); }}>{text.retry}</button></div>}
          {!loading && result && <><p className={styles.order}>{criteria.around ? text.scope : text.order}</p>{!result.items.length && <p className={styles.empty}>{text.empty}<button onClick={() => changed({ q: "", kind: null })}>{text.clear}</button></p>}<EntitySearchResults items={result.items} locale={locale} onChoose={choose} /><nav className={styles.pagination} aria-label={locale === "en" ? "Result pages" : "結果のページ"}><button disabled={cursors.length === 1} onClick={() => setCursors(v => v.slice(0, -1))}>{text.previous}</button><span>{text.hint}</span><button disabled={!result.nextCursor} onClick={() => { setCursors(v => [...v, result.nextCursor]); dialog.current?.scrollTo({ top: 0 }); }}>{text.next}</button></nav></>}
        </section>
      </div>
    </div>
  </dialog>;
}
