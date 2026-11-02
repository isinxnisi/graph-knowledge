import type { CanvasContent } from "../../components/GraphCanvas";
import type { KnowledgeEntityVersion } from "../domain/knowledge-foundation";
import type { KnowledgePublishedRecord } from "../domain/knowledge-publication";
export function knowledgeCanvas(records: KnowledgePublishedRecord[], entities: KnowledgeEntityVersion[]): CanvasContent {
  return {
    nodes: entities.map((e) => ({ id: e.id, label: e.content.name, kind: e.content.kind })),
    relations: Object.fromEntries(records.filter((r) => r.record.content.kind === "relation").map((dto) => {
      const r = dto.record.content, id = "record:" + dto.record.id;
      const label = r.relation + (r.polarity === "denied" ? "（否定）" : r.polarity === "uncertain" ? "（不確実）" : "");
      return [id, { id, subjectId: r.subjectId!, objectId: r.objectId!, claimIds: [dto.record.id], polarity: r.polarity, label, canvasLabel: label, badge: "" }];
    })),
  };
}
