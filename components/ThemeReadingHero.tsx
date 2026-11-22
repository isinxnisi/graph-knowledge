"use client";
import {useState} from "react";
import type {KnowledgeSnapshot,KnowledgeThemeVersion} from "../lib/domain/knowledge-foundation";
import type {ThemeReadingPresentation} from "../lib/domain/theme-reading-presentation";
import {knowledgeDisplayText} from "../lib/domain/knowledge-display";
import Icon from "./Icon";
import ThemeImageButton from "./ThemeImageButton";
import css from "./ThemeReadingHero.module.css";
export default function ThemeReadingHero({theme,snapshot,locale,onAbout,presentation}:{presentation?:ThemeReadingPresentation|null;theme:KnowledgeThemeVersion;snapshot:KnowledgeSnapshot;locale:string;onAbout:()=>void}){
 const en=locale==="en",[brokenSrc,setBrokenSrc]=useState<string|null>(null),image=presentation?.image,broken=image?.src===brokenSrc;
 const description=knowledgeDisplayText(snapshot.translations,{kind:"theme",id:theme.id,revision:theme.revision,field:"description"},locale,theme.content.description);
 if(!description&&!presentation)return <><button onClick={onAbout} className={css.about}><Icon name="book"/>{en?"About this theme":"このテーマについて"}</button></>;
 return <section className={css.hero} data-art={image&&!broken?image.kind:undefined} aria-label={en?"Introduction":"このテーマの導入"}>
 {image&&!broken&&<ThemeImageButton key={image.src} image={image} en={en} className={css.art} onError={()=>setBrokenSrc(image.src)}/>}
 <div className={css.copy}><button className={css.about} onClick={onAbout}>{en?"About this theme":"このテーマについて"}<Icon name="arrow"/></button><p className={css.hook}>{presentation?.hook||description}</p>{presentation?.lead&&<p className={css.lead}>{presentation.lead}</p>}</div>

 </section>;
}
