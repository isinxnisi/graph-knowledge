import { z } from "zod";
import { knowledgeIdSchema, knowledgePinSchema, knowledgeThemeContentSchema } from "./knowledge-foundation";
import { capsuleKnowledgeSnapshotSchema } from "./capsule-knowledge";
import {knowledgeTextTargetSchema,translationLanguageSchema} from "./knowledge-translation";
export const capsuleUpdateQuerySchema=z.strictObject({recordIds:z.array(knowledgeIdSchema).max(400),entityIds:z.array(knowledgeIdSchema).max(400),theme:knowledgePinSchema.optional(),includeTheme:z.boolean().default(false),translations:z.array(z.strictObject({target:knowledgeTextTargetSchema,language:translationLanguageSchema})).max(1200).default([])}).refine(q=>!q.includeTheme||!!q.theme,"テーマ参照が必要です");
export const capsuleUpdateResponseSchema=z.strictObject({generation:z.string().nullable(),translationsChecked:z.boolean().optional(),snapshot:capsuleKnowledgeSnapshotSchema,theme:z.strictObject({...knowledgePinSchema.shape,content:knowledgeThemeContentSchema,createdAt:z.string(),reason:z.string()}).optional(),unavailable:z.array(z.strictObject({kind:z.enum(["record","entity","theme"]),id:knowledgeIdSchema})).max(801)});
export type CapsuleUpdateResponse=z.infer<typeof capsuleUpdateResponseSchema>;
export function sameUpdateValue(a:unknown,b:unknown):boolean{
 const normal=(x:unknown):unknown=>Array.isArray(x)?x.map(normal):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,normal(v)])):x;
 return JSON.stringify(normal(a))===JSON.stringify(normal(b));
}
