import {z} from "zod";
import {knowledgeIdSchema} from "./knowledge-foundation";
import {publicHandleSchema} from "./public-profile";
export const contributorPersonSchema=z.object({handle:publicHandleSchema,displayName:z.string(),icon:z.string(),official:z.boolean().optional(),imageUrl:z.string().nullable().optional()});
export const knowledgeContributorSchema=z.object({id:z.uuidv4(),recordId:knowledgeIdSchema,revision:z.number().int().positive(),operation:z.string(),publishedAt:z.string(),anonymous:z.boolean(),person:contributorPersonSchema.nullable()});
export const knowledgeContributorsSchema=z.object({contributors:z.array(knowledgeContributorSchema).max(50)});
export type KnowledgeContributor=z.infer<typeof knowledgeContributorSchema>;
export const knowledgeProfileActivitySchema=z.object({available:z.boolean(),activities:z.array(knowledgeContributorSchema.extend({title:z.string(),href:z.string()})).max(20),nextCursor:z.string().nullable()});
