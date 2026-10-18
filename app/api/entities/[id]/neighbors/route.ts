import { decodeNeighborCursor } from "../../../../../lib/server/neighbor-cursor";
import { getNeighbors } from "../../../../../lib/server/graph";
import { handle, parseId, neighborsInput, revisionInput } from "../../../../../lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const id = parseId((await context.params).id);
    const { limit, after, predicates, contributionRoles = null, organizationPositions = null, eventRoles = null, relation } = neighborsInput(request);
    return getNeighbors(id, limit, (relation || process.env.GRAPH_DATASET === "public-kg" ? after : decodeNeighborCursor(after, id, predicates, contributionRoles, undefined, organizationPositions, eventRoles)), predicates, contributionRoles, organizationPositions, eventRoles, revisionInput(request), relation);
  });
}
export {
  methodNotAllowed as POST, methodNotAllowed as PUT, methodNotAllowed as PATCH,
  methodNotAllowed as DELETE, methodNotAllowed as HEAD, methodNotAllowed as OPTIONS,
} from "../../../../../lib/server/http";
