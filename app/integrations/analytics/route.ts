import { publicSiteEnabled } from "../../../lib/domain/publication";
import { analyticsFrame, frameResponse } from "../../../lib/server/integration-frames";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (request.headers.get("sec-fetch-dest") !== "iframe" || new URL(request.url).search || !publicSiteEnabled(request.headers.get("host"))) return new Response(null, { status: 404 });
  return frameResponse(analyticsFrame(), false);
}
