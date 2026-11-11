"use client";
import { useEffect, useState } from "react";
import { readKnowledge } from "../lib/client/use-knowledge-workspace";
import type { KnowledgeThemePage } from "../lib/domain/knowledge-theme-reader";
import { useUiLocale } from "../lib/client/ui-locale";
import { ThemeLink, type OpenTheme } from "./ThemeDiscovery";
import ReadingDetailSection,{ExpandableReadingSection} from "./ReadingDetailSection";
export default function RelatedThemes({entityId,onOpen,catalogue}:{entityId:string;catalogue?:KnowledgeThemePage["themes"];onOpen:OpenTheme}) {
 const {locale}=useUiLocale();
 const [page,setPage]=useState<{id:string;value:KnowledgeThemePage}|null>(null);
 const [attempt,retry]=useState(0);
 const [failure,setFailure]=useState("");
 useEffect(()=>{
  if(catalogue)return;
  let live=true;
  void readKnowledge<KnowledgeThemePage>("themes",{entityId}).then(value=>{if(live)setPage({id:entityId,value});}).catch(()=>{if(live)setFailure(entityId);});
  return()=>{live=false;};
 },[entityId,catalogue,attempt]);
 const current=page?.id===entityId?page.value:undefined;
 const themes=catalogue?catalogue.filter(t=>t.entityIds.includes(entityId)||Object.hasOwn(t.focusAliases??{},entityId)):current?.themes;
 if(themes?.length===0)return null;
 const en=locale==="en",title=en?"Related themes":"関連するテーマ";
 if(themes)return <ExpandableReadingSection key={entityId} ariaLabel={title} title={title} icon="event" items={themes.map(t=><ThemeLink key={t.id} theme={t} onOpen={onOpen} focusEntityId={t.entityIds.includes(entityId)?entityId:t.focusAliases?.[entityId]??t.entityIds.find(id=>current?.focusIds?.includes(id))}/>)}/>;
 return <ReadingDetailSection ariaLabel={title} title={title} icon="event">{failure===entityId?<button onClick={()=>{setFailure("");retry(v=>v+1);}}>{en?"Retry":"再取得"}</button>:<small role="status">{en?"Loading themes…":"テーマを読み込み中…"}</small>}</ReadingDetailSection>;
}
