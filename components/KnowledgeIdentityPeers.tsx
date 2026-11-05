"use client";
import {useEffect,useState} from 'react';
import {z} from 'zod';
import {identityEntitySchema,type IdentityEntity} from '../lib/domain/knowledge-identity';
import {useUiLocale} from '../lib/client/ui-locale';
export function KnowledgeIdentityPeers({id}:{id:string}){
 const [peers,setPeers]=useState<IdentityEntity[]>([]),{locale}=useUiLocale(),en=locale==='en';
 useEffect(()=>{const ac=new AbortController();void fetch('/api/knowledge/identities?id='+encodeURIComponent(id),{signal:ac.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();return z.object({peers:z.array(identityEntitySchema)}).parse(await r.json());}).then(v=>{if(!ac.signal.aborted)setPeers(v.peers);}).catch(()=>{});return()=>ac.abort();},[id]);
 if(!peers.length)return null;
 return <details><summary>{en?'Same subject · current links':'同じ対象の別の登録 · 現在の関連付け'} {peers.length}</summary><p>{en?'These links supplement the current view. Saved diagrams retain their original subjects.':'別の資料から登録された、同じ対象です。保存した図の対象や内容は変わりません。'}</p><ul>{peers.map(p=><li key={p.id}><a href={'/?kentity='+encodeURIComponent(p.id)}>{p.content.name}</a>{p.content.description&&<small> · {p.content.description}</small>}</li>)}</ul></details>;
}
