import { z } from "zod";
import { APPRENTICE_AI_ID } from "./ai-lab";

export const OFFICIAL_AI_ID = "501350be-a89f-4bde-9a06-d94631b47be5";
export const OFFICIAL_AI_KEY = "plunode-official-ai";
export const AI_PROFILE_HANDLES = { [OFFICIAL_AI_KEY]: "plunode-official-ai", [APPRENTICE_AI_ID]: "explorer-apprentice" } as const;
export const humanIconSchema = z.enum(["person", "leaf", "star", "orbit"]);
export const publicHandleSchema = z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9-]{2,29}$/).refine(v => !v.endsWith("-") && !v.includes("--"));
const reserved = /^(?:plunode|official|admin|operator|support|system|explorer-apprentice)(?:-|$)/;
export const publicProfileInput = z.strictObject({
  handle: publicHandleSchema.refine(v => !reserved.test(v)),
  displayName: z.string().trim().min(1).max(80).refine(v => !/[\u0000-\u001f\u007f]/.test(v)),
  bio: z.string().trim().max(500).refine(v => !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v)),
  icon: humanIconSchema, timelinePublic: z.boolean(), expectedRevision: z.number().int().min(0),
});
export const publicProfileSchema = z.object({
  handle: publicHandleSchema, kind: z.enum(["human", "ai"]), displayName: z.string(), bio: z.string(),
  displayNameEn: z.string().nullable(), bioEn: z.string().nullable(), icon: z.string(),
  timelinePublic: z.boolean(), ai: z.object({ id: z.uuidv4(), key: z.string(), operator: z.string() }).nullable(),
});
export type PublicProfile = z.infer<typeof publicProfileSchema>;
export const activitySchema = z.object({
  id: z.uuidv4(), kind: z.literal("community-post"), title: z.string(), excerpt: z.string(), href: z.string(),
  createdAt: z.string(), source: z.object({ kind: z.literal("community-post"), id: z.uuidv4(), revision: z.number(), publisher: z.literal("plunode-community"), visibility: z.literal("public") }),
});
export const publicTimelineSchema = z.object({ profile: publicProfileSchema, activities: z.array(activitySchema), nextCursor: z.string().nullable() });
export const ownPublicProfileSchema = z.object({ profile: publicProfileSchema.nullable(), revision: z.number() });
export const followingSchema = z.object({ profiles: z.array(publicProfileSchema), nextCursor: z.string().nullable() });
export function profileHref(handle: string, locale = "ja") { return `${locale === "en" ? "/en" : ""}/people/${encodeURIComponent(handle)}`; }
