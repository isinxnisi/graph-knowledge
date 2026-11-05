import {z} from 'zod';
import {translationProposalSchema} from './knowledge-translation';
import {knowledgeIdSchema} from './knowledge-foundation';
import {knowledgeSubmissionContentSchema,submissionLegacySchema} from './knowledge-submission';
const key=z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,127}$/);
export const importOperations=['create-entity','create-relation','add-information','add-evidence','correct-record','translate-text'] as const;
const commonItem=knowledgeSubmissionContentSchema.shape.items.element.extend({
 operation:z.enum(importOperations),reason:z.string().trim().max(4000).optional(),
}).superRefine((v,c)=>{if(v.operation==='correct-record'&&!v.reason)c.addIssue({code:'custom',path:['reason'],message:'訂正する理由が必要です。'});});
const translationItem=z.strictObject({key:knowledgeIdSchema,operation:z.literal('translate-text'),translation:translationProposalSchema}).transform(v=>({...v,record:knowledgeSubmissionContentSchema.shape.items.element.shape.record.parse({kind:'note',assertion:'',evidence:[]})}));
export const importItemSchema=z.union([translationItem,commonItem]).transform(v=>commonItem.parse(v));
/** Only the envelope is all-or-nothing. Resources and items retain their raw
 * JSON for independent validation and immutable receipt identity. */
export const knowledgeImportPackageSchema=z.strictObject({
 format:z.literal('plunode-knowledge-package'),schemaVersion:z.literal(1),
 namespace:key,packageId:key,revision:z.number().int().positive().max(2147483647),
 entities:z.array(z.json()).max(40).default([]),sources:z.array(z.json()).max(40).default([]),
 entityPins:z.array(z.json()).max(40).default([]),
 sourcePins:z.array(z.json()).max(80).default([]),
 legacy:submissionLegacySchema.optional(),items:z.array(z.json()).min(1).max(20),
 externalUsage:z.strictObject({provider:z.string().max(100),inputTokens:z.number().int().nonnegative().nullable(),outputTokens:z.number().int().nonnegative().nullable()}).optional(),
});
export type KnowledgeImportPackage=z.infer<typeof knowledgeImportPackageSchema>;
const scope=z.union([z.literal('*'),z.array(knowledgeIdSchema).max(1000)]);
export const importPrincipalSchema=z.strictObject({
 id:key,namespace:key,tokenSha256:z.string().regex(/^[a-f0-9]{64}$/),
 expiresAt:z.iso.datetime({offset:true}),disabled:z.boolean().default(false),
 operations:z.array(z.enum(importOperations)).min(1).max(6),
 targets:z.strictObject({entities:scope,records:scope,sources:scope.default([]),themes:z.array(knowledgeIdSchema).max(1000)}),
 allowNewEntities:z.boolean(),packagesPerDay:z.number().int().min(1).max(500),
 itemsPerDay:z.number().int().min(1).max(10000),pendingItems:z.number().int().min(1).max(10000),
});
export type ImportPrincipal=z.infer<typeof importPrincipalSchema>;
export const importConfigurationSchema=z.strictObject({
 origin:z.url().refine(v=>{const u=new URL(v);return u.origin===v&&!u.username&&!u.password&&(u.protocol==='https:'||process.env.NODE_ENV==='test'&&u.hostname==='127.0.0.1');}),
 principals:z.array(importPrincipalSchema).min(1).max(20),
}).superRefine((v,c)=>{for(const field of ['id','namespace','tokenSha256'] as const)if(new Set(v.principals.map(p=>p[field])).size!==v.principals.length)c.addIssue({code:'custom',message:'送信資格の識別子が重複しています。'});});
export type ImportConfiguration=z.infer<typeof importConfigurationSchema>;
export const importCancelSchema=z.strictObject({reason:z.string().trim().max(1000).optional()});
