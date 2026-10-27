import { z } from "zod";
import { normalizeSearch } from "./search";

export const ADMIN_SORTS = {
  entities: ["name", "kind", "degree", "claimCount", "islandSize"] as const,
  islands: ["name", "size", "claimCount"] as const,
};
export type AdminEntity = { id: string; name: string; kind: string; aliases: string[]; degree: number; claimCount: number; islandId: string; islandSize: number };
export type AdminIsland = { id: string; name: string; representativeId: string; size: number; claimCount: number; kinds: Record<string, number> };
export type AdminSnapshot = { dataset: "public-kg"; revision: string; measuredAt: string; entities: AdminEntity[]; islands: AdminIsland[]; excluded: { unpublished: number; denied: number; unsupported: number }; claimCount: number; distribution: number[] };
const integer = z.string().regex(/^\d{1,16}$/).transform(Number).refine(Number.isSafeInteger);
const schema = z.strictObject({
  view: z.enum(["overview", "entities", "islands"]).default("overview"),
  q: z.string().max(100).default("").transform(normalizeSearch), kind: z.string().min(1).max(80).optional(),
  degree: z.enum(["0", "1", "2", "3+"]).optional(), min: integer.optional(), max: integer.optional(),
  island: z.string().regex(/^[a-f0-9]{64}$/).optional(), entity: z.uuidv4().optional(),
  sort: z.string().default("name"), direction: z.enum(["asc", "desc"]).default("asc"),
  second: z.string().optional(), secondDirection: z.enum(["asc", "desc"]).default("asc"),
  revision: z.string().min(1).max(160).optional(), offset: integer.default(0), limit: integer.pipe(z.number().min(1).max(100)).default(40),
});
export function adminInput(params: URLSearchParams) {
  if ([...params.keys()].some(key => params.getAll(key).length !== 1)) throw Error("Duplicate parameter");
  const input = schema.parse(Object.fromEntries(params));
  const keys: readonly string[] = ADMIN_SORTS[input.view === "islands" ? "islands" : "entities"];
  if (!keys.includes(input.sort) || (input.second && !keys.includes(input.second))) throw Error("Unknown sort");
  if (input.min !== undefined && input.max !== undefined && input.min > input.max) throw Error("Invalid range");
  if ((input.offset || input.island || input.entity) && !input.revision) throw Error("Revision required");
  if (input.second === input.sort) input.second = undefined;
  return input;
}
export type AdminInput = ReturnType<typeof adminInput>;
const compare = (a: string | number, b: string | number) => a < b ? -1 : a > b ? 1 : 0;
export function adminPage(snapshot: AdminSnapshot, input: AdminInput) {
  if (input.revision && input.revision !== snapshot.revision) throw Error("DATASET_CHANGED");
  const inRange = (size: number) => (input.min === undefined || size >= input.min) && (input.max === undefined || size <= input.max);
  const entities = snapshot.entities.filter(e => (!input.entity || e.id === input.entity) && (!input.island || e.islandId === input.island) && (!input.kind || e.kind === input.kind)
    && (!input.degree || (input.degree === "3+" ? e.degree >= 3 : e.degree === Number(input.degree))) && inRange(e.islandSize)
    && [e.name, e.id, ...e.aliases].some(s => normalizeSearch(s).includes(input.q)));
  // Island search matches any member, not only its chosen representative.
  const matching = new Set(entities.map(e => e.islandId));
  const rows: (AdminEntity | AdminIsland)[] = input.view === "islands" ? snapshot.islands.filter(i => matching.has(i.id) && inRange(i.size)) : entities;
  const value = (row: AdminEntity | AdminIsland, key: string) => (row as unknown as Record<string, string | number>)[key];
  rows.sort((a, b) => compare(value(a, input.sort), value(b, input.sort)) * (input.direction === "asc" ? 1 : -1)
    || (input.second ? compare(value(a, input.second), value(b, input.second)) * (input.secondDirection === "asc" ? 1 : -1) : 0) || compare(a.id, b.id));
  return { dataset: snapshot.dataset, revision: snapshot.revision, measuredAt: snapshot.measuredAt,
    summary: { entityCount: snapshot.entities.length, islandCount: snapshot.islands.length, isolatedCount: snapshot.distribution[0], claimCount: snapshot.claimCount, distribution: snapshot.distribution, excluded: snapshot.excluded },
    island: input.island ? snapshot.islands.find(i => i.id === input.island) ?? null : null,
    kinds: [...new Set(snapshot.entities.map(e => e.kind))].sort(), total: rows.length,
    items: input.view === "overview" ? [] : rows.slice(input.offset, input.offset + input.limit),
    nextOffset: input.offset + input.limit < rows.length ? input.offset + input.limit : null };
}
export type AdminResponse = ReturnType<typeof adminPage>;
