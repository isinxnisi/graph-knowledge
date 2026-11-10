import {z} from "zod";
import {offerSchema,productSchema} from "./product-contract";
export {productPinSchema} from "./product-pins";
export const imageProvenanceSchema=z.strictObject({
 id:z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,120}$/),
 kind:z.enum(["original","generated","licensed"]),
 credit:z.string().trim().max(300).default(""),
 terms:z.string().trim().min(1).max(2000),
 sourceUrl:z.url().refine(v=>new URL(v).protocol==="https:"&&!new URL(v).username&&!new URL(v).password).optional(),
});
export const uploadProductImageSchema=z.strictObject({requestId:z.uuidv4(),provenance:imageProvenanceSchema.optional(),provenanceId:z.string().max(121).optional(),role:z.enum(["illustration","product-photo"]).default("illustration"),alt:z.object({ja:z.string().trim().min(1).max(300),en:z.string().trim().min(1).max(300)}),base64:z.string().min(8).max(11200000)}).refine(v=>Boolean(v.provenance)!==Boolean(v.provenanceId),"Specify one reusable provenance profile or its id");
export const saveProductSchema=z.strictObject({requestId:z.uuidv4(),expectedRevision:z.number().int().min(0),product:productSchema.omit({image:true}),offers:z.array(offerSchema.omit({image:true})).max(3).default([]),reason:z.object({ja:z.string().trim().min(1).max(300),en:z.string().trim().min(1).max(300)}),appliesTo:z.array(z.strictObject({kind:z.enum(["entity","record"]),id:z.string().min(1).max(200)})).max(100).default([])});
export const productAuthoringCommandSchema=z.discriminatedUnion("action",[
 uploadProductImageSchema.safeExtend({action:z.literal("upload-product-image")}),
 saveProductSchema.extend({action:z.literal("save-product")}),
 z.strictObject({action:z.literal("read-product"),id:z.string().min(1).max(160),revision:z.number().int().positive().optional()}),
]);
export type ProductAuthoringCommand=z.infer<typeof productAuthoringCommandSchema>;
