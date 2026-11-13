import type {PoolClient} from "pg";
import {knowledgeIdSchema} from "../domain/knowledge-foundation";
import {identityGroup} from "./knowledge-identity-resolution";
import {KnowledgeError,resolvePublicKnowledgeTheme} from "./knowledge-foundation";

/** Resolve explicit identities and readable theme context for legacy catalogue fallback.
 * Registered product discovery is independent of theme productPins.
 * Names and graph neighbors do not establish product associations.
 */
export async function readEntityProductContext(c:PoolClient,rawId:string){
 const entityIds=await identityGroup(c,[knowledgeIdSchema.parse(rawId)]);
 const candidates=(await c.query(`SELECT r.id,r.revision FROM knowledge75.objects o
  JOIN knowledge75.revisions r ON r.kind=o.kind AND r.id=o.id AND r.revision=o.current_revision
  JOIN knowledge75.published_revisions p ON p.kind=r.kind AND p.id=r.id AND p.revision=r.revision
  WHERE o.kind='theme' AND o.visibility='public' AND EXISTS (
   SELECT 1 FROM jsonb_array_elements(r.content->'entityPins') pin WHERE pin->>'id'=ANY($1::text[]))
  ORDER BY r.id`,[entityIds])).rows;
 const products=new Map<string,{id:string;revision:number}>();
 const themes:{id:string;revision:number;editorial:boolean}[]=[];
 for(const candidate of candidates){
  try{
   const {theme}=await resolvePublicKnowledgeTheme(c,candidate.id,Number(candidate.revision));
   themes.push({id:theme.id,revision:theme.revision,editorial:theme.content.productPins!==undefined});
   for(const pin of theme.content.productPins??[])if((products.get(pin.id)?.revision??0)<pin.revision)products.set(pin.id,pin);
  }catch(error){if(error instanceof KnowledgeError && [403,404].includes(error.status))continue;throw error;}
 }
 return {entityIds,productPins:[...products.values()],themes};
}
