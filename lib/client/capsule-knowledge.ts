import type { GraphView } from "./graph-view";
import type { KnowledgeSnapshot, KnowledgeThemeResolved } from "../domain/knowledge-foundation";
import { capsuleSchema, type LocalCapsule } from "./local-capsules";
import { capsuleDocumentSchema, type CapsuleDocument } from "../domain/capsule-document";


/** Capture exactly the already-read edition. The editor never fetches a newer source implicitly. */
export function captureKnowledgeCapsule(input: {snapshot:KnowledgeSnapshot;theme?:KnowledgeThemeResolved["theme"];title:string;graphView?:GraphView|null;view?:"graph"|"timeline"|"split"}):LocalCapsule {
 const snapshot=structuredClone(input.snapshot),capturedAt=new Date().toISOString();
 const used=new Set(snapshot.records.filter(r=>r.content.kind==="relation").flatMap(r=>[r.content.subjectId,r.content.objectId]));
 const keys=new Map(snapshot.entities.map(e=>[e.id,crypto.randomUUID()]));
 const nodes=snapshot.entities.filter(e=>used.has(e.id)).map(e=>({key:keys.get(e.id)!,title:e.content.name,description:e.content.description,badge:e.content.kind,shape:e.content.kind==="人物"||e.content.kind==="person"?"circle" as const:undefined,origin:{kind:"knowledge" as const,id:e.id,revision:e.revision}}));
 const relations=snapshot.records.filter(r=>r.content.kind==="relation").map(r=>({key:crypto.randomUUID(),source:keys.get(r.content.subjectId!)!,target:keys.get(r.content.objectId!)!,label:r.content.relation,note:r.content.assertion,origin:{kind:"knowledge" as const,id:r.id,revision:r.revision}}));
 const initialView=input.view??snapshot.initialView;
 const document=capsuleDocumentSchema.parse({schemaVersion:1,nodes,relations,texts:[],evidence:[],unresolvedClaimIds:[],layout:{positions:Object.fromEntries(nodes.flatMap(n=>{const original=n.origin.id,p=input.graphView?.positions[original];return p?[[n.key,p]]:[];})),pan:input.graphView?.pan??{x:0,y:0},zoom:input.graphView?.zoom??1,...(input.graphView?.center?{center:input.graphView.center}:{}),...(input.graphView?.viewport?{viewport:input.graphView.viewport}:{})},knowledge:{schemaVersion:1,capturedAt,...(input.theme?{theme:{id:input.theme.id,revision:input.theme.revision}}:{}),snapshot,initialView}});
 return capsuleSchema.parse({id:crypto.randomUUID(),dataset:"public-kg",revision:1,title:input.title.slice(0,80),note:input.theme?.content.description??"",language:"ja",createdAt:capturedAt,entityIds:[],claimIds:[],document});
}
/** Presentation overlays are separate from the immutable baseline and source evidence. */
export function capsuleKnowledgeProjection(document:CapsuleDocument):KnowledgeSnapshot|null {
 const base=document.knowledge?.snapshot;if(!base)return null;
 const result=structuredClone(base);
 for(const e of result.entities){const node=document.nodes.find(n=>n.origin.kind==="knowledge"&&n.origin.id===e.id);if(node)e.content={...e.content,name:node.title,description:node.description};}
 result.records=result.records.flatMap(record=>{
  if(record.content.kind!=="relation")return [record];
  const relation=document.relations.find(r=>r.origin.kind==="knowledge"&&r.origin.id===record.id);
  if(!relation)return [];
  return [{...record,content:{...record.content,relation:relation.label,assertion:relation.note||record.content.assertion}}];
 });
 // Local additions are content too; without a time they remain in the information section.
 const entityId=(key:string)=>{const n=document.nodes.find(n=>n.key===key);return n?.origin.kind==="knowledge"?n.origin.id:"capsule-node:"+key;};
 for(const n of document.nodes.filter(n=>n.origin.kind!=="knowledge"))result.entities.push({id:entityId(n.key),revision:1,createdAt:document.knowledge!.capturedAt,reason:"Capsule内の独自編集",content:{name:n.title,description:n.description,kind:n.badge||"対象",aliases:[],language:"ja"}});
 for(const relation of document.relations.filter(r=>r.origin.kind==="local"))result.records.push({id:"capsule-relation:"+relation.key,revision:1,createdAt:document.knowledge!.capturedAt,reason:"Capsule内の独自編集",content:{kind:"relation",subjectId:entityId(relation.source),objectId:entityId(relation.target),assertion:relation.note||relation.label||"関係する",relation:relation.label||"関係する",polarity:relation.origin.kind==="local"?relation.origin.polarity??"affirmed":"affirmed",scope:"",times:[],evidence:[]}});
 if(result.timeline){const ids=new Set(result.records.map(r=>r.id));result.timeline={...result.timeline,placements:result.timeline.placements.filter(p=>ids.has(p.recordId)),insets:result.timeline.insets.filter(p=>ids.has(p.parentRecordId))};}
 return result;
}
