import {pruneCapsuleTimeline} from "../domain/capsule-timeline";
import { capsuleDocumentSchema, type CapsuleDocument, type CapsuleRelation } from "../domain/capsule-document";
import type { KnowledgeRecordVersion } from "../domain/knowledge-foundation";
import { sameUpdateValue, type CapsuleUpdateResponse } from "../domain/capsule-updates";
import type {KnowledgeTranslationVersion} from "../domain/knowledge-translation";

export type UpdateChange = { kind:"record"|"entity"|"source"|"mapping"|"theme"|"translation"; id:string; title:string; before:unknown; after:unknown; beforeRevision?:number; afterRevision?:number };
export const translationSlot=(v:KnowledgeTranslationVersion)=>JSON.stringify([v.target.kind,v.target.id,v.target.field,v.target.evidenceId??null,v.target.aliasIndex??null,v.language]);
export type CapsuleUpdatePlan = { document:CapsuleDocument; changes:UpdateChange[]; preserved:number; excluded:number; retained:string[] };
const pinKey=(v:{id:string;revision:number})=>JSON.stringify([v.id,v.revision]);
const authoredRelation=(doc:CapsuleDocument,r:CapsuleRelation,base:KnowledgeRecordVersion)=>r.label!==base.content.relation||r.note!==base.content.assertion||r.times!==undefined||doc.evidence.some(e=>e.targetKey===r.key);

