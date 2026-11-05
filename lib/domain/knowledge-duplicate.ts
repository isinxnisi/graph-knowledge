import type {KnowledgeRecordContent, KnowledgeSourceContent} from './knowledge-foundation';
import {canonicalSourceUrl,sourceDocumentKey} from './knowledge-source-identity';

// Normalization removes presentation differences, never dates, negation or scope.
export const duplicateText=(text:string)=>text.normalize('NFKC').trim().replace(/\s+/gu,' ').toLocaleLowerCase();
export const duplicateSourceURL=canonicalSourceUrl;
export function duplicateAnchors(r:KnowledgeRecordContent){return {kind:r.kind,subjectId:r.subjectId,objectId:r.objectId,aboutRecord:r.aboutRecord?.id??null,aboutTheme:r.aboutTheme??null};}
export function duplicateQualifiers(r:KnowledgeRecordContent){return {...duplicateAnchors(r),...(r.aboutRecord?{aboutRecordRevision:r.aboutRecord.revision}:{}),polarity:r.polarity,scope:duplicateText(r.scope),times:r.times.map(t=>t.time).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))};}
export function duplicateMeaning(r:KnowledgeRecordContent){return {...duplicateQualifiers(r),assertion:duplicateText(r.assertion),relation:duplicateText(r.relation)};}
export const duplicateDocument=sourceDocumentKey;
export type DuplicateSource={id:string;revision:number;content:KnowledgeSourceContent};
export function duplicateEvidenceKey(e:KnowledgeRecordContent['evidence'][number],sources:DuplicateSource[]){
 const source=sources.find(s=>s.id===e.source.id&&s.revision===e.source.revision);
 if(!source)throw Error('Duplicate comparison requires the pinned source');
 return JSON.stringify([duplicateDocument(source.content),e.stance]);
}
/** One source document is not a new independent source on each paraphrase,
 * locator or tracking URL. A missing verbatim excerpt may be enriched once.
 * Preserve original citations and their IDs; never rewrite their source pins.
 */
export function mergeDuplicateEvidence(old:KnowledgeRecordContent,proposed:KnowledgeRecordContent,sources:DuplicateSource[]){
 const evidence=structuredClone(old.evidence);
 for(const incoming of proposed.evidence){
  const key=duplicateEvidenceKey(incoming,sources),index=evidence.findIndex(e=>duplicateEvidenceKey(e,sources)===key);
  if(index<0){let id=incoming.id;while(evidence.some(e=>e.id===id))id+='-added';evidence.push({...incoming,id});}
  else if(!evidence[index].excerpt.trim()&&incoming.excerpt.trim())evidence[index]={...evidence[index],excerpt:incoming.excerpt,locator:incoming.locator};
 }
 return {...old,evidence};
}
