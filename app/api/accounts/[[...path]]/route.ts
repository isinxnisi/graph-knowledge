import { memberRuntime } from "../../../../lib/server/member/runtime";
import { memberHandle, memberJson } from "../../../../lib/server/member/http";
import { publicProfilesEnabled } from "../../../../lib/server/member/public-profiles";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{path?:string[]}>};
async function dispatch(req:Request,ctx:Context) {
  if(!publicProfilesEnabled())return memberJson({error:{code:'NOT_FOUND'}},404);
  const p=(await ctx.params).path??[];
  return memberHandle(async()=>{
    const service=memberRuntime().service.accounts;
    if(p.length===1&&p[0]==='me') {
      if(req.method==='GET')return service.own(req);
      if(req.method==='PUT')return service.save(req);
    }
    if(req.method==='GET'&&p.length===1&&p[0]==='following')return service.following(req);
    if(p.length===2&&p[0]==='profiles'&&req.method==='GET')return service.read(req,p[1]);
    if(p.length===2&&p[0]==='follows'&&['GET','PUT','DELETE'].includes(req.method))return service.follow(req,p[1]);
    return memberJson({error:{code:'NOT_FOUND'}},404);
  });
}
export const GET=dispatch;
export const PUT=dispatch;
export const DELETE=dispatch;
