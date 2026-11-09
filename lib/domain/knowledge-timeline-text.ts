import type {KnowledgeRecordVersion,KnowledgeThemeVersion} from "./knowledge-foundation";
import type {KnowledgeTextTarget} from "./knowledge-translation";

/** Select stable authored prose, never a date/numeric coordinate or an arbitrary JSON path. */
export function recordTimeTextTargets(record:KnowledgeRecordVersion):KnowledgeTextTarget[]{
 return record.content.times.flatMap(({id:timeId,time})=>{
  const fields:KnowledgeTextTarget["field"][]=[];
  if(time.label)fields.push("timeLabel");
  if(time.kind!=="calendar")fields.push("timeAxis");
  if(time.kind==="cycle")fields.push("timeUnit");
  if(time.kind==="qualitative")fields.push("timeCoordinateMeaning","timeFrom",...(time.to?["timeTo" as const]:[]));
  return fields.map(field=>({kind:"record",id:record.id,revision:record.revision,timeId,field}));
 });
}
export function themeTimelineTextTargets(theme:KnowledgeThemeVersion):KnowledgeTextTarget[]{
 return [
  ...(theme.content.timeline?.axes.flatMap(axis=>["axisLabel" as const,...(axis.originLabel?["axisOriginLabel" as const]:[])].map(field=>({kind:"theme" as const,id:theme.id,revision:theme.revision,field,axisId:axis.id})))??[]),
  ...(theme.content.timeline?.insets.map(inset=>({kind:"theme" as const,id:theme.id,revision:theme.revision,field:"insetLabel" as const,axisId:inset.axisId}))??[]),
 ];
}

export function timelineTextFieldLabel(target:KnowledgeTextTarget,en:boolean):string{
 const labels:Partial<Record<KnowledgeTextTarget["field"],[string,string]>>={timeLabel:["時期の補足","Time label"],timeAxis:["時期の軸名","Time axis"],timeUnit:["周期の単位","Cycle unit"],timeCoordinateMeaning:["段階の意味","Stage meaning"],timeFrom:["開始の段階","Start stage"],timeTo:["終了の段階","End stage"],axisLabel:["年表の見出し","Timeline heading"],axisOriginLabel:["軸の説明","Axis description"],insetLabel:["子軸の見出し","Child timeline heading"]};
 return (labels[target.field]?.[en?1:0]??target.field)+" · "+(target.timeId??target.axisId??"");
}
