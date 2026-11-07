"use client";
import { useEffect, useState } from "react";
import { readKnowledge } from "../lib/client/use-knowledge-workspace";
import type { KnowledgeThemePage } from "../lib/domain/knowledge-theme-reader";
import { useUiLocale } from "../lib/client/ui-locale";
import { ThemeLink, type OpenTheme } from "./ThemeDiscovery";
export default function RelatedThemes({entityId,onOpen}:{entityId:string;onOpen:OpenTheme}) {
 const {locale}=useUiLocale();
 const [page,setPage]=useState<{id:string;value:KnowledgeThemePage}|null>(null);
 useEffect(()=>{let live=true;const read=()=>readKnowledge<KnowledgeThemePage>("themes",{entityId}).then(value=>{if(live)setPage({id:entityId,value});}).catch(()=>{if(live)setPage(null);});void read();const timer=setInterval(()=>void read(),30000);return()=>{live=false;clearInterval(timer);};},[entityId]);
 if(page?.id!==entityId||!page.value.themes.length)return null;
 return <section aria-label={locale==="en"?"Related themes":"この対象のテーマ"}><h3>{locale==="en"?"Related themes":"この対象のテーマ"}</h3>{page.value.themes.map(theme=><ThemeLink key={theme.id} theme={theme} onOpen={onOpen} focusEntityId={theme.entityIds.includes(entityId)?entityId:theme.entityIds.find(id=>page.value.focusIds?.includes(id))}/>)}</section>;
}
