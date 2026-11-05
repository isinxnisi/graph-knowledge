import {knowledgeImportHttp} from '../../../../../../lib/server/knowledge-import-runtime';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(r:Request,ctx:{params:Promise<{id:string}>}){return knowledgeImportHttp().cancel(r,(await ctx.params).id);}
