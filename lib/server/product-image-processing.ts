import sharp from "sharp";
import {createHash} from "node:crypto";
import {KnowledgeError} from "./knowledge-foundation";
/** Decode pixels, auto-orient and re-encode: no SVG, animated media, EXIF or originals retained. */
export async function processProductImage(input:Buffer){
 if(input.length>8*1024*1024)throw new KnowledgeError("画像は8MB以下にしてください。",413,"IMAGE_TOO_LARGE");
 try{
  const options={limitInputPixels:24_000_000,failOn:"warning" as const};
  const meta=await sharp(input,options).metadata();
  if(!["png","jpeg","webp","avif"].includes(meta.format??"")||(meta.pages??1)!==1||!meta.width||!meta.height||Math.min(meta.width,meta.height)<32)throw Error("format");
  const image=sharp(input,options).rotate().toColorspace("srgb");
  const main=await image.clone().resize({width:1600,height:1600,fit:"inside",withoutEnlargement:true}).webp({quality:88,alphaQuality:100,effort:4}).toBuffer({resolveWithObject:true});
  const thumbnail=await image.clone().resize({width:640,height:640,fit:"inside",withoutEnlargement:true}).webp({quality:88,alphaQuality:100,effort:4}).toBuffer();
  if(main.data.length>3_000_000||thumbnail.length>1_500_000)throw Error("size");
  return {id:createHash("sha256").update(main.data).digest("hex"),bytes:main.data,thumbnail,width:main.info.width,height:main.info.height,original:{width:meta.width,height:meta.height,bytes:input.length,format:meta.format},processedBytes:main.data.length,thumbnailBytes:thumbnail.length};
 }catch(e){if(e instanceof KnowledgeError)throw e;throw new KnowledgeError("JPEG・PNG・WebP・AVIFの静止画像を選んでください（24メガピクセルまで）。",400,"IMAGE_INVALID");}
}
