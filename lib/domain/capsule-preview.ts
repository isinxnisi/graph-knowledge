import type { MemberCapsule } from "./member-capsule";
import { capsuleKnowledgeProjection } from "../client/capsule-knowledge";
import { calendarMeaning, themeTimeLabel } from "./theme-time";

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
  const selected=candidates.slice().sort((a,b)=>String(a.time.from).localeCompare(String(b.time.from))).slice(0,4);
  const order=main?.kind==="qualitative"?main.order:undefined;
  const keys=[...new Set(selected.flatMap(r=>[String(r.time.from),String(r.time.to??r.time.from)]))].sort((a,b)=>order?order.indexOf(a)-order.indexOf(b):main?.kind==="cycle"?Number(a)-Number(b):a.localeCompare(b));
  const y=(key:string)=>76+(keys.indexOf(key)/Math.max(1,keys.length-1))*340;
  return {axis:main?.label??"年月日・期間",total:rows.length,untimed:snapshot.records.filter(r=>!r.content.times.length).length,
    ticks:keys.map(key=>({label:key,y:y(key)})),
    items:selected.map((row,i)=>({id:row.record.id+":"+row.timeId,title:row.record.content.assertion,label:themeTimeLabel(row.time),
      meaning:row.time.kind==="calendar"?calendarMeaning(row.time):row.time.to!==undefined?"duration":"point",
      x:154+i*16,y:y(String(row.time.from)),end:y(String(row.time.to??row.time.from))})),
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
