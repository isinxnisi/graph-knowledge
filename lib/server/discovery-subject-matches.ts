import "server-only";
import { z } from "zod";
import { relationConditionSchema, relationConditionKey } from "../domain/relation-conditions";
import { patternAcceptsRoot } from "../domain/relation-patterns";
import { readRelationTransaction } from "./read-db";
import { readPublicRevision } from "./public-revision";
import { findFirstRelationRoutes, materializeRelationRoutes } from "./relation-pattern-execution";
import { entityDetail } from "./mappers";
import { handleRelationPost, RelationRequestError } from "./relation-http";
const schema=z.strictObject({version:z.literal(1),ids:z.array(z.uuidv4()).max(24).refine(ids=>new Set(ids).size===ids.length),relation:relationConditionSchema.nullable(),revision:z.string().min(1).max(160)});
export const handleSubjectMatches=(request:Request)=>handleRelationPost(request,async(raw,signal)=>{
 const parsed=schema.safeParse(raw);if(!parsed.success||process.env.GRAPH_DATASET!=="public-kg")throw new RelationRequestError(400,"INVALID_ARGUMENT","INVALID_REQUEST","候補の条件が不正です。");
 const input=parsed.data;
 return readRelationTransaction(async tx=>{
  const revision=await readPublicRevision(tx,input.revision);
  const found=await tx.run("UNWIND $ids AS id MATCH(e:Entity {id:id}) RETURN properties(e) AS entity",{ids:input.ids});
  const entities=found.records.map(r=>entityDetail(r.get("entity")));
  if(entities.length!==input.ids.length)throw new RelationRequestError(400,"INVALID_ARGUMENT","INVALID_WITNESS","候補を再確認してください。");
  const items=[];
  for(const kind of ["work","person","organization","event"] as const){
   const group=entities.filter(e=>e.kind===kind),relation=input.relation;
   const compatible=!relation||relation.type==="adjacent"||patternAcceptsRoot(relation,kind);
   const context={q:"",kind,nameTarget:"subject" as const};
   const routes=compatible&&relation?await findFirstRelationRoutes(tx,relation,group.map(e=>e.id),context):new Map();
   if(relation)await materializeRelationRoutes(tx,relation,[...routes.values()],revision);
   for(const entity of group){const route=routes.get(entity.id);items.push({entity,status:!compatible?"incompatible":!relation||route?"matched":"not-matched",witness:route&&relation?{version:2,dataset:"public-kg",revision,conditionKey:relationConditionKey(relation),route,subjectId:entity.id,subjectPosition:relation.type==="pattern"?(kind==="person"?"contributor":"work"):"endpoint",matchContext:context}:null});}
  }
  await readPublicRevision(tx,revision);signal.throwIfAborted();return {version:1,revision,items};
 },signal);
});
