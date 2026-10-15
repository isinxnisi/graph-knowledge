import { publicSubject } from "../../../../lib/server/public-discovery";
import { shareImage } from "../../../../lib/server/share-image";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ entityId: string }> }) {
  try {
    const subject = await publicSubject((await params).entityId);
    if (!subject) return new Response(null, { status: 404, headers: { "X-Robots-Tag": "noindex" } });
    return shareImage("ja", subject.entity);
  } catch { return new Response(null, { status: 503, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }); }
}
