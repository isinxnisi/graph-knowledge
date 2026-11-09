import type { CanvasContent } from "../../components/GraphCanvas";
import type { KnowledgeEntityVersion } from "../domain/knowledge-foundation";
import type { KnowledgePublishedRecord } from "../domain/knowledge-publication";
import type {KnowledgeTranslationVersion} from "../domain/knowledge-translation";
import {knowledgeDisplayText,knowledgeEntityDisplayName} from "../domain/knowledge-display";
export function knowledgeCanvas(records: KnowledgePublishedRecord[], entities: KnowledgeEntityVersion[],translations?:readonly KnowledgeTranslationVersion[],locale="ja"): CanvasContent {
  return {
    nodes: entities.map((e) => ({ id: e.id, label: knowledgeEntityDisplayName(e,translations,locale), kind: e.content.kind })),
    relations: Object.fromEntries(records.filter((r) => r.record.content.kind === "relation").map((dto) => {
      const r = dto.record.content, id = "record:" + dto.record.id;
      const label = knowledgeDisplayText(translations,{kind:"record",id:dto.record.id,revision:dto.record.revision,field:"relation"},locale,r.relation??"") + (r.polarity === "denied" ? locale==="en"?" (denied)":"（否定）" : r.polarity === "uncertain" ? locale==="en"?" (uncertain)":"（不確実）" : "");
      return [id, { id, subjectId: r.subjectId!, objectId: r.objectId!, claimIds: [dto.record.id], polarity: r.polarity, label, canvasLabel: label, badge: "" }];
    })),
  };
}
