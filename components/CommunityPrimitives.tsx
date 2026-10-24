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
 const ref=useRef<HTMLDetailsElement>(null),[above,setAbove]=useState(false);
 useEffect(()=>{const outside=(e:PointerEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node)&&!(e.target as Element).closest('dialog'))ref.current.open=false;};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&ref.current?.open&&!(e.target as Element).closest('dialog')){ref.current.open=false;ref.current.querySelector('summary')?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);};},[]);
 return <details ref={ref} className={css.menu} data-above={above||undefined} onToggle={event=>{const node=event.currentTarget;if(node.open){const box=node.getBoundingClientRect(),height=node.querySelector('div')?.getBoundingClientRect().height??0;setAbove(innerHeight-box.bottom<height+12&&box.top>height+12);}}}><summary aria-label={label}>{compact?'⋯':<>{label}<Icon name="chevron"/></>}</summary><div className={css.menuPanel}>{children}</div></details>;
}
export function WithdrawPost({onConfirm,busy,t}:{onConfirm:()=>Promise<{ok:boolean}>;busy:boolean;t:(ja:string,en:string)=>string}){
 const [open,setOpen]=useState(false),[failure,setFailure]=useState(false);
 return <><button disabled={busy} onClick={()=>{setFailure(false);setOpen(true);}}>{t('自分の投稿を撤回','Withdraw my post')}</button>{open&&<CommunityDialog title={t('この投稿を撤回しますか？','Withdraw this post?')} busy={busy} onCancel={()=>setOpen(false)}><p>{t('本文を削除し、会話には撤回した記録が残ります。この操作は取り消せません。','The message body will be removed. A withdrawal notice remains in the conversation. This cannot be undone.')}</p>{failure&&<p role="alert">{t('撤回結果を確認できませんでした。再確認してから再試行してください。','Could not confirm withdrawal. Check the current state before retrying.')}</p>}<div className={css.actions}><button disabled={busy} onClick={()=>setOpen(false)}>{t('キャンセル','Cancel')}</button><button className={css.primary} disabled={busy} onClick={async()=>{const result=await onConfirm();if(result.ok)setOpen(false);else setFailure(true);}}>{t('撤回する','Withdraw')}</button></div></CommunityDialog>}</>;
}
