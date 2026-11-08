import { z } from "zod";
import { knowledgeIdSchema } from "./knowledge-ids";

export const featuredThemeIdsSchema = z.array(knowledgeIdSchema).max(24).refine(ids => new Set(ids).size === ids.length);
export const featuredThemeSettingsSchema = z.object({
  revision: z.number().int().nonnegative(), themeIds: featuredThemeIdsSchema,
  updatedAt: z.string().nullable(),
});
export type FeaturedThemeSettings = z.infer<typeof featuredThemeSettingsSchema>;
export const saveFeaturedThemesSchema = z.strictObject({
  requestId: z.uuidv4(), expectedRevision: z.number().int().nonnegative(), themeIds: featuredThemeIdsSchema,
});
export type SaveFeaturedThemes = z.infer<typeof saveFeaturedThemesSchema>;
export const featuredThemeCatalogSchema = featuredThemeSettingsSchema.extend({
  themes: z.array(z.object({
    id: knowledgeIdSchema, revision: z.number().int().positive(), title: z.string(), description: z.string(),
    initialView: z.enum(["graph", "timeline", "split"]), hasTimeline: z.boolean(), hasRelations: z.boolean().optional(),
    publishedAt: z.string().optional(), entityIds: z.array(z.string()),
  })),
});
