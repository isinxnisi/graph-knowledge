"use client";
import {useEffect,useState} from "react";
import {knowledgeContributorsSchema,type KnowledgeContributor} from "../lib/domain/knowledge-contributors";
import {memberRequest} from "../lib/client/member-api";
import {useUiLocale} from "../lib/client/ui-locale";
import PersonIdentity from "./PersonIdentity";
import css from "./KnowledgeContributors.module.css";
export default function KnowledgeContributors({id,revision,kind="record"}:{id:string;revision?:number;kind?:"record"|"entity"|"theme"}){
 const {locale}=useUiLocale(),en=locale==="en";const [state,setState]=useState<{key:string;items:KnowledgeContributor[]}|null>(null);const key=JSON.stringify([kind,id,revision]);
 useEffect(()=>{const c=new AbortController();void memberRequest('/api/knowledge/contributors?'+new URLSearchParams({kind,id,...(revision?{revision:String(revision)}:{})}),knowledgeContributorsSchema,{publicOnly:true,signal:c.signal}).then(r=>{if(!c.signal.aborted)setState({key,items:r.contributors});}).catch(()=>{if(!c.signal.aborted)setState({key,items:[]});});return()=>c.abort();},[key,kind,id,revision]);
 if(state?.key!==key||!state.items.length)return null;
 return <div className={css.contributors} aria-label={en?'Contributors':'投稿者・貢献者'}>{state.items.map(v=><span className={css.entry} key={v.id}><span className={css.action}>{v.operation==='add-evidence'?(en?'Sources added by':'根拠追加'):v.operation==='correct-record'?(en?'Corrected by':'訂正'):en?'Submitted by':'投稿'}</span><PersonIdentity person={v.person} label={v.anonymous?(en?'Anonymous':'匿名'):(en?'Member':'利用者')}/></span>)}</div>;
}
