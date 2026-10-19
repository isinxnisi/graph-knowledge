import { z } from "zod";
import { relationConditionSchema } from "../../../../lib/domain/relation-conditions";
import { matchWitnessSchema, RelationWitnessError } from "../../../../lib/domain/relation-patterns";
import { readRelationTransaction } from "../../../../lib/server/read-db";
import { verifyRelationWitness } from "../../../../lib/server/relation-pattern-execution";
import { handleRelationPost, RelationRequestError } from "../../../../lib/server/relation-http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const schema=z.strictObject({relation:relationConditionSchema,witness:matchWitnessSchema});
export const POST=(request:Request)=>handleRelationPost(request,async(raw,signal)=>{
 const parsed=schema.safeParse(raw);
 if(!parsed.success||process.env.GRAPH_DATASET!=="public-kg")throw new RelationRequestError(400,"INVALID_ARGUMENT","INVALID_WITNESS","一致証拠を確認できません。");
 return readRelationTransaction(async tx=>{try{await verifyRelationWitness(tx,parsed.data.relation,parsed.data.witness);}catch(e){if(e instanceof RelationWitnessError)throw new RelationRequestError(400,"INVALID_ARGUMENT","INVALID_WITNESS","一致証拠を確認できません。");throw e;}signal.throwIfAborted();return {verified:true,revision:parsed.data.witness.revision};},signal);
});
