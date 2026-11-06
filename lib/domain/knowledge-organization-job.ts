import {z} from 'zod';
import {knowledgeEntityContentSchema,knowledgeRecordContentSchema,knowledgeSourceContentSchema,knowledgeConceptSchema} from './knowledge-foundation';
import {patrolOriginSchema} from './knowledge-patrol';

export const ORGANIZATION_POLICY='knowledge-organization-v1';
const ref=z.object({origin:patrolOriginSchema,kind:z.enum(['entity','record','source','theme','mapping']),id:z.string(),revision:z.string(),statusRevision:z.string(),digest:z.string()});
export const organizationMaterialSchema=z.object({
 origin:patrolOriginSchema,kind:ref.shape.kind,id:z.string(),revision:z.string(),statusRevision:z.string(),digest:z.string(),
 content:z.record(z.string(),z.unknown()),
 entities:z.array(z.object({id:z.string(),revision:z.number(),content:knowledgeEntityContentSchema})).default([]),
 sources:z.array(z.object({id:z.string(),revision:z.number(),content:knowledgeSourceContentSchema})).default([]),
 references:z.array(ref).default([]),
 translatedNames:z.array(z.string()).default([]),translationStamp:z.string().default(''),
});
export type OrganizationMaterial=z.infer<typeof organizationMaterialSchema>;
export const organizationInputSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('meaning'),record:organizationMaterialSchema,mappingRevision:z.number().int().nonnegative(),concepts:z.array(knowledgeConceptSchema),reuse:z.object({record:organizationMaterialSchema,mappingRevision:z.number().int().positive(),concept:knowledgeConceptSchema}).optional()}),
 z.object({kind:z.literal('identity'),left:organizationMaterialSchema,right:organizationMaterialSchema,records:z.array(organizationMaterialSchema),identityRevision:z.number().int().nonnegative()}),
]);
export type OrganizationInput=z.infer<typeof organizationInputSchema>;
export const organizationProposalSchema=z.strictObject({
 outcome:z.enum(['map','same','different','unclear']),
 conceptId:z.string().nullable(),label:z.string().trim().max(200),definition:z.string().trim().max(4000),
 evidenceRecordId:z.string().nullable(),evidenceId:z.string().nullable(),reason:z.string().trim().min(1).max(1500),
});
export type OrganizationProposal=z.infer<typeof organizationProposalSchema>;
export const organizationCheckSchema=z.strictObject({supported:z.boolean(),reason:z.string().trim().min(1).max(1500)});
export function organizationRecord(material:OrganizationMaterial){return knowledgeRecordContentSchema.parse(material.content);}
