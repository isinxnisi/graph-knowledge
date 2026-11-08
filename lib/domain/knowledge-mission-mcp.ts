import {z} from 'zod';
import {knowledgeImportPackageSchema} from './knowledge-import';
import {knowledgeSubmissionContentSchema} from './knowledge-submission';
import {knowledgeEntityContentSchema,knowledgeSourceContentSchema,knowledgeIdSchema,knowledgePinSchema} from './knowledge-foundation';

const missionMcpItemSchema=knowledgeSubmissionContentSchema.shape.items.element.extend({
 operation:z.enum(['create-entity','create-relation','add-information','add-evidence','correct-record']),
 correction:knowledgePinSchema.optional().describe('Required for add-evidence and correct-record: the existing Record id and revision from the claimed snapshot. Also set about to kind record with this exact same id and revision.'),
 reason:z.string().trim().max(4000).optional(),
}).superRefine((item,context)=>{
 if(['add-evidence','correct-record'].includes(item.operation)&&(!item.correction||item.about?.kind!=='record'||item.about.id!==item.correction.id||item.about.revision!==item.correction.revision))context.addIssue({code:'custom',path:['correction'],message:'For add-evidence and correct-record, set correction and about (kind: record) to the same existing Record id and revision from the claimed snapshot.'});
 if(item.operation==='correct-record'&&!item.reason?.trim())context.addIssue({code:'custom',path:['reason'],message:'State why this fixed Record version needs correcting.'});
});

export const missionMcpPackageSchema=knowledgeImportPackageSchema.omit({legacy:true}).extend({
 entities:z.array(z.strictObject({id:knowledgeIdSchema,content:knowledgeEntityContentSchema})).max(40).default([]),
 sources:z.array(z.strictObject({id:knowledgeIdSchema,content:knowledgeSourceContentSchema})).max(5).default([]),
 entityPins:z.array(knowledgePinSchema).max(40).default([]),sourcePins:z.array(knowledgePinSchema).max(80).default([]),
 items:z.array(missionMcpItemSchema).min(1).max(10),
});
