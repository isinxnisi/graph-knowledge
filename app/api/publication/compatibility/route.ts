import { readFile } from "node:fs/promises";
import { publicationCapabilities } from "../../../../lib/server/publication-compatibility";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
 let buildId: string | null = null;
 try { buildId = (await readFile(".next-public/BUILD_ID", "utf8")).trim(); } catch { /* Development has no sealed build. */ }
 return Response.json({ capabilities: publicationCapabilities(), buildId }, { headers: { "Cache-Control": "no-store" } });
}
