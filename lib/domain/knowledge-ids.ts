import {z} from "zod";
export const knowledgeIdSchema=z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
export const knowledgeRevisionSchema=z.number().int().positive().max(Number.MAX_SAFE_INTEGER-1);
export const knowledgePinSchema=z.strictObject({id:knowledgeIdSchema,revision:knowledgeRevisionSchema});
