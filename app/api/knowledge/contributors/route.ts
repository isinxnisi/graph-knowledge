import {memberRuntime} from "../../../../lib/server/member/runtime";
import {createKnowledgeContributors} from "../../../../lib/server/member/knowledge-contributors";
import {knowledgeSubmissionHandle} from "../../../../lib/server/member/knowledge-submissions";
export const dynamic="force-dynamic";
export async function GET(request:Request){return knowledgeSubmissionHandle(()=>createKnowledgeContributors(memberRuntime().pool).read(request));}
