import { z } from "zod";
import { knowledgeIdSchema, knowledgeRevisionSchema, type KnowledgeThemeVersion, type KnowledgeSnapshot, type KnowledgeEntityVersion } from "./knowledge-foundation";
import type { KnowledgePublishedRecord } from "./knowledge-publication";

export type KnowledgeThemePage = { themes: {
  id: string; revision: number; title: string; description: string;
  initialView: "graph" | "timeline" | "split"; hasTimeline: boolean; entityIds: string[];
}[] };
/** A Theme fixes its own versions. It is not re-resolved against an active generation. */
export type KnowledgeThemeRead = {
  theme: KnowledgeThemeVersion; snapshot: KnowledgeSnapshot; records: KnowledgePublishedRecord[];
};
export type KnowledgeEntityPage = {
  generation: string; entities: KnowledgeEntityVersion[]; nextCursor: string | null; hasMore: boolean;
};
const queryText = z.string().trim().max(200).refine(v => !/[\u0000-\u001f\u007f]/.test(v), "検索条件に制御文字が含まれています");
export const knowledgeThemeListQuerySchema = z.strictObject({ entityId: knowledgeIdSchema.optional(), q: queryText.default("") });
export const knowledgeThemeReadQuerySchema = z.strictObject({ themeId: knowledgeIdSchema, revision: knowledgeRevisionSchema.optional() });
export const knowledgeEntityQuerySchema = z.strictObject({
  generation: z.string().regex(/^k75-[a-f0-9]{32}$/).optional(),
  entityId: knowledgeIdSchema.optional(), q: queryText.default(""), kind: z.string().trim().min(1).max(80).optional(),
  entityIds: z.array(knowledgeIdSchema).max(200).transform(ids => [...new Set(ids)].sort()).optional(),
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/).optional(),
});
