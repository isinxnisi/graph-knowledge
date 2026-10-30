import {memberRuntime} from "../../../../../../lib/server/member/runtime";
import {memberHandle} from "../../../../../../lib/server/member/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
 const response=await memberHandle(async()=>memberRuntime().service.reportDiscussionPost(request,(await context.params).id));
 response.headers.set("Vary","Cookie, X-Capsule-Token, X-Member-User");
 response.headers.set("X-Robots-Tag","noindex, nofollow, noarchive");
 response.headers.set("Referrer-Policy","no-referrer");
 return response;
}
