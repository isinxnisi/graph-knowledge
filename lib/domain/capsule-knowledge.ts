import { z } from "zod";
import { knowledgeEntityContentSchema, knowledgeSourceContentSchema, knowledgeRecordContentSchema, knowledgeMappingContentSchema, knowledgeTimelineSchema, knowledgePinSchema, knowledgeTimelineIssues } from "./knowledge-foundation";
const version = <T extends z.ZodType>(content: T) => z.strictObject({ ...knowledgePinSchema.shape, content, createdAt: z.iso.datetime(), reason: z.string().max(4000) });
export const capsuleKnowledgeSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(1),
  entities: z.array(version(knowledgeEntityContentSchema)).max(400),
  sources: z.array(version(knowledgeSourceContentSchema)).max(800),
  records: z.array(version(knowledgeRecordContentSchema)).max(400),
  mappings: z.array(version(knowledgeMappingContentSchema)).max(400),
  timeline: knowledgeTimelineSchema.optional(), initialView: z.enum(["graph", "timeline", "split"]),
}).superRefine((s,ctx) => {
  const issue=(message:string)=>ctx.addIssue({code:"custom",message});
  for(const rows of [s.entities,s.records,s.mappings]) if(new Set(rows.map(r=>r.id)).size!==rows.length)issue("Duplicate snapshot identity");
  if(new Set(s.sources.map(r=>JSON.stringify([r.id,r.revision]))).size!==s.sources.length)issue("Duplicate source edition");
  for(const record of s.records){
    const c=record.content;
    for(const id of [c.subjectId,c.objectId].filter(Boolean))if(!s.entities.some(e=>e.id===id))issue("Missing snapshot entity");
    for(const e of c.evidence)if(!s.sources.some(source=>source.id===e.source.id&&source.revision===e.source.revision))issue("Missing source edition");
  }
  if(s.timeline)for(const message of knowledgeTimelineIssues(s.records,s.timeline))issue(message);
});
export const capsuleKnowledgeSchema=z.strictObject({
  schemaVersion:z.literal(1), capturedAt:z.iso.datetime(), theme:knowledgePinSchema.optional(),
  snapshot:capsuleKnowledgeSnapshotSchema, initialView:z.enum(["graph","timeline","split"]),
});
export type CapsuleKnowledge=z.infer<typeof capsuleKnowledgeSchema>;
