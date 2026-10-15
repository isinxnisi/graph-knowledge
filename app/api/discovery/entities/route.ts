import { handle } from "../../../../lib/server/http";
import { discoverEntities, discoverySearchInput } from "../../../../lib/server/discovery-search";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handle(() => discoverEntities(discoverySearchInput(request))); }
export { methodNotAllowed as POST, methodNotAllowed as PUT, methodNotAllowed as PATCH, methodNotAllowed as DELETE, methodNotAllowed as HEAD, methodNotAllowed as OPTIONS } from "../../../../lib/server/http";
