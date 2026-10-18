import { handle } from "../../../../lib/server/http";
import { discoverEntities, discoverySearchInput } from "../../../../lib/server/discovery-search";
import { handleTargetSearch } from "../../../../lib/server/discovery-targets";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handle(() => discoverEntities(discoverySearchInput(request))); }
export const POST = handleTargetSearch;
function unsupported() { return Response.json({ error: { code: "INVALID_ARGUMENT", message: "GETまたはPOSTを利用してください。" } }, { status: 405, headers: { Allow: "GET, POST", "Cache-Control": "no-store" } }); }
export { unsupported as PUT, unsupported as PATCH, unsupported as DELETE, unsupported as HEAD, unsupported as OPTIONS };
