import {z} from 'zod';
import {knowledgeIdSchema,knowledgeRevisionSchema,knowledgeEntityContentSchema} from './knowledge-foundation';

const pin=z.strictObject({id:knowledgeIdSchema,revision:knowledgeRevisionSchema});
export const identityCommandSchema=z.strictObject({
 requestId:z.uuidv4(),left:pin,right:pin,expectedRevision:z.number().int().min(0),
 state:z.enum(['same','withdrawn']),reason:z.string().trim().min(1).max(2000),
 reference:z.url({protocol:/^https$/}).max(2000).refine(v=>{const u=new URL(v);return !u.username&&!u.password;},'認証情報を含むURLは使えません'),
 locator:z.string().trim().min(1).max(1000),
}).refine(v=>v.left.id!==v.right.id,'異なる二つの対象を選んでください');
export type IdentityCommand=z.infer<typeof identityCommandSchema>;
export const identityEntitySchema=z.object({id:knowledgeIdSchema,revision:knowledgeRevisionSchema,content:knowledgeEntityContentSchema});
export const identityLinkSchema=z.object({id:z.string(),revision:z.number(),left:pin,right:pin,state:z.enum(['same','withdrawn']),reason:z.string(),reference:z.string(),locator:z.string(),createdAt:z.string(),stale:z.boolean()});
export const identityPageSchema=z.object({items:z.array(identityEntitySchema),total:z.number(),next:z.string().nullable()});
export const identityDetailSchema=z.object({entity:identityEntitySchema,records:z.array(z.object({id:z.string(),assertion:z.string(),sources:z.array(z.object({title:z.string(),url:z.string().nullable(),locator:z.string(),excerpt:z.string()}))})),links:z.array(identityLinkSchema),peers:z.array(identityEntitySchema),history:z.array(identityLinkSchema)});
export type IdentityEntity=z.infer<typeof identityEntitySchema>;
export type IdentityDetail=z.infer<typeof identityDetailSchema>;
