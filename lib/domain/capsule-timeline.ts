import type {CapsuleDocument} from "./capsule-document";
import type {KnowledgeRecordVersion,KnowledgeTimeline} from "./knowledge-foundation";
export function capsuleTimeRecords(document:CapsuleDocument):KnowledgeRecordVersion[]{
 const baseline=document.knowledge?.snapshot.records??[];
 const records=baseline.filter(r=>!document.knowledge?.excludedRecordIds?.includes(r.id)).flatMap(r=>{if(r.content.kind!=="relation")return [r];const authored=document.relations.find(a=>a.origin.kind==="knowledge"&&a.origin.id===r.id);return authored?[{...r,content:{...r.content,times:authored.times??r.content.times}}]:[];});
 for(const relation of document.relations.filter(r=>r.origin.kind!=="knowledge"))records.push({id:"capsule-relation:"+relation.key,revision:1,createdAt:document.knowledge?.capturedAt??"",reason:"Capsule",content:{kind:"relation",subjectId:relation.source,objectId:relation.target,assertion:relation.note||relation.label||"関係",relation:relation.label,scope:"",polarity:"affirmed",times:relation.times??[],evidence:[]}});
 return records;
}
/** Removing a time removes its layout reference too; no replacement is guessed. */
export function pruneCapsuleTimeline(document:CapsuleDocument,timeline:KnowledgeTimeline):KnowledgeTimeline{
 const rows=new Map(capsuleTimeRecords(document).map(r=>[r.id,r]));
 return {...timeline,placements:timeline.placements.filter(p=>rows.get(p.recordId)?.content.times.some(t=>t.id===p.timeId&&timeline.axes.some(a=>a.id===p.axisId&&a.kind===t.time.kind))),insets:timeline.insets.filter(i=>rows.has(i.parentRecordId)&&(!i.parentTimeId||rows.get(i.parentRecordId)!.content.times.some(t=>t.id===i.parentTimeId)))};
}
