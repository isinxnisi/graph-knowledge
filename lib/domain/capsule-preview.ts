import type { MemberCapsule } from "./member-capsule";
import { capsuleKnowledgeProjection } from "../client/capsule-knowledge";
import { calendarMeaning, themeTimeLabel } from "./theme-time";
import {calendarGraph} from "./calendar-graph";

/** A small, faithful excerpt of one axis. Separate calendars/cycles are never
 * flattened into a fictitious common clock. Endpoints remain visible. */
function timelinePreview(capsule:MemberCapsule) {
  const document=capsule.content.document;
  if(!document?.knowledge || document.knowledge.initialView==="graph")return null;
  const snapshot=capsuleKnowledgeProjection(document)!;
  const insets=new Set(snapshot.timeline?.insets.map(i=>i.axisId));
  const main=snapshot.timeline?.axes.find(a=>!insets.has(a.id));
  const rows=snapshot.records.flatMap(r=>r.content.times.map(t=>({record:r,time:t.time,timeId:t.id})));
  const placements=snapshot.timeline?.placements??[];
  const candidates=rows.filter(row=>main?placements.some(p=>p.recordId===row.record.id&&p.timeId===row.timeId&&p.axisId===main.id):row.time.kind==="calendar");
  const order=main?.kind==="qualitative"?main.order:undefined;
  const compare=(a:string,b:string)=>order?order.indexOf(a)-order.indexOf(b):main?.kind==="cycle"?Number(a)-Number(b):a.localeCompare(b);
  const selected=candidates.slice().sort((a,b)=>compare(String(a.time.from),String(b.time.from))).slice(0,4);

  const rowId=(row:typeof selected[number])=>JSON.stringify([row.record.id,row.timeId]);
  const calendar=(!main||main.kind==="calendar")?calendarGraph(selected.map(row=>({id:rowId(row),time:row.time}))):null;
  const keys=[...new Set(selected.flatMap(r=>[String(r.time.from),String(r.time.to??r.time.from),...(r.time.kind==="cycle"&&r.time.wrap?["0",String(r.time.period)]:[])]))].sort(compare);
  const y=(index:number,count:number)=>76+index/Math.max(1,count-1)*340;
  const ranges=new Map(calendar?.ranges.map(r=>[r.record.id,r]));
  const ticks=calendar?calendar.slices.map((s,i)=>({label:s.label,y:y(i,calendar.slices.length)})):keys.map((key,i)=>({label:key,y:y(i,keys.length)}));
  return {axis:main?.label??"年月日・期間",total:rows.length,untimed:snapshot.records.filter(r=>!r.content.times.length).length,ticks,
    items:selected.map((row,i)=>{
      const range=ranges.get(rowId(row)),position=(key:string)=>y(keys.indexOf(key),keys.length);
      const start=range?y(range.startRow,calendar!.slices.length):position(String(row.time.from));
      const end=range?y(range.endRow,calendar!.slices.length):position(String(row.time.to??row.time.from));
      return {id:rowId(row),title:row.record.content.assertion,label:themeTimeLabel(row.time),
        meaning:row.time.kind==="calendar"?calendarMeaning(row.time):row.time.to!==undefined?"duration":"point",x:154+i*16,y:start,end,
        startLatest:range&&range.startEnd!==range.start?y(range.startEndRow,calendar!.slices.length):undefined,
        endEarliest:range&&range.endStart!==range.end?y(range.endStartRow,calendar!.slices.length):undefined,
        wrap:row.time.kind==="cycle"&&row.time.wrap};
    }),
  };
}
export function capsulePreviewModel(capsule:MemberCapsule) {
  const document=capsule.content.document;
  const degree=new Map<string,number>();
  for(const edge of document?.relations??[]) for(const key of [edge.source,edge.target]) degree.set(key,(degree.get(key)??0)+1);
  const ranked=[...(document?.nodes??[])].sort((a,b)=>(degree.get(b.key)??0)-(degree.get(a.key)??0)||a.key.localeCompare(b.key));
  const chosen=ranked.slice(0,1);
  while(chosen.length<7 && chosen.length<ranked.length){
    const keys=new Set(chosen.map(n=>n.key));
    const next=ranked.find(n=>!keys.has(n.key)&&(document?.relations??[]).some(e=>e.source===n.key&&keys.has(e.target)||e.target===n.key&&keys.has(e.source)))??ranked.find(n=>!keys.has(n.key));
    if(!next)break;chosen.push(next);
  }
  // Keep a star's focal entity at the center. For multi-center diagrams,
  // leave the center empty so an outer-to-outer edge cannot hide behind an
  // unrelated central node and imply a connection that does not exist.
  const chosenKeys=new Set(chosen.map(n=>n.key));
  const star=(document?.relations??[]).filter(e=>chosenKeys.has(e.source)&&chosenKeys.has(e.target)).every(e=>e.source===chosen[0]?.key||e.target===chosen[0]?.key);
  const nodes=chosen.map((n,i)=>{
    const centered=chosen.length===1||star&&i===0;
    const angle=(star?i-1:i)/Math.max(1,chosen.length-(star?1:0))*Math.PI*2-Math.PI/2;
    return {...n,x:centered?300:300+205*Math.cos(angle),y:centered?245:245+180*Math.sin(angle)};
  });
  const keys=new Set(nodes.map(n=>n.key));
  // Multiple Claims may form the same visible connection; retain only actual endpoints.
  const seen=new Set<string>();
  const edges=(document?.relations??[]).filter(e=>{const k=e.source+":"+e.target;if(!keys.has(e.source)||!keys.has(e.target)||seen.has(k))return false;seen.add(k);return true;});
  const timeline=timelinePreview(capsule);
  return {title:capsule.content.title,description:capsule.content.note.trim()||document?.texts.find(t=>t.text.trim())?.text.trim()||"",timeline,nodes,edges,totalNodes:document?.nodes.length??capsule.content.entityIds.length,totalRelations:document?.relations.length??capsule.content.claimIds.length};
}
export function previewExcerpt(text:string,length:number){const letters=Array.from(text.replace(/\s+/g," ").trim());return letters.slice(0,length).join("")+(letters.length>length?"…":"");}
