import { z } from "zod";
import { knowledgePinSchema } from "./knowledge-foundation";
import type { CapsuleKnowledge } from "./capsule-knowledge";

export const knowledgeReferenceSchema = z.strictObject({ ...knowledgePinSchema.shape, kind:z.enum(["record","entity","source","mapping","theme"]) });
export type KnowledgeReference = z.infer<typeof knowledgeReferenceSchema>;
export const knowledgeReferenceGroupsSchema = z.array(z.array(knowledgeReferenceSchema).max(2001)).max(400);
export function capsuleKnowledgeReferences(knowledge:CapsuleKnowledge):KnowledgeReference[] {
  return [
    ...(knowledge.theme?[{...knowledge.theme,kind:"theme" as const}]:[]),
    ...(["records","entities","sources","mappings"] as const).flatMap(group=>knowledge.snapshot[group].map(row=>({id:row.id,revision:row.revision,kind:({records:"record",entities:"entity",sources:"source",mappings:"mapping"} as const)[group]}))),
  ];
}
