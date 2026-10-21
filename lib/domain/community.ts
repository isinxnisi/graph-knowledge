import {z} from 'zod';
export const communitySchema=z.object({id:z.uuid(),title:z.string(),description:z.string(),visibility:z.enum(['public','members']),status:z.enum(['active','archived','suspended']),revision:z.number(),role:z.enum(['admin','member']).nullable(),adminOffered:z.boolean()});
export type Community=z.infer<typeof communitySchema>;
export const communityResponse=z.object({
 community:communitySchema.optional(),communities:z.array(communitySchema).optional(),
 threads:z.array(z.object({id:z.uuid(),title:z.string(),audience:z.string(),closed:z.boolean(),revision:z.number()})).optional(),
 thread:z.object({id:z.uuid(),title:z.string(),audience:z.string(),closed:z.boolean(),revision:z.number()}).optional(),
 posts:z.array(z.object({id:z.uuid(),body:z.string(),status:z.string(),author_id:z.string().nullable().optional(),name:z.string().nullable().optional()})).optional(),
 members:z.array(z.object({id:z.uuid(),name:z.string(),role:z.string(),admin_offered:z.boolean()})).optional(),
 partial:z.boolean().optional(),membersPartial:z.boolean().optional()
});
