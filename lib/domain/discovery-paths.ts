import { z } from "zod";
import { pathPresetRefSchema, presetAcceptsStep, resolvePathPreset, type PathPresetRef } from "./discovery-path-presets";
import { claimSummarySchema, entitySummarySchema, type ClaimSummary } from "./api";
import { matchesClaim, type PredicateFilter, type ContributionRoleFilter } from "./exploration";

export const PATH_LIMITS = { neighbors: 20, expansions: 24, prefixes: 128, results: 12 } as const;
export type PathConditions = { predicates: PredicateFilter; contributionRoles: ContributionRoleFilter };
export const discoveryPathSchema = z.strictObject({
  nodeIds: z.array(z.uuidv4()).min(3).max(4),
  claimIds: z.array(z.array(z.uuidv4()).min(1).max(PATH_LIMITS.neighbors)).min(2).max(3),
}).refine(p => p.nodeIds.length === p.claimIds.length + 1 && new Set(p.nodeIds).size === p.nodeIds.length
  && p.claimIds.every(ids => new Set(ids).size === ids.length));
export type DiscoveryPath = z.infer<typeof discoveryPathSchema>;
export const pathKey = (path: DiscoveryPath) => path.nodeIds.join(":");
export const pathUiSchema = z.strictObject({ scope: z.string().max(300), open: z.boolean(), depth: z.union([z.literal(2), z.literal(3)]), selected: z.string().max(160).nullable(), preset: pathPresetRefSchema.nullable().optional(), changed: z.boolean().optional() });
export type PathUi = z.infer<typeof pathUiSchema>;
export const pathResponseSchema = z.object({
  preset: pathPresetRefSchema.nullable().optional(), revision: z.string().min(1).max(160), anchor: entitySummarySchema, depth: z.union([z.literal(2), z.literal(3)]),
  nodes: z.array(entitySummarySchema).max(49), claims: z.array(claimSummarySchema).max(720), paths: z.array(discoveryPathSchema).max(PATH_LIMITS.results),
  scan: z.object({ expanded: z.number().int().min(1).max(PATH_LIMITS.expansions), reasons: z.array(z.enum(["neighbors", "expansions", "prefixes", "results"])), limitedIds: z.array(z.uuidv4()).max(PATH_LIMITS.expansions) }),
});
export type DiscoveryPathsResponse = z.infer<typeof pathResponseSchema>;
export type Adjacency = { id: string; claims: ClaimSummary[]; hasMore: boolean };

// Bounded breadth-first traversal, grouping parallel Claims without merging their meanings.
// The loader filters and orders each node's Claims BEFORE its bounded read.
export async function enumeratePaths(root: string, depth: 2 | 3, read: (ids: string[]) => Promise<Adjacency[]>, limits: { neighbors: number; expansions: number; prefixes: number; results: number } = PATH_LIMITS, acceptStep: (claim: ClaimSummary, from: string, to: string, step: number) => boolean = () => true) {
  const cache = new Map<string, Adjacency>();
  const reasons = new Set<DiscoveryPathsResponse["scan"]["reasons"][number]>(), limitedIds = new Set<string>();
  let prefixes = [{ nodeIds: [root], claimIds: [] as string[][] }];
  for (let step = 0; step < depth; step++) {
    const wanted = [...new Set(prefixes.map(p => p.nodeIds.at(-1)!).filter(id => !cache.has(id)))];
    const ids = wanted.slice(0, Math.max(0, limits.expansions - cache.size));
    if (ids.length < wanted.length) reasons.add("expansions");
    if (ids.length) {
      const pages = await read(ids);
      for (const id of ids) {
        const page = pages.find(p => p.id === id) ?? { id, claims: [], hasMore: false };
        cache.set(id, page);
        if (page.hasMore) { reasons.add("neighbors"); limitedIds.add(id); }
      }
    }
    const next: typeof prefixes = [], seen = new Set<string>();
    for (const prefix of prefixes) {
      const from = prefix.nodeIds.at(-1)!, page = cache.get(from);
      if (!page) continue;
      const groups = new Map<string, string[]>();
      for (const c of [...page.claims].sort((a,b) => a.id.localeCompare(b.id)).slice(0, limits.neighbors)) {
        const to = c.subjectId === from ? c.objectId : c.objectId === from ? c.subjectId : null;
        if (!to || prefix.nodeIds.includes(to) || !acceptStep(c, from, to, step)) continue;
        const claims = groups.get(to) ?? [];
        if (!claims.includes(c.id)) claims.push(c.id);
        groups.set(to, claims);
      }
      for (const [to, claims] of groups) {
        const path = { nodeIds: [...prefix.nodeIds, to], claimIds: [...prefix.claimIds, claims] }, key = pathKey(path);
        if (seen.has(key)) continue;
        seen.add(key);
        const maximum = step === depth - 1 ? limits.results : limits.prefixes;
        if (next.length >= maximum) { reasons.add(step === depth - 1 ? "results" : "prefixes"); continue; }
        next.push(path);
      }
    }
    prefixes = next;
    if (!prefixes.length) break;
  }
  return { paths: prefixes.filter(p => p.claimIds.length === depth), scan: { expanded: cache.size, reasons: [...reasons].sort(), limitedIds: [...limitedIds].sort() } };
}

