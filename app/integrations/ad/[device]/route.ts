import { adFrameEnabled } from "../../../../lib/domain/publication";
import { adFrame, frameResponse } from "../../../../lib/server/integration-frames";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ device: string }> }) {
  const { device } = await params;
  if (request.headers.get("sec-fetch-dest") !== "iframe" || new URL(request.url).search || !adFrameEnabled(request.headers.get("host")) || !["desktop", "mobile"].includes(device)) return new Response(null, { status: 404 });
  return frameResponse(adFrame(device as "desktop" | "mobile"), true);
}
