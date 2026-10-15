import "server-only";
import { cache } from "react";
import { z } from "zod";
import { getEntity, getNeighbors, getClaim } from "./graph";
import { START_EXAMPLES } from "../client/start-examples";
import { ApiError } from "./http";
// Published neighbors and the matching revision are the only input. No saved Graph,
// hidden Capsule, cursor or query value is used in search text or share images.
export const publicSubject = cache(async (id: string) => {
  if (!z.uuidv4().safeParse(id).success) return null;
  try {
    const [{ entity }, neighbors] = await Promise.all([getEntity(id), getNeighbors(id, 12, null)]);
    const records = await Promise.all(neighbors.claims.slice(0, 6).map(c => getClaim(c.id, neighbors.revision)));
    return { entity, neighbors, records };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
});
export const publicExamples = cache(async () => {
  const values = await Promise.all(START_EXAMPLES["public-kg"].map(e => publicSubject(e.id)));
  return values.filter((value): value is PublicSubject => value !== null && value.neighbors.claims.length > 0);
});
export type PublicSubject = NonNullable<Awaited<ReturnType<typeof publicSubject>>>;
