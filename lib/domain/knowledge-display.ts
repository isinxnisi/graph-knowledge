import type {ThemeTime} from "./theme-workbench";
import type {KnowledgeRecordVersion,KnowledgeThemeVersion,KnowledgeTimeline} from "./knowledge-foundation";
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
  const timeline=snapshot.theme?knowledgeDisplayTimeline(snapshot.timeline,snapshot.theme,snapshot.translations,locale):snapshot.timeline;
  return {...snapshot,...(timeline?{timeline}:{}),
    entities:snapshot.entities.map(v=>({...v,content:{...v.content,name:text("entity",v,"name",v.content.name)}})),
    records:snapshot.records.map(v=>({...v,content:{...v.content,assertion:text("record",v,"assertion",v.content.assertion),scope:text("record",v,"scope",v.content.scope),...(v.content.relation?{relation:text("record",v,"relation",v.content.relation)}:{})}})),
    ...(snapshot.theme?{theme:{...snapshot.theme,content:{...snapshot.theme.content,title:text("theme",snapshot.theme,"title",snapshot.theme.content.title),description:text("theme",snapshot.theme,"description",snapshot.theme.content.description)}}}:{}),
  };
}

/** Display-only copies. Coordinates used for grouping/order/period geometry stay raw. */
export function knowledgeDisplayTime(record:KnowledgeRecordVersion,timeId:string,translations:readonly KnowledgeTranslationVersion[]|undefined,locale:string):ThemeTime{
 const time=record.content.times.find(t=>t.id===timeId)!.time;
 const text=(field:KnowledgeTextTarget["field"],original:string)=>knowledgeDisplayText(translations,{kind:"record",id:record.id,revision:record.revision,timeId,field},locale,original);
 return {...time,label:text("timeLabel",time.label),...(time.kind!=="calendar"?{axis:text("timeAxis",time.axis)}:{}),
  ...(time.kind==="cycle"?{unit:text("timeUnit",time.unit)}:{}),
  ...(time.kind==="qualitative"?{from:text("timeFrom",time.from),...(time.to?{to:text("timeTo",time.to)}:{}),coordinateMeaning:text("timeCoordinateMeaning",time.coordinateMeaning)}:{})} as ThemeTime;
}
export function knowledgeDisplayTimeline(timeline:KnowledgeTimeline|undefined,theme:KnowledgeThemeVersion,translations:readonly KnowledgeTranslationVersion[]|undefined,locale:string):KnowledgeTimeline|undefined{
 if(!timeline)return timeline;
 const text=(field:KnowledgeTextTarget["field"],axisId:string,original:string)=>knowledgeDisplayText(translations,{kind:"theme",id:theme.id,revision:theme.revision,axisId,field},locale,original);
 return {...timeline,axes:timeline.axes.map(a=>({...a,label:text("axisLabel",a.id,a.label),...(a.originLabel?{originLabel:text("axisOriginLabel",a.id,a.originLabel)}:{})})),insets:timeline.insets.map(i=>({...i,label:text("insetLabel",i.axisId,i.label)}))};
}
