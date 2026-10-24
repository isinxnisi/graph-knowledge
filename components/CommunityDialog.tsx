"use client";
import {createContext,useContext,useEffect,useId,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import css from './CommunityPage.module.css';
export const CommunityRevalidation=createContext(false);
export function CommunityDialog({title,children,onCancel,busy=false,className}:{className?:string;title:string;children:ReactNode;onCancel:()=>void;busy?:boolean}){
 const ref=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLElement|null>(null),focus=useRef<HTMLElement|null>(null),label=useId();const blocked=useContext(CommunityRevalidation);
 useEffect(()=>{
  // Strict Mode replays effects while keeping the dialog DOM. Do not replace
  // the original trigger with the modal's autofocus target on that replay.
  if(!trigger.current)trigger.current=document.activeElement as HTMLElement;
  const dialog=ref.current;
  return()=>{queueMicrotask(()=>{if(!dialog?.isConnected&&trigger.current?.isConnected)trigger.current.focus({preventScroll:true});});};
 },[]);
 useEffect(()=>{const d=ref.current;if(!d)return;if(blocked){if(d.contains(document.activeElement))focus.current=document.activeElement as HTMLElement;d.close();}else if(!d.open){d.showModal();if(focus.current?.isConnected)focus.current.focus({preventScroll:true});}},[blocked]);
 useEffect(()=>{
  const d=ref.current;if(!d||blocked)return;
  // The visible viewport can shrink or move independently of the layout
  // viewport when mobile browser chrome or the software keyboard changes.
  const place=()=>{const v=window.visualViewport;const width=v?.width??innerWidth,height=v?.height??innerHeight;d.style.setProperty('--dialog-width',width+'px');d.style.setProperty('--dialog-height',height+'px');d.style.left=((v?.offsetLeft??0)+width/2)+'px';d.style.top=((v?.offsetTop??0)+height/2)+'px';};
  place();window.addEventListener('resize',place);window.visualViewport?.addEventListener('resize',place);window.visualViewport?.addEventListener('scroll',place);
  const body=document.body,overflow=body.style.overflow,padding=body.style.paddingRight;
  const gap=innerWidth-document.documentElement.clientWidth;
  body.style.overflow='hidden';if(gap>0)body.style.paddingRight=((parseFloat(getComputedStyle(body).paddingRight)||0)+gap)+'px';
  return()=>{body.style.overflow=overflow;body.style.paddingRight=padding;window.removeEventListener('resize',place);window.visualViewport?.removeEventListener('resize',place);window.visualViewport?.removeEventListener('scroll',place);};
 },[blocked]);
 return typeof document==='undefined'?null:createPortal(<dialog ref={ref} className={`${css.dialog} ${className??''}`} aria-modal="true" aria-labelledby={label} onCancel={e=>{e.preventDefault();if(!busy)onCancel();}}><h2 id={label}>{title}</h2>{children}</dialog>,document.body);
}
