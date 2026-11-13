import "server-only";
import {cache} from "react";
import {knowledgeIdSchema} from "../domain/knowledge-ids";
import {knowledgeCapability} from "./knowledge-deployment";
import {knowledgeReadGuard} from "./knowledge-read-runtime";
import {knowledgePublicationPreview} from "./knowledge-publication-preview";

/** The same current public projection as normal knowledge exploration. */
export const publicKnowledgeEntity=cache(async(id:string)=>{
 if(!knowledgeIdSchema.safeParse(id).success||process.env.KNOWLEDGE_WORKSPACE_ENABLED!=="1"||!knowledgeCapability("public-read"))return null;
 knowledgeReadGuard();
 const page=await(await knowledgePublicationPreview()).entities({entityId:id,limit:1});
 return page.entities.find(e=>e.id===id)??null;
});