export function validatePathResponse(value: unknown, root: string, depth: 2 | 3, revision: string, conditions: PathConditions, preset: PathPresetRef | null = null): DiscoveryPathsResponse {
  const result = pathResponseSchema.parse(value);
  const entityMap = new Map(result.nodes.map(n => [n.id,n]));
  const nodes = new Set(result.nodes.map(n => n.id)), claims = new Map(result.claims.map(c => [c.id, c]));
  if ((result.preset?.id ?? null) !== (preset?.id ?? null) || (result.preset?.revision ?? null) !== (preset?.revision ?? null)
    || preset && (resolvePathPreset(preset).depth !== depth || conditions.predicates?.length !== 1 || conditions.predicates[0] !== resolvePathPreset(preset).predicate)
    || result.revision !== revision || result.anchor.id !== root || result.depth !== depth || !nodes.has(root)
    || nodes.size !== result.nodes.length || claims.size !== result.claims.length || new Set(result.paths.map(pathKey)).size !== result.paths.length
    || result.paths.some(path => path.nodeIds[0] !== root || path.claimIds.length !== depth || path.nodeIds.some(id => !nodes.has(id))
      || path.claimIds.some((ids, i) => ids.some(id => { const c = claims.get(id); return !c || !matchesClaim(c, conditions.predicates, conditions.contributionRoles)
        || (preset !== null && !presetAcceptsStep(preset,c,entityMap.get(path.nodeIds[i])!,entityMap.get(path.nodeIds[i+1])!,i))
        || !([c.subjectId, c.objectId].includes(path.nodeIds[i]) && [c.subjectId, c.objectId].includes(path.nodeIds[i+1])); })))) throw new Error("Invalid path response");
  return result;
}

export type PathWitness = DiscoveryPath & { revision: string };
export function parsePathWitness(raw: string | null, root: string): PathWitness | undefined {
  if (raw === null) return;
  if (raw.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error("Invalid path witness");
  const value = JSON.parse(atob(raw.replaceAll("-", "+").replaceAll("_", "/")));
  // The strict path shape is validated separately from its revision metadata.
  const path = discoveryPathSchema.parse({ nodeIds: value.nodeIds, claimIds: value.claimIds });
  if (Object.keys(value).sort().join() !== "claimIds,nodeIds,revision" || path.nodeIds[0] !== root || !z.string().regex(/^[a-zA-Z0-9:._-]{1,160}$/).safeParse(value.revision).success) throw new Error("Invalid path witness");
  return { ...path, revision: value.revision };
}

export const pathScope = (anchor: string, predicate: string | null, role: string | null) => JSON.stringify([anchor,predicate,role]);
