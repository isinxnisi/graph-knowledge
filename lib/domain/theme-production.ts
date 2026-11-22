import {z} from 'zod';
import type {ThemeAutomationCommand} from './theme-automation';
import {knowledgePinSchema} from './knowledge-foundation';
import {themeRegistrationInputSchema,themeUpdateInputSchema,amendThemeRegistrationSchema,controlThemeRetrySchema,type ThemeRegistrationCommand} from './knowledge-theme-registration';
import {submitThemeTranslationSchema} from './knowledge-theme-translation';
import {saveProductSchema,uploadProductImageSchema} from './product-authoring';

export const productionWorkflowSchema=z.enum(['scheduled','manual']);
export const productionPhaseSchema=z.enum(['production','review']);
export const productionProgressSchema=z.strictObject({
 brief:z.string().min(1).max(40000),scope:z.string().max(40000),
 artifacts:z.record(z.string().min(1).max(200),z.json()).default({}).describe('Current drafts, sources, immutable image/product refs and material status; retain the exact next-run work, not old AI instructions.'),
 unfinished:z.array(z.string().min(1).max(8000)).default([]),blockers:z.array(z.string().min(1).max(8000)).default([]),
});
export const createThemeProductionSchema=z.strictObject({requestId:z.uuidv4(),workflow:productionWorkflowSchema.optional().describe('Omit for the existing sequential scheduled workflow. Use manual for a normal operator chat independent of scheduled work; retain the returned caseId for every read/claim.'),progress:productionProgressSchema,theme:knowledgePinSchema.optional(),phase:productionPhaseSchema.default('production')});
export const listThemeProductionsSchema=z.strictObject({
 themeId:knowledgePinSchema.shape.id,cursor:z.number().int().min(0).max(1000000).default(0),
});
export const getThemeProductionSchema=z.strictObject({caseId:z.uuidv4().optional(),submissionId:z.uuidv4().optional(),submissionCursor:z.number().int().min(0).default(0),includeSettledSubmissions:z.boolean().optional(),operationCursor:z.number().int().min(0).max(1000000).optional()});
export const abandonThemeProductionSchema=z.strictObject({
 requestId:z.uuidv4(),caseId:z.uuidv4(),expectedVersion:z.number().int().positive(),
 reason:z.string().trim().min(1).max(2000),
});
export const claimThemeProductionSchema=z.strictObject({requestId:z.uuidv4(),executionId:z.uuidv4(),phase:productionPhaseSchema,caseId:z.uuidv4().optional(),leaseSeconds:z.number().int().min(60).max(1800).default(900)});
export const productionFenceSchema=z.strictObject({requestId:z.uuidv4().describe("This checkpoint/attempt operation ID, not the nested registration requestId. Retry identical HTTP input with this ID; a successor retry uses a new operation ID and the SAME saved registration ID/payload."),caseId:z.uuidv4(),executionId:z.uuidv4(),leaseToken:z.uuidv4(),expectedVersion:z.number().int().positive()});
export const productionAssessmentSchema=z.strictObject({scope:z.literal('whole-theme'),targetDigest:z.string().regex(/^[a-f0-9]{64}$/),guideRevision:z.number().int().positive(),result:z.enum(['pass','needs-changes']),summary:z.string().min(1).max(20000),reviewEvidenceId:z.uuidv4().optional(),exceptions:z.array(z.strictObject({issue:z.string().min(1).max(8000),reason:z.string().min(1).max(8000),submissionId:z.uuidv4().optional()})).default([])});
export const updateThemeProductionSchema=productionFenceSchema.extend({operation:z.enum(['save','renew','release','handoff','assess','complete','withdraw-submission']),progress:productionProgressSchema.optional(),status:z.enum(['working','waiting-publication','blocked']).optional(),leaseSeconds:z.number().int().min(60).max(1800).default(900),assessment:productionAssessmentSchema.optional(),submissionId:z.uuidv4().optional(),reason:z.string().max(8000).optional()});
export const productionSubmissionCommandSchema=z.discriminatedUnion('action',[
 themeRegistrationInputSchema.safeExtend({action:z.literal('submit-theme')}),themeUpdateInputSchema.safeExtend({action:z.literal('update-theme')}),submitThemeTranslationSchema.safeExtend({action:z.literal('submit-translation')}),
 amendThemeRegistrationSchema.safeExtend({action:z.literal('amend-theme-items')}),controlThemeRetrySchema.safeExtend({action:z.literal('control-theme-retry')}),saveProductSchema.extend({action:z.literal('save-product')}),uploadProductImageSchema.safeExtend({action:z.literal('upload-product-image')}),
 z.strictObject({action:z.literal('cancel-theme'),requestId:z.uuidv4()}),z.strictObject({action:z.literal('cancel-translation'),requestId:z.uuidv4()}),
]);
export type ProductionSubmissionCommand=z.infer<typeof productionSubmissionCommandSchema>;
export const prepareThemeProductionSubmissionSchema=productionFenceSchema.extend({command:productionSubmissionCommandSchema,generatedImage:z.strictObject({automationId:z.uuidv4(),locales:z.array(z.enum(['ja','en'])).min(1).max(2),target:knowledgePinSchema.optional().describe('Exact Record pin in each requested presentation locale. Omit for the theme cover image.')}).optional()});
export const dispatchThemeProductionSubmissionSchema=productionFenceSchema.extend({submissionId:z.uuidv4()});
export const themeProductionCommandSchema=z.discriminatedUnion('action',[
 createThemeProductionSchema.extend({action:z.literal('create-theme-production')}),getThemeProductionSchema.extend({action:z.literal('get-theme-production')}),listThemeProductionsSchema.extend({action:z.literal('list-theme-productions')}),abandonThemeProductionSchema.extend({action:z.literal('abandon-theme-production')}),claimThemeProductionSchema.extend({action:z.literal('claim-theme-production')}),updateThemeProductionSchema.extend({action:z.literal('update-theme-production')}),prepareThemeProductionSubmissionSchema.extend({action:z.literal('prepare-theme-production-submission')}),dispatchThemeProductionSubmissionSchema.extend({action:z.literal('dispatch-theme-production-submission')}),
]);
export type ThemeProductionCommand=z.infer<typeof themeProductionCommandSchema>;
export type ThemeOperatorCommand=ThemeRegistrationCommand|ThemeProductionCommand|ThemeAutomationCommand;
export type ProductionFence=z.infer<typeof productionFenceSchema>;
export type ProductionProgress=z.infer<typeof productionProgressSchema>;
export const productionSubmissionSummarySchema=z.strictObject({id:z.uuidv4(),requestId:z.uuidv4(),action:z.string(),digest:z.string(),state:z.enum(['prepared','uncertain','accepted','pending','applied','failed','withdrawn']),reason:z.string(),dispatches:z.number().int().nonnegative()});
export const productionEvaluationTargetSchema=z.strictObject({theme:knowledgePinSchema,digest:z.string(),guide:z.strictObject({id:z.string(),revision:z.number().int().nonnegative()}),references:z.json(),publicationConflict:z.json().optional()});
export const themeProductionCaseSchema=z.strictObject({
 id:z.uuidv4(),ownerId:z.uuidv4(),workflow:productionWorkflowSchema,environment:z.enum(['beta','production']),origin:z.url(),version:z.number().int().positive(),phase:productionPhaseSchema,
 status:z.enum(['ready','working','waiting-publication','blocked','completed','needs-review','abandoned']),progress:productionProgressSchema,theme:knowledgePinSchema.nullable(),
 lease:z.strictObject({executionId:z.uuidv4(),until:z.iso.datetime(),valid:z.boolean()}).nullable(),evaluationTarget:productionEvaluationTargetSchema.nullable(),
 lastWholeThemeAssessment:productionAssessmentSchema.extend({workDigest:z.string(),evaluatedTheme:knowledgePinSchema,guide:z.strictObject({id:z.string(),revision:z.number().int().nonnegative()}),evaluatedAt:z.iso.datetime(),executionId:z.uuidv4(),contentCurrent:z.boolean(),guideCurrent:z.boolean(),workCurrent:z.boolean(),current:z.boolean()}).nullable(),
 publication:z.strictObject({state:z.string(),publishedRevision:z.number().int().nullable(),workingRevision:z.number().int(),releaseId:z.string().nullable(),workingChanges:z.boolean(),approvalPresent:z.boolean(),pending:z.boolean(),retryCommand:updateThemeProductionSchema.extend({action:z.literal('update-theme-production')}).optional()}).nullable(),evaluationUnavailable:z.string().nullable(),completed:z.boolean(),submissions:z.array(productionSubmissionSummarySchema),nextSubmissionCursor:z.number().int().nullable(),completedSubmissionCount:z.number().int().nonnegative(),pendingSubmissionCount:z.number().int().nonnegative(),
 savedSubmission:productionSubmissionSummarySchema.extend({result:z.json().nullable(),encoding:z.literal('json'),wire:z.string(),command:productionSubmissionCommandSchema}).optional(),abandonReason:z.string().optional(),createdAt:z.iso.datetime().optional(),updatedAt:z.iso.datetime(),
 operationHistory:z.strictObject({
  items:z.array(z.strictObject({requestId:z.uuidv4(),outcome:z.string(),at:z.iso.datetime()})),
  nextCursor:z.number().int().nullable(),
 }).optional(),
});
export const themeProductionListSchema=z.strictObject({
 items:z.array(themeProductionCaseSchema.pick({
  id:true,workflow:true,phase:true,status:true,version:true,theme:true,lease:true,createdAt:true,updatedAt:true,pendingSubmissionCount:true,abandonReason:true,
 }).extend({
  unfinished:z.array(z.string()),blockers:z.array(z.string()),
  assessment:z.strictObject({result:z.enum(['pass','needs-changes']),current:z.boolean(),evaluatedAt:z.iso.datetime()}).nullable(),
  publication:themeProductionCaseSchema.shape.publication.unwrap().omit({retryCommand:true}).nullable(),
 })),
 nextCursor:z.number().int().nullable(),
});
export const themeProductionResponseSchema=z.strictObject({outcome:z.enum(['found','none','busy','phase-mismatch','created','claimed','updated','prepared','dispatched','abandoned']),case:themeProductionCaseSchema.nullable(),replayed:z.boolean().optional(),leaseToken:z.uuidv4().optional(),submissionId:z.uuidv4().optional(),publicationError:z.strictObject({code:z.string(),message:z.string()}).optional()});
