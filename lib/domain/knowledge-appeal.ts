import {z} from "zod";
export const appealActions=["inspect","respond","recheck","confirm-content","hide","restore"] as const;
export const appealCommandSchema=z.strictObject({action:z.literal("appeal"),requestId:z.uuidv4(),submissionId:z.uuidv4(),revision:z.number().int().positive(),itemKey:z.string().min(1).max(200),detail:z.string().trim().min(1).max(1500),shareWithOperators:z.literal(true)});
export const appealOperatorCommandSchema=z.strictObject({requestId:z.uuidv4(),id:z.uuidv4(),expectedRevision:z.number().int().positive(),action:z.enum(appealActions),reason:z.string().trim().min(1).max(1000),statusRevision:z.number().int().positive().optional()});
export const appealReplySchema=z.object({action:z.string(),reason:z.string(),createdAt:z.string()});
export const appealPublicSchema=z.object({id:z.uuidv4(),revision:z.number().int().positive(),status:z.enum(["open","answered","withdrawn"]),pending:z.boolean().default(false),moderation:z.object({state:z.enum(["pending","applied","blocked"]),visibility:z.string(),reason:z.string()}).optional(),detail:z.string(),createdAt:z.string(),replies:z.array(appealReplySchema)});
export type SubmissionAppeal=z.infer<typeof appealPublicSchema>;
export const canAppeal=(state:string)=>["needs-changes","declined","attention","published"].includes(state);
