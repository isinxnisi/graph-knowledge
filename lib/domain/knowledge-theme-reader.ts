import { z } from "zod";
import { knowledgeIdSchema, knowledgeRevisionSchema, type KnowledgeThemeVersion, type KnowledgeSnapshot, type KnowledgeEntityVersion } from "./knowledge-foundation";
import type { KnowledgePublishedRecord } from "./knowledge-publication";
import { PREDICATE_KEYS } from "./predicates";
import { roleIdSchema } from "./contribution";

export type KnowledgeThemePage = { focusIds?: string[]; themes: {
  id: string; revision: number; title: string; description: string;
  initialView: "graph" | "timeline" | "split"; hasTimeline: boolean; hasRelations?: boolean; publishedAt?: string; entityIds: string[];
}[] };
/** A Theme fixes its own versions. It is not re-resolved against an active generation. */
export type KnowledgeThemeRead = {
  theme: KnowledgeThemeVersion; snapshot: KnowledgeSnapshot; records: KnowledgePublishedRecord[];
};
export type KnowledgeEntityPage = {
  generation: string; entities: KnowledgeEntityVersion[]; nextCursor: string | null; hasMore: boolean;
};
const queryText = z.string().trim().max(200).refine(v => !/[\u0000-\u001f\u007f]/.test(v), "検索条件に制御文字が含まれています");
export const knowledgeThemeListQuerySchema = z.strictObject({ entityId: knowledgeIdSchema.optional(), q: queryText.default(""), kind: z.enum(["all", "timeline", "graph", "context"]).default("all"), order: z.enum(["newest", "name"]).default("newest") });
export const knowledgeThemeReadQuerySchema = z.strictObject({ themeId: knowledgeIdSchema, revision: knowledgeRevisionSchema.optional() });
export const knowledgeEntityQuerySchema = z.strictObject({
  generation: z.string().regex(/^k75-[a-f0-9]{32}$/).optional(),
  entityId: knowledgeIdSchema.optional(), q: queryText.default(""), kind: z.string().trim().min(1).max(80).optional(),
  entityIds: z.array(knowledgeIdSchema).max(200).transform(ids => [...new Set(ids)].sort()).optional(),
  predicates: z.array(z.enum(PREDICATE_KEYS)).min(1).max(PREDICATE_KEYS.length).transform(ids => [...new Set(ids)].sort()).optional(),
  roleId: roleIdSchema.optional(), aroundId: knowledgeIdSchema.optional(),
  scopeIds: z.array(knowledgeIdSchema).max(20000).transform(ids => [...new Set(ids)].sort()).optional(),
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/).optional(),
});

export type KnowledgeThemeSummary = KnowledgeThemePage["themes"][number];
export type KnowledgeThemeHome = { featured: KnowledgeThemeSummary[]; recent: KnowledgeThemeSummary[]; total: number };
export function knowledgeThemeKind(theme: KnowledgeThemeSummary) { return theme.hasTimeline ? "timeline" : theme.hasRelations === false ? "context" : "graph"; }
export function knowledgeThemeTypeLabel(theme: KnowledgeThemeSummary, en = false) {
  return theme.hasTimeline ? theme.hasRelations ? en ? "Timeline · relation diagram" : "年表・関係図" : en ? "Timeline" : "年表" : theme.hasRelations === false ? en ? "Reading" : "解説" : en ? "Relation diagram" : "関係図";
}
