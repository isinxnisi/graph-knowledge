import type { MemberCapsule } from "../../domain/member-capsule";
import { capsuleKnowledgeReferences, type KnowledgeReference } from "../../domain/capsule-knowledge-access";
import { knowledgePublicationPreview } from "../knowledge-publication-preview";
import { MemberError } from "./http";

/** SQL identifiers come only from server-owned call sites. Never interpolate input. */
export function knowledgeReferencesSql(snapshot:string) {
  const k=`${snapshot}#>'{content,document,knowledge}'`;
  const groups=([['records','record'],['entities','entity'],['sources','source'],['mappings','mapping']] as const).map(([group,kind])=>`SELECT jsonb_build_object('kind','${kind}','id',p->'id','revision',p->'revision') AS pin FROM jsonb_array_elements(COALESCE(${k}#>'{snapshot,${group}}','[]'::jsonb)) p`);
  groups.push(`SELECT (${k}->'theme')||'{"kind":"theme"}'::jsonb AS pin WHERE ${k}->'theme' IS NOT NULL`);
  return `(SELECT COALESCE(jsonb_agg(pin),'[]'::jsonb) FROM (${groups.join(' UNION ALL ')}) knowledge_pins)`;
}

/** No cache: current source stops apply to every public surface and old edition. */
export async function knowledgeReferencesAllowed(groups:KnowledgeReference[][]):Promise<boolean[]> {
  if(groups.every(group=>!group.length))return groups.map(()=>true);
  try {
    const service=await knowledgePublicationPreview(),results:boolean[]=[];
    for(let start=0;start<groups.length;start+=400)results.push(...await service.capsulesReadable(groups.slice(start,start+400)));
    return results;
  }
  catch { throw new MemberError(503,"KNOWLEDGE_PUBLICATION_UNAVAILABLE"); }
}
export async function requireKnowledgeReferences(groups:KnowledgeReference[][]) {
  if((await knowledgeReferencesAllowed(groups)).some(allowed=>!allowed))throw new MemberError(404,"NOT_FOUND");
}
/** Verify the immutable baseline as well as visibility before freezing a new edition. */
export async function requireKnowledgePublication(capsule:MemberCapsule) {
  const knowledge=capsule.content.document?.knowledge;
  if(!knowledge||!capsuleKnowledgeReferences(knowledge).length)return;
  let allowed:boolean;
  try {allowed=await (await knowledgePublicationPreview()).validateCapsuleKnowledge(knowledge);}
  catch {throw new MemberError(503,"KNOWLEDGE_PUBLICATION_UNAVAILABLE");}
  if(!allowed)throw new MemberError(403,"KNOWLEDGE_REFERENCE_UNAVAILABLE");
}
