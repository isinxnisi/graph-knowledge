"use client";
import {useId,useState,type ComponentProps,type ReactNode,type Ref} from "react";
import {useUiLocale} from "../lib/client/ui-locale";
import Icon from "./Icon";
import css from "./ReadingDetailSection.module.css";

type SectionProps={title:string;icon:ComponentProps<typeof Icon>["name"];children:ReactNode;action?:ReactNode;sectionRef?:Ref<HTMLElement>;ariaLabel?:string;className?:string};
export default function ReadingDetailSection({title,icon,children,action,sectionRef,ariaLabel,className=""}:SectionProps) {
 return <section ref={sectionRef} className={`${css.section} ${className}`} aria-label={ariaLabel}><header className={css.header}><h3 className={css.heading}><Icon name={icon}/><span>{title}</span></h3>{action}</header><div className={css.body}>{children}</div></section>;
}

type ExpandableProps=Omit<SectionProps,"children"|"action">&{
 items:ReactNode[];expanded?:boolean;onExpandedChange?:(expanded:boolean)=>void;
 hasMore?:boolean;busy?:boolean;footer?:ReactNode;listTag?:"div"|"ul";locale?:string;
};
/** All reading lists share one stable control; expansion stays in the page's scroll flow. */
export function ExpandableReadingSection({items,expanded:controlled,onExpandedChange,hasMore=false,busy=false,footer,listTag="div",locale:displayLocale,...section}:ExpandableProps) {
 const {locale}=useUiLocale(),en=(displayLocale??locale)==="en",[localExpanded,setLocalExpanded]=useState(false),listId=useId();
 const expanded=controlled??localExpanded,canExpand=items.length>3||hasMore;
 const toggle=()=>{const next=!expanded;if(controlled===undefined)setLocalExpanded(next);onExpandedChange?.(next);};
 const List=listTag;
 return <ReadingDetailSection {...section} action={<div className={css.listControls}>
  <span className={css.count}>{items.length}{hasMore?"+":""}{en?"":"件"}</span>
  {canExpand&&<button type="button" className={css.sourceToggle} aria-expanded={expanded} aria-controls={listId} aria-label={`${section.title}：${expanded?(en?"Show less":"閉じる"):(en?"View all":"すべて見る")}`} onClick={toggle}>{expanded?(en?"Show less":"閉じる"):(en?"View all":"すべて見る")}<Icon name="chevron"/></button>}
 </div>}><List id={listId} className={css.list}>{expanded?items:items.slice(0,3)}</List>{busy&&expanded&&<p className={css.loading} role="status">{en?"Loading…":"読み込み中…"}</p>}{footer}</ReadingDetailSection>;
}

export function ReadingMore({label,onClick,busy=false}:{label:string;onClick:()=>void;busy?:boolean}) {
 return <div className={css.more}><button className={css.moreButton} type="button" disabled={busy} onClick={onClick}>{label}<Icon name={busy?"refresh":"chevron"}/></button></div>;
}

/** Used inside sections whose heading also contains independent controls. */
export function ReadingList({items,noun}:{items:ReactNode[];noun:string}) {
 const {locale}=useUiLocale(),en=locale==="en",[expanded,setExpanded]=useState(false),listId=useId();
 return <><div id={listId} className={css.list}>{expanded?items:items.slice(0,3)}</div>{items.length>3&&<div className={css.more}>
  <button className={css.moreButton} type="button" aria-controls={listId} aria-expanded={expanded} aria-label={`${noun}：${expanded?(en?"Show less":"閉じる"):(en?"View all":"すべて見る")}`} onClick={()=>setExpanded(value=>!value)}>{expanded?(en?"Show less":"閉じる"):(en?"View all":"すべて見る")}<Icon name="chevron"/></button>
 </div>}</>;
}

export function ReadingSources({items}:{items:ReactNode[]}) {
 const {locale}=useUiLocale();
 return items.length?<ExpandableReadingSection className={css.numberedSources} icon="book" title={locale==="en"?"Sources":"出典"} items={items}/>:null;
}
