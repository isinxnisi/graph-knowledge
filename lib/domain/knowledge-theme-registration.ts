import {z} from 'zod';
import {missionMcpPackageSchema} from './knowledge-mission-mcp';
import {knowledgeThemeContentSchema,knowledgePinSchema,knowledgeTimelineSchema} from './knowledge-foundation';

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
 timeline:knowledgeTimelineSchema.optional(),
}).superRefine((v,c)=>{
 const keys=v.package?.items.map(i=>i.key)??[];
 if(new Set(v.recordPins.map(p=>p.id)).size!==v.recordPins.length)c.addIssue({code:'custom',path:['recordPins'],message:'同じ記録は一つの内容版を指定してください。'});
 if(new Set(keys).size!==keys.length)c.addIssue({code:'custom',path:['package','items'],message:'項目のkeyが重複しています。'});
 if(new Set(v.recordKeys).size!==v.recordKeys.length||v.recordKeys.some(k=>!keys.includes(k)))c.addIssue({code:'custom',path:['recordKeys'],message:'テーマへ含める項目のkeyを確認してください。'});
 if(!v.package&&!v.recordPins.length)c.addIssue({code:'custom',path:['recordPins'],message:'根拠付き項目か、公開済みの記録版を指定してください。'});
 if(v.package?.items.some(i=>i.operation==='correct-record'))c.addIssue({code:'custom',path:['package','items'],message:'新しいテーマの受付では、既存記録の訂正を混ぜず、追加する情報や根拠を指定してください。'});
});
export type ThemeRegistrationInput=z.infer<typeof themeRegistrationInputSchema>;
export const themeRegistrationCommandSchema=z.discriminatedUnion('action',[
 themeRegistrationInputSchema.safeExtend({action:z.literal('submit-theme')}),
 z.strictObject({action:z.literal('theme-status'),requestId:z.uuidv4()}),
 z.strictObject({action:z.literal('cancel-theme'),requestId:z.uuidv4()}),
]);
export type ThemeRegistrationCommand=z.infer<typeof themeRegistrationCommandSchema>;
