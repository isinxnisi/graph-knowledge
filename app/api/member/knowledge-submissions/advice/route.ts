import {memberRuntime} from "../../../../../lib/server/member/runtime";
import {knowledgeSubmissionHandle} from "../../../../../lib/server/member/knowledge-submissions";
export async function POST(request:Request){return knowledgeSubmissionHandle(()=>memberRuntime().service.submissions.advice(request));}
