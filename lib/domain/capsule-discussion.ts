import {personSchema} from "./community";
import { z } from "zod";

export const DISCUSSION_LIMITS = { body: 2000, posts: 200, perMinute: 5 } as const;
export const discussionRevisionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const discussionCreateSchema = z.strictObject({
  requestId: z.uuidv4(), revision: discussionRevisionSchema,
  body: z.string().trim().min(1).max(DISCUSSION_LIMITS.body),
});
export const discussionCloseSchema = z.strictObject({ closed: z.boolean(), expectedClosed: z.boolean() });
export const discussionWithdrawSchema = z.strictObject({ postId: z.uuidv4() });
export const discussionPostSchema = z.strictObject({
  id: z.uuidv4(), revision: discussionRevisionSchema, authorName: z.string().nullable(), author: personSchema.nullable().optional(),
  moderationRevision: z.number().int().positive().optional(), canReport: z.boolean().optional(),
  body: z.string().nullable(), createdAt: z.iso.datetime(), withdrawnAt: z.iso.datetime().nullable(), own: z.boolean(),
});
export const discussionSchema = z.strictObject({
  capsuleId: z.uuidv4(), revision: discussionRevisionSchema, closed: z.boolean(),
  viewer: z.strictObject({ id: z.uuidv4(), name: z.string() }).nullable(), canManage: z.boolean(),
  posts: z.array(discussionPostSchema).max(DISCUSSION_LIMITS.posts),
});
export type CapsuleDiscussion = z.infer<typeof discussionSchema>;

export const OWN_POSTS_PAGE_SIZE = 20;
export const ownDiscussionPostSchema = z.strictObject({
  id: z.uuidv4(), capsuleId: z.uuidv4(), revision: discussionRevisionSchema,
  body: z.string().max(DISCUSSION_LIMITS.body).nullable(),
  createdAt: z.iso.datetime(), withdrawnAt: z.iso.datetime().nullable(),
});
export const ownDiscussionPostsSchema = z.strictObject({
  posts: z.array(ownDiscussionPostSchema).max(OWN_POSTS_PAGE_SIZE),
  nextCursor: z.string().min(1).max(512).nullable(),
});
export type OwnDiscussionPosts = z.infer<typeof ownDiscussionPostsSchema>;
