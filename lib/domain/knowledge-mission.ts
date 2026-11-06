import {z} from 'zod';
import {knowledgeIdSchema} from './knowledge-foundation';

export const missionHostSchema=z.string().trim().toLowerCase().regex(/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/,'資料のサイトを example.org の形で入力してください。').refine(v=>!/(^|\.)(localhost|local|internal|test|invalid|example)$/.test(v),'公開資料のサイトを指定してください。');
export const missionPlanSchema=z.strictObject({
 title:z.string().trim().min(1).max(160),question:z.string().trim().min(8).max(1500),
 themeId:knowledgeIdSchema.nullable().default(null),
 entityIds:z.array(knowledgeIdSchema).max(12).default([]),
 sourceHosts:z.array(missionHostSchema).min(1).max(8),
 intervalHours:z.number().int().min(6).max(720).default(24),
 maxSources:z.number().int().min(1).max(5).default(3),
 maxItems:z.number().int().min(1).max(10).default(5),
}).superRefine((v,c)=>{
 if(!v.themeId&&!v.entityIds.length)c.addIssue({code:'custom',path:['themeId'],message:'テーマか、核となる対象を選んでください。'});
 if(new Set(v.entityIds).size!==v.entityIds.length||new Set(v.sourceHosts).size!==v.sourceHosts.length)c.addIssue({code:'custom',message:'同じ対象やサイトが重複しています。'});
});
export type MissionPlan=z.infer<typeof missionPlanSchema>;
const version={id:z.uuidv4(),expectedRevision:z.number().int().positive()};
export const missionOperatorSchema=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('create'),requestId:z.uuidv4(),content:missionPlanSchema}),
 z.strictObject({action:z.literal('update'),requestId:z.uuidv4(),...version,content:missionPlanSchema}),
 z.strictObject({action:z.enum(['pause','resume']),requestId:z.uuidv4(),...version}),
]);
const lease={runId:z.uuidv4(),generation:z.number().int().positive(),token:z.string().regex(/^[a-f0-9]{64}$/)};
export const missionWorkerSchema=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('claim'),requestId:z.uuidv4()}),
 z.strictObject({action:z.literal('deliver'),requestId:z.uuidv4(),...lease,package:z.json()}),
 z.strictObject({action:z.literal('empty'),requestId:z.uuidv4(),...lease,summary:z.string().trim().min(1).max(1000)}),
 z.strictObject({action:z.literal('fail'),requestId:z.uuidv4(),...lease,retryable:z.boolean(),reason:z.enum(['network','source-unavailable','search-unavailable','limit','invalid-package'])}),
]);
export type MissionWorkerCommand=z.infer<typeof missionWorkerSchema>;
export const missionRunViewSchema=z.object({id:z.uuidv4(),state:z.string(),reason:z.string(),createdAt:z.string(),receiptId:z.uuidv4().nullable(),receiptState:z.string().nullable(),results:z.array(z.object({state:z.string(),url:z.string().nullable(),reason:z.string()})).default([])});
export const missionPageSchema=z.object({
 items:z.array(z.object({id:z.uuidv4(),revision:z.number(),state:z.enum(['active','paused']),content:missionPlanSchema,nextDue:z.string(),runs:z.array(missionRunViewSchema)})),
 themes:z.array(z.object({id:z.string(),label:z.string()})),entities:z.array(z.object({id:z.string(),label:z.string()})),
 workerConnected:z.boolean(),workerLastSeen:z.string().nullable(),
});
