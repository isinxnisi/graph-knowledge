import "server-only";
import {cache} from "react";
import {headers} from "next/headers";
import {notFound} from "next/navigation";
import type {Metadata} from "next";
import {knowledgeReadGuard} from "./knowledge-read-runtime";
import {knowledgePublicationPreview} from "./knowledge-publication-preview";
import {ExplorationPage} from "./exploration-page";
import {explorationMetadata} from "./publication";
import {knowledgeDisplayText} from "../domain/knowledge-display";
import {themeReadingPresentation} from "./theme-reading-presentation";
import {knowledgeIdSchema} from "../domain/knowledge-ids";
import {PUBLIC_ORIGIN} from "../domain/publication";
export const themePath=(id:string,locale:string="ja")=>(locale==="en"?"/en":"")+"/t/"+encodeURIComponent(id);
/** All public entry points share the publication service's current authorization. No durable body cache. */
export const publicThemeRead=cache(async(id:string,locale:string,revision?:number)=>{
 const parsed=knowledgeIdSchema.safeParse(decodeURIComponent(id));if(!parsed.success)notFound();id=parsed.data;
 const h=await headers();knowledgeReadGuard(new Request("http://localhost/",{headers:{host:h.get("host")??""}}));
 const service=await knowledgePublicationPreview();return service.theme({themeId:id,language:locale,...(revision?{revision}:{})});
});
export function hasThemeLocale(value:Awaited<ReturnType<typeof publicThemeRead>>,locale:string){
 if(locale==="ja")return true;
 const t=value.theme;
 const title=knowledgeDisplayText(value.displayTranslations,{kind:"theme",id:t.id,revision:t.revision,field:"title"},locale,t.content.title);
 const translated=(field:"title"|"description")=>t.content.textLanguages?.[field]?.tag===locale||knowledgeDisplayText(value.displayTranslations,{kind:"theme",id:t.id,revision:t.revision,field},locale,t.content[field])!==t.content[field];
 const timed=value.snapshot.records.filter(r=>r.content.times.length),bodies=timed.length?timed:value.snapshot.records,readable=bodies.filter(r=>r.content.textLanguages?.assertion?.tag===locale||knowledgeDisplayText(value.displayTranslations,{kind:"record",id:r.id,revision:r.revision,field:"assertion"},locale,r.content.assertion)!==r.content.assertion);
 return !!title&&translated("title")&&(!t.content.description||translated("description"))&&(!bodies.length||readable.length===bodies.length);
}
export async function themeMetadata(id:string,locale:"ja"|"en",revision?:number,stateful=false):Promise<Metadata>{
 let value;try{value=await publicThemeRead(id,locale,revision);}catch{return {title:locale==="en"?"Theme unavailable":"テーマを閲覧できません",robots:{index:false,follow:false}};}
 if(!hasThemeLocale(value,locale))return {robots:{index:false,follow:false}};
 id=value.theme.id;const t=value.theme,p=themeReadingPresentation(t,locale,value.snapshot),text=(field:"title"|"description")=>knowledgeDisplayText(value.displayTranslations,{kind:"theme",id:t.id,revision:t.revision,field},locale,t.content[field]);
 const path=themePath(id,locale),metadata=await explorationMetadata(path,!!revision||stateful,text("title")+" — Plunode",p?.lead||text("description"),true,{locale,image:path+"/opengraph-image?revision="+t.revision});
 const english=locale==="en"?value:await publicThemeRead(id,"en",revision);
 return {...metadata,alternates:{canonical:PUBLIC_ORIGIN+path,languages:{ja:PUBLIC_ORIGIN+themePath(id),...(hasThemeLocale(english,"en")?{en:PUBLIC_ORIGIN+themePath(id,"en")}:{}),"x-default":PUBLIC_ORIGIN+themePath(id)}}};
}
export async function ThemeReadingPage({id,locale,revision}:{id:string;locale:"ja"|"en";revision?:number}){
 let value;try{value=await publicThemeRead(id,locale,revision);}catch(error){if(error&&typeof error==="object"&&"status" in error&&[403,404,410].includes(Number(error.status)))notFound();throw error;}
 if(!hasThemeLocale(value,locale))notFound();
 return <ExplorationPage locale={locale} initialKnowledgeTheme={value}/>;
}
