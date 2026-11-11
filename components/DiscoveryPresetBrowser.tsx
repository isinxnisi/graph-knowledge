"use client";
import { useState, type ReactNode } from "react";
import { availableCatalogPresets, findCatalogPresets, hasCatalogFilters, initialCatalogFilters, type CatalogFilters, type CatalogPreset } from "../lib/domain/discovery-preset-catalog";
import { WORLD_IDS, worldNames } from "../lib/domain/discovery-prototype";
import { CONTRIBUTION_ROLE_IDS } from "../lib/domain/contribution";
import { contributionLabels } from "../lib/i18n/contribution";
import { useUiLocale } from "../lib/client/ui-locale";
import DiscoveryWorldIcon from "./DiscoveryWorldIcon";
import Icon from "./Icon";
import styles from "./DiscoveryPresetBrowser.module.css";
import list from "./DiscoveryList.module.css";

export function PresetModeSwitch({mode,onChange}:{mode:"presets"|"names";onChange:(mode:"presets"|"names")=>void}){
 const {locale}=useUiLocale(),en=locale==="en";
 return <div className={styles.modeSwitch} role="group" aria-label={en?"Find a starting point":"探索の始め方"}>{(["presets","names"] as const).map(value=><button key={value} aria-pressed={mode===value} onClick={()=>onChange(value)}><Icon name={value==="presets"?"graph":"search"}/>{value==="presets"?(en?"Explore connections":"探し方から"):(en?"Find by name":"名前から探す")}</button>)}</div>;
}
export default function DiscoveryPresetBrowser({filters,onChange,onSelect,onNames,busy,error,onChangeSubject,switcher}:{filters:CatalogFilters;onChange:(value:CatalogFilters)=>void;onSelect:(preset:CatalogPreset,example?:boolean)=>void;onNames:()=>void;busy:boolean;error:string|null;onChangeSubject?:(preset:CatalogPreset)=>void;switcher?:ReactNode}){
 const {locale}=useUiLocale(),en=locale==="en",t=(ja:string,eng:string)=>en?eng:ja;
 const [filtersOpen,setFiltersOpen]=useState(false);
 const found=findCatalogPresets(filters),items=found.items;
 const roles=CONTRIBUTION_ROLE_IDS.filter(role=>filters.role === role || availableCatalogPresets.some(p=>p.role === role));
 const update=(patch:Partial<CatalogFilters>)=>onChange({...filters,...patch});
 const kinds=[["person","人物","People"],["work","作品","Works"],["organization","組織","Organizations"],["event","出来事","Events"]] as const;
 return <div className={styles.catalog} data-testid="preset-browser" aria-busy={busy}>
  <aside className={styles.left}>
   <section className={styles.filters} data-open={filtersOpen||undefined} aria-label={t("プリセットの絞り込み","Preset filters")}>
    <div className={styles.filterHeading}><h3>{t("探し方を絞る","Filter connections")}</h3><button className={styles.mobileFilterToggle} aria-expanded={filtersOpen} aria-controls="preset-filter-body" onClick={()=>setFiltersOpen(value=>!value)}><Icon name="settings"/>{t("絞り込み","Filters")}<Icon name="chevron"/></button>{hasCatalogFilters(filters)&&<button onClick={()=>onChange(initialCatalogFilters)}>{t("リセット","Reset")}</button>}</div>
    <div className={styles.filterBody} id="preset-filter-body">
    <fieldset><legend>{t("興味のある分野","Fields of interest")}</legend><div className={styles.worlds}>{WORLD_IDS.map(world=><button className={styles.chip} key={world} data-catalog-world={world} aria-pressed={filters.worlds.includes(world)} onClick={()=>update({worlds:filters.worlds.includes(world)?filters.worlds.filter(w=>w!==world):[...filters.worlds,world]})}><DiscoveryWorldIcon world={world}/>{worldNames[world][en?1:0]}</button>)}</div></fieldset>
    <fieldset><legend>{t("対象の種類","Starting subject")}</legend><div className={styles.options}>{kinds.map(([kind,ja,eng])=><button className={styles.chip} key={kind} aria-pressed={filters.kind===kind} onClick={()=>update({kind:filters.kind===kind?null:kind})}>{t(ja,eng)}</button>)}</div></fieldset>
    <fieldset><legend>{t("関係性","Relations")}</legend><div className={styles.options}>{([["credits","制作","Production"],["affiliations","所属","Affiliation"],["influences","影響","Influence"]] as const).map(([question,ja,eng])=><button className={styles.chip} key={question} aria-pressed={filters.question===question} onClick={()=>update({question:filters.question===question?null:question})}>{t(ja,eng)}</button>)}</div></fieldset>
    <fieldset><legend>{t("制作での役割","Production role")}</legend><div className={styles.options}>{roles.map(role=><button className={styles.chip} key={role} data-catalog-role={role} aria-pressed={filters.role===role} onClick={()=>update({role:filters.role===role?null:role})}>{contributionLabels(locale).roles[role]}</button>)}</div></fieldset>
    </div>
   </section>
  </aside>
  <section className={styles.results} aria-label={t("プリセットの検索結果","Preset search results")}>
   {switcher??<PresetModeSwitch mode="presets" onChange={mode=>{if(mode === "names")onNames();}}/>}
   <p className={styles.intro}>{t("作品のつくり手や研究者のつながりなど、気になる切り口から探せます。","Explore a work’s creators, researchers’ connections, and more.")}</p>
   <div className={styles.tools}><label className={styles.search}><Icon name="search"/><input aria-label={t("プリセットを検索","Search presets")} value={filters.q} maxLength={100} placeholder={t("探し方の名前・説明から…","Search titles and descriptions…")} onChange={e=>update({q:e.target.value})}/>{filters.q&&<button aria-label={t("プリセットの検索語を消す","Clear preset search text")} onClick={()=>update({q:""})}>×</button>}</label><div className={styles.sort}>{t("並び順","Sort")}<span className={styles.sortOptions} role="group" aria-label={t("プリセットの並び順","Preset order")}>{(["recommended","newest","popular"] as const).map(sort=><button key={sort} aria-pressed={filters.sort===sort} onClick={()=>update({sort})}>{sort==="recommended"?t("おすすめ順","Recommended"):sort==="newest"?t("新着順","Newest"):t("人気順","Popular")}</button>)}</span></div></div>
   {filters.sort==="popular"&&!found.popularityMeasured&&<p className={styles.notice} role="status">{t("人気はまだ未集計です。掲載優先順で表示しています。","Popularity has not been measured yet. Showing editorial priority order.")}</p>}
   <div className={styles.count} role="status">{t(`${items.length}件の探し方`,`${items.length} presets`)}</div>
   {error&&<p className={styles.notice} role="alert">{error}</p>}
   <div className={styles.rows}>{items.map(p=><article key={p.id} className={`${styles.row} ${list.row}`} data-catalog-result={p.id}><div className={`${styles.rowCopy} ${list.copy}`}><div className={styles.rowTop}><DiscoveryWorldIcon world={p.worlds[0]}/><h4>{p.title[en?1:0]}</h4><span>{p.execution.type==="fixed"?t("すぐに探索","Ready to explore"):t("名前を選んで探索","Choose a name to begin")}</span></div><p>{p.description[en?1:0]}</p><small>{p.worlds.map(w=>worldNames[w][en?1:0]).join(" · ")}{p.role?" · "+contributionLabels(locale).roles[p.role]:""}</small></div><div className={`${list.actions} ${styles.rowActions}`}>{p.execution.type==="fixed"&&onChangeSubject&&<button className={list.secondary} disabled={busy} onClick={()=>onChangeSubject(p)}>{t("名前を選ぶ","Choose a name")}<Icon name="arrow"/></button>}<button className={list.primary} disabled={busy} onClick={()=>onSelect(p)}><Icon name={p.execution.type==="fixed"?"graph":"search"}/>{p.execution.type==="fixed"?t("つながりを見る","View connections"):t("名前を選ぶ","Choose a name")}<Icon name="arrow"/></button></div></article>)}</div>
   {!items.length&&<div className={styles.empty}><h4>{t("この条件のプリセットは、まだありません。","No presets match these filters yet.")}</h4><p>{t("公開KGのデータが0件という意味ではありません。条件を外すか、名前から自由に探せます。","This is not a count of KG data. Remove a filter, or explore freely by name.")}</p><button onClick={()=>onChange(initialCatalogFilters)}>{t("絞り込みをリセット","Reset filters")}</button><button onClick={onNames}>{t("名前から探す","Find by name")}</button></div>}
  </section>
 </div>;
}
