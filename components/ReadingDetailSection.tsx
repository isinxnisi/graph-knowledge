"use client";
import {useId,useRef,useState,type ComponentProps,type ReactNode,type Ref} from "react";
import {useUiLocale} from "../lib/client/ui-locale";
import Icon from "./Icon";
import css from "./ReadingDetailSection.module.css";
export default function ReadingDetailSection({title,icon,children,action,sectionRef,ariaLabel,className=""}:{title:string;icon:ComponentProps<typeof Icon>["name"];children:ReactNode;action?:ReactNode;sectionRef?:Ref<HTMLElement>;ariaLabel?:string;className?:string}) {
 return <section ref={sectionRef} className={`${css.section} ${className}`} aria-label={ariaLabel}><header className={css.header}><h3 className={css.heading}><Icon name={icon}/><span>{title}</span></h3>{action}</header><div className={css.body}>{children}</div></section>;
}
export function ReadingMore({label,onClick,busy=false}:{label:string;onClick:()=>void;busy?:boolean}) {
 return <div className={css.more}><button className={css.moreButton} type="button" disabled={busy} onClick={onClick}>{label}<Icon name={busy?"refresh":"chevron"}/></button></div>;
}
export function ReadingList({items,noun}:{items:ReactNode[];noun:string}) {
 const {locale}=useUiLocale(),en=locale==="en",[visible,setVisible]=useState(3),listId=useId(),more=useRef<HTMLButtonElement>(null);
 const remaining=items.length-visible,count=Math.min(3,remaining),expanded=visible>3&&items.length>3;
 const moreLabel=en?`Show ${count} more ${noun}`:`${noun}をさらに${count}件表示`;
 function collapse(){setVisible(3);requestAnimationFrame(()=>more.current?.focus());}
 return <><div id={listId} className={css.list}>{items.slice(0,visible)}</div>{items.length>3&&<div className={`${css.more} ${css.listActions}`}>
   {expanded&&<button className={`${css.moreButton} ${css.collapseButton}`} type="button" aria-controls={listId} aria-expanded onClick={collapse}>{en?"Show first 3":"3件に戻す"}<Icon name="chevron"/></button>}
   {remaining>0&&<button ref={more} className={`${css.moreButton} ${css.listMore}`} type="button" aria-controls={listId} aria-expanded={expanded} aria-label={moreLabel} onClick={()=>setVisible(value=>Math.min(items.length,value+3))}>{en?`Show ${count} more`:`さらに${count}件`}<Icon name="chevron"/></button>}
 </div>}</>;
}

export function ReadingSources({items}:{items:ReactNode[]}) {
 const {locale}=useUiLocale(), en=locale==="en";
 const [expanded,setExpanded]=useState(false), listId=useId();
 if(!items.length)return null;
 return <ReadingDetailSection className={css.numberedSources} icon="book" title={en?"Sources":"出典"} action={items.length>3&&<button type="button" className={css.sourceToggle} aria-expanded={expanded} aria-controls={listId} onClick={()=>setExpanded(open=>!open)}>
  {expanded?(en?"Show first 3":"3件に戻す"):(en?`View all ${items.length}`:`全${items.length}件を見る`)}<Icon name="chevron"/>
 </button>}><div id={listId} className={expanded?css.openSources:undefined}>{expanded?items:items.slice(0,3)}</div></ReadingDetailSection>;
}
