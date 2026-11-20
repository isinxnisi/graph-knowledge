import {z} from 'zod';
import {uploadProductImageSchema} from './product-authoring';
import {knowledgePinSchema} from './knowledge-foundation';

export const automationDigest=z.string().regex(/^[a-f0-9]{64}$/);
const locale=z.enum(['ja','en']);
export const automationFence=z.strictObject({
  requestId:z.uuidv4(),caseId:z.uuidv4(),executionId:z.uuidv4(),leaseToken:z.uuidv4(),expectedVersion:z.number().int().positive(),
});
export const generateThemeImageSchema=automationFence.extend({
  prompt:z.string().trim().min(10).max(2500).describe('A standalone illustration brief. Exclude unpublished source text, credentials and personal data.'),
  alt:uploadProductImageSchema.shape.alt,
});
export const captureThemePreviewSchema=automationFence.extend({targetDigest:automationDigest});
export const readThemeAutomationSchema=z.strictObject({caseId:z.uuidv4(),automationId:z.uuidv4().optional()});
export const readThemeEvidenceSchema=automationFence.extend({
  automationId:z.uuidv4(),name:z.string().regex(/^(ja|en)-(390|1440)-(overview|image|timeline-source|story-source)\.png$/),
});
export const reportThemeExternalSchema=automationFence.extend({
  code:z.enum(['BLOCKED_FILE_REFERENCE','BROWSER_UNAVAILABLE','EVIDENCE_VIEW_UNAVAILABLE']),
});
export const automationTargetSchema=z.strictObject({
  theme:knowledgePinSchema,digest:automationDigest,guideRevision:z.number().int().nonnegative(),
  locales:z.array(locale).min(1).max(2),imageIds:z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(2),
});
export const themeAutomationActions=z.discriminatedUnion('action',[
  generateThemeImageSchema.extend({action:z.literal('generate-theme-image')}),
  captureThemePreviewSchema.extend({action:z.literal('capture-theme-preview')}),
  readThemeAutomationSchema.extend({action:z.literal('read-theme-automation')}),
  readThemeEvidenceSchema.extend({action:z.literal('read-theme-evidence')}),
  reportThemeExternalSchema.extend({action:z.literal('report-theme-external')}),
]);
export type ThemeAutomationCommand=z.infer<typeof themeAutomationActions>;
export type AutomationTarget=z.infer<typeof automationTargetSchema>;
