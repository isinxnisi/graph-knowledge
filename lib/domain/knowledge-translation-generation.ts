import {z} from 'zod';
import {knowledgeTextTargetSchema,translationLanguageSchema} from './knowledge-translation';
export const TRANSLATION_GENERATION_POLICY='translation-context-v2';
export const translationGenerationDisclosure={profileId:'google-gemini-free-translation-context-v2',serviceName:'Google Gemini',notice:'無料APIでは、送信内容がGoogleのサービス改善に利用される場合があります。公開済みの原文と、その対象・関係・資料の文脈を送ります。'};
export const translationGenerationInputSchema=z.strictObject({action:z.enum(['request','status','cancel']),target:knowledgeTextTargetSchema,language:translationLanguageSchema,profileId:z.string().optional()});
export const translationGenerationStatusSchema=z.object({id:z.string(),state:z.enum(['none','queued','running','retry','quota','ready','attention','cancelled']),reason:z.string(),text:z.string().nullable(),nextAttemptAt:z.string().nullable(),attempts:z.number().int(),workerAvailable:z.boolean()});
export type TranslationGenerationStatus=z.infer<typeof translationGenerationStatusSchema>;
