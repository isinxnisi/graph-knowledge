import type { MemberCapsule } from "./member-capsule";
import { knowledgeSubmissionContentSchema } from "./knowledge-submission";
import { capsuleKnowledgeProjection, withCapsuleTimeline } from "../client/capsule-knowledge";

export function capsuleSubmissionMaterial(capsule: MemberCapsule) {
 const doc=capsule.content.document;
 if(!doc)return null;
 return capsuleKnowledgeProjection(withCapsuleTimeline(doc));
}
export function capsuleSubmissionCandidates(capsule: MemberCapsule) {
 const snapshot=capsuleSubmissionMaterial(capsule);
 return (snapshot?.records??[]).map(r=>({key:r.id,assertion:r.content.assertion,kind:r.content.kind,evidenceCount:r.content.evidence.length+(capsule.content.document?.relations.filter(rel=>(rel.origin.kind==="knowledge"?rel.origin.id:"capsule-relation:"+rel.key)===r.id).reduce((n,rel)=>n+(rel.origin.kind==="kg"?rel.origin.detail?.citations.length??0:0)+(capsule.content.document?.evidence.filter(e=>e.targetKey===rel.key&&e.locator.trim()).length??0),0)??0),
  subject:snapshot?.entities.find(e=>e.id===r.content.subjectId)?.content.name??null,
  object:snapshot?.entities.find(e=>e.id===r.content.objectId)?.content.name??null}));
}
/** Called only after server ownership, current revision and row locks. Capture
 * the selected material, never unselected private notes or a client snapshot.
 */
export function captureSubmissionCapsule(capsule: MemberCapsule, keys: string[]) {
 const snapshot=capsuleSubmissionMaterial(capsule),doc=capsule.content.document;
 if(!snapshot||!doc||new Set(keys).size!==keys.length)throw new Error("CAPSULE_SELECTION_UNAVAILABLE");
 const records=snapshot.records.filter(r=>keys.includes(r.id));
 if(records.length!==keys.length||!records.length)throw new Error("CAPSULE_SELECTION_UNAVAILABLE");
 const entityIds=new Set(records.flatMap(r=>[r.content.subjectId,r.content.objectId]).filter(Boolean));
 const entities=snapshot.entities.filter(e=>entityIds.has(e.id));
 const existing=entities.filter(e=>doc.knowledge?.snapshot.entities.some(base=>base.id===e.id));
 const newEntities=entities.filter(e=>!existing.some(base=>base.id===e.id));
 const sourcePins=records.flatMap(r=>r.content.evidence.map(e=>e.source)).filter((p,i,a)=>a.findIndex(q=>q.id===p.id&&q.revision===p.revision)===i);
 const selectedRelations=doc.relations.filter(r=>keys.includes(r.origin.kind==="knowledge"?r.origin.id:"capsule-relation:"+r.key));
 const nodeKeys=new Set(selectedRelations.flatMap(r=>[r.source,r.target]));
 const manual=doc.evidence.filter(e=>selectedRelations.some(r=>r.key===e.targetKey));
 const sources=manual.filter(e=>e.locator.trim()).map(e=>({id:"submission-source:"+e.key,content:{title:e.title,url:e.url,bibliography:e.url?"":e.title,language:"und"}}));
 const kg=selectedRelations.flatMap(rel=>rel.origin.kind==="kg"?(rel.origin.detail?.citations??[]).map(c=>({recordId:"capsule-relation:"+rel.key,id:"submission-kg-source:"+rel.key+":"+c.id,citation:c})):[]);
 for(const entry of kg){const s=entry.citation.source;sources.push({id:entry.id,content:{title:s.title.slice(0,300),url:s.url,bibliography:[s.title,...s.authors,s.publisher,s.publishedAt,s.edition].filter(Boolean).join(" · ").slice(0,4000),language:"und"}});}
 const content=knowledgeSubmissionContentSchema.parse({title:capsule.content.title,
  entities:newEntities.map(e=>({id:e.id,content:e.content})),entityPins:existing.map(e=>({id:e.id,revision:e.revision})),sourcePins,sources,
  items:records.map(r=>({key:r.id,...(doc.knowledge?.snapshot.records.some(base=>base.id===r.id)?{correction:{id:r.id,revision:r.revision}}:{}),record:{...r.content,evidence:[...r.content.evidence,...manual.filter(e=>e.locator.trim()&&selectedRelations.some(rel=>rel.key===e.targetKey&&(rel.origin.kind==="knowledge"?rel.origin.id:"capsule-relation:"+rel.key)===r.id)).map(e=>({id:e.key,source:{id:"submission-source:"+e.key,revision:1},locator:e.locator,excerpt:"",stance:e.stance})),...kg.filter(e=>e.recordId===r.id).map(e=>({id:e.citation.id,source:{id:e.id,revision:1},locator:e.citation.locator,excerpt:"",stance:e.citation.stance}))]}}))});
 return {content,sourceCapsule:{capsuleId:capsule.id,capsuleRevision:capsule.revision,title:capsule.content.title,keys,
  captured:{records,entities,sources:snapshot.sources.filter(s=>sourcePins.some(p=>p.id===s.id&&p.revision===s.revision)),nodes:doc.nodes.filter(n=>nodeKeys.has(n.key)),relations:selectedRelations,evidence:manual}}};
}
