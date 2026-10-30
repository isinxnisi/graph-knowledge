import type { MemberCapsule } from "./member-capsule";
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
  return {title:capsule.content.title,description:capsule.content.note.trim()||document?.texts.find(t=>t.text.trim())?.text.trim()||"",nodes,edges,totalNodes:document?.nodes.length??capsule.content.entityIds.length,totalRelations:document?.relations.length??capsule.content.claimIds.length};
}
export function previewExcerpt(text:string,length:number){const letters=Array.from(text.replace(/\s+/g," ").trim());return letters.slice(0,length).join("")+(letters.length>length?"…":"");}
