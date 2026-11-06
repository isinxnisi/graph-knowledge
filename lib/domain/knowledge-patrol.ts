import {z} from 'zod';

export const patrolOriginSchema=z.enum(['common','public-kg']);
export type PatrolOrigin=z.infer<typeof patrolOriginSchema>;
export const patrolStatusSchema=z.object({
 policy:z.string(),
 origins:z.array(z.object({
  origin:patrolOriginSchema,
  phase:z.enum(['scanning','queueing','idle']),
  scanned:z.number().int().nonnegative(),total:z.number().int().nonnegative(),
  present:z.number().int().nonnegative(),eligible:z.number().int().nonnegative(),
  pending:z.number().int().nonnegative(),superseded:z.number().int().nonnegative(),
  completedAt:z.string().nullable(),nextScanAt:z.string(),
  errorCode:z.string().nullable(),retryAt:z.string().nullable(),
 })),
});
export type PatrolStatus=z.infer<typeof patrolStatusSchema>;
