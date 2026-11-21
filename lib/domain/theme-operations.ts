import {z} from 'zod';
import {themeProductionCaseSchema} from './theme-production';

export const operatorThemesSchema=z.object({items:z.array(z.object({
 id:z.string(),title:z.string(),currentRevision:z.number().int().positive(),publishedRevision:z.number().int().positive().nullable(),
 state:z.enum(['production','review','published','inactive']),caseId:z.uuidv4().nullable().optional(),caseBrief:z.string().optional(),unfinished:z.array(z.string()),blockers:z.array(z.string()),
}))});
export type OperatorTheme=z.infer<typeof operatorThemesSchema>['items'][number];

export const operatorThemeCaseDetailsSchema=themeProductionCaseSchema.pick({
 id:true,version:true,workflow:true,phase:true,status:true,updatedAt:true,lease:true,abandonReason:true,
 pendingSubmissionCount:true,submissions:true,nextSubmissionCursor:true,operationHistory:true,
}).extend({
 progress:themeProductionCaseSchema.shape.progress.omit({artifacts:true}),
 publicationPending:z.boolean(),
 publicationConflict:z.boolean(),
 assessment:themeProductionCaseSchema.shape.lastWholeThemeAssessment.unwrap()
  .pick({result:true,current:true,evaluatedAt:true,summary:true}).nullable(),
});
