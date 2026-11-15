"use client";
import { useEffect, useState } from "react";
import { readKnowledge } from "../lib/client/use-knowledge-workspace";
import type { KnowledgeThemePage, KnowledgeThemeRead } from "../lib/domain/knowledge-theme-reader";
import { relatedThemesForTheme } from "../lib/domain/related-themes";
import { useUiLocale } from "../lib/client/ui-locale";
import { ThemeLink, type OpenTheme } from "./ThemeDiscovery";
import ReadingDetailSection,{ExpandableReadingSection} from "./ReadingDetailSection";
export default function RelatedThemes({entityId="",theme,onOpen,catalogue}:{entityId?:string;theme?:KnowledgeThemeRead;catalogue?:KnowledgeThemePage["themes"];onOpen:OpenTheme}) {
 const {locale}=useUiLocale();
 const isTheme=Boolean(theme);
 const scope=theme?theme.theme.id+":"+theme.theme.revision:entityId;
 const [page,setPage]=useState<{id:string;value:KnowledgeThemePage}|null>(null);
 const [attempt,retry]=useState(0);
 const [failure,setFailure]=useState("");
 useEffect(()=>{
  if(catalogue)return;
  let live=true;
  void readKnowledge<KnowledgeThemePage>("themes",isTheme?{}:{entityId}).then(value=>{if(live)setPage({id:scope,value});}).catch(()=>{if(live)setFailure(scope);});
  return()=>{live=false;};
 },[entityId,scope,isTheme,catalogue,attempt]);
 const current=page?.id===scope?page.value:undefined;
 const available=catalogue??current?.themes;
 const themes=theme?(available?relatedThemesForTheme(available,theme):undefined):catalogue?catalogue.filter(t=>t.entityIds.includes(entityId)||Object.hasOwn(t.focusAliases??{},entityId)):current?.themes;
 if(themes?.length===0)return null;
 const en=locale==="en",title=en?"Related themes":"関連するテーマ";
 if(themes)return <ExpandableReadingSection key={scope} ariaLabel={title} title={title} icon="event" items={themes.map(t=><ThemeLink key={t.id} theme={t} onOpen={onOpen} focusEntityId={theme?undefined:t.entityIds.includes(entityId)?entityId:t.focusAliases?.[entityId]??t.entityIds.find(id=>current?.focusIds?.includes(id))}/>)}/>;
 return <ReadingDetailSection ariaLabel={title} title={title} icon="event">{failure===scope?<button onClick={()=>{setFailure("");retry(v=>v+1);}}>{en?"Retry":"再取得"}</button>:<small role="status">{en?"Loading themes…":"テーマを読み込み中…"}</small>}</ReadingDetailSection>;
}
