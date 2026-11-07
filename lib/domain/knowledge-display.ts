import type {KnowledgeSnapshot} from "./knowledge-foundation";
import {translationTargetKey,type KnowledgeTextTarget,type KnowledgeTranslationVersion} from "./knowledge-translation";

/** Presentation only. Never use the returned text as a new original or a saved snapshot. */
export function knowledgeDisplayText(translations:readonly KnowledgeTranslationVersion[]|undefined,target:KnowledgeTextTarget,locale:string,original:string):string {
  const key=translationTargetKey(target);
  return translations?.find(t=>t.language===locale&&translationTargetKey(t.target)===key&&t.originalText===original)?.text??original;
}

/** The original snapshot and authored overrides remain untouched. Evidence stays in its source language. */
export function knowledgeDisplaySnapshot(snapshot:KnowledgeSnapshot,locale:string):KnowledgeSnapshot {
  const text=(kind:KnowledgeTextTarget["kind"],v:{id:string;revision:number},field:KnowledgeTextTarget["field"],original:string)=>knowledgeDisplayText(snapshot.translations,{kind,id:v.id,revision:v.revision,field},locale,original);
  return {...snapshot,
    entities:snapshot.entities.map(v=>({...v,content:{...v.content,name:text("entity",v,"name",v.content.name)}})),
    records:snapshot.records.map(v=>({...v,content:{...v.content,assertion:text("record",v,"assertion",v.content.assertion),...(v.content.relation?{relation:text("record",v,"relation",v.content.relation)}:{})}})),
    ...(snapshot.theme?{theme:{...snapshot.theme,content:{...snapshot.theme.content,title:text("theme",snapshot.theme,"title",snapshot.theme.content.title),description:text("theme",snapshot.theme,"description",snapshot.theme.content.description)}}}:{}),
  };
}
