import {Pool} from "pg";
import {z} from "zod";
import {knowledgeCommandSchema} from "../domain/knowledge-foundation";
import {createKnowledgeFoundationService,knowledgeDigest,KnowledgeError} from "./knowledge-foundation";
import {readSubmissionLegacyReferences} from "./knowledge-submission-legacy";
import {knowledgeReadConfiguration} from "./knowledge-read-runtime";
import {verifyKnowledgeReadSchema} from "./knowledge-publication-preview";
import {buildKnowledgePublishedRecord} from "../domain/knowledge-publication";
let pool:Pool|undefined;
/** Materialize the server-read public original, never user-supplied text. */
export async function prepareLegacyEntityTranslation(raw:unknown,dependencies?:{pool:Pool;capture:typeof readSubmissionLegacyReferences}){
 const input=z.strictObject({kind:z.enum(["entity","record"]),id:z.uuidv4(),requestId:z.uuidv4()}).parse(raw);
 const capture=dependencies?.capture??readSubmissionLegacyReferences;
 const selection={entityIds:input.kind==="entity"?[input.id]:[],claimIds:input.kind==="record"?[input.id]:[]};
 const captured=await capture(selection);
 const target=input.kind==="entity"?captured.entities.find(e=>e.id===input.id):captured.records.find(e=>e.id===input.id);
 if(!target)throw new KnowledgeError("公開中の対象がありません",404,"NOT_FOUND");
 const knowledge=dependencies?.pool??(pool??=new Pool({connectionString:knowledgeReadConfiguration().databaseUrl,max:2,statement_timeout:15000}));
 const service=createKnowledgeFoundationService(knowledge,dependencies?{}:{prepareSchema:()=>verifyKnowledgeReadSchema(knowledge)});
 const command=knowledgeCommandSchema.parse({action:"capture-legacy",requestId:input.requestId,entities:captured.entities.map(e=>{const proof=captured.legacy.entities.find(p=>p.id===e.id)!;return {id:e.id,content:e.content,revision:captured.revision,payload:proof.payload,sha256:proof.sha256};}),sources:captured.sources.map(s=>({id:s.id,content:s.content})),records:captured.records.map(e=>{const proof=captured.legacy.records.find(p=>p.id===e.id)!;return {id:e.id,content:e.content,revision:captured.revision,payload:proof.payload,sha256:proof.sha256};}),reason:"公開済みKGの原文を翻訳から参照"});
 const result=await service.execute({kind:"organizer",id:"public-legacy-translation"},command,{verify:async()=>{const current=await capture({revision:captured.revision,...selection});if(knowledgeDigest(current)!==knowledgeDigest(captured))throw new KnowledgeError("原文が更新されています。開き直してください",409,"TARGET_CHANGED");},prepare:async()=>{}}) as {entities:{id:string;revision:number}[];records:{id:string;revision:number}[]};
 const actor={kind:"reader" as const,id:"public"};
 if(input.kind==="entity")return {entity:await service.get(actor,"entity",input.id,result.entities.find(e=>e.id===input.id)!.revision)};
 const record=await service.get(actor,"record",input.id,1),entities=await Promise.all(result.entities.map(e=>service.get(actor,"entity",e.id,1))),sources=await Promise.all(captured.sources.map(e=>service.get(actor,"source",e.id,1)));
 return {record:buildKnowledgePublishedRecord(record,{entities,sources,mappings:[]})};
}

/** Public reads never materialize or update an original. */
export async function readLegacyTranslationReference(kind:"entity"|"record",id:string){
 z.uuidv4().parse(id);const knowledge=pool??=new Pool({connectionString:knowledgeReadConfiguration().databaseUrl,max:2,statement_timeout:15000});
 const service=createKnowledgeFoundationService(knowledge,{prepareSchema:()=>verifyKnowledgeReadSchema(knowledge)}),actor={kind:"reader" as const,id:"public"};
 if(kind==="entity")return {entity:await service.get(actor,"entity",id,1)};
 const record=await service.get(actor,"record",id,1);
 const entities=await Promise.all([...new Set([record.content.subjectId,record.content.objectId].filter((v):v is string=>!!v))].map(id=>service.get(actor,"entity",id,1)));
 const sources=await Promise.all(record.content.evidence.map(e=>service.get(actor,"source",e.source.id,e.source.revision)));
 return {record:buildKnowledgePublishedRecord(record,{entities,sources,mappings:[]})};
}
