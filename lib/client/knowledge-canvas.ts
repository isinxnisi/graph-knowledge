import type { CanvasContent } from "../../components/GraphCanvas";
import type { KnowledgeEntityVersion } from "../domain/knowledge-foundation";
import type { KnowledgePublishedRecord } from "../domain/knowledge-publication";
import type {KnowledgeTranslationVersion} from "../domain/knowledge-translation";
import {knowledgeDisplayText,knowledgeEntityDisplayName} from "../domain/knowledge-display";
type EntityNotes = readonly {target:{id:string;revision:number};text:string}[];
export function entityCaption(e:KnowledgeEntityVersion,records:readonly KnowledgePublishedRecord[],translations:readonly KnowledgeTranslationVersion[]|undefined,locale:string,notes?:EntityNotes){
 const note=notes?.find(n=>n.target.id===e.id&&n.target.revision===e.revision);
 if(note)return note.text;
 const original=e.content.description?.trim();
 if(original) return knowledgeDisplayText(translations,{kind:"entity",id:e.id,revision:e.revision,field:"description"},locale,e.content.description);
 const r=records.find(({record:{content:c}})=>c.evidence.length>0&&(c.subjectId===e.id||c.objectId===e.id))?.record;
 return r?(locale==="en"?"In this record: ":"記録では：")+knowledgeDisplayText(translations,{kind:"record",id:r.id,revision:r.revision,field:"assertion"},locale,r.content.assertion):undefined;
}
export function knowledgeCanvas(records: KnowledgePublishedRecord[], entities: KnowledgeEntityVersion[],translations?:readonly KnowledgeTranslationVersion[],locale="ja",notes?:EntityNotes): CanvasContent {
  return {
    nodes: entities.map((e) => ({ id: e.id, label: knowledgeEntityDisplayName(e,translations,locale), kind: e.content.kind, description:entityCaption(e,records,translations,locale,notes) })),
    relations: Object.fromEntries(records.filter((r) => r.record.content.kind === "relation").map((dto) => {
      const r = dto.record.content, id = "record:" + dto.record.id;
      const label = knowledgeDisplayText(translations,{kind:"record",id:dto.record.id,revision:dto.record.revision,field:"relation"},locale,r.relation??"") + (r.polarity === "denied" ? locale==="en"?" (denied)":"（否定）" : r.polarity === "uncertain" ? locale==="en"?" (uncertain)":"（不確実）" : "");
      return [id, { id, subjectId: r.subjectId!, objectId: r.objectId!, claimIds: [dto.record.id], polarity: r.polarity, label, canvasLabel: label, badge: "" }];
    })),
  };
}
