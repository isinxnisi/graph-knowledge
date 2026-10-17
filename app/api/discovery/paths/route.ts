import { handle } from "../../../../lib/server/http";
import { discoverPaths, discoveryPathsInput } from "../../../../lib/server/discovery-paths";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handle(() => discoverPaths(discoveryPathsInput(request))); }
export { methodNotAllowed as POST, methodNotAllowed as PUT, methodNotAllowed as PATCH, methodNotAllowed as DELETE, methodNotAllowed as HEAD, methodNotAllowed as OPTIONS } from "../../../../lib/server/http";
