import {z} from 'zod';
import {knowledgePinSchema} from './knowledge-foundation';
import {knowledgeTextTargetSchema,translationLanguageSchema,translationProposalSchema,translationTextLimit} from './knowledge-translation';

export const readThemeTranslationSchema=z.strictObject({theme:knowledgePinSchema,target:knowledgeTextTargetSchema,language:translationLanguageSchema,revision:z.number().int().positive().optional()});
export const submitThemeTranslationSchema=z.strictObject({
 requestId:z.uuidv4(),theme:knowledgePinSchema,
 translation:translationProposalSchema.extend({text:z.string().trim().min(1).max(4000),expectedRevision:z.number().int().nonnegative()}),
 // Accept the old explicit field for immutable retries. The operator route
 // always uses service attribution, irrespective of this legacy preference.
 attribution:z.enum(['profile','anonymous']).default('profile').describe('Legacy retry compatibility only. This operator API is system data intake: no public member credit, personal profile link or personal activity is created.'),
}).superRefine((v,c)=>{if(v.translation.text.length>translationTextLimit(v.translation.target))c.addIssue({code:'custom',path:['translation','text'],message:'訳文がこの項目の文字数上限を超えています。'});});
export type ReadThemeTranslation=z.infer<typeof readThemeTranslationSchema>;
export type SubmitThemeTranslation=z.infer<typeof submitThemeTranslationSchema>;
