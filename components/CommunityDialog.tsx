"use client";
import {createContext,useContext,useLayoutEffect,useId,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {useModalViewport} from "../lib/client/use-modal-viewport";
import {useCapsuleBackdrop} from "./CapsuleSurface";
import Icon from "./Icon";
import css from './CommunityPage.module.css';
export const CommunityRevalidation=createContext(false);
export function CommunityDialog({title,children,onCancel,busy=false,className}:{className?:string;title:string;children:ReactNode;onCancel:()=>void;busy?:boolean}){
 const ref=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLElement|null>(null),focus=useRef<HTMLElement|null>(null),label=useId();const blocked=useContext(CommunityRevalidation);
 useModalViewport(ref);
 const backdrop=useCapsuleBackdrop(onCancel,!busy&&!blocked);
 useLayoutEffect(()=>{
  // Strict Mode replays effects while keeping the dialog DOM. Do not replace
  // the original trigger with the modal's autofocus target on that replay.
  if(!trigger.current)trigger.current=document.activeElement as HTMLElement;
  const dialog=ref.current;
  return()=>{queueMicrotask(()=>{if(!dialog?.isConnected&&trigger.current?.isConnected)trigger.current.focus({preventScroll:true});});};
 },[]);
 useLayoutEffect(()=>{const d=ref.current;if(!d)return;if(blocked){if(d.contains(document.activeElement))focus.current=document.activeElement as HTMLElement;d.close();}else if(!d.open){d.showModal();if(focus.current?.isConnected)focus.current.focus({preventScroll:true});}},[blocked]);
 return typeof document==='undefined'?null:createPortal(<dialog ref={ref} className={`${css.dialog} ${className??''}`} aria-modal="true" aria-labelledby={label} {...backdrop.handlers} onCancel={e=>{e.preventDefault();if(!busy&&!backdrop.composing.current&&e.target===e.currentTarget)onCancel();}}><header className={css.dialogHeading}><h2 id={label}>{title}</h2><button type="button" disabled={busy} aria-label="閉じる / Close" onClick={onCancel}><Icon name="close"/></button></header>{children}</dialog>,document.body);
}
