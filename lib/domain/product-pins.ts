import {z} from "zod";
export const productPinSchema=z.strictObject({id:z.string().min(1).max(160),revision:z.number().int().positive()});
