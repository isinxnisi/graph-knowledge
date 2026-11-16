"use client";
import Image from "next/image";
import {useEffect,useRef,useState} from "react";
import type {KnowledgeSnapshot,KnowledgeThemeVersion} from "../lib/domain/knowledge-foundation";
import type {ThemeReadingPresentation} from "../lib/domain/theme-reading-presentation";
import {knowledgeDisplayText} from "../lib/domain/knowledge-display";
import Icon from "./Icon";
import DialogCloseButton from "./DialogCloseButton";
import {useDialogBackdrop} from "../lib/client/use-dialog-backdrop";
import css from "./ThemeReadingHero.module.css";
export default function ThemeReadingHero({theme,snapshot,locale,onAbout,presentation}:{presentation?:ThemeReadingPresentation|null;theme:KnowledgeThemeVersion;snapshot:KnowledgeSnapshot;locale:string;onAbout:()=>void}){
 const en=locale==="en",[brokenSrc,setBrokenSrc]=useState<string|null>(null),image=presentation?.image,broken=image?.src===brokenSrc;
 const description=knowledgeDisplayText(snapshot.translations,{kind:"theme",id:theme.id,revision:theme.revision,field:"description"},locale,theme.content.description);
 if(!description&&!presentation)return <><button onClick={onAbout} className={css.about}><Icon name="book"/>{en?"About this theme":"このテーマについて"}</button></>;
 return <section className={css.hero} data-art={image&&!broken?image.kind:undefined} aria-label={en?"Introduction":"このテーマの導入"}>
 {image&&!broken&&<ThemeArt key={image.src} image={image} en={en} onError={()=>setBrokenSrc(image.src)}/>}
 <div className={css.copy}><button className={css.about} onClick={onAbout}>{en?"About this theme":"このテーマについて"}<Icon name="arrow"/></button><p className={css.hook}>{presentation?.hook||description}</p>{presentation?.lead&&<p className={css.lead}>{presentation.lead}</p>}</div>

 </section>;
}

function ThemeArt({image,en,onError}:{image:NonNullable<ThemeReadingPresentation["image"]>;en:boolean;onError:()=>void}){
 const [expanded,setExpanded]=useState(false);
 return <><button type="button" className={css.art} aria-label={en?"Enlarge theme image":"テーマ画像を拡大"} aria-haspopup="dialog" onClick={()=>setExpanded(true)}><Image unoptimized src={image.src} width={image.width} height={image.height} alt={image.alt} style={{objectPosition:image.focus}} onError={onError}/></button>
 {expanded&&<ThemeImageDialog image={image} en={en} onClose={()=>setExpanded(false)}/>}</>;
}

function ThemeImageDialog({image,en,onClose}:{image:NonNullable<ThemeReadingPresentation["image"]>;en:boolean;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close();},[]);
 const close=()=>{dialog.current?.close();onClose();},backdrop=useDialogBackdrop(close);
 return <dialog ref={dialog} className={css.imageDialog} aria-label={en?"Theme image":"テーマ画像"} onCancel={event=>{event.preventDefault();close();}} {...backdrop}>
  <div className={css.imageControls}><DialogCloseButton label={en?"Close":"閉じる"} onClick={close}/></div>
  <figure className={css.enlargedArt}>
   <Image unoptimized src={image.src} width={image.width} height={image.height} alt={image.alt}/>
   {(image.caption||image.credit)&&<figcaption>{image.caption}{image.caption&&image.credit&&" — "}{image.credit}</figcaption>}
  </figure>
 </dialog>;
}
