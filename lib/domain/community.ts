import {z} from 'zod';
export const personSchema=z.object({handle:z.string(),displayName:z.string(),icon:z.string(),official:z.boolean().optional(),imageUrl:z.string().nullable().optional()});
export const communitySchema=z.object({id:z.uuid(),title:z.string(),description:z.string(),visibility:z.enum(['public','members']),status:z.enum(['active','archived','suspended']),revision:z.number(),role:z.enum(['admin','member']).nullable(),adminOffered:z.boolean(),membershipGeneration:z.number().nullable().optional(),lastAdmin:z.boolean().optional(),creator:personSchema.nullable().optional()});
export type Community=z.infer<typeof communitySchema>;
export const communityCapsuleListingSchema=z.object({
 id:z.uuid(),communityId:z.uuid(),capsuleId:z.uuid(),capsuleRevision:z.number().int().positive(),revision:z.number().int().positive(),
 audience:z.enum(['public','cohort']),description:z.string(),createdAt:z.string(),updatedAt:z.string(),title:z.string(),
 entityCount:z.number().int().nonnegative(),claimCount:z.number().int().nonnegative(),canManage:z.boolean(),threadId:z.uuid().nullable()
});
export const communityResponse=z.object({
 community:communitySchema.optional(),communities:z.array(communitySchema).optional(),
 capsules:z.array(communityCapsuleListingSchema).max(20).optional(),
 threads:z.array(z.object({id:z.uuid(),title:z.string(),audience:z.string(),closed:z.boolean(),revision:z.number(),creator:personSchema.nullable().optional(),postCount:z.number().optional(),updatedAt:z.string().nullable().optional()})).optional(),
 thread:z.object({id:z.uuid(),title:z.string(),audience:z.string(),closed:z.boolean(),revision:z.number(),creator:personSchema.nullable().optional()}).optional(),
 posts:z.array(z.object({id:z.uuid(),body:z.string(),status:z.string(),createdAt:z.string().optional(),readable:z.boolean().optional(),threadId:z.uuid().optional(),threadTitle:z.string().optional(),communityTitle:z.string().optional(),revision:z.number().optional(),hiddenBy:z.enum(['community','site']).nullable().optional(),canWithdraw:z.boolean().optional(),author:z.object({handle:z.string(),icon:z.string(),official:z.boolean().optional(),imageUrl:z.string().nullable().optional()}).nullable().optional(),author_id:z.string().nullable().optional(),name:z.string().nullable().optional()})).optional(),
 members:z.array(z.object({id:z.uuid(),name:z.string(),role:z.string(),admin_offered:z.boolean(),creator:personSchema.nullable().optional()})).optional(),
 nextCursor:z.string().nullable().optional(),membersCursor:z.string().nullable().optional(),
 invitations:z.array(z.object({id:z.uuid(),communityId:z.uuid(),title:z.string().nullable(),targetId:z.uuid(),targetHandle:z.string().nullable().optional(),revision:z.number(),status:z.string(),expiresAt:z.string(),readmission:z.boolean()})).optional(),
 participation:z.array(z.object({communityId:z.uuid(),title:z.string().nullable(),status:z.string(),role:z.string(),canRequestRecovery:z.boolean()})).optional(),
 recoveries:z.array(z.object({id:z.uuid(),communityId:z.uuid(),status:z.string(),revision:z.number(),readmissionRequired:z.boolean().optional()})).optional(),
 reports:z.array(z.object({id:z.uuid(),kind:z.string(),status:z.string()})).optional(),
 audit:z.array(z.object({id:z.string(),action:z.string(),targetId:z.uuid(),actorId:z.string().nullable(),reason:z.string(),at:z.string()})).optional(),
 partial:z.boolean().optional(),membersPartial:z.boolean().optional()
});
