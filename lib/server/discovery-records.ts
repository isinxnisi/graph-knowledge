import "server-only";
import { z } from "zod";
import { int } from "neo4j-driver";
import { ApiError } from "./http";
import { readTransaction } from "./read-db";
import { readPublicRevision } from "./public-revision";
import { discoveryScope } from "./discovery-search";
import { claimSummary, entitySummary } from "./mappers";
import { normalizeSearch, SEARCH_KINDS } from "../domain/search";
import { DISCOVERY_THEMES } from "../domain/discovery";
import { PREDICATE_KEYS } from "../domain/predicates";
import { normalizePredicates } from "../domain/exploration";
import { roleIdSchema } from "../domain/contribution";
import { recordSearchProblem, type RecordSearchCriteria } from "../domain/discovery-records";
import type { DiscoveryRecordsResponse } from "../domain/api";

const schema = z.strictObject({
  q: z.string().default("").transform(normalizeSearch).refine(s => [...s].length <= 100),
  kind: z.enum(SEARCH_KINDS).optional(), theme: z.enum(DISCOVERY_THEMES).optional(), around: z.uuidv4().optional(),
  predicates: z.string().max(160).transform(s => s.split(",")).pipe(z.array(z.enum(PREDICATE_KEYS)).min(1)).transform(normalizePredicates).optional(),
  contributionRole: roleIdSchema.optional(), after: z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/).optional(),
  revision: z.string().regex(/^[a-zA-Z0-9:._-]{1,160}$/).optional(),
});
export function discoveryRecordsInput(request: Request) {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(k => params.getAll(k).length !== 1)) throw invalid();
  const value = schema.safeParse(Object.fromEntries(params));
  if (!value.success) throw invalid();
  const { after, revision, ...raw } = value.data;
  const criteria: RecordSearchCriteria = { ...raw, kind: raw.kind ?? null, predicates: raw.predicates ?? null, contributionRole: raw.contributionRole ?? null };
  if (recordSearchProblem(criteria)) throw invalid();
  return { criteria, after: after ?? null, revision: revision ?? null };
}
const invalid = () => new ApiError(400, "INVALID_ARGUMENT", "記録の検索条件またはcursorが不正です。");
const cursorSchema = z.strictObject({ v: z.literal(1), dataset: z.literal("public-kg"), revision: z.string().min(1).max(160), condition: z.string().max(1500), after: z.uuidv4() });
export const recordCondition = (criteria: RecordSearchCriteria) => JSON.stringify([normalizeSearch(criteria.q), criteria.kind, normalizePredicates(criteria.predicates), criteria.contributionRole, criteria.theme ?? null, criteria.around ?? null]);

// Relation and role belong to c. Name, kind and editorial scope must match ONE endpoint of c.
// Neither independent Claims nor independent endpoints can supply parts of this conjunction.
export const RECORD_WHERE = `WHERE c.visibility = 'published'
  AND ($around IS NULL OR subject.id = $around OR object.id = $around)
  AND ($predicates IS NULL OR c.predicate IN $predicates)
  AND ($role IS NULL OR (c.predicate = 'CONTRIBUTED_TO' AND c.contributionRoleId = $role))
  AND any(e IN [subject, object] WHERE ($kind IS NULL OR e.kind = $kind)
    AND ($q = '' OR any(name IN e.searchNames WHERE name CONTAINS $q))
    AND ($scopeIds IS NULL OR e.id IN $scopeIds))
  AND ($after IS NULL OR c.id > $after)`;
export const DISCOVERY_RECORDS = `MATCH (c:Claim)-[:SUBJECT]->(subject:Entity), (c)-[:OBJECT]->(object:Entity)
${RECORD_WHERE}
WITH DISTINCT c, subject, object ORDER BY c.id LIMIT $take
OPTIONAL MATCH (c)-[:HAS_CITATION]->(:Citation)-[:CITES]->(source:Source)
RETURN properties(c) AS claim, properties(subject) AS subject, properties(object) AS object, count(DISTINCT source) AS sourceCount
ORDER BY claim.id`;

export async function discoverRecords({ criteria, after, revision: expected }: ReturnType<typeof discoveryRecordsInput>): Promise<DiscoveryRecordsResponse> {
  if (process.env.GRAPH_DATASET !== "public-kg") throw new ApiError(400, "INVALID_ARGUMENT", "公開KGだけで利用できる記録検索です。");
  if (recordSearchProblem(criteria)) throw invalid();
  return readTransaction(async tx => {
    const revision = await readPublicRevision(tx, expected);
    let afterId: string | null = null;
    if (after) {
      let cursor: z.infer<typeof cursorSchema>;
      try { cursor = cursorSchema.parse(JSON.parse(Buffer.from(after, "base64url").toString("utf8"))); } catch { throw invalid(); }
      if (cursor.condition !== recordCondition(criteria)) throw invalid();
      if (cursor.revision !== revision) throw new ApiError(409, "DATASET_CHANGED", "公開KGの版が変わりました。先頭から再取得してください。");
      afterId = cursor.after.toLowerCase();
    }
    const scopeIds = await discoveryScope(tx, criteria, "public-kg");
    const result = await tx.run(DISCOVERY_RECORDS, { q: normalizeSearch(criteria.q), kind: criteria.kind, predicates: normalizePredicates(criteria.predicates), role: criteria.contributionRole, scopeIds, around: criteria.around ?? null, after: afterId, take: int(21) });
    const nodes = new Map<string, ReturnType<typeof entitySummary>>();
    const claims = result.records.slice(0, 20).map(row => {
      const subject = entitySummary(row.get("subject")), object = entitySummary(row.get("object"));
      nodes.set(subject.id, subject); nodes.set(object.id, object);
      return claimSummary(row.get("claim"), subject, object, row.get("sourceCount").toNumber());
    });
    await readPublicRevision(tx, revision);
    const hasMore = result.records.length > 20;
    return { revision, nodes: [...nodes.values()], claims, page: { hasMore, nextCursor: hasMore ? Buffer.from(JSON.stringify({ v: 1, dataset: "public-kg", revision, condition: recordCondition(criteria), after: claims.at(-1)!.id })).toString("base64url") : null } };
  });
}
