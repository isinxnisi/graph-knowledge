import { adminAuthorized, ADMIN_HEADERS } from "../../../lib/server/kg-admin-access";
import { adminInput, adminPage } from "../../../lib/domain/kg-admin";
import { adminSnapshot } from "../../../lib/server/kg-admin";
import { ApiError, handle } from "../../../lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!await adminAuthorized(request.headers)) return new Response(null, { status: 404, headers: ADMIN_HEADERS });
  const response = await handle(async () => {
    let input;
    try { input = adminInput(new URL(request.url).searchParams); }
    catch { throw new ApiError(400, "INVALID_ARGUMENT", "Invalid management search parameters"); }
    const snapshot = await adminSnapshot();
    if (input.revision && input.revision !== snapshot.revision) throw new ApiError(409, "DATASET_CHANGED", "KG changed. Start again from the first page.");
    return adminPage(snapshot, input);
  });
  for (const [key, value] of Object.entries(ADMIN_HEADERS)) response.headers.set(key, value);
  return response;
}
