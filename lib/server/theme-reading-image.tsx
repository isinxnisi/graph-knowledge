import {memberRuntime} from "./member/runtime";
/* ImageResponse renders a static image tree; next/image is not supported here. */
/* eslint-disable @next/next/no-img-element */
import "server-only";
import {ImageResponse} from "next/og";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {publicThemeRead,hasThemeLocale} from "./theme-reading-page";
import {themeReadingPresentation} from "./theme-reading-presentation";
import {knowledgeDisplayText} from "../domain/knowledge-display";
export async function themeReadingImage(id:string,locale:"ja"|"en",revision?:number){
 try{
 const v=await publicThemeRead(id,locale,revision);if(!hasThemeLocale(v,locale))return new Response(null,{status:404});
 const p=themeReadingPresentation(v.theme,locale,v.snapshot),title=knowledgeDisplayText(v.displayTranslations,{kind:"theme",id,revision:v.theme.revision,field:"title"},locale,v.theme.content.title);
 const [font,asset]=await Promise.all([readFile(path.join(process.cwd(),"app/fonts/BIZUDPMincho-OG.woff")),p?.image?p.image.src.startsWith('/api/knowledge/product-images/')?memberRuntime().pool.query('SELECT a.bytes FROM product_image_asset a WHERE a.id=$1 AND EXISTS(SELECT 1 FROM theme_editorial_asset_reference t WHERE t.image_id=a.id AND t.published)',[p.image.id]).then(r=>r.rows[0]?.bytes??null):readFile(path.join(process.cwd(),"public",p.image.src)):null]);
 return new ImageResponse(<div style={{display:"flex",width:"100%",height:"100%",background:"#faf6ef",color:"#172d46",padding:54,gap:46,alignItems:"center"}}>
 <div style={{display:"flex",flexDirection:"column",width:asset?600:1050,gap:26}}><div style={{display:"flex",fontSize:25,color:"#286da2"}}>Plunode · {locale==="en"?"Theme":"根拠から読むテーマ"}</div><div style={{fontSize:48,lineHeight:1.4,wordBreak:"break-word"}}>{title}</div><div style={{fontSize:24,lineHeight:1.6,color:"#526578"}}>{p?.hook||v.theme.content.description.slice(0,100)}</div><div style={{fontSize:18,color:"#627689"}}>plunode.net</div></div>
 {asset&&p?.image&&<div style={{display:"flex",flexDirection:"column",width:400,gap:12}}><img alt={p.image.alt} src={`data:image/${p.image.src.startsWith("/api/")?"webp":p.image.src.endsWith(".png")?"png":"jpeg"};base64,`+asset.toString("base64")} width={400} height={420} style={{objectFit:p.image.kind==="illustration"?"contain":"cover",borderRadius:18}}/><div style={{fontSize:13,color:"#526578"}}>{p.image.credit}</div></div>}
 </div>,{width:1200,height:630,fonts:[{name:"Editorial",data:font,weight:400}],headers:{"Cache-Control":"no-store","X-Robots-Tag":"noindex"}});
 }catch(error){return new Response(null,{status:error&&typeof error==="object"&&"status" in error&&[403,404,410].includes(Number(error.status))?404:503,headers:{"Cache-Control":"no-store","X-Robots-Tag":"noindex"}});}
}
