import { aiLabEnabled, loadAiLabArtifact } from "../../../lib/server/ai-lab";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control":"no-store", "X-Robots-Tag":"noindex, nofollow, noarchive" };
  if (!aiLabEnabled()) return new Response(null,{status:404,headers});
  if (new URL(request.url).search) return new Response(null,{status:400,headers});
  try { const artifact = await loadAiLabArtifact(); return Response.json(artifact,{headers:{...headers,ETag:'"'+artifact.sha256+'"'}}); }
  catch { return Response.json({error:{code:"SERVICE_UNAVAILABLE"}},{status:503,headers}); }
}
