import "server-only";
import { z } from "zod";
import { int } from "neo4j-driver";
import { ApiError } from "./http";
import { readTransaction } from "./read-db";
import { readPublicRevision } from "./public-revision";
import { entitySummary, claimSummary } from "./mappers";
import { PREDICATE_KEYS } from "../domain/predicates";
import { PATH_PRESET_IDS, resolvePathPreset, presetAcceptsStep, type PathPresetRef } from "../domain/discovery-path-presets";
import { roleIdSchema } from "../domain/contribution";
import { normalizePredicates } from "../domain/exploration";
import { enumeratePaths, PATH_LIMITS, type PathConditions, type Adjacency, type DiscoveryPathsResponse } from "../domain/discovery-paths";
import type { ClaimSummary, EntitySummary } from "../domain/api";
const invalid = () => new ApiError(400, "INVALID_ARGUMENT", "経路の検索条件が不正または未対応です。");
const schema = z.strictObject({ anchor: z.uuidv4().transform(s => s.toLowerCase()), depth: z.enum(["2","3"]).optional(), preset: z.enum(PATH_PRESET_IDS).optional(), presetRevision: z.literal("1").optional(),
  predicates: z.string().max(160).transform(s => s === "" ? [] : s.split(",")).pipe(z.array(z.enum(PREDICATE_KEYS))).optional(),
  contributionRoles: z.string().max(300).transform(s => s === "" ? [] : s.split(",")).pipe(z.array(roleIdSchema)).optional(),
  revision: z.string().regex(/^[a-zA-Z0-9:._-]{1,160}$/).optional(),
});
export function discoveryPathsInput(request: Request) {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(k => params.getAll(k).length !== 1)) throw invalid();
  const parsed = schema.safeParse(Object.fromEntries(params)); if (!parsed.success) throw invalid();
  const v = parsed.data;
  if ((v.preset === undefined) !== (v.presetRevision === undefined)) throw invalid();
  const preset: PathPresetRef | null = v.preset ? {id:v.preset,revision:1} : null;
  const template = preset ? resolvePathPreset(preset) : null;
  const predicates = v.predicates === undefined && template ? [template.predicate] : normalizePredicates(v.predicates ?? null);
  const depth = v.depth ? Number(v.depth) as 2 | 3 : template?.depth ?? 2;
  if (template && (depth !== template.depth || predicates?.length !== 1 || predicates[0] !== template.predicate)) throw invalid();
  if (v.contributionRoles !== undefined && predicates !== null && !predicates.includes("CONTRIBUTED_TO")) throw invalid();
  return { anchor: v.anchor, depth, preset, revision: v.revision ?? null,
    conditions: { predicates, contributionRoles: v.contributionRoles === undefined ? null : [...new Set(v.contributionRoles)].sort() } satisfies PathConditions };
}
export const PATH_CLAIM_FILTER = `c.visibility = 'published' AND ($predicates IS NULL OR c.predicate IN $predicates)
    AND ($roles IS NULL OR c.predicate <> 'CONTRIBUTED_TO' OR c.contributionRoleId IN $roles)`;
export const PATH_NEIGHBORS = `UNWIND $ids AS id
MATCH (e:Entity {id: id})
CALL {
  WITH e
  MATCH (e)<-[:SUBJECT|OBJECT]-(c:Claim)
  WHERE ${PATH_CLAIM_FILTER}
  WITH DISTINCT c ORDER BY c.id LIMIT $take
  MATCH (c)-[:SUBJECT]->(subject:Entity), (c)-[:OBJECT]->(object:Entity)
  OPTIONAL MATCH (c)-[:HAS_CITATION]->(:Citation)-[:CITES]->(source:Source)
  RETURN properties(c) AS claim, properties(subject) AS subject, properties(object) AS object, count(DISTINCT source) AS sourceCount
}
RETURN e.id AS anchorId, claim, subject, object, sourceCount ORDER BY anchorId, claim.id`;
export async function discoverPaths(input: ReturnType<typeof discoveryPathsInput>): Promise<DiscoveryPathsResponse> {
  if (process.env.GRAPH_DATASET !== "public-kg") throw invalid();
  return readTransaction(async tx => {
    const revision = await readPublicRevision(tx, input.revision);
    const center = await tx.run("MATCH (e:Entity {id: $id}) RETURN properties(e) AS entity", { id: input.anchor });
    if (!center.records.length) throw new ApiError(404,"NOT_FOUND","対象が見つかりません。");
    const anchor = entitySummary(center.records[0].get("entity"));
    if (input.preset && anchor.kind !== resolvePathPreset(input.preset).kinds[0]) throw invalid();
    const nodes = new Map<string,EntitySummary>([[anchor.id,anchor]]), claims = new Map<string,ClaimSummary>();
    const result = await enumeratePaths(input.anchor, input.depth, async ids => {
      const rows = await tx.run(PATH_NEIGHBORS, { ids, predicates: input.conditions.predicates, roles: input.conditions.contributionRoles, take: int(PATH_LIMITS.neighbors + 1) });
      const pages = new Map<string,Adjacency>(ids.map(id => [id, { id, claims: [], hasMore: false }]));
      for (const row of rows.records) {
        const page = pages.get(row.get("anchorId"))!;
        if (page.claims.length === PATH_LIMITS.neighbors) { page.hasMore = true; continue; }
        const subject = entitySummary(row.get("subject")), object = entitySummary(row.get("object")), claim = claimSummary(row.get("claim"),subject,object,row.get("sourceCount").toNumber());
        nodes.set(subject.id,subject);nodes.set(object.id,object);claims.set(claim.id,claim);page.claims.push(claim);
      }
      return [...pages.values()];
    }, PATH_LIMITS, (claim,from,to,step) => !input.preset || presetAcceptsStep(input.preset,claim,nodes.get(from)!,nodes.get(to)!,step));
    await readPublicRevision(tx,revision);
    const nodeIds = new Set([anchor.id,...result.paths.flatMap(p=>p.nodeIds)]), claimIds = new Set(result.paths.flatMap(p=>p.claimIds.flat()));
    return { revision, anchor, depth: input.depth, preset: input.preset, ...result, nodes: [...nodes.values()].filter(n=>nodeIds.has(n.id)), claims: [...claims.values()].filter(c=>claimIds.has(c.id)) };
  });
}
