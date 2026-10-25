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
  if(p.length===2&&p[0]==='invitations'&&p[1]==='summary')return s.invitationSummary(req);
  if(p.length===1&&p[0]==='reports')return s.reports(req);
  if(p.length===2&&p[1]==='safety-log')return s.safetyLog(req,p[0]);
  if(p.length===1&&p[0]==='invitations')return s.invitations(req);
  if(p.length===1&&p[0]==='participation')return s.participation(req);
  if(p.length===1&&p[0]==='recoveries')return s.recoveries(req);
  if(p.length===2&&p[1]==='invitations')return s.invitations(req,p[0]);
  if(p.length===1&&p[0]==='my-posts')return s.ownPosts(req);
  if(p.length===1)return s.read(req,p[0]);
  if(p.length===2&&p[0]==='threads')return s.thread(req,p[1]);
 }else{
  if(!p.length)return s.create(req);
  if(p.length===1&&p[0]==='reports')return s.report(req);
  if(p.length===3&&p[0]==='posts'&&p[2]==='moderate')return s.moderatePost(req,p[1]);
  if(p.length===2&&p[1]==='invitations')return s.invite(req,p[0]);
  if(p.length===3&&p[0]==='invitations'&&['accept','decline','revoke'].includes(p[2]))return s.decideInvitation(req,p[1],p[2] as 'accept'|'decline'|'revoke');
  if(p.length===2&&p[1]==='recovery')return s.requestRecovery(req,p[0]);
  if(p.length===3&&p[0]==='recoveries'&&['accept','cancel'].includes(p[2]))return s.acceptRecovery(req,p[1],p[2] as 'accept'|'cancel');
  if(p.length===2&&p[1]==='threads')return s.createThread(req,p[0]);
  if(p.length===3&&p[0]==='threads'&&p[2]==='posts')return s.post(req,p[1]);
  if(p.length===3&&p[0]==='threads'&&p[2]==='close')return s.closeThread(req,p[1]);
  if(p.length===3&&p[0]==='posts'&&p[2]==='withdraw')return s.withdraw(req,p[1]);
  if(p.length===2&&['join','leave','settings','archive','reopen','remove','offer-admin','accept-admin','demote-admin','cancel-admin-offer'].includes(p[1]))return s.change(req,p[0],p[1]);
 }
 return memberJson({error:{code:'NOT_FOUND'}},404);
 });
}
export const GET=handle;export const POST=handle;
