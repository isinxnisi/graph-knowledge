import type {KnowledgeTimeline,KnowledgeRecordContent} from "./knowledge-foundation";

type Annotation=KnowledgeRecordContent["times"][number];
type Timed={id:string;content:{times:Annotation[]}};
/** New time annotations join compatible root axes. An overlap never creates nesting. */
export function appendKnowledgeTimelineRecord(input:KnowledgeTimeline,recordId:string,times:Annotation[],before:Timed[],signature:(value:unknown)=>string):KnowledgeTimeline{
 const timeline=structuredClone(input),oldPlacements=timeline.placements.filter(p=>p.recordId===recordId);
 timeline.placements=timeline.placements.filter(p=>p.recordId!==recordId);
 const annotations=new Map(before.flatMap(r=>r.content.times.map(t=>[JSON.stringify([r.id,t.id]),t.time] as const)));
 for(const t of times)annotations.set(JSON.stringify([recordId,t.id]),t.time);
 const nested=new Set(timeline.insets.map(i=>i.axisId));
 const compatible=(axis:KnowledgeTimeline["axes"][number],t:Annotation["time"])=>{
  if(axis.kind!==t.kind)return false;
  if(t.kind==="calendar")return true;
  if(axis.label!==t.axis.slice(0,200))return false;
  const assigned=timeline.placements.filter(p=>p.axisId===axis.id).map(p=>annotations.get(JSON.stringify([p.recordId,p.timeId]))).filter(v=>v!==undefined);
  if(t.kind==="cycle")return assigned.every(v=>v.kind==="cycle"&&v.axis===t.axis&&v.period===t.period&&v.unit===t.unit);
  if(assigned.some(v=>v.kind!=="qualitative"||v.axis!==t.axis||v.coordinateMeaning!==t.coordinateMeaning))return false;
  return !axis.order||axis.order.includes(t.from)&&(!t.to||axis.order.includes(t.to)&&axis.order.indexOf(t.from)<=axis.order.indexOf(t.to));
 };
 for(const annotation of times){
  const t=annotation.time,old=oldPlacements.find(p=>p.timeId===annotation.id);
  let axis=old?timeline.axes.find(a=>a.id===old.axisId&&compatible(a,t)):undefined;
  axis??=timeline.axes.find(a=>!nested.has(a.id)&&compatible(a,t));
  if(!axis&&timeline.axes.length<32){
   const base="submission-axis:"+signature(t.kind==="calendar"?{kind:t.kind}:{kind:t.kind,axis:t.axis,...(t.kind==="cycle"?{period:t.period,unit:t.unit}:{coordinateMeaning:t.coordinateMeaning,order:[t.from,...(t.to&&t.to!==t.from?[t.to]:[])]})}).slice(0,24);
   let id=base,copy=1;while(timeline.axes.some(a=>a.id===id))id=base+":"+copy++;
   axis={id,kind:t.kind,label:t.kind==="calendar"?"年月日・期間":t.axis.slice(0,200),...(t.kind==="qualitative"?{order:[t.from,...(t.to&&t.to!==t.from?[t.to]:[])]}:{})};
   timeline.axes.push(axis);
  }
  // At the explicit layout limit, the reader's fallback groups still show it.
  if(axis&&timeline.placements.length<400)timeline.placements.push({recordId,timeId:annotation.id,axisId:axis.id});
 }
 return timeline;
}
