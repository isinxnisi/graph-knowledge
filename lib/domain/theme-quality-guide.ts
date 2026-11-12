import {z} from 'zod';

export const THEME_QUALITY_GUIDE_ID='theme-authoring-quality';
export const readThemeQualityGuideSchema=z.strictObject({
 revision:z.number().int().positive().optional(),
 historyBefore:z.number().int().positive().optional(),
});
export const updateThemeQualityGuideSchema=z.strictObject({
 requestId:z.uuidv4(),expectedRevision:z.number().int().nonnegative(),
 markdown:z.string().min(1).max(160000).refine(v=>v.trim().length>0,'本文を入力してください。').optional(),
 restoreRevision:z.number().int().positive().optional(),
 reason:z.string().trim().min(1).max(500),
}).superRefine((v,c)=>{if((v.markdown!==undefined)===(v.restoreRevision!==undefined))c.addIssue({code:'custom',message:'本文か復元する版を一つ指定してください。'});});
export type ReadThemeQualityGuide=z.infer<typeof readThemeQualityGuideSchema>;
export type UpdateThemeQualityGuide=z.infer<typeof updateThemeQualityGuideSchema>;
