import { explorationLabels } from "../i18n/exploration";
import { z } from "zod";
import { ApiError } from "./http";
import { predicateKey, type PredicateFilter } from "../domain/exploration";

const schema = z.strictObject({ v: z.literal(1), center: z.uuidv4(), condition: z.string(), after: z.uuidv4() });
export function encodeNeighborCursor(center: string, predicates: PredicateFilter, after: string): string {
  return predicates === null ? after : Buffer.from(JSON.stringify({ v: 1, center, condition: predicateKey(predicates), after })).toString("base64url");
}
export function decodeNeighborCursor(cursor: string | null, center: string, predicates: PredicateFilter): string | null {
  if (cursor === null) return null;
  try {
    if (predicates === null) return z.uuidv4().parse(cursor).toLowerCase();
    if (cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("Invalid cursor");
    const value = schema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (value.center !== center || value.condition !== predicateKey(predicates)) throw new Error("Cursor scope mismatch");
    return value.after.toLowerCase();
  } catch {
    throw new ApiError(400, "INVALID_ARGUMENT", explorationLabels().invalidCursor);
  }
}
