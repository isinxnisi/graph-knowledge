import {z} from 'zod';
import {knowledgeEntityContentSchema,knowledgePinSchema,type KnowledgeEntityContent} from './knowledge-foundation';
export const entityCorrectionSchema=z.strictObject({target:knowledgePinSchema,content:z.strictObject({...knowledgeEntityContentSchema.shape,name:z.string().trim().max(200),aliases:z.array(z.string().trim().max(200)).max(30).default([])}),reason:z.string().trim().max(4000)});
export function entityCorrectionSummary(before:KnowledgeEntityContent,after:KnowledgeEntityContent){
 const fields=([['name','名前'],['aliases','別名'],['description','説明'],['textLanguages','原文の言語'],['language','言語']] as const).filter(([k])=>JSON.stringify(before[k]??null)!==JSON.stringify(after[k]??null)).map(([,label])=>label);
 return '「'+after.name+'」の'+(fields.length?fields.join('・'):'対象情報')+'を訂正';
}
