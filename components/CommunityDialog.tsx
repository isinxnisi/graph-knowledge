"use client";
import {createContext,useContext,useEffect,useId,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import css from './CommunityPage.module.css';
export const CommunityRevalidation=createContext(false);
export function CommunityDialog({title,children,onCancel,busy=false}:{title:string;children:ReactNode;onCancel:()=>void;busy?:boolean}){
 const ref=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLElement|null>(null),focus=useRef<HTMLElement|null>(null),label=useId();const blocked=useContext(CommunityRevalidation);
 useEffect(()=>{
  // Strict Mode replays effects while keeping the dialog DOM. Do not replace
  // the original trigger with the modal's autofocus target on that replay.
  if(!trigger.current)trigger.current=document.activeElement as HTMLElement;
  const dialog=ref.current;
  return()=>{queueMicrotask(()=>{if(!dialog?.isConnected&&trigger.current?.isConnected)trigger.current.focus({preventScroll:true});});};
 },[]);
 useEffect(()=>{const d=ref.current;if(!d)return;if(blocked){if(d.contains(document.activeElement))focus.current=document.activeElement as HTMLElement;d.close();}else if(!d.open){d.showModal();if(focus.current?.isConnected)focus.current.focus({preventScroll:true});}},[blocked]);
 return typeof document==='undefined'?null:createPortal(<dialog ref={ref} className={css.dialog} aria-modal="true" aria-labelledby={label} onCancel={e=>{e.preventDefault();if(!busy)onCancel();}}><h2 id={label}>{title}</h2>{children}</dialog>,document.body);
}
