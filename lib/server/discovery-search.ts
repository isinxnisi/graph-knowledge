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
import { DISCOVERY_THEMES, DISCOVERY_SEEDS } from "../domain/discovery";
import { PREDICATE_KEYS } from "../domain/predicates";
import { roleIdSchema } from "../domain/contribution";
import { recordSearchProblem } from "../domain/discovery-records";
import { normalizePredicates } from "../domain/exploration";
import type { DiscoverySearchResponse } from "../domain/api";

const inputSchema = z.strictObject({ contributionRole: roleIdSchema.optional(), q: z.string().default("").transform(normalizeSearch).refine(s => [...s].length <= 100), kind: z.enum(SEARCH_KINDS).optional(), around: z.uuidv4().optional(), theme: z.enum(DISCOVERY_THEMES).optional(), predicates: z.string().max(160).transform(s => s.split(",")).pipe(z.array(z.enum(PREDICATE_KEYS)).min(1)).transform(normalizePredicates).optional(), after: z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/).optional() });
export function discoverySearchInput(request: Request) {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(k => params.getAll(k).length !== 1)) throw new ApiError(400, "INVALID_ARGUMENT", "検索条件が不正です。");
  const result = inputSchema.safeParse(Object.fromEntries(params));
  if (!result.success) throw new ApiError(400, "INVALID_ARGUMENT", "検索条件が不正です。");
  if (recordSearchProblem({ q: result.data.q, kind: result.data.kind ?? null, predicates: result.data.predicates ?? null, contributionRole: result.data.contributionRole ?? null })) throw new ApiError(400, "INVALID_ARGUMENT", "制作役割は作品づくりだけの検索で指定してください。");
  return result.data;
}
const cursorV1 = z.strictObject({ v: z.literal(1), dataset: z.string(), revision: z.string().nullable(), q: z.string(), kind: z.string().nullable(), around: z.string().nullable(), rank: z.number().int().min(0).max(1), name: z.string().max(2000), id: z.uuidv4() });
const cursorV2 = cursorV1.extend({ v: z.literal(2), theme: z.enum(DISCOVERY_THEMES).nullable(), predicates: z.array(z.enum(PREDICATE_KEYS)).nullable() });
const cursorSchema = z.union([cursorV1, cursorV2, cursorV2.extend({ v: z.literal(3), contributionRole: roleIdSchema.nullable() })]);
// Two published Claim hops define an editorial collection, never an inferred relation.
export const DISCOVERY_COLLECTION = `MATCH (seed:Entity) WHERE seed.id IN $seeds
CALL {
  WITH seed RETURN seed.id AS id
  UNION
  WITH seed MATCH (seed)<-[:SUBJECT|OBJECT]-(a:Claim)-[:SUBJECT|OBJECT]->(one:Entity)
  WHERE a.visibility = 'published' RETURN one.id AS id
  UNION
  WITH seed MATCH (seed)<-[:SUBJECT|OBJECT]-(a:Claim)-[:SUBJECT|OBJECT]->(:Entity)<-[:SUBJECT|OBJECT]-(b:Claim)-[:SUBJECT|OBJECT]->(two:Entity)
  WHERE a.visibility = 'published' AND b.visibility = 'published' RETURN two.id AS id
}
RETURN collect(DISTINCT id) AS ids`;
export const DISCOVERY_NEIGHBORHOOD = `MATCH (seed:Entity {id: $around})
CALL {
  WITH seed RETURN seed.id AS id
  UNION
  WITH seed MATCH (seed)<-[:SUBJECT|OBJECT]-(c:Claim)-[:SUBJECT|OBJECT]->(other:Entity)
  WHERE c.visibility = 'published' RETURN other.id AS id
}
RETURN collect(DISTINCT id) AS ids`;
export const DISCOVERY_SCOPE = `($scopeIds IS NULL OR e.id IN $scopeIds)`;
const MATCHING = `MATCH (e:Entity)
WHERE e.kind IN $kinds AND ($q = '' OR any(name IN e.searchNames WHERE name CONTAINS $q))
  AND EXISTS { MATCH (e)<-[:SUBJECT|OBJECT]-(c:Claim) WHERE c.visibility = 'published' AND ($predicates IS NULL OR c.predicate IN $predicates) AND ($role IS NULL OR (c.predicate = 'CONTRIBUTED_TO' AND c.contributionRoleId = $role)) AND ($around IS NULL OR EXISTS { MATCH (c)-[:SUBJECT|OBJECT]->(:Entity {id: $around}) }) }
  AND ${DISCOVERY_SCOPE}`;
