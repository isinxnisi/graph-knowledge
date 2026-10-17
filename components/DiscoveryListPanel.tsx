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
import { CONTRIBUTION_ROLE_IDS } from "../lib/domain/contribution";
import { contributionLabels } from "../lib/i18n/contribution";
import { recordSearchProblem, recordPresets, type RecordSearchCriteria } from "../lib/domain/discovery-records";
import { usePrototypeQuery } from "../lib/client/use-discovery-prototype";
import { discoveryExplorationHref } from "../lib/client/discovery-navigation";
import DiscoveryClaimRow from "./DiscoveryClaimRow";
import Icon from "./Icon";
import styles from "./DiscoveryExplorer.module.css";

// Entity-list conditions remain separate from the subject's relation exploration.
export default function DiscoveryListPanel({ criteria, cursors, onChange, onPage, onChoose }: {
  criteria: DiscoveryCriteria; cursors: (string | null)[];
  onChange: (criteria: DiscoveryCriteria) => void; onPage: Dispatch<SetStateAction<(string | null)[]>>;
  onChoose: (entity: EntitySummary, predicates?: PredicateFilter, roles?: import("../lib/domain/exploration").ContributionRoleFilter) => void;
}) {
  const { locale } = useUiLocale(), en = locale === "en", text = discoverySearchLabels(locale), search = searchLabels(locale);
  const [composing, setComposing] = useState(false);
  const recordView = !!criteria.recordView;
  const recordCriteria: RecordSearchCriteria = { q: criteria.q, kind: criteria.kind, predicates: criteria.predicates ?? null, contributionRole: criteria.contributionRole ?? null, ...(criteria.theme ? { theme: criteria.theme } : {}), ...(criteria.around ? { around: criteria.around } : {}) };
  const problem = recordSearchProblem(recordCriteria);
  const query = useDiscoverySearch(recordView ? { q: "", kind: null, theme: criteria.theme, around: criteria.around } : criteria, recordView ? null : cursors.at(-1)!, composing && !recordView || !!problem);
  const records = usePrototypeQuery(!recordView ? { state: "needs-anchor" } : problem ? { state: "unsupported", reason: problem } : { state: "ready", operation: "claims", criteria: recordCriteria }, cursors.at(-1)!, composing);
  const displayed = query.result ?? query.previous;
  const loading = !problem && (recordView ? records.loading : query.loading), error = recordView ? records.error : query.error;
  const blocked = loading || !!error || !!problem;
  const recordData = records.result ?? records.previous;
  const graphHref = (id: string) => (en ? "/en" : "") + discoveryExplorationHref("public-kg", id, criteria.predicates ?? null, criteria.contributionRole ? [criteria.contributionRole] : null);
  const counts = new Map((displayed?.facets ?? []).map(f => [f.predicate, f.count]));
  const cuts = PREDICATE_KEYS.filter(predicate => (counts.get(predicate) ?? 0) > 0 || criteria.predicates?.includes(predicate));
  const toggleCut = (predicate: Predicate) => {
    const next = PREDICATE_KEYS.filter(p => p === predicate ? !criteria.predicates?.includes(p) : criteria.predicates?.includes(p));
    onChange({ ...criteria, predicates: next.length ? next : null });
  };
  const clear = () => onChange({ q: "", kind: null, predicates: null, presentation: "list", recordView, contributionRole: null });
  return <div id="discovery-list-panel" role="tabpanel" aria-labelledby="prototype-tab-list" className={styles.listWorkspace}>
    <aside className={styles.listFilters}>
      <div className={styles.sectionHeading}><h3>{en ? "List filters" : "一覧の条件"}</h3><button className={styles.clearAll} onClick={clear}>{text.clear}</button></div>
      <div className={styles.listOptions} role="group" aria-label={en ? "Result unit" : "結果の種類"}>
        <button aria-pressed={!recordView} onClick={() => onChange({ ...criteria, recordView: false })}>{en ? "Entities" : "対象の一覧"}</button>
        <button aria-pressed={recordView} onClick={() => onChange({ ...criteria, recordView: true })}>{en ? "Relation records" : "関係の記録"}</button>
      </div>
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
      {(criteria.predicates?.length === 1 && criteria.predicates[0] === "CONTRIBUTED_TO" || criteria.contributionRole) && <div className={styles.listGroup} role="group" aria-label={en ? "Production role" : "制作役割"}><span className={styles.fieldLabel}>{en ? "Role" : "制作役割"}</span><div className={styles.listOptions}>
        <button aria-pressed={!criteria.contributionRole} onClick={() => onChange({ ...criteria, contributionRole: null })}>{en ? "Any role" : "限定なし"}</button>
        {CONTRIBUTION_ROLE_IDS.map(role => <button key={role} data-record-role={role} aria-pressed={criteria.contributionRole === role} onClick={() => onChange({ ...criteria, contributionRole: role })}>{contributionLabels(locale).roles[role]}</button>)}
      </div><small>{en ? "Exact role on the same production Claim. Broader credits are not inferred." : "同じ制作Claimに明記された役割だけ。広い制作記録からは推定しません。"}</small></div>}
      {problem && <div className={styles.unavailable} role="alert"><p>{problem[en ? 1 : 0]}</p><button onClick={() => onChange({ ...criteria, contributionRole: null })}>{en ? "Remove only the role" : "制作役割だけ外す"}</button><button onClick={() => onChange({ ...criteria, predicates: ["CONTRIBUTED_TO"] })}>{en ? "Use only Production" : "関係を作品づくりだけに戻す"}</button></div>}
      {recordView && <div className={styles.listGroup}><span className={styles.fieldLabel}>{en ? "Try a query" : "検索例"}</span><div className={styles.listOptions}>
        {recordPresets.map(preset => <button key={preset.id} data-record-preset={preset.id} onClick={() => onChange({ ...criteria, predicates: [...preset.predicates], contributionRole: preset.contributionRole })}>{preset.title[en ? 1 : 0]}</button>)}
      </div><small>{en ? "Replaces relation and role only; keeps name, kind and scope." : "関係・役割だけを置換。名前・種別・範囲は保持します。"}</small></div>}
      <div className={styles.listGroup} role="group" aria-label={text.connections}><span className={styles.fieldLabel}>{en ? "Around" : "周辺"}</span><div className={styles.listOptions}>
        <button aria-pressed={!criteria.around} onClick={() => onChange({ ...criteria, around: undefined })}>{text.all}</button>
        {query.starts.map(entity => <button key={entity.id} aria-pressed={criteria.around === entity.id} onClick={() => onChange({ ...criteria, around: criteria.around === entity.id ? undefined : entity.id })}>{text.around(entity.name)}</button>)}
      </div><small>{en ? "Only Claims directly connected to the selected subject. Relation and role must match that same Claim." : "選んだ対象に直接つながるClaimを検索。関係と役割も同じClaimで照合します。"}</small></div>
    </aside>
    <section className={styles.matches} aria-label={recordView ? en ? "Relation records" : "関係の記録" : en ? "Entity list" : "対象の一覧"} aria-busy={loading}>
      <form className={styles.keyword} data-testid="discovery-keyword" onSubmit={event => { event.preventDefault(); if (recordView) records.retry(); else query.retry(); }}>
        <div className={styles.keywordLabel}><label htmlFor="discovery-name">{en ? "Name or alias · optional" : "名前・別名（空欄でも検索）"}</label></div>
        <div className={styles.inputRow}><Icon name="search"/><input id="discovery-name" aria-label={search.name} value={criteria.q} placeholder={text.placeholder} autoComplete="off" maxLength={100} onChange={event => onChange({ ...criteria, q: event.target.value })} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}/>
          {criteria.q && <button type="button" aria-label={text.remove(search.name)} onClick={() => onChange({ ...criteria, q: "" })}><Icon name="close"/></button>}
          <button type="submit" className={styles.searchSubmit}>{search.submit}<Icon name="arrow"/></button>
        </div>
      </form>
      <div className={styles.resultHeading}><div><h3>{recordView ? en ? "Relation records" : "関係の記録" : en ? "Entities" : "対象の一覧"}</h3><span role="status">{problem ? "" : loading ? text.updating : recordView ? records.result ? (en ? records.result.claims.length + " on this page" : "このページ " + records.result.claims.length + "件") : "" : query.result ? text.resultCount(query.result.items.length, query.result.total ?? query.result.items.length) : ""}</span></div><small>{text.page(cursors.length)}</small></div>
      {error && !problem && <div role="alert" className={styles.unavailable}><p>{recordView ? records.conflict ? (en ? "The public KG changed. Refresh from the first page." : "公開KGの版が変わりました。先頭から再取得してください。") : (en ? "Could not load records. Please retry." : "記録を取得できませんでした。再試行してください。") : explorerMessage(error!, locale)}</p><button onClick={() => { onPage([null]); if (recordView) records.retry(); else query.retry(); }}>{text.retry}</button></div>}
      <div className={styles.resultStage} data-updating={blocked || undefined} data-testid="discovery-results">
        {problem ? <p className={styles.note}>{en ? "Search paused; every criterion is retained." : "検索を実行していません。選択条件はすべて保持しています。"}</p> : recordView ? <div inert={blocked} aria-hidden={blocked || undefined}>
          {recordData && <div className={styles.recordList}>{recordData.claims.map(claim => <DiscoveryClaimRow key={recordData.revision + ":" + claim.id} claim={claim} nodes={recordData.nodes} revision={recordData.revision} graphHref={graphHref}/>)}</div>}
          {records.result && !records.result.claims.length && <div className={styles.empty}><p>{en ? "No published Claim matches all these criteria. This is not a statement about coverage of the whole world." : "すべての条件に一致する公開Claimはありません。世界全体の収録状況を意味しません。"}</p><button onClick={clear}>{text.clear}</button></div>}
          {loading && !recordData && <div className={styles.skeleton} aria-hidden="true"/>}
        </div> : displayed ? <div inert={blocked} aria-hidden={blocked || undefined}>
          {!displayed.items.length && <div className={styles.empty}><p>{text.empty}</p><button onClick={clear}>{text.clear}</button></div>}
          <EntitySearchResults items={displayed.items} locale={locale} onChoose={entity => onChoose(entity, criteria.predicates, criteria.contributionRole ? [criteria.contributionRole] : undefined)}/>
        </div> : <div className={styles.skeleton} aria-hidden="true"/>}
      </div>
      <nav className={styles.pagination} aria-label={en ? "Result pages" : "結果のページ"}>
        <button disabled={blocked || cursors.length === 1} onClick={() => onPage(v => v.slice(0, -1))}>{text.previous}</button>
        <span>{criteria.predicates?.length ? text.carry : text.hint}</span>
        <button disabled={blocked || !(recordView ? records.result?.nextCursor : query.result?.nextCursor)} onClick={() => { onPage(v => [...v, (recordView ? records.result!.nextCursor : query.result!.nextCursor)]); document.getElementById("discovery-name")?.closest("form")?.scrollIntoView({ block: "start" }); }}>{text.next}</button>
      </nav>
      {(recordView || criteria.contributionRole) && <p className={styles.scopeNote}>{en ? "Names and kind match the same endpoint of each Claim, across all pages. Graph carries relation and role only; name, kind and scope remain search criteria. Graph expands both directions." : "名前と種別は同じClaimの同じ端点で照合し、全ページに適用します。Graphへ渡すのは関係と制作役割です。名前・種別・範囲は検索に保持し、Graphは両方向へ展開します。"}</p>}
      {((recordView && records.result) || (!recordView && criteria.contributionRole && query.result?.revision)) && <small className={styles.revision}>PUBLIC KG · {recordView ? records.result!.revision : query.result!.revision}</small>}
      <p className={styles.scopeNote}>{en ? "These filters search the list. Your connection and world selections are kept in their entrances." : "この条件は一覧の検索に使います。接点・知識世界で選んだ条件は、それぞれの入口に保持しています。"}</p>
    </section>
  </div>;
}
