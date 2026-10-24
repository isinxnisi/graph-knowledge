import {memberRuntime} from '../../../../lib/server/member/runtime';
import {memberHandle,memberJson} from '../../../../lib/server/member/http';
export const dynamic='force-dynamic';export const runtime='nodejs';
type Context={params:Promise<{path?:string[]}>};
async function handle(req:Request,ctx:Context){return memberHandle(async()=>{const p=(await ctx.params).path??[];if(process.env.SITE_OPERATIONS_ENABLED!=='1')return memberJson({error:{code:'NOT_FOUND'}},404);const service=memberRuntime().service.operator;if(req.method==='GET'&&p.length===1)return service.read(req,p[0]);if(req.method==='POST'&&!p.length)return service.act(req);return memberJson({error:{code:'NOT_FOUND'}},404);});}
export const GET=handle;export const POST=handle;