"use client";
import Image from "next/image";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { readKnowledge } from "../lib/client/use-knowledge-workspace";
import { knowledgeThemeTypeLabel, type KnowledgeThemeSummary, type KnowledgeThemePage, type KnowledgeThemeHome } from "../lib/domain/knowledge-theme-reader";
import { useUiLocale } from "../lib/client/ui-locale";
import Icon from "./Icon";
import {knowledgeDisplayText} from "../lib/domain/knowledge-display";
import layout from "./DiscoveryExplorer.module.css";
import css from "./ThemeDiscovery.module.css";
import home from "./DiscoveryHome.module.css";
import results from "./DiscoverySearch.module.css";

export type ThemeCriteria = { q: string; kind: "all" | "timeline" | "graph" | "context"; order: "newest" | "name" };
export const initialThemeCriteria: ThemeCriteria = { q: "", kind: "all", order: "newest" };
export type OpenTheme = (ref: { id: string; revision?: number; focusEntityId?: string }) => void;
export function ThemeLink({ theme, onOpen, appearance = "row", showDescription = false, focusEntityId, openInNewTab = false }: {
  theme: KnowledgeThemeSummary; onOpen: OpenTheme;
  appearance?: "row" | "featured" | "recent"; showDescription?: boolean;
  focusEntityId?: string; openInNewTab?: boolean;
}) {
  const { locale } = useUiLocale(), en = locale === "en";
  const type = knowledgeThemeTypeLabel(theme, en);
  const title=knowledgeDisplayText(theme.translations,{kind:"theme",id:theme.id,revision:theme.revision,field:"title"},locale,theme.title);
  const description=knowledgeDisplayText(theme.translations,{kind:"theme",id:theme.id,revision:theme.revision,field:"description"},locale,theme.description);
  const presentation={image:theme.presentationImages?.[en?"en":"ja"],intro:theme.presentationIntros?.[en?"en":"ja"]};
  const icon = theme.hasTimeline ? "event" : theme.hasRelations === false ? "book" : "graph";
  const href = `${en?"/en":""}/t/${encodeURIComponent(theme.id)}${focusEntityId?"?kfocus="+encodeURIComponent(focusEntityId):""}`;
  function choose(event: MouseEvent<HTMLAnchorElement>) {
    if (openInNewTab || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); onOpen({ id: theme.id, revision: theme.revision,...(focusEntityId?{focusEntityId}:{}) });
  }
  if (appearance === "recent") return <a className={`${css.recentLink} ${home.recentThemeLink}`} href={href} target={openInNewTab ? "_blank" : undefined} rel={openInNewTab ? "noopener" : undefined} onClick={choose}>
    <Icon name={icon}/><span className={home.recentThemeText}><span className={home.recentThemeTitle}>{title}</span><small>{type}</small></span>
  </a>;
  if (appearance === "featured") return <a className={`${home.themeFeature} ${css.featureLink}`} href={href} target={openInNewTab ? "_blank" : undefined} rel={openInNewTab ? "noopener" : undefined} onClick={choose}>
    <>{presentation?.image?<Image unoptimized className={css.themeImage} data-kind={presentation.image.kind} src={presentation.image.src} width={96} height={80} alt={presentation.image.alt} style={{objectPosition:presentation.image.focus}}/>:<Icon name={icon}/>}</><span><small>{type}</small><strong>{title}</strong>
      {showDescription && theme.description && <span className={css.featureDescription}>{presentation.intro?.hook||description}</span>}
    </span><Icon name="arrow"/>
  </a>;
  return <a className={`${results.resultRow} ${css.themeRow}`} href={href} target={openInNewTab ? "_blank" : undefined} rel={openInNewTab ? "noopener" : undefined} onClick={choose}>
    <Icon name={icon}/><span className={results.identity}>
      <span className={results.name}><strong>{title}</strong><small>{type}</small></span>
      {showDescription && theme.description && <span className={results.description}>{description}</span>}
    </span><Icon name="chevron"/>
  </a>;
}
export function FeaturedThemeRail({ themes, onOpen, openInNewTab = false }: {
  themes: KnowledgeThemeSummary[]; onOpen: OpenTheme; openInNewTab?: boolean;
}) {
  const { locale } = useUiLocale(), en = locale === "en";
  const [expanded,setExpanded] = useState(false);
  const listId = useId();
  return <div className={css.featuredWrap} data-expanded={expanded || undefined}>
    <div id={listId} className={`${css.featured} ${css.home}`} role="list" aria-label={en ? "Featured themes" : "紹介テーマ"}>
      {themes.map(theme => <div key={theme.id} role="listitem"><ThemeLink theme={theme} onOpen={onOpen} appearance="featured" showDescription openInNewTab={openInNewTab}/></div>)}
    </div>
    {themes.length>3&&<button className={css.featuredMore} aria-controls={listId} aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?(en?"Show less":"閉じる"):(en?"Show more":"もっと見る")}<Icon name="chevron"/></button>}
  </div>;
}
export function useHomeThemes(initialData?: KnowledgeThemeHome | null, enabled = true) {
  const [data, setData] = useState<KnowledgeThemeHome | null>(initialData ?? null);
  const [failed, setFailed] = useState(initialData === null), [attempt, setAttempt] = useState(0);
  const [busy,setBusy]=useState(false), first=useRef(true);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const read = () => { setBusy(true); return readKnowledge<KnowledgeThemeHome>("theme-home")
      .then(value => { if (live) { setData(value); setFailed(false); } })
      .catch(() => { if (live) { setData(null); setFailed(true); } }).finally(()=>{if(live)setBusy(false);}); };
    // The initial HTML was just authorised. Recheck on later returns, retry and polling.
    if(!first.current||!initialData)void read();
    first.current=false;
    const timer = setInterval(() => void read(), 30000);
    return () => { live = false; clearInterval(timer); };
    // initialData belongs to the server render; returning Home explicitly rechecks it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, attempt]);
  return { data, failed, busy, retry: () => setAttempt(value => value + 1) };
}
export function HomeThemes({ state, onOpen, onBrowse, part = "both" }: {
  state: ReturnType<typeof useHomeThemes>; onOpen: OpenTheme; onBrowse: () => void; part?: "featured" | "recent" | "both";
}) {
  const { locale } = useUiLocale(), en = locale === "en";
  const { data, failed, busy, retry } = state;
  if (failed || !data) {
    // Both slots share one request. Keep one contextual message and one retry.
    if(part==="recent")return null;
    return <div className={css.home}><section className={home.fields} aria-labelledby="home-theme-featured"><div className={css.heading}><h3 id="home-theme-featured">{en?"Featured themes":"紹介テーマ"}</h3></div><div className={css.statusLine} role="status"><span>{busy?en?"Loading themes…":"テーマを読み込んでいます…":en?"Themes could not be loaded.":"テーマを読み込めませんでした。"}</span>{failed&&<button disabled={busy} onClick={retry}><Icon name="refresh"/>{en?"Retry":"再試行"}</button>}</div></section></div>;
  }
  if (!data.total) return null;
  return <div className={css.home}>
    {part !== "recent" && !!data.featured.length && <section className={home.fields} aria-labelledby="home-theme-featured"><div className={css.heading}><h3 id="home-theme-featured">{en ? "Featured themes" : "紹介テーマ"}</h3><button onClick={onBrowse}>{en ? "Explore themes" : "テーマを探す"}<Icon name="arrow" /></button></div><FeaturedThemeRail themes={data.featured} onOpen={onOpen}/></section>}
    {part !== "featured" && <section className={home.recent} aria-labelledby="home-theme-recent"><div className={css.heading}><h3 id="home-theme-recent">{en ? "New themes" : "新着テーマ"}</h3><button onClick={onBrowse}>{en ? "Browse all" : "一覧を見る"}<Icon name="arrow" /></button></div><ul>{data.recent.map(theme=><li key={theme.id}><ThemeLink theme={theme} onOpen={onOpen} appearance="recent"/><time dateTime={theme.publishedAt}>{theme.publishedAt?.slice(0,10)}</time></li>)}</ul><p className={home.note}>{en ? "Theme registration dates, not dates of historical events." : "テーマの登録日です。出来事が起きた日付ではありません。"}</p></section>}
  </div>;
}
export function ThemeSearchPanel({ criteria, onChange, onOpen }: { criteria: ThemeCriteria; onChange: (value: ThemeCriteria) => void; onOpen: OpenTheme }) {
  const { locale } = useUiLocale(), en = locale === "en";
  const [response, setResponse] = useState<{key:string;page:KnowledgeThemePage} | null>(null), [busy,setBusy]=useState(true),[error,setError]=useState(false),[attempt,setAttempt]=useState(0),[composing,setComposing]=useState(false),[filtersOpen,setFiltersOpen]=useState(false);
  const key=JSON.stringify(criteria);
  const result=response?.page;
  const pending=busy||response?.key!==key;
  useEffect(()=>{let live=true;const query:ThemeCriteria=JSON.parse(key);const timer=setTimeout(()=>{if(composing)return;setBusy(true);setError(false);void readKnowledge<KnowledgeThemePage>("themes",{...query,language:locale}).then(value=>{if(live)setResponse({key,page:value});}).catch(()=>{if(live){setResponse(null);setError(true);}}).finally(()=>{if(live)setBusy(false);});},250);return()=>{live=false;clearTimeout(timer);};},[key,attempt,composing,locale]);
  const choices = [["all", en?"All":"すべて"],["timeline",en?"Timelines":"年表"],["graph",en?"Relation diagrams only":"関係図のみ"],["context",en?"Readings":"解説"]] as const;
  return <div id="discovery-theme-panel" role="tabpanel" aria-labelledby="prototype-tab-themes" className={layout.listWorkspace}>
    <aside className={`${layout.listFilters} ${css.filters}`} data-open={filtersOpen || undefined}><div className={layout.sectionHeading}><h3>{en?"Theme filters":"テーマの条件"}</h3><button className={css.mobileToggle} aria-expanded={filtersOpen} aria-controls="theme-filter-body" onClick={()=>setFiltersOpen(v=>!v)}><Icon name="settings"/>{en?"Filters":"絞り込み"}<Icon name="chevron" /></button><button className={layout.clearAll} onClick={()=>onChange(initialThemeCriteria)}>{en?"Clear filters":"条件をクリア"}</button></div><div className={css.filterBody} id="theme-filter-body"><div className={layout.listGroup}><span className={layout.fieldLabel}>{en?"Presentation":"表示内容"}</span><div className={layout.listOptions} role="group" aria-label={en?"Theme presentation":"テーマの表示内容"}>{choices.map(([kind,label])=><button key={kind} aria-pressed={criteria.kind===kind} onClick={()=>onChange({...criteria,kind})}>{label}</button>)}</div></div><label className={css.sort}>{en?"Order":"並び順"}<select value={criteria.order} onChange={e=>onChange({...criteria,order:e.target.value as ThemeCriteria["order"]})}><option value="newest">{en?"Newest":"新着順"}</option><option value="name">{en?"Name":"名前順"}</option></select></label></div></aside>
    <section className={`${layout.matches} ${css.matches}`} aria-label={en?"Theme results":"テーマの検索結果"} aria-busy={pending}><form className={layout.keyword} onSubmit={e=>{e.preventDefault();setAttempt(v=>v+1);}}><div className={layout.keywordLabel}><label htmlFor="theme-search-name">{en?"Theme name or description":"テーマの名前・説明"}</label></div><div className={layout.inputRow}><Icon name="search" /><input id="theme-search-name" value={criteria.q} maxLength={200} placeholder={en?"A subject, a period, a theme…":"人物・時代・気になるテーマ…"} onCompositionStart={()=>setComposing(true)} onCompositionEnd={()=>setComposing(false)} onChange={e=>onChange({...criteria,q:e.target.value})} /><button type="submit" className={layout.searchSubmit}>{en?"Search":"検索"}<Icon name="arrow" /></button></div></form><div className={layout.resultHeading}><div><h3>{en?"Themes":"テーマ"}</h3><span role="status">{pending?en?"Searching…":"検索中…":result?`${result.themes.length}${en?" matches":"件"}`:""}</span></div></div>
      {error?<div role="alert" className={layout.unavailable}>{en?"Could not load themes.":"テーマを取得できませんでした。"}<button onClick={()=>setAttempt(v=>v+1)}>{en?"Retry":"再取得"}</button></div>:<><ul className={`${results.results} ${css.results}`} inert={pending || composing}>{result?.themes.map(theme=><li key={theme.id}><ThemeLink theme={theme} onOpen={onOpen} showDescription/></li>)}</ul>{!pending&&result&&!result.themes.length&&<p className={layout.note}>{en?"No themes match these filters.":"条件に合うテーマはありません。"}</p>}</>}
    </section>
  </div>;
}
