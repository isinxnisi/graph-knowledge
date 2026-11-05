import {memberRuntime} from '../../../../lib/server/member/runtime';
import {knowledgeSubmissionHandle} from '../../../../lib/server/member/knowledge-submissions';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(r:Request){return knowledgeSubmissionHandle(()=>memberRuntime().service.knowledgeIdentity.list(r));}
export function POST(r:Request){return knowledgeSubmissionHandle(()=>memberRuntime().service.knowledgeIdentity.act(r));}
