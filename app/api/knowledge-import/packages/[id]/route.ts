import {knowledgeImportHttp} from '../../../../../lib/server/knowledge-import-runtime';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(r:Request,ctx:{params:Promise<{id:string}>}){return knowledgeImportHttp().get(r,(await ctx.params).id);}
