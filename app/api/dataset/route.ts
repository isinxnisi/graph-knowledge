import { datasetMode } from "../../../lib/domain/dataset";
import { handle } from "../../../lib/server/http";
import { readTransaction } from "../../../lib/server/read-db";
import { readPublicRevision } from "../../../lib/server/public-revision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  return handle(async () => ({ dataset: datasetMode(process.env.GRAPH_DATASET), revision: process.env.GRAPH_DATASET === "public-kg" ? await readTransaction(tx => readPublicRevision(tx)) : null }));
}
export { methodNotAllowed as POST, methodNotAllowed as PUT, methodNotAllowed as PATCH, methodNotAllowed as DELETE, methodNotAllowed as HEAD, methodNotAllowed as OPTIONS } from "../../../lib/server/http";
