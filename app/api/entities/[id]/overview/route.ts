import { overviewLabels } from "../../../../../lib/i18n/entity-overview";
import { getEntityOverview } from "../../../../../lib/server/graph";
import { ApiError, handle, methodNotAllowed, parseId } from "../../../../../lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (new URL(request.url).searchParams.size) throw new ApiError(400, "INVALID_ARGUMENT", overviewLabels().unsupported);
    return getEntityOverview(parseId((await context.params).id));
  });
}
export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
