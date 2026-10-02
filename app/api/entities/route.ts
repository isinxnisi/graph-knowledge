import { searchEntities } from "../../../lib/server/graph";
import { handle, searchInput } from "../../../lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handle(async () => {
    const { q, limit } = searchInput(request);
    return searchEntities(q, limit);
  });
}
export {
  methodNotAllowed as POST, methodNotAllowed as PUT, methodNotAllowed as PATCH,
  methodNotAllowed as DELETE, methodNotAllowed as HEAD, methodNotAllowed as OPTIONS,
} from "../../../lib/server/http";
