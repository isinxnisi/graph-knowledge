import {z} from 'zod';
export const themePublicationCheckSchema=z.strictObject({theme:z.string().min(1).max(2000),languages:z.array(z.enum(['ja','en'])).min(1).max(2).default(['ja','en']),expectedRevision:z.number().int().positive().optional(),view:z.literal("published").optional()});
