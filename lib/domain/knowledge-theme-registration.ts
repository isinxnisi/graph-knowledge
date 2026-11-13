import {readThemeQualityGuideSchema,updateThemeQualityGuideSchema} from './theme-quality-guide';
import {themeEditorialInputSchema} from './theme-editorial';
import {z} from 'zod';
import {productPinSchema,productAuthoringCommandSchema,uploadEditorialImageSchema} from "./product-authoring";
import {readThemeTranslationSchema,submitThemeTranslationSchema} from './knowledge-theme-translation';
import {missionMcpPackageSchema} from './knowledge-mission-mcp';
import {knowledgeThemeContentSchema,knowledgePinSchema,knowledgeTimelineSchema,knowledgeIdSchema} from './knowledge-foundation';

/** Editorial composition is independent of the evidence review of its records.
 * This contract is for an authenticated operator's ChatGPT connection, not a
 * public/member Theme-posting form. Unreviewed items never become Theme pins. */
export const themeRegistrationInputSchema=z.strictObject({
 requestId:z.uuidv4(),
 title:knowledgeThemeContentSchema.shape.title,
 description:knowledgeThemeContentSchema.shape.description,
 textLanguages:knowledgeThemeContentSchema.shape.textLanguages,
 initialView:knowledgeThemeContentSchema.shape.initialView,
 package:missionMcpPackageSchema.nullable().default(null),
 recordKeys:z.array(z.string().min(1).max(160)).max(20).default([]),
 recordPins:z.array(knowledgePinSchema).max(200).default([]),
 productPins:z.array(productPinSchema).max(24).optional().describe("Optional exact product revisions returned by save_product. Images and products may be added later."),
 presentation:themeEditorialInputSchema.optional(),
 timeline:knowledgeTimelineSchema.optional(),
}).superRefine((v,c)=>{
 const keys=v.package?.items.map(i=>i.key)??[];
 if(v.package?.items.some(i=>i.themes?.length))c.addIssue({code:'custom',path:['package','items'],message:'新規テーマの項目に別テーマへの追加を混ぜないでください。既存テーマには更新操作を使えます。'});
 if(new Set(v.recordPins.map(p=>p.id)).size!==v.recordPins.length)c.addIssue({code:'custom',path:['recordPins'],message:'同じ記録は一つの内容版を指定してください。'});
 if(new Set(keys).size!==keys.length)c.addIssue({code:'custom',path:['package','items'],message:'項目のkeyが重複しています。'});
 if(new Set(v.recordKeys).size!==v.recordKeys.length||v.recordKeys.some(k=>!keys.includes(k)))c.addIssue({code:'custom',path:['recordKeys'],message:'テーマへ含める項目のkeyを確認してください。'});
 if(!v.package&&!v.recordPins.length)c.addIssue({code:'custom',path:['recordPins'],message:'根拠付き項目か、公開済みの記録版を指定してください。'});
 if(v.package?.items.some(i=>i.operation==='correct-record'))c.addIssue({code:'custom',path:['package','items'],message:'新しいテーマの受付では、既存記録の訂正を混ぜず、追加する情報や根拠を指定してください。'});
});
export type ThemeRegistrationInput=z.infer<typeof themeRegistrationInputSchema>;
/** A theme edit is an editorial change to one observed revision. Imported facts
 * still pass the common evidence pipeline; omitted fields and members survive. */
