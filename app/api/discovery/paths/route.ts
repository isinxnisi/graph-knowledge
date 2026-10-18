import { handle } from "../../../../lib/server/http";
import { handlePatternGraph } from "../../../../lib/server/pattern-graph";
import { discoverPaths, discoveryPathsInput } from "../../../../lib/server/discovery-paths";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handle(() => discoverPaths(discoveryPathsInput(request))); }
export const POST = handlePatternGraph;
function unsupported() { return Response.json({ error: { code: "INVALID_ARGUMENT", message: "GETまたはPOSTを利用してください。" } }, { status: 405, headers: { Allow: "GET, POST", "Cache-Control": "no-store" } }); }
export { unsupported as PUT, unsupported as PATCH, unsupported as DELETE, unsupported as HEAD, unsupported as OPTIONS };
