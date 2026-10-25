"use client";
import {useEffect,useState} from 'react';
import css from './PublicProfile.module.css';
export default function PublicHandleCopy({handle,en=false}:{handle:string;en?:boolean}){
 const [status,setStatus]=useState('');
 useEffect(()=>{if(!status)return;const timer=setTimeout(()=>setStatus(''),3000);return()=>clearTimeout(timer);},[status]);
 async function copy(){try{await navigator.clipboard.writeText('@'+handle);setStatus('copied');}catch{setStatus('failed');}}
 return <div className={css.handle}><button type="button" className={css.handleCopy} onClick={()=>void copy()} aria-label={en?'Copy @'+handle:'@'+handle+' をコピー'} title={en?'Click to copy public ID':'クリックして公開IDをコピー'}>@{handle}</button><span className={css.copyStatus} role="status">{status==='copied'?(en?'Copied':'コピーしました'):status==='failed'?(en?'Could not copy':'コピーできませんでした'):''}</span></div>;
}
