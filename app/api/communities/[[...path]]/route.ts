import { memberRuntime } from "../../../../lib/server/member/runtime";
import { memberHandle, memberJson } from "../../../../lib/server/member/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = {params:Promise<{path?:string[]}>};
async function handle(req:Request,ctx:Context){
 if(process.env.COMMUNITY_ENABLED!=="1")return memberJson({error:{code:"NOT_FOUND"}},404);
 const p=(await ctx.params).path??[];
 return memberHandle(async()=>{const s=memberRuntime().service.community;
 if(req.method==='GET'){
  if(!p.length)return s.list(req);
  if(p.length===1&&p[0]==='my-posts')return s.ownPosts(req);
  if(p.length===1)return s.read(req,p[0]);
  if(p.length===2&&p[0]==='threads')return s.thread(req,p[1]);
 }else{
  if(!p.length)return s.create(req);
  if(p.length===2&&p[1]==='threads')return s.createThread(req,p[0]);
  if(p.length===3&&p[0]==='threads'&&p[2]==='posts')return s.post(req,p[1]);
  if(p.length===3&&p[0]==='threads'&&p[2]==='close')return s.closeThread(req,p[1]);
  if(p.length===3&&p[0]==='posts'&&p[2]==='withdraw')return s.withdraw(req,p[1]);
  if(p.length===2&&['join','leave','settings','archive','reopen','remove','offer-admin','accept-admin'].includes(p[1]))return s.change(req,p[0],p[1]);
 }
 return memberJson({error:{code:'NOT_FOUND'}},404);
 });
}
export const GET=handle;export const POST=handle;
