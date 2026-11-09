"use client";
import {KnowledgeIdentityPeers} from "./KnowledgeIdentityPeers";
import {useKnowledgeDisplayTranslations} from "../lib/client/use-knowledge-display-translations";
import {knowledgeDisplaySnapshot,knowledgeDisplayText} from "../lib/domain/knowledge-display";
import {buildKnowledgePublishedRecord} from "../lib/domain/knowledge-publication";
import type {KnowledgeTranslationVersion} from "../lib/domain/knowledge-translation";
import KnowledgeTranslationPanel from "./KnowledgeTranslationPanel";
import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {CapsuleWorkspace} from "./MyCapsules";
import {captureKnowledgeCapsule} from "../lib/client/capsule-knowledge";
import type {LocalCapsule} from "../lib/client/local-capsules";
import {useSearchParams} from "next/navigation";
import Icon from "./Icon";
import {knowledgeKindLabel} from "../lib/client/knowledge-kind-label";
import KnowledgeRelatedInformation from "./KnowledgeRelatedInformation";
import KnowledgeContributors from "./KnowledgeContributors";
import {useKnowledgeSubmissionsEnabled} from "./KnowledgeSubmissionAvailability";
import {createSelectionSubmission,knowledgeSubmissionSelection,submissionHandoffError} from "../lib/client/knowledge-submission-handoff";
import {MemberClientError} from "../lib/client/member-api";
import GraphCanvas, {type GraphCanvasHandle} from "./GraphCanvas";
import KnowledgeTimeline from "./KnowledgeTimeline";
import KnowledgeSplit from "./KnowledgeSplit";
import KnowledgeThemeContext from "./KnowledgeThemeContext";
import KnowledgeRecordDetail from "./KnowledgeRecordDetail";
import {emptyGraph, type Selection} from "../lib/client/graph-state";
import {knowledgeCanvas} from "../lib/client/knowledge-canvas";
import {useKnowledgeWorkspace, readKnowledge} from "../lib/client/use-knowledge-workspace";
import {useUiLocale} from "../lib/client/ui-locale";
import type {KnowledgeEntityVersion} from "../lib/domain/knowledge-foundation";
import {knowledgeThemeTypeLabel, type KnowledgeThemePage} from "../lib/domain/knowledge-theme-reader";
import type {EntitySummary} from "../lib/domain/api";
import type {OpenTheme} from "./ThemeDiscovery";
import base from "./Explorer.module.css";
import css from "./KnowledgeReading.module.css";
type ThemeSummary=KnowledgeThemePage["themes"][number];
const canvasSelection=(s:{kind:"entity"|"record";id:string}|null):Selection=>s?s.kind==="record"?{kind:"relation",id:"record:"+s.id}:{kind:"entity",id:s.id}:null;
type Host={beforeOpen:()=>boolean;onPane:(p:"search"|"graph"|"detail")=>void;onReturn:()=>void;onLegacyEntity:(entity:EntitySummary)=>void};
export type KnowledgeReadingContract={active:boolean;restoring:boolean;center:ReactNode;detail:ReactNode;openTheme:OpenTheme;openRecord:(id:string)=>void;openEntity:(entity:KnowledgeEntityVersion)=>void;leave:()=>void;checkpoint:()=>void;attachHost:(value:Host)=>()=>void;error:string;message:string;busy:boolean};
const ReadingContext=createContext<KnowledgeReadingContract|undefined>(undefined);
export const useKnowledgeReading=()=>useContext(ReadingContext);
export default function KnowledgeReading({children,operatorEnabled=true}:{children:ReactNode;operatorEnabled?:boolean}) {
 const submissionsEnabled=useKnowledgeSubmissionsEnabled();
 const [submissionBusy,setSubmissionBusy]=useState(false),[submissionError,setSubmissionError]=useState("");
 const [submissionRefreshTarget,setSubmissionRefreshTarget]=useState<{kind:"record"|"entity";id:string}|null>(null);
 const [canvasKeys,setCanvasKeys]=useState<string[]>([]);
 const [keptTranslations,setKeptTranslations]=useState<KnowledgeTranslationVersion[]>([]);
 const keepTranslation=(v:KnowledgeTranslationVersion)=>setKeptTranslations(rows=>[...rows.filter(r=>r.id!==v.id),v]);
 const [createdCapsule,setCreatedCapsule]=useState<LocalCapsule|null>(null);
 const w=useKnowledgeWorkspace({embedded:true}); const locationParams=useSearchParams(); const {locale}=useUiLocale(),en=locale==="en";
 const [commonVisible,setCommonVisible]=useState(()=>locationParams.has('kentity')||locationParams.has('krecord'));
 const [requested,setRequested]=useState(()=>locationParams.has('ktheme')||locationParams.has('kentity')||locationParams.has('krecord'));
 const host=useRef<Host|null>(null);
 const attachHost=useCallback((value:Host)=>{host.current=value;return()=>{if(host.current===value)host.current=null;};},[]);
 const normalCanvas=useRef<GraphCanvasHandle>(null),themeCanvas=useRef<GraphCanvasHandle>(null),themeGraphPane=useRef<HTMLDivElement>(null);
 const checkpointTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const active=w.activeTheme,retained=w.retainedTheme;
 const closeTheme=w.closeTheme;
 const selection=active?w.themeSelection:w.normal.selection;
 const records=active?active.records:w.normal.records;
 const entities=active?active.snapshot.entities:w.normal.entities;
 const selectedRecord=selection?.kind==="record"?records.find(r=>r.record.id===selection.id):null;
 const selectedEntity=selection?.kind==="entity"?entities.find(e=>e.id===selection.id):null;
 const normalTranslations=useKnowledgeDisplayTranslations(w.normal.entities,w.normal.records.map(r=>r.record),undefined,locale);
 const themeTranslations=useKnowledgeDisplayTranslations(retained?.snapshot.entities??[],retained?.snapshot.records??[],retained?.theme,locale);
 const normalDisplayTranslations=useMemo(()=>[...normalTranslations,...keptTranslations],[normalTranslations,keptTranslations]);
 const themeDisplayTranslations=useMemo(()=>[...themeTranslations,...keptTranslations],[themeTranslations,keptTranslations]);
 const withTranslations=(snapshot:import("../lib/domain/knowledge-foundation").KnowledgeSnapshot,theme?:import("../lib/domain/knowledge-foundation").KnowledgeThemeVersion)=>({...snapshot,translations:[...new Map([...normalTranslations,...themeTranslations,...keptTranslations].map(t=>[t.id,t])).values()].filter(t=>(t.target.kind==="record"?snapshot.records:t.target.kind==="source"?snapshot.sources:t.target.kind==="entity"?snapshot.entities:theme?[theme]:[]).some(v=>v.id===t.target.id&&v.revision===t.target.revision))});
 const normalContent=useMemo(()=>knowledgeCanvas(w.normal.records,w.normal.entities,normalDisplayTranslations,locale),[w.normal.records,w.normal.entities,normalDisplayTranslations,locale]);
 const themeSnapshot=retained?withTranslations(retained.snapshot,retained.theme):null;
 const themeDisplay=themeSnapshot?knowledgeDisplaySnapshot(themeSnapshot,locale):null;
 const normalState=useMemo(()=>emptyGraph(w.normal.epoch),[w.normal.epoch]);
 const themeState=useMemo(()=>emptyGraph(retained?.theme.revision??0),[retained?.theme.revision]);
 const themeContent=useMemo(()=>{const rows=retained?.records.filter(r=>r.record.content.kind==="relation")??[];const ids=new Set(rows.flatMap(r=>[r.record.content.subjectId,r.record.content.objectId]));return knowledgeCanvas(rows,retained?.snapshot.entities.filter(e=>ids.has(e.id))??[],themeDisplayTranslations,locale);},[retained,themeDisplayTranslations,locale]);
 const themeHasTime=Boolean(retained?.snapshot.records.some(r=>r.content.times.length)),themeHasGraph=Boolean(themeContent.nodes.length);
 const themeMode=themeHasTime?themeHasGraph&&w.themeView==="split"?"split":"timeline":"graph";
 const busy=w.busy||w.restoring;
 const [relatedPage,setRelatedPage]=useState<{id:string;themes:ThemeSummary[];focusIds?:string[]}|null>(null);
 const entityId=selectedEntity?.id;
 const related=relatedPage&&relatedPage.id===entityId?relatedPage.themes:[];
 useEffect(()=>{let live=true;if(entityId)void readKnowledge<KnowledgeThemePage>("themes",{entityId}).then(p=>{if(live)setRelatedPage({id:entityId,themes:p.themes,focusIds:p.focusIds});}).catch(()=>{if(live)setRelatedPage(null);});return()=>{live=false;};},[entityId,w.status?.changeToken]);
 useEffect(()=>{const sync=()=>{const url=new URL(location.href);setCommonVisible(url.searchParams.has("kentity")||url.searchParams.has("krecord"));setRequested(url.searchParams.has("ktheme")||url.searchParams.has("kentity")||url.searchParams.has("krecord"));};queueMicrotask(sync);window.addEventListener("popstate",sync);return()=>window.removeEventListener("popstate",sync);},[]);
 // A same-route Next Link to Home changes searchParams without a popstate event.
 // Close the reader only after an actual Theme/common view exists; an in-flight open still uses the prior URL.
 useEffect(()=>{if((active||commonVisible)&&!locationParams.has("ktheme")&&!locationParams.has("kentity")&&!locationParams.has("krecord")){queueMicrotask(()=>{const url=new URL(location.href);if(url.searchParams.has("ktheme")||url.searchParams.has("kentity")||url.searchParams.has("krecord"))return;closeTheme("replace");setCommonVisible(false);setRequested(false);});}},[active,commonVisible,locationParams,closeTheme]);
 function setPane(p:"search"|"graph"|"detail"){host.current?.onPane(p);}
 function checkpoint(){if(checkpointTimer.current)clearTimeout(checkpointTimer.current);if(active)w.captureThemeView(themeCanvas.current?.capture()??null);else if(commonVisible)w.captureNormalView(normalCanvas.current?.capture()??null);}
 function scheduleCheckpoint(){if(checkpointTimer.current)clearTimeout(checkpointTimer.current);checkpointTimer.current=setTimeout(checkpoint,350);}
 useEffect(()=>{const save=()=>checkpoint();window.addEventListener("pagehide",save);return()=>{window.removeEventListener("pagehide",save);if(checkpointTimer.current)clearTimeout(checkpointTimer.current);};});
 function openTheme(ref:{id:string;revision?:number;focusEntityId?:string}){if(host.current&&!host.current.beforeOpen())return;checkpoint();setRequested(true);void w.openTheme(ref);setPane("graph");}
 function openRecord(id:string){if(host.current&&!host.current.beforeOpen())return;checkpoint();setRequested(true);closeTheme("replace");void w.selectRecord(id,{latest:true}).then(opened=>{if(!opened)return;const url=new URL(location.href);url.searchParams.delete('kentity');url.searchParams.set('krecord',id);history.replaceState(history.state,'',url);setCommonVisible(true);});setPane("detail");}
 function openEntity(entity:KnowledgeEntityVersion){if(host.current&&!host.current.beforeOpen())return;checkpoint();setRequested(true);closeTheme("replace");void w.startFrom(entity,{latest:true}).then(opened=>{if(!opened)return;const url=new URL(location.href);url.searchParams.delete("krecord");url.searchParams.set("kentity",entity.id);history.replaceState(history.state,"",url);setCommonVisible(true);setPane("graph");});}
 function leave(){checkpoint();setRequested(false);w.closeTheme("replace");setCommonVisible(false);const url=new URL(location.href);url.searchParams.delete("kentity");url.searchParams.delete("krecord");history.replaceState(history.state,"",url);}
 function chooseEntity(id:string){if(active)w.setThemeSelection({kind:"entity",id});else w.selectEntity(id);setPane("detail");}
 function chooseRecord(id:string){if(active)w.setThemeSelection({kind:"record",id});else void w.selectRecord(id);setPane("detail");}
 async function startFrom(entity:KnowledgeEntityVersion){
   checkpoint();
   // Stable IDs from the KG import are reused. A missing KG entity opens the common read model, never a guessed same-name entity.
   try {const response=await fetch('/api/entities/'+encodeURIComponent(entity.id),{cache:'no-store'});if(response.ok){const value=await response.json();const legacy=value.entity??value;if(legacy?.id===entity.id){leave();host.current?.onLegacyEntity(legacy);setPane("graph");return;}}} catch { /* The common model remains available independently. */ }
   const opened=await w.startFrom(entity);if(!opened)return;const url=new URL(location.href);url.searchParams.delete("krecord");url.searchParams.set("kentity",entity.id);history.replaceState(history.state,"",url);setCommonVisible(true);setPane("graph");
 }
 async function submitSelection(){
   setSubmissionBusy(true);setSubmissionError("");setSubmissionRefreshTarget(null);
   try{const canvas=active?themeCanvas.current:normalCanvas.current,fromCanvas=canvas?.selectedKeys?.()??canvasKeys,fallback=canvasSelection(selection),keys=fromCanvas.length&&(!fallback||fromCanvas.includes(fallback.id))?fromCanvas:fallback?[fallback.id]:[];
     const context=knowledgeSubmissionSelection(entities,records.map(r=>r.record),keys,active?{id:active.theme.id,revision:active.theme.revision}:undefined);
     checkpoint();const href=await createSelectionSubmission({context});location.assign(href);
   }catch(error){setSubmissionError(submissionHandoffError(error,en));if(error instanceof MemberClientError&&error.status===409)setSubmissionRefreshTarget(selectedRecord?{kind:"record",id:selectedRecord.record.id}:selectedEntity?{kind:"entity",id:selectedEntity.id}:null);}finally{setSubmissionBusy(false);}
 }
 const submissionButton=submissionsEnabled&&<button className={css.themeInfo} aria-label={en?"Submit selection":"選択範囲を投稿"} title={en?"Submit selected knowledge":"選択範囲を投稿"} disabled={busy||submissionBusy||(!selection&&!canvasKeys.length)} onClick={()=>void submitSelection()}><Icon name="edit"/></button>;
 function graphFromTimeline(id:string){w.setThemeSelection({kind:"record",id});w.setThemeView("split");requestAnimationFrame(()=>{themeCanvas.current?.ensureVisible?.("record:"+id);if(matchMedia("(max-width:1100px)").matches)themeGraphPane.current?.scrollIntoView({block:"start"});});}
 const themeButton=(t:ThemeSummary)=><button key={t.id} className={css.result} disabled={busy} onClick={()=>openTheme({...t,focusEntityId:entityId&&t.entityIds.includes(entityId)?entityId:t.entityIds.find(id=>relatedPage?.focusIds?.includes(id))})}><strong>{knowledgeDisplayText(t.translations,{kind:"theme",id:t.id,revision:t.revision,field:"title"},locale,t.title)}</strong><small>{knowledgeThemeTypeLabel(t,en)}</small></button>;
 const value:KnowledgeReadingContract={active:Boolean(active)||commonVisible||(busy&&requested),restoring:w.restoring,openTheme,openRecord,openEntity,leave,checkpoint,attachHost,error:w.error,message:w.message,busy,
 center:<div className={css.workspace}>
  {submissionError&&<p role="alert" className={base.error}>{submissionError}{submissionRefreshTarget&&<button onClick={()=>{const target=submissionRefreshTarget;setSubmissionError("");setSubmissionRefreshTarget(null);if(target.kind==="record")openRecord(target.id);else{const entity=entities.find(e=>e.id===target.id);if(entity)openEntity(entity);}}}><Icon name="refresh"/>{en?"Open current content and reselect":"最新版を開いて選び直す"}</button>}</p>}
  {submissionBusy&&<p role="status">{en?"Creating a private draft…":"非公開の投稿草稿を作成しています…"}</p>}
 {w.error&&<p role="alert" className={base.error}>{w.error}<button onClick={()=>void w.refreshLatest()}>再取得</button></p>}
 {busy&&(active||commonVisible||requested)&&<p role="status" className={css.notice}>読み込んでいます…</p>}
 {w.message&&<p role="status" className={css.notice}>{w.message}</p>}
 {commonVisible&&!active&&w.status?.active&&w.normal.generation&&w.status.active.id!==w.normal.generation&&<p className={css.notice}>新しい公開版があります。<button disabled={busy} onClick={()=>void w.refreshLatest()}>最新版を読む</button></p>}
 {commonVisible&&!active&&<button className={css.return} onClick={()=>{leave();host.current?.onReturn();}}><Icon name="back"/>元の探索へ戻る</button>}
        <section hidden={Boolean(active) || !commonVisible} className={`${base.panel} ${base.graphPanel} ${css.stage}`} aria-label={en ? "Ordinary exploration" : "通常の関係探索"}>
          <header className={css.stageHeader}><h2>{selectedRecord&&selectedRecord.record.content.kind!=="relation"?(en?"Knowledge":"知識"):"Graph"}</h2><span role="status">{busy ? en ? "Reading…" : "読み込み中…" : `${w.normal.entities.length} ${en ? "subjects" : "対象"} · ${w.normal.records.filter(r => r.record.content.kind === "relation").length} ${en ? "relations" : "関係"}`}</span><button className={css.themeInfo} aria-label={en?"Create Capsule":"Capsuleを作成"} title={en?"Create Capsule":"Capsuleを作成"} disabled={busy||!w.normal.records.length} onClick={()=>setCreatedCapsule(captureKnowledgeCapsule({title:selectedRecord?.record.content.assertion.slice(0,80)??"知識のつながり",snapshot:withTranslations({schemaVersion:1,entities:w.normal.entities,sources:[...new Map(w.normal.records.flatMap(dto=>dto.sources).map(source=>[source.id+"@"+source.revision,source])).values()],records:w.normal.records.map(dto=>dto.record),mappings:[],initialView:"graph"}),view:"graph",graphView:normalCanvas.current?.capture()}))}><Icon name="capsule"/></button>{submissionButton}</header>

          {selectedRecord&&selectedRecord.record.content.kind!=="relation"&&<KnowledgeRecordDetail onTranslation={keepTranslation} dto={selectedRecord} onEntity={chooseEntity}/> }
          <div hidden={!!selectedRecord&&selectedRecord.record.content.kind!=="relation"} className={css.canvasFrame}><GraphCanvas onSelectionChange={setCanvasKeys} ref={normalCanvas} graph={normalState} content={normalContent} restoration={w.normalRestoration} onViewChange={scheduleCheckpoint} contentOnly fillHeight compactGuide selection={canvasSelection(w.normal.selection)} interactionBlocked={busy || Boolean(active)} onEntity={(id) => w.selectEntity(id)} onEntityDoubleClick={(id) => { void w.expandEntity(id); }} onToggleEntity={(id) => { void w.expandEntity(id); }} onRelation={(id) => chooseRecord(id.replace(/^record:/,""))} /></div>
          <div className={css.recordStrip}>{w.normal.records.map((r) => <button key={r.record.id} onClick={() => chooseRecord(r.record.id)} aria-pressed={w.normal.selection?.kind === "record" && w.normal.selection.id === r.record.id}>{r.label || r.record.content.assertion}</button>)}</div>
        </section>
        {retained && <section hidden={!active} className={`${base.panel} ${base.graphPanel} ${css.stage}`} aria-label={en ? "Theme reading" : "テーマを読む"}>
          <header className={css.themeHeader}><button onClick={() => { checkpoint(); setRequested(false); w.closeTheme(); if(!commonVisible)host.current?.onReturn(); }} className={css.return}><Icon name="back" />{en ? "Back to exploration" : "探索に戻る"}</button><span>{en ? "Saved composition" : "構成版"} {retained.theme.revision}</span><h2 title={retained.theme.content.title}>{knowledgeDisplayText(themeDisplayTranslations,{kind:"theme",id:retained.theme.id,revision:retained.theme.revision,field:"title"},locale,retained.theme.content.title)}</h2><button className={css.themeInfo} aria-label={en?"Create Capsule":"Capsuleを作成"} title={en?"Create Capsule":"Capsuleを作成"} disabled={busy} onClick={()=>{checkpoint();setCreatedCapsule(captureKnowledgeCapsule({snapshot:withTranslations(retained.snapshot,retained.theme),theme:retained.theme,title:retained.theme.content.title,view:w.themeView,graphView:themeCanvas.current?.capture()}));}}><Icon name="capsule"/></button>{submissionButton}<button className={css.themeInfo} aria-label={en ? "About this theme" : "テーマについて"} title={en ? "About this theme" : "テーマについて"} onClick={() => { w.setThemeSelection(null); setPane("detail"); }}><Icon name="book" /></button></header>
          <KnowledgeThemeContext key={retained.theme.id + ":" + retained.theme.revision} records={themeDisplay!.records.map(record=>buildKnowledgePublishedRecord(record,themeDisplay!))} selectedRecordId={w.themeSelection?.kind === "record" ? w.themeSelection.id : null} onRead={(id) => { w.setThemeSelection({ kind: "record", id }); setPane("detail"); }} />

          {(themeHasTime||themeHasGraph)&&<KnowledgeSplit mode={themeMode}>
            <div className={css.timelinePane} hidden={!themeHasTime || themeMode === "graph"}><KnowledgeTimeline key={retained.theme.id + ":" + retained.theme.revision} snapshot={themeSnapshot!} headerAction={themeHasTime && themeHasGraph && <button className={css.themeInfo} aria-label={themeMode === "split" ? en ? "Close relation diagram" : "関係図を閉じる" : en ? "Show relation diagram" : "関係図を並べて表示"} title={themeMode === "split" ? en?"Close relation diagram":"関係図を閉じる" : en?"Show relation diagram":"関係図を並べて表示"} aria-pressed={themeMode === "split"} onClick={() => w.setThemeView(themeMode === "split" ? "timeline" : "split")}><Icon name="panel" /></button>} untimedInContext focusedEntityId={w.themeSelection?.kind==='entity'?w.themeSelection.id:undefined} focusedRecordId={w.themeSelection?.kind === "record" ? w.themeSelection.id : null} onFocusRecord={(id) => w.setThemeSelection(id ? { kind: "record", id } : null)} onShowGraph={(id) => graphFromTimeline(id)} /></div>
            <div ref={themeGraphPane} hidden={!themeHasGraph || themeMode === "timeline"} className={`${css.canvasFrame} ${css.themeCanvas}`}><GraphCanvas onSelectionChange={setCanvasKeys} key={retained.theme.id + ":" + retained.theme.revision} ref={themeCanvas} graph={themeState} content={themeContent} restoration={w.themeRestoration} onViewChange={scheduleCheckpoint} contentOnly fillHeight compactGuide selection={canvasSelection(w.themeSelection)} interactionBlocked={busy || !active} onEntity={(id) => w.setThemeSelection({ kind: "entity", id })} onEntityDoubleClick={(id) => { w.setThemeSelection({ kind: "entity", id }); setPane("detail"); }} onToggleEntity={(id) => { w.setThemeSelection({ kind: "entity", id }); setPane("detail"); }} onRelation={(id) => chooseRecord(id.replace(/^record:/,""))} /></div>
          </KnowledgeSplit>}
        </section>}
</div>,detail:<div className={css.workspace}><h2><Icon name="book"/>{en?"Details":"詳細"}</h2>        {selectedRecord ? <><KnowledgeRecordDetail onTranslation={keepTranslation} dto={selectedRecord} onEntity={chooseEntity} onRecord={openRecord} onTheme={id=>openTheme({id})} />{!operatorEnabled&&<Link className={css.editRecord} href={"/member/submissions?record="+encodeURIComponent(selectedRecord.record.id)+"&revision="+selectedRecord.record.revision} target="_blank" rel="noopener noreferrer"><Icon name="edit"/>{en?"Propose a correction":"訂正を提案"} ↗</Link>}{operatorEnabled&&<Link className={css.editRecord} href={`/themes/records?record=${encodeURIComponent(selectedRecord.record.id)}&fromRevision=${selectedRecord.record.revision}`} onClick={() => checkpoint()}><Icon name="edit" />{en ? "Correct this record" : "この記録を訂正"}</Link>}</> : selectedEntity ? <><h2>{knowledgeDisplayText(active?themeDisplayTranslations:normalDisplayTranslations,{kind:"entity",id:selectedEntity.id,revision:selectedEntity.revision,field:"name"},locale,selectedEntity.content.name)}</h2><KnowledgeTranslationPanel onRetain={keepTranslation} fields={[{label:en?'Name':'名前',target:{kind:'entity',id:selectedEntity.id,revision:selectedEntity.revision,field:'name'}},...selectedEntity.content.aliases.map((alias,aliasIndex)=>({label:(en?'Alias: ':'別名：')+alias,target:{kind:'entity' as const,id:selectedEntity.id,revision:selectedEntity.revision,field:'aliases' as const,aliasIndex}})),...(selectedEntity.content.description?[{label:en?'Description':'説明',target:{kind:'entity' as const,id:selectedEntity.id,revision:selectedEntity.revision,field:'description' as const}}]:[])]}/><KnowledgeContributors kind="entity" id={selectedEntity.id}/><KnowledgeIdentityPeers key={selectedEntity.id+":"+selectedEntity.revision} id={selectedEntity.id}/><a className={css.editRecord} href={'/member/submissions?'+new URLSearchParams({entity:selectedEntity.id,revision:String(selectedEntity.revision)})} target="_blank" rel="noopener noreferrer"><Icon name="edit"/>{en?'Correct name or description':'名前・説明の訂正を提案'} ↗</a><KnowledgeRelatedInformation key={selectedEntity.id} entityId={selectedEntity.id} onOpen={openRecord}/><p className={base.muted}>{knowledgeKindLabel(selectedEntity.content.kind,locale)}</p>{selectedEntity.content.description && <p>{knowledgeDisplayText(active?themeDisplayTranslations:normalDisplayTranslations,{kind:"entity",id:selectedEntity.id,revision:selectedEntity.revision,field:"description"},locale,selectedEntity.content.description)}</p>}
          {active ? <button onClick={() => startFrom(selectedEntity)} disabled={busy}><Icon name="arrow" />{en ? "Explore from this subject" : "この対象から探索する"}</button> : <div className={base.actions}><button onClick={() => void w.expandEntity(selectedEntity.id)} disabled={busy}><Icon name="graph" />{en ? "Expand connections" : "周囲の関係を広げる"}</button>{w.neighborPages[selectedEntity.id]?.hasMore && <button disabled={busy} onClick={() => void w.expandEntity(selectedEntity.id, w.neighborPages[selectedEntity.id]?.cursor)}>{en ? "More connections" : "関係の続きを追加"}</button>}</div>}
          {related.length > 0 && <section className={css.related}><h3>{en ? "Related themes" : "この対象のテーマ"}</h3>{related.map(themeButton)}</section>}
          <section className={css.related}><h3>{en ? "Records in this view" : "この表示の記録"}</h3>{records.filter(r => [r.record.content.subjectId,r.record.content.objectId].includes(selectedEntity.id)).map(r => <button key={r.record.id} className={css.result} onClick={() => chooseRecord(r.record.id)}>{r.record.content.assertion}</button>)}</section>
        </> : active ? <><h3>{knowledgeDisplayText(themeDisplayTranslations,{kind:"theme",id:active.theme.id,revision:active.theme.revision,field:"title"},locale,active.theme.content.title)}</h3><KnowledgeTranslationPanel onRetain={keepTranslation} fields={[{label:en?'Theme title':'テーマ名',target:{kind:'theme',id:active.theme.id,revision:active.theme.revision,field:'title'}},...(active.theme.content.description?[{label:en?'Description':'説明',target:{kind:'theme' as const,id:active.theme.id,revision:active.theme.revision,field:'description' as const}}]:[])]}/><p className={base.muted}>{en ? "Saved composition" : "構成版"} {active.theme.revision}</p>{active.theme.content.description && <p>{knowledgeDisplayText(themeDisplayTranslations,{kind:"theme",id:active.theme.id,revision:active.theme.revision,field:"description"},locale,active.theme.content.description)}</p>}<p className={base.muted}>{en ? "Choose a timeline entry or a relation to read the same record and its evidence here." : "年表の記録や図の関係を選ぶと、対応する内容と根拠をここで読めます。"}</p></> : <p className={base.muted}>{en ? "Select a subject or relation in the graph." : "図の対象や関係を選ぶと、内容と根拠を読めます。"}</p>}
</div>};
 return <ReadingContext value={value}>{children}{createdCapsule&&<CapsuleWorkspace initial={createdCapsule} isNew onClose={()=>setCreatedCapsule(null)}/>}</ReadingContext>;
}
