import {z} from "zod";
const https=z.url({protocol:/^https$/}).max(2000).refine(s=>{const u=new URL(s);return !u.username&&!u.password&&(!u.port||u.port==='443')&&!u.hash;},'公開HTTPS URLを入力してください');
export const collectionRequestSchema=z.strictObject({action:z.literal('create'),requestId:z.uuidv4(),title:z.string().trim().min(1).max(160),scope:z.string().trim().min(1).max(1500),urls:z.array(https).min(1).max(5)}).refine(x=>new Set(x.urls).size===x.urls.length,'URLが重複しています');
export const collectionOperatorSchema=z.union([collectionRequestSchema,z.strictObject({action:z.literal('cancel'),requestId:z.uuidv4(),id:z.uuidv4()})]);
const lease={jobId:z.uuidv4(),itemId:z.uuidv4(),generation:z.number().int().positive(),token:z.string().regex(/^[a-f0-9]{64}$/)};
export const collectionDocumentSchema=z.strictObject({url:https,type:z.string().max(200),bodyBase64:z.string().max(2666672),text:z.string().max(120000),bodySha256:z.string().regex(/^[a-f0-9]{64}$/),textSha256:z.string().regex(/^[a-f0-9]{64}$/),fetchedAt:z.iso.datetime()});
export const collectionWorkerCommandSchema=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('claim'),requestId:z.uuidv4()}),
 z.strictObject({action:z.literal('complete'),requestId:z.uuidv4(),...lease,document:collectionDocumentSchema}),
 z.strictObject({action:z.literal('fail'),requestId:z.uuidv4(),...lease,retryable:z.boolean(),reason:z.enum(['unavailable','unsupported','too-large','network'])})
]);
export const collectionLeaseSchema=z.object({...lease,url:https,scope:z.string(),title:z.string(),expiresAt:z.string()});
export type CollectionLease=z.infer<typeof collectionLeaseSchema>;
export const collectionItemSchema=z.object({id:z.string(),url:z.string(),state:z.enum(['queued','leased','captured','failed','cancelled']),attempts:z.number(),reason:z.string(),fetchedAt:z.string().nullable(),bodySha256:z.string().nullable(),textSha256:z.string().nullable(),bytes:z.number().nullable()});
export const collectionJobSchema=z.object({id:z.string(),title:z.string(),scope:z.string(),state:z.string(),createdAt:z.string(),items:z.array(collectionItemSchema)});
export const collectionPageSchema=z.object({items:z.array(collectionJobSchema),nextBefore:z.string().nullable(),stage:z.literal('capture'),workerConnected:z.boolean(),missionsAvailable:z.boolean().default(false)});
export const collectionStage=(job:z.infer<typeof collectionJobSchema>)=>job.state==='cancelled'?'取消済み':job.items.some(x=>x.state==='leased')?'資料を取得中':job.items.some(x=>x.state==='queued')?'PC側の取得待ち':job.items.some(x=>x.state==='failed')?'取得完了・一部取得できません':'資料取得完了';
