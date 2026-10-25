import {z} from 'zod';
export const communitySchema=z.object({id:z.uuid(),title:z.string(),description:z.string(),visibility:z.enum(['public','members']),status:z.enum(['active','archived','suspended']),revision:z.number(),role:z.enum(['admin','member']).nullable(),adminOffered:z.boolean(),membershipGeneration:z.number().nullable().optional(),lastAdmin:z.boolean().optional()});
export type Community=z.infer<typeof communitySchema>;
export const communityResponse=z.object({
 community:communitySchema.optional(),communities:z.array(communitySchema).optional(),
 threads:z.array(z.object({id:z.uuid(),title:z.string(),audience:z.string(),closed:z.boolean(),revision:z.number(),postCount:z.number().optional(),updatedAt:z.string().nullable().optional()})).optional(),
 thread:z.object({id:z.uuid(),title:z.string(),audience:z.string(),closed:z.boolean(),revision:z.number()}).optional(),
 posts:z.array(z.object({id:z.uuid(),body:z.string(),status:z.string(),createdAt:z.string().optional(),readable:z.boolean().optional(),threadId:z.uuid().optional(),threadTitle:z.string().optional(),communityTitle:z.string().optional(),revision:z.number().optional(),hiddenBy:z.enum(['community','site']).nullable().optional(),canWithdraw:z.boolean().optional(),author:z.object({handle:z.string(),icon:z.string()}).nullable().optional(),author_id:z.string().nullable().optional(),name:z.string().nullable().optional()})).optional(),
 members:z.array(z.object({id:z.uuid(),name:z.string(),role:z.string(),admin_offered:z.boolean()})).optional(),
 nextCursor:z.string().nullable().optional(),membersCursor:z.string().nullable().optional(),
 invitations:z.array(z.object({id:z.uuid(),communityId:z.uuid(),title:z.string().nullable(),targetId:z.uuid(),revision:z.number(),status:z.string(),expiresAt:z.string(),readmission:z.boolean()})).optional(),
 participation:z.array(z.object({communityId:z.uuid(),title:z.string().nullable(),status:z.string(),role:z.string(),canRequestRecovery:z.boolean()})).optional(),
 recoveries:z.array(z.object({id:z.uuid(),communityId:z.uuid(),status:z.string(),revision:z.number(),readmissionRequired:z.boolean().optional()})).optional(),
 reports:z.array(z.object({id:z.uuid(),kind:z.string(),status:z.string()})).optional(),
 audit:z.array(z.object({id:z.string(),action:z.string(),targetId:z.uuid(),actorId:z.string().nullable(),reason:z.string(),at:z.string()})).optional(),
 partial:z.boolean().optional(),membersPartial:z.boolean().optional()
});
