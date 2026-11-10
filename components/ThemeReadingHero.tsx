"use client";
import Image from "next/image";
import {useState} from "react";
import type {KnowledgeSnapshot,KnowledgeThemeVersion} from "../lib/domain/knowledge-foundation";
import type {ThemeReadingPresentation} from "../lib/domain/theme-reading-presentation";
import {knowledgeDisplayText} from "../lib/domain/knowledge-display";
import Icon from "./Icon";
import css from "./ThemeReadingHero.module.css";
export default function ThemeReadingHero({theme,snapshot,locale,onAbout,itemEntry,presentation}:{itemEntry?:import("react").ReactNode;presentation?:ThemeReadingPresentation|null;theme:KnowledgeThemeVersion;snapshot:KnowledgeSnapshot;locale:string;onAbout:()=>void}){
 const en=locale==="en",[broken,setBroken]=useState(false),image=presentation?.image;
 const description=knowledgeDisplayText(snapshot.translations,{kind:"theme",id:theme.id,revision:theme.revision,field:"description"},locale,theme.content.description);
 if(!description&&!presentation)return <><button onClick={onAbout} className={css.about}><Icon name="book"/>{en?"About this theme":"このテーマについて"}</button>{itemEntry}</>;
 return <section className={css.hero} data-art={image&&!broken?image.kind:undefined} aria-label={en?"Introduction":"このテーマの導入"}>
 {image&&!broken&&<div className={css.art}><Image unoptimized src={image.src} width={image.width} height={image.height} alt={image.alt} style={{objectPosition:image.focus}} onError={()=>setBroken(true)}/></div>}
 <div className={css.copy}><button className={css.about} onClick={onAbout}>{en?"About this theme":"このテーマについて"}<Icon name="arrow"/></button><p className={css.hook}>{presentation?.hook||description}</p>{presentation?.lead&&<p className={css.lead}>{presentation.lead}</p>}</div>
 {itemEntry}
 </section>;
}
