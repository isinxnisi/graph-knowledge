import {describe,expect,it} from "vitest";
import {knowledgeRecordContentSchema} from "../lib/domain/knowledge-foundation";
import {knowledgeSubmissionContentSchema,type KnowledgeSubmissionContext} from "../lib/domain/knowledge-submission";
import {submissionIntentIssues} from "../lib/domain/knowledge-submission-intent";

const record=knowledgeRecordContentSchema.parse({kind:"note",subjectId:"webb",assertion:"Webbは12:20 UTCに打ち上げられた。",evidence:[{id:"original",source:{id:"nasa",revision:1},locator:"Launch",excerpt:"Webb launched at 12:20 UTC.",textLanguages:{excerpt:{tag:"en",basis:"declared"}},stance:"support"}]});
// Reordering every nested object reproduces the JSONB/context vs parsed DTO
// boundary without depending on a private production submission.
function reorder(value:unknown):unknown{
 if(Array.isArray(value))return value.map(reorder);
 if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reorder(v)]));
 return value;
}
const context={entities:[],sources:[],records:[{id:"launch",revision:2,content:reorder(record)}]} as KnowledgeSubmissionContext;
function draft(){return knowledgeSubmissionContentSchema.parse({schemaVersion:2,attribution:"profile",title:"根拠を追加",sourcePins:[{id:"nasa",revision:1}],items:[{key:"item",operation:"add-evidence",about:{kind:"record",id:"launch",revision:2},correction:{id:"launch",revision:2},record:{...record,evidence:[...record.evidence,{id:"new",source:{id:"nasa",revision:1},locator:"Launch video",excerpt:"Webb launched at 12:20 UTC.",stance:"support"}]}}]});}
describe("immutable submission comparison across JSONB",()=>{
 it("accepts unchanged nested evidence despite object-key order",()=>expect(submissionIntentIssues(draft(),context)).toEqual([]));
 it("still rejects altered original evidence",()=>{const value=draft();value.items[0].record.evidence[0].excerpt="Different quotation";expect(submissionIntentIssues(value,context).join(" ")).toContain("元の根拠を残したまま");});
 it("still rejects changed facts and a missing new source",()=>{const value=draft();value.items[0].record.assertion="別の内容";value.items[0].record.evidence.pop();const issues=submissionIntentIssues(value,context).join(" ");expect(issues).toContain("元の事実や意味を変更できません");expect(issues).toContain("新しい根拠を追加");});
});
