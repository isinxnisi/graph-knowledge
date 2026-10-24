"use client";
import {useEffect,useRef,useState,type ReactNode} from 'react';
import Icon from './Icon';
import {CommunityDialog} from './CommunityDialog';
import css from './CommunityPage.module.css';
export function CommunityMark({name,person=false}:{name:string;person?:boolean}){
 const tone=Array.from(name).reduce((n,c)=>n+c.codePointAt(0)!,0)%4;
 return <span aria-hidden="true" className={`${css.mark} ${person?css.avatar:''}`} data-tone={tone}>{person?Array.from(name.trim())[0]?.toUpperCase()||'·':<Icon name="graph"/>}</span>;
}
export function CommunityMenu({label,children,compact=false}:{label:string;children:ReactNode;compact?:boolean}){
 const ref=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{
  const node=ref.current;if(!node)return;const panel=node.querySelector<HTMLElement>('[data-menu-panel]')!;
  const position=()=>{
   if(!node.open)return;
   const anchor=node.querySelector('summary')!.getBoundingClientRect(),view=window.visualViewport;
   const left=view?.offsetLeft??0,top=view?.offsetTop??0,width=view?.width??innerWidth,height=view?.height??innerHeight;
   panel.style.maxHeight=Math.max(44,height-16)+'px';panel.style.maxWidth=Math.max(120,width-16)+'px';
   const box=panel.getBoundingClientRect(),below=top+height-anchor.bottom-6,above=anchor.top-top-6;
   const y=below>=box.height||below>=above?anchor.bottom+6:anchor.top-box.height-6;
   panel.style.left=Math.max(left+8,Math.min(anchor.right-box.width,left+width-box.width-8))+'px';
   panel.style.top=Math.max(top+8,Math.min(y,top+height-box.height-8))+'px';panel.dataset.positioned='true';
  };
  const toggle=()=>{if(node.open)position();else delete panel.dataset.positioned;};
  const outside=(e:PointerEvent)=>{if(!node.contains(e.target as Node)&&!(e.target as Element).closest('dialog'))node.open=false;};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&node.open&&!(e.target as Element).closest('dialog')){node.open=false;node.querySelector('summary')?.focus({preventScroll:true});}};
  node.addEventListener('toggle',toggle);document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);
  window.addEventListener('scroll',position,true);window.addEventListener('resize',position);window.visualViewport?.addEventListener('resize',position);window.visualViewport?.addEventListener('scroll',position);
  const observer=new ResizeObserver(position);observer.observe(panel);
  return()=>{node.removeEventListener('toggle',toggle);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);window.removeEventListener('scroll',position,true);window.removeEventListener('resize',position);window.visualViewport?.removeEventListener('resize',position);window.visualViewport?.removeEventListener('scroll',position);observer.disconnect();};
 },[]);
 return <details ref={ref} className={css.menu} data-floating-menu data-compact={compact||undefined}><summary aria-label={label}>{compact?<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg>:<>{label}<Icon name="chevron"/></>}</summary><div data-menu-panel className={css.menuPanel}>{children}</div></details>;
}
export function WithdrawPost({onConfirm,busy,t}:{onConfirm:()=>Promise<{ok:boolean}>;busy:boolean;t:(ja:string,en:string)=>string}){
 const [open,setOpen]=useState(false),[failure,setFailure]=useState(false);
 return <><button disabled={busy} onClick={()=>{setFailure(false);setOpen(true);}}>{t('自分の投稿を撤回','Withdraw my post')}</button>{open&&<CommunityDialog title={t('この投稿を撤回しますか？','Withdraw this post?')} busy={busy} onCancel={()=>setOpen(false)}><p>{t('本文を削除し、会話には撤回した記録が残ります。この操作は取り消せません。','The message body will be removed. A withdrawal notice remains in the conversation. This cannot be undone.')}</p>{failure&&<p role="alert">{t('撤回結果を確認できませんでした。再確認してから再試行してください。','Could not confirm withdrawal. Check the current state before retrying.')}</p>}<div className={css.actions}><button disabled={busy} onClick={()=>setOpen(false)}>{t('キャンセル','Cancel')}</button><button className={css.primary} disabled={busy} onClick={async()=>{const result=await onConfirm();if(result.ok)setOpen(false);else setFailure(true);}}>{t('撤回する','Withdraw')}</button></div></CommunityDialog>}</>;
}
