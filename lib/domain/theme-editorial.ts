import {z} from 'zod';

const pin=z.strictObject({id:z.string().min(1).max(200),revision:z.number().int().positive()});
export const editorialImageId=z.string().regex(/^[a-f0-9]{64}$/);
const record=z.strictObject({target:pin,shortTitle:z.string().min(1).max(180),timelineSummary:z.string().max(260).optional(),chapterQuestion:z.string().min(1).max(180).optional(),explanations:z.array(z.strictObject({record:pin,role:z.enum(['background','importance','insight','next']),heading:z.string().min(1).max(100).optional()})).max(20).default([])});
const note=z.strictObject({target:pin,text:z.string().min(1).max(500),supportingRecords:z.array(pin).min(1).max(20)});
/** Original editorial prose is locale-specific. Facts remain pinned, reviewed records. */
export const themeEditorialLocaleSchema=z.strictObject({
 locale:z.enum(['ja','en']),hook:z.string().min(1).max(300),lead:z.string().max(1200),
 imageId:editorialImageId.optional(),entityNotes:z.array(note).max(100).default([]),records:z.array(record).max(400).default([]),
});
export const themeEditorialInputSchema=z.array(themeEditorialLocaleSchema).max(2).superRefine((rows,c)=>{
 if(new Set(rows.map(r=>r.locale)).size!==rows.length)c.addIssue({code:'custom',message:'言語ごとに一つの編集内容を指定してください。'});
 for(const [i,row] of rows.entries())for(const key of ['records','entityNotes'] as const)
  if(new Set(row[key].map(v=>v.target.id)).size!==row[key].length)c.addIssue({code:'custom',path:[i,key],message:'同じ項目を重複指定できません。'});
});
export const resolvedEditorialImageSchema=z.strictObject({id:editorialImageId,src:z.string().regex(/^\/api\/knowledge\/product-images\/[a-f0-9]{64}$/),width:z.number().int().positive().max(1600),height:z.number().int().positive().max(1600),kind:z.literal('illustration'),alt:z.string().max(300),caption:z.string().max(1000),credit:z.string().max(300),sourceUrl:z.url().optional(),termsUrl:z.url().optional(),checkedAt:z.iso.date(),focus:z.string().default('50% 50%')});
export const resolvedThemeEditorialSchema=z.array(themeEditorialLocaleSchema.omit({imageId:true}).extend({image:resolvedEditorialImageSchema.optional()})).max(2);
export type ThemeEditorialInput=z.infer<typeof themeEditorialInputSchema>;
