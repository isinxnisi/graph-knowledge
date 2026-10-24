"use client";
import {useState} from 'react';
import css from './OperationsPage.module.css';
/** Auxiliary identifiers stay available without dominating case review. */
export function OperationIdentifiers({entries,ja}:{entries:[string,string][];ja:boolean}){
 const [copied,setCopied]=useState('');
 return <details className={css.identifiers}><summary>{ja?'識別IDを表示':'Show identifiers'}</summary><dl>{entries.map(([label,id])=><div key={label}><dt>{label}</dt><dd><code>{id}</code><button type="button" aria-label={(ja?'コピー: ':'Copy: ')+label} onClick={()=>void navigator.clipboard.writeText(id).then(()=>setCopied(id),()=>setCopied('!'))}>{copied===id?(ja?'コピー済み':'Copied'):(ja?'コピー':'Copy')}</button></dd></div>)}</dl>{copied==='!'&&<span role="status">{ja?'コピーできません。IDを選択してください。':'Could not copy. Select the ID instead.'}</span>}</details>;
}