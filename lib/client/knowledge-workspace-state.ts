import { z } from "zod";
import { knowledgeIdSchema } from "../domain/knowledge-foundation";

export const knowledgeSelectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("entity"), id: knowledgeIdSchema }),
  z.object({ kind: z.literal("record"), id: knowledgeIdSchema,timeId:knowledgeIdSchema.optional() }),
]).nullable();
export type KnowledgeSelection = z.infer<typeof knowledgeSelectionSchema>;
export type KnowledgeView = "graph" | "timeline" | "split";
const point = z.object({ x: z.number().finite().min(-100_000_000).max(100_000_000), y: z.number().finite().min(-100_000_000).max(100_000_000) });
export const knowledgeGraphViewSchema = z.object({
  positions: z.record(knowledgeIdSchema, point).refine(value => Object.keys(value).length <= 400),
  pan: point, zoom: z.number().min(0.15).max(2), initialLayoutDone: z.boolean(), recenter: z.boolean().optional(),
  center: point.optional(), viewport: z.object({ width: z.number().positive().max(100_000), height: z.number().positive().max(100_000) }).optional(),
});
export const knowledgeWorkspaceReferenceSchema = z.object({
  version: z.literal(1), query: z.string().max(500), kind: z.string().max(80),
  generation: z.string().regex(/^k75-[a-f0-9]{32}$/).nullable(),
  rootId: knowledgeIdSchema.nullable(), recordIds: z.array(knowledgeIdSchema).max(200),
  selection: knowledgeSelectionSchema,
  theme: z.object({ id: knowledgeIdSchema, revision: z.number().int().positive() }).nullable(),
  themeView: z.enum(["graph", "timeline", "split"]), themeSelection: knowledgeSelectionSchema,
  normalView: knowledgeGraphViewSchema.optional(),
  themeCanvasView: z.object({ themeId: knowledgeIdSchema, revision: z.number().int().positive(), view: knowledgeGraphViewSchema }).optional(),
});
export type KnowledgeWorkspaceReference = z.infer<typeof knowledgeWorkspaceReferenceSchema>;
export const workspaceHistoryKey = "plunodeKnowledgeWorkspace";
export const workspaceStorageKey = "plunode:knowledge-workspace:v1:";
export function emptyKnowledgeReference(): KnowledgeWorkspaceReference {
  return { version: 1, query: "", kind: "", generation: null, rootId: null, recordIds: [], selection: null, theme: null, themeView: "graph", themeSelection: null };
}
export function parseKnowledgeReference(value: unknown): KnowledgeWorkspaceReference | null {
  const result = knowledgeWorkspaceReferenceSchema.safeParse(value);
  return result.success ? result.data : null;
}
export function knowledgeThemeLocation(url: URL): { id: string; revision?: number; view?: KnowledgeView; focusEntityId?: string } | null {
  const canonical=url.pathname.match(/^\/(?:en\/)?t\/([^/]+)\/?$/);
  const id = knowledgeIdSchema.safeParse(url.searchParams.get("ktheme")??(canonical?decodeURIComponent(canonical[1]):null));
  if (!id.success) return null;
  const rawRevision = url.searchParams.get("krev"), revision = rawRevision === null ? undefined : Number(rawRevision);
  if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 1)) return null;
  const view = url.searchParams.get("kview");
  const focus=knowledgeIdSchema.safeParse(url.searchParams.get('kfocus'));
  return { id: id.data, ...(focus.success?{focusEntityId:focus.data}:{}), ...(revision === undefined ? {} : { revision }), ...(["graph", "timeline", "split"].includes(view ?? "") ? { view: view as KnowledgeView } : {}) };
}
export function knowledgeWorkspaceHref(url: URL, value: KnowledgeWorkspaceReference): string {
  const next = new URL(url);
  for (const key of ["ktheme", "krev", "kview", "kfocus"]) next.searchParams.delete(key);
  const canonical=/^\/(?:en\/)?t\/[^/]+\/?$/.test(next.pathname);
  if(canonical)next.pathname=value.theme?(next.pathname.startsWith("/en/")?"/en":"")+"/t/"+encodeURIComponent(value.theme.id):(next.pathname.startsWith("/en/")?"/en":"/");
  if (value.theme) {
    if(!canonical)next.searchParams.set("ktheme", value.theme.id);
    next.searchParams.set("krev", String(value.theme.revision));
    next.searchParams.set("kview", value.themeView);
    if(value.themeSelection?.kind==='entity')next.searchParams.set('kfocus',value.themeSelection.id);
  }
  return next.pathname + next.search + next.hash;
}