export const themeUpdateInputSchema=z.strictObject({
 requestId:z.uuidv4(),
 target:knowledgePinSchema.describe('Existing theme id and exact revision returned by read_theme. Never guess the current revision.'),
 changes:z.strictObject({
  title:knowledgeThemeContentSchema.shape.title.optional(),
  description:z.string().max(8000).optional(),
  textLanguages:knowledgeThemeContentSchema.shape.textLanguages,
  initialView:z.enum(['graph','timeline','split']).optional(),
  productPins:z.array(productPinSchema).max(24).optional().describe("Complete product selection for the new theme edition. Omit to retain; [] removes only from the new edition."),
  presentation:themeEditorialInputSchema.optional().describe("Complete locale-specific editorial presentation. Omit to retain; [] removes from the new edition only."),
  timeline:knowledgeTimelineSchema.nullable().optional(),
 }).default({}),
 package:missionMcpPackageSchema.nullable().default(null),
 recordKeys:z.array(z.string().min(1).max(160)).max(20).default([]),
 recordPins:z.array(knowledgePinSchema).max(200).default([]).describe('Add existing public records, or explicitly replace a selected record revision. Other theme records are kept.'),
 removeRecordIds:z.array(knowledgeIdSchema).max(400).default([]).describe('Remove only these theme memberships. Does not delete common knowledge or change saved Capsules.'),
 recordOrder:z.array(knowledgeIdSchema).max(400).optional().describe('Optional complete final order. Use item:KEY for a newly submitted package item.'),
 reason:z.string().trim().min(1).max(4000),
}).superRefine((v,c)=>{
 const keys=v.package?.items.map(i=>i.key)??[];
 if(new Set(keys).size!==keys.length)c.addIssue({code:'custom',path:['package','items'],message:'項目のkeyが重複しています。'});
 if(new Set(v.recordKeys).size!==v.recordKeys.length||v.recordKeys.some(k=>!keys.includes(k)))c.addIssue({code:'custom',path:['recordKeys'],message:'テーマへ含める項目のkeyを確認してください。'});
 for(const [field,ids] of [['recordPins',v.recordPins.map(p=>p.id)],['removeRecordIds',v.removeRecordIds],['recordOrder',v.recordOrder??[]]] as const)
  if(new Set(ids).size!==ids.length)c.addIssue({code:'custom',path:[field],message:'同じ記録は一度だけ指定してください。'});
 if(v.removeRecordIds.some(id=>v.recordPins.some(p=>p.id===id)))c.addIssue({code:'custom',path:['removeRecordIds'],message:'追加・更新と掲載解除を同時に指定できません。'});
 if(!v.package&&!v.recordPins.length&&!v.removeRecordIds.length&&!v.recordOrder&&!Object.keys(v.changes).length)c.addIssue({code:'custom',message:'変更する内容を指定してください。'});
 for(const [i,item] of (v.package?.items??[]).entries()){
  if(item.themes?.some(p=>p.id!==v.target.id||p.revision!==v.target.revision))c.addIssue({code:'custom',path:['package','items',i,'themes'],message:'この更新で追加するテーマは、対象テーマの取得版だけを指定してください。'});
  if(item.about?.kind==='theme'&&(item.about.id!==v.target.id||item.about.revision!==v.target.revision))c.addIssue({code:'custom',path:['package','items',i,'about'],message:'テーマの情報は、この更新の対象テーマに結び付けてください。'});
 }
});
export type ThemeUpdateInput=z.infer<typeof themeUpdateInputSchema>;
export const themeAuthoringRequestSchema=z.union([themeRegistrationInputSchema,themeUpdateInputSchema]);
export type ThemeAuthoringRequest=z.infer<typeof themeAuthoringRequestSchema>;
/** Replace one pending item, never the immutable registration envelope. */
export const amendThemeRegistrationSchema=z.strictObject({
 requestId:z.uuidv4().describe('A new amendment operation ID; retry identical content with this same ID.'),
 registrationRequestId:z.uuidv4().describe('The original theme registration requestId; this does not change.'),
 reason:z.string().trim().min(1).max(2000),
 items:z.array(z.strictObject({
  key:knowledgeIdSchema,
  expectedRevision:z.number().int().positive().max(20).describe('inputRevision returned by get_theme_registration, not a Record revision.'),
  item:missionMcpPackageSchema.shape.items.element,
  entities:missionMcpPackageSchema.shape.entities.removeDefault().optional(),
  sources:missionMcpPackageSchema.shape.sources.removeDefault().optional(),
  entityPins:missionMcpPackageSchema.shape.entityPins.removeDefault().optional(),
  sourcePins:missionMcpPackageSchema.shape.sourcePins.removeDefault().optional(),
 })).min(1).max(10),
}).superRefine((v,c)=>{
 if(new Set(v.items.map(i=>i.key)).size!==v.items.length)c.addIssue({code:'custom',path:['items'],message:'修正する項目keyが重複しています。'});
 for(const [i,vv] of v.items.entries())if(vv.item.key!==vv.key)c.addIssue({code:'custom',path:['items',i,'item','key'],message:'修正対象の項目keyは変更できません。'});
});
export type AmendThemeRegistration=z.infer<typeof amendThemeRegistrationSchema>;
export const themeRegistrationStatusSchema=z.strictObject({requestId:z.uuidv4(),itemKey:knowledgeIdSchema.optional(),inputRevision:z.number().int().positive().optional()}).superRefine((v,c)=>{if(v.inputRevision&&!v.itemKey)c.addIssue({code:'custom',path:['itemKey'],message:'入力履歴を読む項目keyを指定してください。'});});
export const themeRegistrationCommandSchema=z.discriminatedUnion('action',[
 ...productAuthoringCommandSchema.options,
 uploadEditorialImageSchema.safeExtend({action:z.literal('upload-editorial-image')}),
 readThemeTranslationSchema.extend({action:z.literal('read-translation')}),
 submitThemeTranslationSchema.safeExtend({action:z.literal('submit-translation')}),
 z.strictObject({action:z.literal('translation-status'),requestId:z.uuidv4()}),
 z.strictObject({action:z.literal('cancel-translation'),requestId:z.uuidv4()}),
 themeRegistrationInputSchema.safeExtend({action:z.literal('submit-theme')}),
 themeUpdateInputSchema.safeExtend({action:z.literal('update-theme')}),
 themeRegistrationStatusSchema.safeExtend({action:z.literal('theme-status')}),
 amendThemeRegistrationSchema.safeExtend({action:z.literal('amend-theme-items')}),
 z.strictObject({action:z.literal('cancel-theme'),requestId:z.uuidv4()}),
 z.strictObject({action:z.literal('theme-guide')}),
 readThemeQualityGuideSchema.extend({action:z.literal('read-quality-guide')}),
 updateThemeQualityGuideSchema.safeExtend({action:z.literal('update-quality-guide')}),
 z.strictObject({action:z.literal('find-themes'),query:z.string().trim().max(200).default(''),cursor:z.number().int().min(0).max(1000000).default(0)}),
 z.strictObject({action:z.literal('read-theme'),theme:z.string().min(1).max(2000),revision:z.number().int().positive().optional()}),
 z.strictObject({action:z.literal('find-knowledge'),kind:z.enum(['entity','record','source']),query:z.string().trim().max(200).default(''),cursor:z.number().int().min(0).max(1000000).default(0)}),
 z.strictObject({action:z.literal('read-knowledge'),kind:z.enum(['entity','record','source']),id:knowledgeIdSchema,revision:z.number().int().positive().optional()}),
]);
export type ThemeRegistrationCommand=z.infer<typeof themeRegistrationCommandSchema>;