/** A three-way import into a draft. It never saves, publishes or mutates the observed edition. */
export function planCapsuleKnowledgeUpdate(document:CapsuleDocument,response:CapsuleUpdateResponse,includeTheme=false,translationIds:readonly string[]=[]):CapsuleUpdatePlan {
 if(!document.knowledge||response.unavailable.length)throw Error("取得元を確認できないため取り込めません");
 if(includeTheme&&(!response.theme||response.theme.id!==document.knowledge.theme?.id))throw Error("テーマが一致しません");
 const doc=structuredClone(document),attachment=doc.knowledge!,old=attachment.snapshot,candidate=structuredClone(response.snapshot);
 if(!includeTheme&&old.theme)candidate.theme=structuredClone(old.theme);
 const changes:UpdateChange[]=[],retained:string[]=[];let preserved=0;
 const groups=["records","entities","sources","mappings"] as const;
 for(const group of groups){
  const kind=({records:"record",entities:"entity",sources:"source",mappings:"mapping"} as const)[group];
  const before=old[group],after=candidate[group];
  // Theme membership is independent of old records deliberately retained by the author.
  const membership=includeTheme&&group==="records"?new Set(attachment.themeRecordIds??old.records.map(r=>r.id)):null;
  const ids=new Set([...(group==="records"?before.filter(r=>!membership||membership.has(r.id)).map(r=>r.id):[]),...after.map(r=>r.id)]);
  for(const id of ids){
   const a=before.filter(r=>r.id===id&&(!membership||membership.has(r.id))),b=after.filter(r=>r.id===id);
   if(sameUpdateValue(a,b))continue;
   const first=b[0]??a[0],content=first?.content;
   const title=content&&("assertion" in content?content.assertion:"name" in content?content.name:"title" in content?content.title:id);
   changes.push({kind,id,title:String(title??id),before:a.length?a.map(r=>r.content):null,after:b.length?b.map(r=>r.content):null,beforeRevision:a[0]?.revision,afterRevision:b[0]?.revision});
  }
 }
 if(includeTheme&&response.theme){candidate.theme=structuredClone(response.theme);if(attachment.theme?.revision!==response.theme.revision)changes.unshift({kind:"theme",id:response.theme.id,title:response.theme.content.title,before:old.theme?.content??attachment.theme?.revision,after:response.theme.content,beforeRevision:attachment.theme?.revision,afterRevision:response.theme.revision});}
 const oldRecords=new Map(old.records.map(r=>[r.id,r])),newRecords=new Map(candidate.records.map(r=>[r.id,r]));
 const excluded=new Set(attachment.excludedRecordIds??[]);
 for(const r of old.records)if(r.content.kind==="relation"&&!doc.relations.some(e=>e.origin.kind==="knowledge"&&e.origin.id===r.id))excluded.add(r.id);
 // Keep authored relations if a Theme removes them. Otherwise honor the explicit membership import.
 const removedKeys=new Set<string>();
 for(const r of doc.relations){
  if(r.origin.kind!=="knowledge")continue;
  const baseline=oldRecords.get(r.origin.id)!,next=newRecords.get(r.origin.id);
  if(!next||next.content.kind!=="relation"){
   if(authoredRelation(doc,r,baseline)){retained.push(baseline.id);preserved++;newRecords.set(baseline.id,baseline);}
   else removedKeys.add(r.key);
  }
 }
 doc.relations=doc.relations.filter(r=>!removedKeys.has(r.key));
 doc.evidence=doc.evidence.filter(e=>!removedKeys.has(e.targetKey));
 candidate.records=[...newRecords.values()];
 // Preserve node keys, geometry and all authored fields. Source fields update only when untouched.
 for(const node of doc.nodes){
  if(node.origin.kind!=="knowledge")continue;
  const id=node.origin.id,baseline=old.entities.find(e=>e.id===id),next=candidate.entities.find(e=>e.id===id);
  if(!next){if(baseline)candidate.entities.push(baseline);continue;}
  if(baseline)for(const [field,source] of [["title","name"],["description","description"],["badge","kind"]] as const){
   if(node[field]===baseline.content[source])node[field]=next.content[source];else preserved++;
  }
  node.origin.revision=next.revision;
 }
 const ensureNode=(id:string)=>{
  const existing=doc.nodes.find(n=>n.origin.kind==="knowledge"&&n.origin.id===id);if(existing)return existing.key;
  const e=candidate.entities.find(e=>e.id===id);if(!e)throw Error("関係先が欠けています");
  const key=crypto.randomUUID();doc.nodes.push({key,title:e.content.name,description:e.content.description,badge:e.content.kind,shape:e.content.kind==="人物"||e.content.kind==="person"?"circle":undefined,origin:{kind:"knowledge",id:e.id,revision:e.revision}});return key;
 };
 for(const next of candidate.records){
  if(next.content.kind!=="relation"||excluded.has(next.id))continue;
  const existing=doc.relations.find(r=>r.origin.kind==="knowledge"&&r.origin.id===next.id),baseline=oldRecords.get(next.id);
  // A removed relation is not resurrected by updating the source, even after a kind change.
  if(!existing&&baseline?.content.kind==="relation")continue;
  const source=ensureNode(next.content.subjectId!),target=ensureNode(next.content.objectId!);
  if(existing){
   if(baseline){for(const [field,sourceField] of [["label","relation"],["note","assertion"]] as const){if(existing[field]===baseline.content[sourceField])existing[field]=next.content[sourceField];else preserved++;}}
   if(existing.times!==undefined)preserved++;
   existing.source=source;existing.target=target;existing.origin={kind:"knowledge",id:next.id,revision:next.revision};
  }else doc.relations.push({key:crypto.randomUUID(),source,target,label:next.content.relation,note:next.content.assertion,origin:{kind:"knowledge",id:next.id,revision:next.revision}});
 }
 // Retained records still cite their exact editions, even when the same source has newer editions.
 for(const record of candidate.records)for(const cite of record.content.evidence)if(!candidate.sources.some(s=>pinKey(s)===pinKey(cite.source))){const source=old.sources.find(s=>pinKey(s)===pinKey(cite.source));if(source)candidate.sources.push(source);}
 for(const record of candidate.records)for(const id of [record.content.subjectId,record.content.objectId].filter(Boolean))if(!candidate.entities.some(e=>e.id===id)){const e=old.entities.find(e=>e.id===id);if(e)candidate.entities.push(e);}
 const timeline=includeTheme?candidate.timeline:structuredClone(old.timeline);
 if(timeline){
  timeline.placements=timeline.placements.filter(p=>candidate.records.some(r=>r.id===p.recordId&&r.content.times.some(t=>t.id===p.timeId&&timeline.axes.some(a=>a.id===p.axisId&&a.kind===t.time.kind))));
  timeline.insets=timeline.insets.filter(p=>candidate.records.some(r=>r.id===p.parentRecordId)&&timeline.axes.some(a=>a.id===p.axisId));
 }
 const hasOriginal=(t:KnowledgeTranslationVersion)=>(t.target.kind==='record'?candidate.records:t.target.kind==='entity'?candidate.entities:t.target.kind==='source'?candidate.sources:candidate.theme?[candidate.theme]:[]).some(v=>v.id===t.target.id&&v.revision===t.target.revision);
 const previous=old.translations??[],offered=candidate.translations??[];
 for(const a of previous){const b=offered.find(v=>translationSlot(v)===translationSlot(a)&&hasOriginal(v));if(b?.id===a.id&&b.revision===a.revision)continue;if(!b&&hasOriginal(a)&&!response.translationsChecked)continue;changes.push({kind:"translation",id:b?.id??a.id,title:`${a.language} · ${a.target.field}`,before:a.text,after:b?.text??null,beforeRevision:a.revision,afterRevision:b?.revision});}
 candidate.translations=previous.filter(t=>hasOriginal(t)&&(!response.translationsChecked||offered.some(v=>translationSlot(v)===translationSlot(t)))&&!offered.some(v=>translationSlot(v)===translationSlot(t)&&translationIds.includes(v.id))).concat(offered.filter(t=>hasOriginal(t)&&translationIds.includes(t.id)));
 candidate.translations=[...new Map(candidate.translations.map(t=>[t.id,t])).values()];
 attachment.snapshot={...candidate,initialView:old.initialView,...(timeline?{timeline}:{})};
 attachment.capturedAt=new Date().toISOString();
 attachment.excludedRecordIds=[...excluded];
 if(includeTheme&&response.theme){attachment.theme={id:response.theme.id,revision:response.theme.revision};attachment.themeRecordIds=response.snapshot.records.map(r=>r.id);}
 if(attachment.timeline)attachment.timeline=pruneCapsuleTimeline(doc,attachment.timeline);
 return {document:capsuleDocumentSchema.parse(doc),changes,preserved,excluded:excluded.size,retained};
}

/** Do not compare generation IDs: an unrelated publication must not invalidate this preview. */
export function sameCapsuleUpdate(a:CapsuleUpdateResponse,b:CapsuleUpdateResponse){return sameUpdateValue({snapshot:a.snapshot,theme:a.theme,unavailable:a.unavailable,translationsChecked:a.translationsChecked},{snapshot:b.snapshot,theme:b.theme,unavailable:b.unavailable,translationsChecked:b.translationsChecked});}
