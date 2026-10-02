import { getNeighbors } from "../../../../../lib/server/graph";
import { handle, parseId, neighborsInput } from "../../../../../lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const id = parseId((await context.params).id);
    const { limit, after } = neighborsInput(request);
    return getNeighbors(id, limit, after);
  });
}
export {
  methodNotAllowed as POST, methodNotAllowed as PUT, methodNotAllowed as PATCH,
  methodNotAllowed as DELETE, methodNotAllowed as HEAD, methodNotAllowed as OPTIONS,
} from "../../../../../lib/server/http";
