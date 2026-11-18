import {z} from 'zod';

export const operatorThemesSchema=z.object({items:z.array(z.object({
 id:z.string(),title:z.string(),currentRevision:z.number().int().positive(),publishedRevision:z.number().int().positive().nullable(),
 state:z.enum(['production','review','published']),unfinished:z.array(z.string()),blockers:z.array(z.string()),
}))});
export type OperatorTheme=z.infer<typeof operatorThemesSchema>['items'][number];
