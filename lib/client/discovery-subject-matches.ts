import { z } from "zod";
import { entityDetailSchema } from "../domain/api";
import { matchWitnessSchema, witnessSubjectId } from "../domain/relation-patterns";
import { relationConditionKey, type RelationCondition } from "../domain/relation-conditions";

const responseSchema = z.strictObject({ version:z.literal(1), revision:z.string(), items:z.array(z.strictObject({
  entity:entityDetailSchema, status:z.enum(["matched","not-matched","incompatible"]), witness:matchWitnessSchema.nullable(),
})).max(24) });
export type SubjectMatches = z.infer<typeof responseSchema>;

/** Validate the entire response before allowing selection or Graph handoff. */
export async function fetchSubjectMatches(ids:string[], relation:RelationCondition|null, revision:string, signal:AbortSignal):Promise<SubjectMatches> {
  const response=await fetch("/api/discovery/subject-matches",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({version:1,ids,relation,revision}),signal,cache:"no-store"});
  if(!response.ok)throw Error("Unconfirmed candidates");
  const matches=responseSchema.parse(await response.json());
  if(signal.aborted)throw Error("Aborted");
  if(matches.revision!==revision||matches.items.length!==ids.length||new Set(matches.items.map(i=>i.entity.id)).size!==ids.length||matches.items.some(i=>
    !ids.includes(i.entity.id)||i.status==="matched"&&relation&&!i.witness||i.status!=="matched"&&i.witness!==null||
    i.witness&&(!relation||witnessSubjectId(i.witness)!==i.entity.id||i.witness.revision!==revision||i.witness.conditionKey!==relationConditionKey(relation))
  ))throw Error("Unexpected candidates");
  return matches;
}
