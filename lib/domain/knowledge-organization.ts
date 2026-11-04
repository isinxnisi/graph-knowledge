import {z} from "zod";
import {knowledgeConceptSchema,knowledgeRecordContentSchema,knowledgeIdSchema} from "./knowledge-foundation";
export const organizationQuerySchema=z.object({q:z.string().trim().max(200).default(""),state:z.enum(["all","unmapped","mapped","stale"]).default("all"),after:knowledgeIdSchema.optional()});
export const organizationRowSchema=z.object({id:z.string(),revision:z.number(),content:knowledgeRecordContentSchema,subject:z.string().nullable(),object:z.string().nullable(),mappingRevision:z.number(),mappedRecordRevision:z.number().nullable(),concept:knowledgeConceptSchema.nullable(),suggestions:z.array(knowledgeConceptSchema)});
export const organizationPageSchema=z.object({items:z.array(organizationRowSchema),total:z.number(),next:z.string().nullable(),concepts:z.array(knowledgeConceptSchema),catalogTruncated:z.boolean()});
export type OrganizationRow=z.infer<typeof organizationRowSchema>;
