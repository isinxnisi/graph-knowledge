"use client";
import Image from "next/image";
import {useState} from "react";
import type {KnowledgeSnapshot,KnowledgeThemeVersion} from "../lib/domain/knowledge-foundation";
import type {ThemeReadingPresentation} from "../lib/domain/theme-reading-presentation";
import {knowledgeDisplayText} from "../lib/domain/knowledge-display";
import Icon from "./Icon";
import css from "./ThemeReadingHero.module.css";
export default function ThemeReadingHero({theme,snapshot,locale,onAbout,presentation}:{presentation?:ThemeReadingPresentation|null;theme:KnowledgeThemeVersion;snapshot:KnowledgeSnapshot;locale:string;onAbout:()=>void}){
 const en=locale==="en",[broken,setBroken]=useState(false);
 const description=knowledgeDisplayText(snapshot.translations,{kind:"theme",id:theme.id,revision:theme.revision,field:"description"},locale,theme.content.description);
 if(!description&&!presentation)return <button onClick={onAbout} className={css.about}><Icon name="book"/>{en?"About this theme":"このテーマについて"}</button>;
 return <section className={css.hero} aria-label={en?"Introduction":"このテーマの導入"}>
 {presentation?.image&&!broken&&<figure><Image unoptimized src={presentation.image.src} width={presentation.image.width} height={presentation.image.height} alt={presentation.image.alt} style={{objectPosition:presentation.image.focus}} onError={()=>setBroken(true)}/><figcaption><a href={presentation.image.sourceUrl} target="_blank" rel="noopener noreferrer">{presentation.image.credit}</a></figcaption></figure>}
 <div><button className={css.about} onClick={onAbout}>{en?"About this theme":"このテーマについて"}<Icon name="arrow"/></button><p className={css.hook}>{presentation?.hook||description}</p>{presentation?.lead&&<p className={css.lead}>{presentation.lead}</p>}{broken&&presentation?.image&&<small className={css.imageFallback}>{en?"Image unavailable · ":"画像を表示できません · "}{presentation.image.credit}</small>}</div>
 </section>;
}
