"use client";
import {useState,type ReactNode} from "react";
import type {KnowledgeSnapshot,KnowledgeThemeVersion} from "../lib/domain/knowledge-foundation";
import type {ThemeReadingPresentation} from "../lib/domain/theme-reading-presentation";
import {knowledgeDisplayText} from "../lib/domain/knowledge-display";
import Icon from "./Icon";
import ThemeImageButton from "./ThemeImageButton";
import css from "./ThemeReadingHero.module.css";
type HeroProps = {
  theme:KnowledgeThemeVersion;
  snapshot:KnowledgeSnapshot;
  locale:string;
  onAbout:()=>void;
  presentation?:ThemeReadingPresentation|null;
  media?:ReactNode;
};

export default function ThemeReadingHero({theme,snapshot,locale,onAbout,presentation,media}:HeroProps){
  const en=locale==="en";
  const [brokenSrc,setBrokenSrc]=useState<string|null>(null);
  const image=presentation?.image;
  const broken=image?.src===brokenSrc;
  const description=knowledgeDisplayText(snapshot.translations,{kind:"theme",id:theme.id,revision:theme.revision,field:"description"},locale,theme.content.description);
  const hook=presentation?.hook||description;
  const about=en?"About this theme":"このテーマについて";
  const cover=image&&!broken&&<ThemeImageButton key={image.src} image={image} en={en}
    className={css.art} onError={()=>setBrokenSrc(image.src)}/>;
  const heading=(hook||!media)&&<p className={media&&!presentation?.hook?css.lead:css.hook}>{hook}</p>;
  const lead=presentation?.lead&&<p className={css.lead}>{presentation.lead}</p>;

  if(!description&&!presentation&&!media)return <button onClick={onAbout} className={css.about}><Icon name="book"/>{about}</button>;

  return <section className={media?`${css.hero} ${css.editorial}`:css.hero}
    data-art={!media&&image&&!broken?image.kind:undefined} data-media-intro={media?"true":undefined}
    aria-label={en?"Introduction":"このテーマの導入"}>
    {!media&&cover}
    <div className={css.copy}>
      <button className={css.about} onClick={onAbout}>{about}<Icon name="arrow"/></button>
      {media&&image?<div className={css.editorialHeadline}>
        <div className={css.editorialCover}>{cover}</div>
        {heading}
      </div>:heading}
      {lead}
    </div>
    {media&&<div className={css.media}>{media}</div>}
  </section>;
}
