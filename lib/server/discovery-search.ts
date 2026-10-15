import "server-only";
import { int } from "neo4j-driver";
import { z } from "zod";
import { ApiError } from "./http";
import { readTransaction } from "./read-db";
import { readPublicRevision } from "./public-revision";
import { entityDetail, entitySummary } from "./mappers";
import { START_EXAMPLES } from "../client/start-examples";
import { datasetMode } from "../domain/dataset";
import { SEARCH_KINDS, normalizeSearch } from "../domain/search";
import { dataReleaseLabels } from "../i18n/data-release";
import type { DiscoverySearchResponse } from "../domain/api";

const inputSchema = z.strictObject({ q: z.string().default("").transform(normalizeSearch).refine(s => [...s].length <= 100), kind: z.enum(SEARCH_KINDS).optional(), around: z.uuidv4().optional(), after: z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/).optional() });
export function discoverySearchInput(request: Request) {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(k => params.getAll(k).length !== 1)) throw new ApiError(400, "INVALID_ARGUMENT", "検索条件が不正です。");
  const result = inputSchema.safeParse(Object.fromEntries(params));
  if (!result.success) throw new ApiError(400, "INVALID_ARGUMENT", "検索条件が不正です。");
  return result.data;
}
const cursorSchema = z.strictObject({ v: z.literal(1), dataset: z.string(), revision: z.string().nullable(), q: z.string(), kind: z.string().nullable(), around: z.string().nullable(), rank: z.number().int().min(0).max(1), name: z.string().max(2000), id: z.uuidv4() });
export const DISCOVERY_ENTITIES = `
MATCH (e:Entity)
WHERE e.kind IN $kinds AND ($q = '' OR any(name IN e.searchNames WHERE name CONTAINS $q))
  AND EXISTS { MATCH (e)<-[:SUBJECT|OBJECT]-(c:Claim) WHERE c.visibility = 'published' }
  AND ($around IS NULL OR e.id = $around OR EXISTS {
    MATCH (e)<-[:SUBJECT|OBJECT]-(c:Claim)-[:SUBJECT|OBJECT]->(:Entity {id: $around})
    WHERE c.visibility = 'published'
  })
WITH e, CASE WHEN $q <> '' AND $q IN e.searchNames THEN 0 ELSE 1 END AS rank
WHERE $afterId IS NULL OR rank > $afterRank OR (rank = $afterRank AND (e.name > $afterName OR (e.name = $afterName AND e.id > $afterId)))
RETURN properties(e) AS entity, rank
ORDER BY rank, e.name, e.id LIMIT 21`;
export function discoverEntities(input: ReturnType<typeof discoverySearchInput>): Promise<DiscoverySearchResponse> {
  const dataset = datasetMode(process.env.GRAPH_DATASET);
  return readTransaction(async tx => {
    const revision = dataset === "public-kg" ? await readPublicRevision(tx) : null;
    let after: z.infer<typeof cursorSchema> | null = null;
    if (input.after) {
      try { after = cursorSchema.parse(JSON.parse(Buffer.from(input.after, "base64url").toString("utf8"))); }
      catch { throw new ApiError(400, "INVALID_ARGUMENT", "検索条件が不正です。"); }
      if (after.dataset !== dataset || after.q !== input.q || after.kind !== (input.kind ?? null) || after.around !== (input.around ?? null)) throw new ApiError(400, "INVALID_ARGUMENT", "検索条件が不正です。");
      if (after.revision !== revision) throw new ApiError(409, "DATASET_CHANGED", dataReleaseLabels().changed);
    }
    const result = await tx.run(DISCOVERY_ENTITIES, { q: input.q, kinds: input.kind ? [input.kind] : [...SEARCH_KINDS], around: input.around ?? null, afterId: after?.id ?? null, afterName: after?.name ?? null, afterRank: after ? int(after.rank) : null });
    const starts = await tx.run(`MATCH (e:Entity) WHERE e.id IN $ids AND EXISTS { MATCH (e)<-[:SUBJECT|OBJECT]-(c:Claim) WHERE c.visibility = 'published' } RETURN properties(e) AS entity`, { ids: START_EXAMPLES[dataset].map(e => e.id) });
    const items = result.records.slice(0, 20).map(r => entityDetail(r.get("entity")));
    const hasMore = result.records.length > 20, last = items.at(-1);
    if (revision) await readPublicRevision(tx, revision);
    const available = new Map(starts.records.map(r => { const entity = entitySummary(r.get("entity")); return [entity.id, entity] as const; }));
    return { items, hasMore, starts: START_EXAMPLES[dataset].flatMap(e => available.has(e.id) ? [available.get(e.id)!] : []), nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ v: 1, dataset, revision, q: input.q, kind: input.kind ?? null, around: input.around ?? null, rank: result.records[19].get("rank").toNumber(), name: last.name, id: last.id })).toString("base64url") : null };
  });
}
