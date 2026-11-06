import {knowledgePublishingEnabled} from "../knowledge-deployment";
import {knowledgeCapability} from "../knowledge-deployment";
import type {Pool} from 'pg';
import {translationGenerationInputSchema,translationGenerationDisclosure} from '../../domain/knowledge-translation-generation';
import {createTranslationGeneration} from '../knowledge-translation-generation';
import {knowledgeReadConfiguration} from '../knowledge-read-runtime';
import {Pool as PgPool} from 'pg';
import {reviewEnabledFor} from '../knowledge-review-queue';
import {assertMemberOrigin,memberInput,memberJson,MemberError} from './http';
export function createMemberTranslationGeneration(pool:Pool,origin:string,owner:(r:Request)=>Promise<{id:string}>){
 let queue:ReturnType<typeof createTranslationGeneration>|undefined;
 const service=()=>queue??=createTranslationGeneration(pool,new PgPool({connectionString:knowledgeReadConfiguration().databaseUrl,max:2,options:'-c default_transaction_read_only=on'}));
 return {
  queue:service,
  async command(request:Request){assertMemberOrigin(request,origin);if(!request.headers.has('x-member-user'))throw new MemberError(400,'INVALID_ARGUMENT');const user=await owner(request);if(!knowledgeCapability("translation",origin)||!reviewEnabledFor(user.id)||!knowledgePublishingEnabled())throw new MemberError(404,'NOT_FOUND');
   const v=await memberInput(request,translationGenerationInputSchema);
   const status=v.action==='request'?await service().request(user.id,v.target,v.language,v.profileId??''):v.action==='cancel'?await service().cancel(user.id,v.target,v.language):await service().status(user.id,v.target,v.language);
   return memberJson({generation:status,disclosure:translationGenerationDisclosure});
  }
 };
}