export const DISCOVERY_ENTITIES = `${MATCHING}
WITH e, CASE WHEN $q <> '' AND $q IN e.searchNames THEN 0 ELSE 1 END AS rank
WHERE $afterId IS NULL OR rank > $afterRank OR (rank = $afterRank AND (e.name > $afterName OR (e.name = $afterName AND e.id > $afterId)))
RETURN properties(e) AS entity, rank
ORDER BY rank, e.name, e.id LIMIT 21`;
export const DISCOVERY_FACETS = `MATCH (e:Entity) WHERE ${DISCOVERY_SCOPE}
MATCH (e)<-[:SUBJECT|OBJECT]-(c:Claim) WHERE c.visibility = 'published'
RETURN c.predicate AS predicate, count(DISTINCT c) AS count`;
export function discoverEntities(input: ReturnType<typeof discoverySearchInput>): Promise<DiscoverySearchResponse> {
  const dataset = datasetMode(process.env.GRAPH_DATASET);
  return readTransaction(async tx => {
    const revision = dataset === "public-kg" ? await readPublicRevision(tx) : null;
    const predicates = input.predicates ?? null;
    let after: z.infer<typeof cursorSchema> | null = null;
    if (input.after) {
      try { after = cursorSchema.parse(JSON.parse(Buffer.from(input.after, "base64url").toString("utf8"))); }
      catch { throw new ApiError(400, "INVALID_ARGUMENT", "検索条件が不正です。"); }
      if (after.dataset !== dataset || after.q !== input.q || after.kind !== (input.kind ?? null) || after.around !== (input.around ?? null)) throw new ApiError(400, "INVALID_ARGUMENT", "検索条件が不正です。");
      if ((after.v !== 1 ? after.theme : null) !== (input.theme ?? null) || JSON.stringify(after.v !== 1 ? after.predicates : null) !== JSON.stringify(predicates)) throw new ApiError(400, "INVALID_ARGUMENT", "検索条件が不正です。");
      if ((after.v === 3 ? after.contributionRole : null) !== (input.contributionRole ?? null)) throw new ApiError(400, "INVALID_ARGUMENT", "検索条件が不正です。");
      if (after.v !== 3 && input.around && predicates !== null) throw new ApiError(400, "INVALID_ARGUMENT", "周辺と関係の検索方式が変わりました。先頭から再取得してください。");
      if (after.revision !== revision) throw new ApiError(409, "DATASET_CHANGED", dataReleaseLabels().changed);
    }
    const scopeIds = await discoveryScope(tx, input, dataset);
    const params = { scopeIds, predicates, around: input.around ?? null, role: input.contributionRole ?? null, q: input.q, kinds: input.kind ? [input.kind] : [...SEARCH_KINDS], afterId: after?.id ?? null, afterName: after?.name ?? null, afterRank: after ? int(after.rank) : null };
    const result = await tx.run(DISCOVERY_ENTITIES, params);
    const starts = await tx.run(`MATCH (e:Entity) WHERE e.id IN $ids AND EXISTS { MATCH (e)<-[:SUBJECT|OBJECT]-(c:Claim) WHERE c.visibility = 'published' } RETURN properties(e) AS entity`, { ids: START_EXAMPLES[dataset].map(e => e.id) });
    const counts = await tx.run(`${MATCHING} RETURN count(e) AS total`, params);
    const facets = await tx.run(DISCOVERY_FACETS, params);
    const items = result.records.slice(0, 20).map(r => entityDetail(r.get("entity")));
    const hasMore = result.records.length > 20, last = items.at(-1);
    if (revision) await readPublicRevision(tx, revision);
    const available = new Map(starts.records.map(r => { const entity = entitySummary(r.get("entity")); return [entity.id, entity] as const; }));
    return { ...(revision ? { revision } : {}), items, hasMore, total: counts.records[0].get("total").toNumber(),
      facets: facets.records.map(r => ({ predicate: z.enum(PREDICATE_KEYS).parse(r.get("predicate")), count: r.get("count").toNumber() })),
      themes: dataset === "public-kg" ? DISCOVERY_THEMES.filter(t => DISCOVERY_SEEDS[t].some(id => available.has(id))) : [], starts: START_EXAMPLES[dataset].flatMap(e => available.has(e.id) ? [available.get(e.id)!] : []), nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ v: 3, contributionRole: input.contributionRole ?? null, theme: input.theme ?? null, predicates, dataset, revision, q: input.q, kind: input.kind ?? null, around: input.around ?? null, rank: result.records[19].get("rank").toNumber(), name: last.name, id: last.id })).toString("base64url") : null };
  });
}

export async function discoveryScope(tx: import("neo4j-driver").ManagedTransaction, input: { theme?: import("../domain/discovery").DiscoveryTheme; around?: string }, dataset: import("../domain/dataset").DatasetMode) {
  const seeds = input.theme ? dataset === "public-kg" ? [...DISCOVERY_SEEDS[input.theme]] : [] : null;
  let scopeIds = seeds === null ? null : seeds.length ? (await tx.run(DISCOVERY_COLLECTION, { seeds })).records[0].get("ids") as string[] : [];
  if (input.around) {
    const neighborhood = (await tx.run(DISCOVERY_NEIGHBORHOOD, { around: input.around })).records[0].get("ids") as string[];
    const nearby = new Set(neighborhood);
    scopeIds = scopeIds === null ? neighborhood : scopeIds.filter(id => nearby.has(id));
  }
  return scopeIds;
}
