import {memberRuntime} from "../../../../lib/server/member/runtime";
import {knowledgeSubmissionHandle} from "../../../../lib/server/member/knowledge-submissions";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export function GET(request:Request){return knowledgeSubmissionHandle(()=>memberRuntime().service.submissions.list(request));}
export function POST(request:Request){return knowledgeSubmissionHandle(()=>memberRuntime().service.submissions.command(request));}
