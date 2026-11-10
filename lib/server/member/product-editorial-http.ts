import type {Pool} from "pg";
import {z} from "zod";
import {assertMemberOrigin,memberInput,memberJson,MemberError} from "./http";
import {productAuthoringCommandSchema} from "../../domain/product-authoring";
import {authorizeProductOperator,dispatchProductAuthoring} from "./product-editorial";
import {KnowledgeError} from "../knowledge-foundation";
export function createProductEditorialHttp(pool:Pool,origin:string,owner:(request:Request)=>Promise<{id:string}>){return async(request:Request)=>{
 const u=await owner(request);await authorizeProductOperator(pool,u.id);assertMemberOrigin(request,origin);
 try{const input=request.headers.get('content-type')?.startsWith('multipart/form-data')?await multipartImage(request):await memberInput(request,productAuthoringCommandSchema,11_300_000);return memberJson(await dispatchProductAuthoring(pool,u.id,input));}
 catch(e){if(e instanceof KnowledgeError)return memberJson({error:{code:e.code,message:e.message}},e.status);if(e instanceof z.ZodError)throw new MemberError(400,"INVALID_ARGUMENT");throw e;}
};}

async function multipartImage(request:Request){
 const reader=request.body?.getReader();if(!reader)throw new MemberError(400,"INVALID_ARGUMENT");const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const v=await reader.read();if(v.done)break;size+=v.value.length;if(size>8*1024*1024+32000){await reader.cancel();throw new MemberError(413,"BODY_TOO_LARGE");}chunks.push(v.value);}}finally{reader.releaseLock();}
 try{const form=await new Request(request.url,{method:'POST',headers:{'content-type':request.headers.get('content-type')!},body:Buffer.concat(chunks)}).formData(),image=form.get('image'),metadata=form.get('metadata');if(!(image instanceof Blob)||typeof metadata!=='string')throw Error();return productAuthoringCommandSchema.parse({...JSON.parse(metadata),action:'upload-product-image',base64:Buffer.from(await image.arrayBuffer()).toString('base64')});}catch{throw new MemberError(400,"INVALID_ARGUMENT");}
}
