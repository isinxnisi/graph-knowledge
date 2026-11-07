import {knowledgeTranslationVersionSchema,knowledgeOriginalText} from "./knowledge-translation";
import { z } from "zod";
import { knowledgeEntityContentSchema, knowledgeSourceContentSchema, knowledgeRecordContentSchema, knowledgeMappingContentSchema, knowledgeThemeContentSchema, knowledgeTimelineSchema, knowledgePinSchema, knowledgeTimelineIssues } from "./knowledge-foundation";
const version = <T extends z.ZodType>(content: T) => z.strictObject({ ...knowledgePinSchema.shape, content, createdAt: z.iso.datetime(), reason: z.string().max(4000) });
export const capsuleKnowledgeSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(1),
  theme:version(knowledgeThemeContentSchema).optional(),
  entities: z.array(version(knowledgeEntityContentSchema)).max(400),
  sources: z.array(version(knowledgeSourceContentSchema)).max(800),
  records: z.array(version(knowledgeRecordContentSchema)).max(400),
  translations:z.array(knowledgeTranslationVersionSchema).max(100).optional(),
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
  const translations=s.translations??[];
  if(new Set(translations.map(t=>t.id)).size!==translations.length)issue('Duplicate translation identity');
  for(const t of translations){const rows=t.target.kind==='record'?s.records:t.target.kind==='entity'?s.entities:t.target.kind==='source'?s.sources:s.theme?[s.theme]:[];
   const original=rows.find(v=>v.id===t.target.id&&v.revision===t.target.revision);
   try{if(!original||knowledgeOriginalText(t.target,original.content).text!==t.originalText)issue('Translation original is not in this snapshot');}catch{issue('Invalid translation original');}
  }
  if(s.timeline)for(const message of knowledgeTimelineIssues(s.records,s.timeline))issue(message);
});
export const capsuleKnowledgeSchema=z.strictObject({
  schemaVersion:z.literal(1), capturedAt:z.iso.datetime(), theme:knowledgePinSchema.optional(),
  snapshot:capsuleKnowledgeSnapshotSchema,
  timeline:knowledgeTimelineSchema.optional(),
  themeRecordIds:z.array(knowledgePinSchema.shape.id).max(400).optional(),
  excludedRecordIds:z.array(knowledgePinSchema.shape.id).max(400).optional(),
  initialView:z.enum(["graph","timeline","split"]),
}).superRefine((k,c)=>{if(k.snapshot.theme&&(!k.theme||k.theme.id!==k.snapshot.theme.id||k.theme.revision!==k.snapshot.theme.revision))c.addIssue({code:"custom",message:"Theme baseline and reference differ"});});
export type CapsuleKnowledge=z.infer<typeof capsuleKnowledgeSchema>;
