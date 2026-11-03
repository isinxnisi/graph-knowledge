import {memberRuntime} from "../../../../../lib/server/member/runtime";
import {knowledgeSubmissionHandle} from "../../../../../lib/server/member/knowledge-submissions";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export function GET(request:Request,context:{params:Promise<{id:string}>}){return knowledgeSubmissionHandle(async()=>memberRuntime().service.submissions.read(request,(await context.params).id));}
