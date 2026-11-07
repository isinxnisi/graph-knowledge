import {z} from 'zod';
export const webImportReceiptSchema=z.object({receiptId:z.string(),state:z.string(),items:z.array(z.object({ordinal:z.number(),state:z.string(),reason:z.string(),result:z.object({currentUrl:z.string().nullable(),revision:z.number()}).nullable()}))});
export const webImportPageSchema=z.object({items:z.array(z.object({requestId:z.string(),namespace:z.string(),packageId:z.string(),revision:z.number(),createdAt:z.string(),state:z.string().default('saved'),reason:z.string().default(''),receipt:webImportReceiptSchema.nullable()}))});
