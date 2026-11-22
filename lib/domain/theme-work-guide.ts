import {z} from 'zod';

export const workGuideFocuses = ['planning','timeline','sources','reading','images','registration','translation','preview','handoff','review','publication','recovery'] as const;
export const workGuidePhaseSchema = z.enum(['production','review']);
export const workGuideRequiredKeys = ['principles','whole-theme-review'] as const;
export const workGuideSectionKeys = ['timeline-and-sources','reading-experience','images','registration-and-translation','review-and-publication'] as const;
const key = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const markdown = z.string().min(1).max(60000).refine(value => value.trim().length > 0);
const profiles = z.array(key).max(16);

export const evidenceRequirementsSchema = z.strictObject({
 requiredLocales: z.array(z.enum(['ja','en'])).max(2),
 requiredScreens: z.array(z.enum(['image','timeline-source','story-source'])).max(3),
});
export type EvidenceRequirements = z.infer<typeof evidenceRequirementsSchema>;

export const workGuideContentSchema = z.strictObject({
 required: z.strictObject({principles:markdown,'whole-theme-review':markdown}),
 sections: z.array(z.strictObject({
  key:z.enum(workGuideSectionKeys),focuses:z.array(z.enum(workGuideFocuses)).min(1),markdown,
 })).length(workGuideSectionKeys.length).refine(values => new Set(values.map(value => value.key)).size === workGuideSectionKeys.length),
 assistance: z.array(z.strictObject({
  key,markdown,observation:z.string().min(1).max(2000),retireWhen:z.string().min(1).max(1000),
  revisitOn:z.iso.date(),enabled:z.boolean(),profiles,phases:z.array(workGuidePhaseSchema).max(2),
  focuses:z.array(z.enum(workGuideFocuses)).max(workGuideFocuses.length),
 })).max(30).refine(values => new Set(values.map(value => value.key)).size === values.length),
 evidence:evidenceRequirementsSchema,
});
export type WorkGuideContent = z.infer<typeof workGuideContentSchema>;

export const readThemeWorkGuideSchema = z.strictObject({
 phase:workGuidePhaseSchema,caseId:z.uuidv4().optional(),
 contractVersion:z.literal(2).optional(),focuses:z.array(key).max(20).default([]),
 profile:key.optional(),knownVersions:z.record(key,z.number().int().positive()).optional(),
 revision:z.number().int().positive().optional(),historyBefore:z.number().int().positive().optional(),
 management:z.boolean().optional().describe('Return the complete editable structured guide and revision history. Use for an explicitly requested guide edit.'),
});
export type ReadThemeWorkGuide = z.infer<typeof readThemeWorkGuideSchema>;
export const updateThemeWorkGuideSchema = z.strictObject({
 expectedRevision:z.number().int().nonnegative(),
 requestId:z.uuidv4(),reason:z.string().trim().min(1).max(500),
 changes:workGuideContentSchema.optional(),restoreRevision:z.number().int().positive().optional(),
}).refine(value => (value.changes === undefined) !== (value.restoreRevision === undefined), 'Supply a complete edited guide or a revision to restore.');
export type UpdateThemeWorkGuide = z.infer<typeof updateThemeWorkGuideSchema>;

export const guideVersionsSchema = z.strictObject({
 id:z.string(),revision:z.number().int().nonnegative(),
 criteriaRevision:z.number().int().nonnegative().optional(),evidenceRevision:z.number().int().nonnegative().optional(),
});
export type GuideVersions = z.infer<typeof guideVersionsSchema>;
