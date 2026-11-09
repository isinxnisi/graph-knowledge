"use client";
import {useEffect,useState} from "react";
import type {KnowledgeEntityVersion,KnowledgeRecordVersion,KnowledgeThemeVersion} from "../domain/knowledge-foundation";
import {knowledgeDisplayTranslationSchema,translationTargetKey,type KnowledgeTextTarget,type KnowledgeDisplayTranslation} from "../domain/knowledge-translation";

import {recordTimeTextTargets,themeTimelineTextTargets} from "../domain/knowledge-timeline-text";

const empty:readonly KnowledgeDisplayTranslation[]=Object.freeze([]);
export function useKnowledgeDisplayTranslations(entities:KnowledgeEntityVersion[],records:KnowledgeRecordVersion[],theme:KnowledgeThemeVersion|undefined,language:string,enabled=true):readonly KnowledgeDisplayTranslation[]{
 const targets:KnowledgeTextTarget[]=[
  ...records.flatMap(recordTimeTextTargets),...(theme?themeTimelineTextTargets(theme):[]),
  ...entities.flatMap(e=>[{kind:"entity" as const,id:e.id,revision:e.revision,field:"name" as const},...(e.content.description?[{kind:"entity" as const,id:e.id,revision:e.revision,field:"description" as const}]:[])]),
  ...records.flatMap(r=>[{kind:"record" as const,id:r.id,revision:r.revision,field:"assertion" as const},...(r.content.relation?[{kind:"record" as const,id:r.id,revision:r.revision,field:"relation" as const}]:[]),...(r.content.scope?[{kind:"record" as const,id:r.id,revision:r.revision,field:"scope" as const}]:[])]),
  ...(theme?[{kind:"theme" as const,id:theme.id,revision:theme.revision,field:"title" as const},...(theme.content.description?[{kind:"theme" as const,id:theme.id,revision:theme.revision,field:"description" as const}]:[])]:[]),
 ];
 const key=JSON.stringify({language,targets:[...new Map(targets.map(t=>[translationTargetKey(t),t])).values()].sort((a,b)=>translationTargetKey(a).localeCompare(translationTargetKey(b)))});
 const [loaded,setLoaded]=useState<{key:string;translations:readonly KnowledgeDisplayTranslation[]}>({key:"",translations:empty});
 useEffect(()=>{
  const controller=new AbortController(),query=JSON.parse(key) as {language:string;targets:KnowledgeTextTarget[]};
  if(!enabled||!query.targets.length)return;
  void (async()=>{try{
   const translations:KnowledgeDisplayTranslation[]=[];
   for(let i=0;i<query.targets.length;i+=100){
    const response=await fetch('/api/knowledge/translations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:query.language,targets:query.targets.slice(i,i+100)}),cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
    if(!response.ok)throw Error('Translation display unavailable');
    const value=await response.json();translations.push(...knowledgeDisplayTranslationSchema.array().parse(value.translations));
   }
   if(!controller.signal.aborted)setLoaded({key,translations});
  }catch{/* Originals remain usable when optional translations cannot be read. */}})();
  return()=>controller.abort();
 },[key,enabled]);
 return loaded.key===key?loaded.translations:empty;
}
