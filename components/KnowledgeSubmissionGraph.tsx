"use client";
import {useMemo,useState} from "react";
import type {KnowledgeSubmissionContent,KnowledgeSubmissionContext} from "../lib/domain/knowledge-submission";
import {submissionGraphPreview} from "../lib/client/knowledge-submission-preview";
import {emptyGraph} from "../lib/client/graph-state";
import GraphCanvas from "./GraphCanvas";
import Icon from "./Icon";
import css from "./KnowledgeSubmissionGraph.module.css";
export default function KnowledgeSubmissionGraph({content,context,selectedKey,onSelect}:{content:KnowledgeSubmissionContent;context?:KnowledgeSubmissionContext;selectedKey?:string|null;onSelect?:(key:string)=>void}){
 const preview=useMemo(()=>submissionGraphPreview(content,context),[content,context]);
 const [opened,setOpened]=useState(()=>Boolean(context&&preview.canvas.nodes.length));
 const state=useMemo(()=>emptyGraph(1),[]),keys=selectedKey?preview.targets[selectedKey]??[]:[];
 const select=(id:string)=>{const key=preview.owners[id];if(key)onSelect?.(key);};
 return <details className={css.preview} aria-label="投稿する内容と既存の知識" open={opened} onToggle={event=>setOpened(event.currentTarget.open)}><summary className={css.summary}><Icon name="chevron"/><strong>投稿する箇所</strong><small>{content.items.length}件</small><span><i aria-hidden="true"/>青：投稿 <small>灰：既存</small></span></summary>
 {opened&&<>
 {preview.canvas.nodes.length>0&&<div className={css.canvas}><GraphCanvas graph={state} content={preview.canvas} contentOnly fillHeight compactGuide controls="view" selectedKeys={keys} selection={null} onEntity={select} onRelation={select} onToggleEntity={()=>{}}/></div>}
 <ol className={css.items}>{content.items.map((item,index)=><li key={item.key}><button type="button" aria-pressed={selectedKey===item.key} onClick={()=>onSelect?.(item.key)}><span>{index+1}</span><strong>{item.record.assertion||content.entities.find(e=>e.id===item.record.subjectId)?.content.name||"内容を入力してください"}</strong><small>{item.about?.kind==="theme"?"テーマへの情報":item.record.kind==="relation"?"関係への投稿":item.about?.kind==="record"?"既存の情報への補足":"対象への投稿"}</small></button></li>)}</ol>
 </>}
 </details>;
}
