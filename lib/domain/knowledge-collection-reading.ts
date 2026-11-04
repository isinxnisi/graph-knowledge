import {z} from 'zod';
import {knowledgeIdSchema,knowledgePinSchema} from './knowledge-foundation';
export const READING_POLICY='collection-reading-v1';
export const readingTargetSchema=knowledgePinSchema.extend({kind:z.enum(['entity','theme'])});
export const readingOperatorSchema=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('read'),requestId:z.uuidv4(),captureJobId:z.uuidv4(),sourceIds:z.array(z.uuidv4()).min(1).max(4),target:readingTargetSchema,scope:z.string().trim().min(5).max(2000),publish:z.literal(true),externalProcessing:z.literal(true)}),
 z.strictObject({action:z.literal('cancel'),requestId:z.uuidv4(),id:z.uuidv4()})
]);
export const readingLeaseSchema=z.strictObject({taskId:z.uuidv4(),jobId:z.uuidv4(),attemptId:z.uuidv4(),token:z.uuidv4(),wire:z.string().max(100000),wireDigest:z.string(),model:z.string(),expiresAt:z.string()});
export type ReadingLease=z.infer<typeof readingLeaseSchema>;
const resultSchema=z.discriminatedUnion('state',[
 z.strictObject({state:z.literal('received'),status:z.number(),raw:z.unknown()}),
 z.strictObject({state:z.literal('http-error'),status:z.number(),raw:z.unknown(),retryAfter:z.string().nullable(),category:z.enum(['rate-limit','unavailable','authorization','invalid-request'])}),
 z.strictObject({state:z.literal('delivery-unknown')}),z.strictObject({state:z.literal('not-sent')})
]);
export const readingWorkerSchema=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('claim'),requestId:z.uuidv4()}),
 z.strictObject({action:z.literal('begin'),requestId:z.uuidv4(),lease:readingLeaseSchema}),
 z.strictObject({action:z.literal('complete'),requestId:z.uuidv4(),lease:readingLeaseSchema,result:resultSchema})
]);
const text=z.string().trim();
export const readingCandidateSchema=z.strictObject({
 kind:z.enum(['relation','episode','note']),assertion:text.min(1).max(1500),subjectId:knowledgeIdSchema.nullable(),objectId:knowledgeIdSchema.nullable(),relation:text.max(200),polarity:z.enum(['affirmed','denied','uncertain']),scope:text.max(1000),
 quote:text.min(12).max(3000),locator:text.min(1).max(300),timeKind:z.enum(['none','point','duration','occurrence-window']),from:text.max(10),to:text.max(10),timeLabel:text.max(200),timeQuote:text.max(1000)
});
export const readingOutputSchema=z.strictObject({
 entities:z.array(z.strictObject({key:text.regex(/^new:[a-z0-9-]{1,30}$/),name:text.min(1).max(200),kind:text.min(1).max(80),quote:text.min(2).max(1000)})).max(4),
 records:z.array(readingCandidateSchema).max(2),reason:text.min(1).max(500)
});
export type ReadingOutput=z.infer<typeof readingOutputSchema>;
export function sourceChunks(text:string,size=8000,overlap=500){
 if(size<=overlap||size<100)throw Error('Invalid chunk size');const chunks=[];for(let at=0;at<text.length;at+=size-overlap){chunks.push({offset:at,text:text.slice(at,at+size)});if(at+size>=text.length)break;}return chunks;
}
