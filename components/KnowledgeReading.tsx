"use client";
import {themeTimelineTextTargets,timelineTextFieldLabel} from "../lib/domain/knowledge-timeline-text";
import {KnowledgeIdentityPeers} from "./KnowledgeIdentityPeers";
import {useKnowledgeDisplayTranslations} from "../lib/client/use-knowledge-display-translations";
import {knowledgeDisplaySnapshot,knowledgeDisplayText,knowledgeEntityDisplayName} from "../lib/domain/knowledge-display";
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
import KnowledgeReadingBadge from "./KnowledgeReadingBadge";
import ReadingDetailSection,{ReadingSources} from "./ReadingDetailSection";
import {knowledgeKindLabel} from "../lib/client/knowledge-kind-label";
import KnowledgeRelatedInformation from "./KnowledgeRelatedInformation";
import KnowledgeContributors from "./KnowledgeContributors";
import {useKnowledgeSubmissionsEnabled} from "./KnowledgeSubmissionAvailability";
import {createSelectionSubmission,knowledgeSubmissionSelection,submissionHandoffError} from "../lib/client/knowledge-submission-handoff";
import {MemberClientError} from "../lib/client/member-api";
import GraphCanvas, {type GraphCanvasHandle} from "./GraphCanvas";
import KnowledgeTimeline from "./KnowledgeTimeline";
import ThemeProducts,{ThemeItemsResult,useThemeItems,ItemTeaser} from "./ThemeProducts";
import ThemeReadingHero from "./ThemeReadingHero";
import {readingRecordTitle,readingExplanations} from "../lib/domain/theme-reading-presentation";
import type {EvidenceRequest} from "./KnowledgeReadingSources";
import type {KnowledgeThemeRead} from "../lib/domain/knowledge-theme-reader";
import {knowledgeThemeLocation} from "../lib/client/knowledge-workspace-state";
import KnowledgeSplit from "./KnowledgeSplit";
import KnowledgeThemeContext from "./KnowledgeThemeContext";
import KnowledgeRecordDetail from "./KnowledgeRecordDetail";
import {emptyGraph, type Selection} from "../lib/client/graph-state";
import {entityCaption,knowledgeCanvas} from "../lib/client/knowledge-canvas";
import {useKnowledgeWorkspace, readKnowledge} from "../lib/client/use-knowledge-workspace";
import {useUiLocale} from "../lib/client/ui-locale";
import type {KnowledgeEntityVersion} from "../lib/domain/knowledge-foundation";
import {type KnowledgeThemePage} from "../lib/domain/knowledge-theme-reader";
import type {EntitySummary} from "../lib/domain/api";
import RelatedThemes from "./RelatedThemes";
import {type OpenTheme} from "./ThemeDiscovery";
import base from "./Explorer.module.css";
import css from "./KnowledgeReading.module.css";
const canvasSelection=(s:{kind:"entity"|"record";id:string}|null):Selection=>s?s.kind==="record"?{kind:"relation",id:"record:"+s.id}:{kind:"entity",id:s.id}:null;
type Host={beforeOpen:()=>boolean;onPane:(p:"search"|"graph"|"detail")=>void;onReturn:()=>void;onLegacyEntity:(entity:EntitySummary)=>void};
export type KnowledgeReadingContract={active:boolean;restoring:boolean;center:ReactNode;detail:ReactNode;openTheme:OpenTheme;openRecord:(id:string)=>void;openEntity:(entity:KnowledgeEntityVersion)=>void;leave:()=>void;checkpoint:()=>void;attachHost:(value:Host)=>()=>void;error:string;message:string;busy:boolean};
const ReadingContext=createContext<KnowledgeReadingContract|undefined>(undefined);
export const useKnowledgeReading=()=>useContext(ReadingContext);
export default function KnowledgeReading({children,operatorEnabled=true,initialTheme,relatedCatalogue}:{relatedCatalogue?:KnowledgeThemePage["themes"];children:ReactNode;operatorEnabled?:boolean;initialTheme?:KnowledgeThemeRead}) {
 const submissionsEnabled=useKnowledgeSubmissionsEnabled();
 const [submissionBusy,setSubmissionBusy]=useState(false),[submissionError,setSubmissionError]=useState("");
 const [submissionRefreshTarget,setSubmissionRefreshTarget]=useState<{kind:"record"|"entity";id:string}|null>(null);
 const [canvasKeys,setCanvasKeys]=useState<string[]>([]);
 const [keptTranslations,setKeptTranslations]=useState<KnowledgeTranslationVersion[]>([]);
 const keepTranslation=(v:KnowledgeTranslationVersion)=>setKeptTranslations(rows=>[...rows.filter(r=>r.id!==v.id),v]);
 const [createdCapsule,setCreatedCapsule]=useState<LocalCapsule|null>(null);
 const w=useKnowledgeWorkspace({embedded:true,initialTheme}); const locationParams=useSearchParams(); const {locale}=useUiLocale(),en=locale==="en";
 const [commonVisible,setCommonVisible]=useState(()=>locationParams.has('kentity')||locationParams.has('krecord'));
 const [requested,setRequested]=useState(()=>!!initialTheme||locationParams.has('ktheme')||locationParams.has('kentity')||locationParams.has('krecord'));
 const host=useRef<Host|null>(null);
 const attachHost=useCallback((value:Host)=>{host.current=value;return()=>{if(host.current===value)host.current=null;};},[]);
 const normalCanvas=useRef<GraphCanvasHandle>(null),themeCanvas=useRef<GraphCanvasHandle>(null),themeGraphPane=useRef<HTMLDivElement>(null);
 const checkpointTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const active=w.activeTheme,retained=w.retainedTheme;
 const closeTheme=w.closeTheme;
 const [about,setAbout]=useState(false),[contextVariant,setContextVariant]=useState<"list"|"collapsed">("list");
 const [entryVariant,setEntryVariant]=useState<"detail"|"image">(()=>locationParams.get("itemEntry")==="1"?"image":"detail");
 const themeItems=useThemeItems(active?.theme);
 const previewItem=themeItems.items.find(i=>i.product.image&&!i.product.image.credit);
 const itemsRef=useRef<HTMLDivElement>(null),entryOrigin=useRef<HTMLButtonElement|null>(null);
 function openItems(origin:HTMLButtonElement){entryOrigin.current=origin;setAbout(true);setPane("detail");requestAnimationFrame(()=>{itemsRef.current?.focus({preventScroll:true});itemsRef.current?.scrollIntoView({block:"nearest"});});}
 const [evidenceOpen,setEvidenceOpen]=useState<Record<string,string[]>>({}),[evidenceRequest,setEvidenceRequest]=useState<EvidenceRequest>();
 const evidenceSerial=useRef(0);
 const readingOrigin=useRef<HTMLElement|null>(null);
 const [savedDetailTrail,setDetailTrail]=useState<{id:string;previousTop:number;context:string;guideEvidence?:string;chapter?:boolean}[]>([]);
 function resetDetailTrail(){setDetailTrail([]);setEvidenceRequest(undefined);}
 function readLinkedRecord(id:string){
   if(!active?.records.some(r=>r.record.id===id)){openRecord(id);return;}
   if(id===selectedRecord?.record.id)return;
   setEvidenceRequest(undefined);
   const previousTop=document.getElementById("explorer-detail")?.scrollTop??0;
   setDetailTrail(rows=>[...(rows[0]?.context===detailContext?rows:[]),{id,previousTop,context:detailContext}]);setAbout(false);setPane("detail");
   requestAnimationFrame(()=>{document.getElementById("explorer-detail")?.scrollTo({top:0});detailRef.current?.querySelector<HTMLElement>("[data-detail-back]")?.focus({preventScroll:true});});
 }
 function backFromLinkedRecord(){
   const last=detailTrail.at(-1);setDetailTrail(rows=>rows.slice(0,-1));setEvidenceRequest(undefined);if(last?.guideEvidence||last?.chapter)setAbout(true);
   requestAnimationFrame(()=>{document.getElementById("explorer-detail")?.scrollTo({top:last?.previousTop??0});const origin=[...detailRef.current?.querySelectorAll<HTMLElement>("[data-detail-record],[data-guide-evidence]")??[]].find(el=>last?.guideEvidence?el.dataset.guideEvidence===last.guideEvidence:el.dataset.detailRecord===last?.id);origin?.focus({preventScroll:true});});
 }

 const detailRef=useRef<HTMLDivElement>(null),detailFocus=useRef<HTMLElement|null>(null),returnDetail=useRef<{top:number;focus:HTMLElement|null}|null>(null);
 function showAbout(){entryOrigin.current=null;returnDetail.current={top:document.getElementById("explorer-detail")?.scrollTop??0,focus:detailFocus.current};setAbout(true);setPane("detail");requestAnimationFrame(()=>{document.getElementById("explorer-detail")?.scrollTo({top:0});detailRef.current?.querySelector<HTMLElement>("button")?.focus({preventScroll:true});});}
 function returnToRecord(){if(entryOrigin.current?.isConnected){const trigger=entryOrigin.current;entryOrigin.current=null;setAbout(false);setPane("graph");requestAnimationFrame(()=>{trigger.focus({preventScroll:true});trigger.scrollIntoView({block:"nearest"});});return;}setAbout(false);setPane(selectedRecord||selectedEntity?"detail":"graph");requestAnimationFrame(()=>{document.getElementById("explorer-detail")?.scrollTo({top:returnDetail.current?.top??0});returnDetail.current?.focus?.focus({preventScroll:true});});}
 function readEvidence(recordId:string,evidenceId:string){const previousTop=document.getElementById("explorer-detail")?.scrollTop??0;setDetailTrail(rows=>[...(rows[0]?.context===detailContext?rows:[]),{id:recordId,previousTop,context:detailContext,guideEvidence:evidenceId}]);setAbout(false);setPane("detail");setEvidenceRequest({recordId,evidenceId,token:++evidenceSerial.current});}
 const presentation=retained?.presentation?.locale===locale?retained.presentation:null;
 const selection=active?w.themeSelection:w.normal.selection;
 const records=active?active.records:w.normal.records;
 const entities=active?active.snapshot.entities:w.normal.entities;
 const detailContext=`${active?.theme.id??"normal"}@${active?.theme.revision??0}:${selection?.kind??"none"}:${selection?.id??""}`;
 const detailTrail=savedDetailTrail[0]?.context===detailContext?savedDetailTrail:[];
 const linkedRecordId=detailTrail.at(-1)?.id;
 const selectedRecord=linkedRecordId?records.find(r=>r.record.id===linkedRecordId):selection?.kind==="record"?records.find(r=>r.record.id===selection.id):null;
 const chapters=active&&presentation?presentation.records.filter(row=>row.chapterQuestion&&active.records.some(r=>r.record.id===row.target.id&&r.record.revision===row.target.revision)):[];
 const chapterIndex=chapters.findIndex(row=>row.target.id===selectedRecord?.record.id);
 function readChapter(id:string,next=false){
   const previousTop=document.getElementById("explorer-detail")?.scrollTop??0;
   setDetailTrail(rows=>[...(rows[0]?.context===detailContext?rows:[]),{id,previousTop,context:detailContext,chapter:!next}]);
   setEvidenceRequest(undefined);setAbout(false);setPane("detail");
   requestAnimationFrame(()=>{document.getElementById("explorer-detail")?.scrollTo({top:0});detailRef.current?.querySelector<HTMLElement>("[data-detail-back]")?.focus({preventScroll:true});});
 }
 const parentRecord=detailTrail.length?records.find(r=>r.record.id===(detailTrail.length>1?detailTrail.at(-2)?.id:selection?.kind==="record"?selection.id:undefined)):null;

 const selectedEntity=selection?.kind==="entity"?entities.find(e=>e.id===selection.id):null;
 const normalTranslations=useKnowledgeDisplayTranslations(w.normal.entities,w.normal.records.map(r=>r.record),undefined,locale);
 const themeTranslations=useKnowledgeDisplayTranslations(retained?.snapshot.entities??[],retained?.snapshot.records??[],retained?.theme,locale,!retained?.displayTranslations);
 const normalDisplayTranslations=useMemo(()=>[...normalTranslations,...keptTranslations],[normalTranslations,keptTranslations]);
 const themeDisplayTranslations=useMemo(()=>[...(retained?.displayTranslations??retained?.snapshot.translations??[]),...themeTranslations,...keptTranslations],[retained?.displayTranslations,retained?.snapshot,themeTranslations,keptTranslations]);
 const withTranslations=(snapshot:import("../lib/domain/knowledge-foundation").KnowledgeSnapshot,theme?:import("../lib/domain/knowledge-foundation").KnowledgeThemeVersion)=>({...snapshot,...(theme?{theme}:{}),translations:[...new Map([...normalTranslations,...(retained?.displayTranslations??[]),...themeTranslations,...keptTranslations].map(t=>[t.id,t])).values()].filter(t=>!("displayTarget" in t)&&(t.target.kind==="record"?snapshot.records:t.target.kind==="source"?snapshot.sources:t.target.kind==="entity"?snapshot.entities:theme?[theme]:[]).some(v=>v.id===t.target.id&&v.revision===t.target.revision))});
 const selectedCaption=selectedEntity?entityCaption(selectedEntity,records,active?themeDisplayTranslations:normalDisplayTranslations,locale,active?presentation?.entityNotes:undefined):undefined;
 const normalContent=useMemo(()=>knowledgeCanvas(w.normal.records,w.normal.entities,normalDisplayTranslations,locale),[w.normal.records,w.normal.entities,normalDisplayTranslations,locale]);
 const themeSnapshot=retained?withTranslations(retained.snapshot,retained.theme):null;
 const themeDisplay=themeSnapshot?knowledgeDisplaySnapshot({...themeSnapshot,translations:themeDisplayTranslations},locale):null;
 const parentRecordTitle=parentRecord?readingRecordTitle(themeDisplay?.records.find(r=>r.id===parentRecord.record.id)??parentRecord.record,presentation):undefined;
 const normalState=useMemo(()=>emptyGraph(w.normal.epoch),[w.normal.epoch]);
 const themeState=useMemo(()=>emptyGraph(retained?.theme.revision??0),[retained?.theme.revision]);
 const themeContent=useMemo(()=>{const rows=retained?.records.filter(r=>r.record.content.kind==="relation")??[];const ids=new Set(rows.flatMap(r=>[r.record.content.subjectId,r.record.content.objectId]));return knowledgeCanvas(retained?.records??[],retained?.snapshot.entities.filter(e=>ids.has(e.id))??[],themeDisplayTranslations,locale,presentation?.entityNotes);},[retained,themeDisplayTranslations,locale,presentation]);
 const themeHasTime=Boolean(retained?.snapshot.records.some(r=>r.content.times.length)),themeHasGraph=Boolean(themeContent.nodes.length);
 const themeMode=themeHasTime?themeHasGraph&&w.themeView==="split"?"split":"timeline":"graph";
 const busy=w.busy||w.restoring;
 useEffect(()=>{const sync=()=>{const url=new URL(location.href);setCommonVisible(url.searchParams.has("kentity")||url.searchParams.has("krecord"));setRequested(url.searchParams.has("ktheme")||url.searchParams.has("kentity")||url.searchParams.has("krecord"));};queueMicrotask(sync);window.addEventListener("popstate",sync);return()=>window.removeEventListener("popstate",sync);},[]);
 // A same-route Next Link to Home changes searchParams without a popstate event.
 // Close the reader only after an actual Theme/common view exists; an in-flight open still uses the prior URL.
 useEffect(()=>{if((active||commonVisible)&&!initialTheme&&!locationParams.has("ktheme")&&!locationParams.has("kentity")&&!locationParams.has("krecord")){queueMicrotask(()=>{const url=new URL(location.href);if(knowledgeThemeLocation(url)||url.searchParams.has("kentity")||url.searchParams.has("krecord"))return;closeTheme("replace");setCommonVisible(false);setRequested(false);});}},[active,commonVisible,locationParams,closeTheme,initialTheme]);
 function setPane(p:"search"|"graph"|"detail"){host.current?.onPane(p);}
 function checkpoint(){if(checkpointTimer.current)clearTimeout(checkpointTimer.current);if(active)w.captureThemeView(themeCanvas.current?.capture()??null);else if(commonVisible)w.captureNormalView(normalCanvas.current?.capture()??null);}
 function scheduleCheckpoint(){if(checkpointTimer.current)clearTimeout(checkpointTimer.current);checkpointTimer.current=setTimeout(checkpoint,350);}
 useEffect(()=>{const save=()=>checkpoint();window.addEventListener("pagehide",save);return()=>{window.removeEventListener("pagehide",save);if(checkpointTimer.current)clearTimeout(checkpointTimer.current);};});
 function openTheme(ref:{id:string;revision?:number;focusEntityId?:string}){resetDetailTrail();if(host.current&&!host.current.beforeOpen())return;checkpoint();setAbout(false);setRequested(true);void w.openTheme(ref);setPane("graph");}
 function openRecord(id:string){resetDetailTrail();if(host.current&&!host.current.beforeOpen())return;checkpoint();setRequested(true);closeTheme("replace");void w.selectRecord(id,{latest:true}).then(opened=>{if(!opened)return;const url=new URL(location.href);url.searchParams.delete('kentity');url.searchParams.set('krecord',id);history.replaceState(history.state,'',url);setCommonVisible(true);});setPane("detail");}
 function openEntity(entity:KnowledgeEntityVersion){resetDetailTrail();if(host.current&&!host.current.beforeOpen())return;checkpoint();setRequested(true);closeTheme("replace");void w.startFrom(entity,{latest:true}).then(opened=>{if(!opened)return;const url=new URL(location.href);url.searchParams.delete("krecord");url.searchParams.set("kentity",entity.id);history.replaceState(history.state,"",url);setCommonVisible(true);setPane("graph");});}
 function leave(){resetDetailTrail();checkpoint();setRequested(false);w.closeTheme("replace");setCommonVisible(false);const url=new URL(location.href);url.searchParams.delete("kentity");url.searchParams.delete("krecord");history.replaceState(history.state,"",url);}
 function backToReading(){setPane("graph");requestAnimationFrame(()=>readingOrigin.current?.focus({preventScroll:true}));}
 function chooseEntity(id:string){resetDetailTrail();readingOrigin.current=document.activeElement as HTMLElement;setAbout(false);if(active)w.setThemeSelection({kind:"entity",id});else w.selectEntity(id);setPane("detail");}
 function chooseRecord(id:string){resetDetailTrail();readingOrigin.current=document.activeElement as HTMLElement;setAbout(false);if(active)w.setThemeSelection({kind:"record",id});else void w.selectRecord(id);setPane("detail");}
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
 function graphFromTimeline(id:string){resetDetailTrail();w.setThemeSelection({kind:"record",id});w.setThemeView("split");requestAnimationFrame(()=>{themeCanvas.current?.ensureVisible?.("record:"+id);if(matchMedia("(max-width:1100px)").matches)themeGraphPane.current?.scrollIntoView({block:"start"});});}
 const value:KnowledgeReadingContract={active:Boolean(active)||commonVisible||(busy&&requested),restoring:w.restoring,openTheme,openRecord,openEntity,leave,checkpoint,attachHost,error:w.error,message:w.message,busy,
 center:<div className={css.workspace}>
  {submissionError&&<p role="alert" className={base.error}>{submissionError}{submissionRefreshTarget&&<button onClick={()=>{const target=submissionRefreshTarget;setSubmissionError("");setSubmissionRefreshTarget(null);if(target.kind==="record")openRecord(target.id);else{const entity=entities.find(e=>e.id===target.id);if(entity)openEntity(entity);}}}><Icon name="refresh"/>{en?"Open current content and reselect":"最新版を開いて選び直す"}</button>}</p>}
  {submissionBusy&&<p role="status">{en?"Creating a private draft…":"非公開の投稿草稿を作成しています…"}</p>}
 {w.error&&<p role="alert" className={base.error}>{w.error}<button onClick={()=>void w.refreshLatest()}>再取得</button></p>}
 {busy&&(active||commonVisible||requested)&&<p role="status" className={css.notice}>{en?"Loading…":"読み込んでいます…"}</p>}
 {w.message&&<p role="status" className={css.notice}>{w.message}</p>}
 {commonVisible&&!active&&w.status?.active&&w.normal.generation&&w.status.active.id!==w.normal.generation&&<p className={css.notice}>新しい公開版があります。<button disabled={busy} onClick={()=>void w.refreshLatest()}>最新版を読む</button></p>}
 {commonVisible&&!active&&<button className={css.return} onClick={()=>{leave();host.current?.onReturn();}}><Icon name="back"/>元の探索へ戻る</button>}
        <section hidden={Boolean(active) || !commonVisible} className={`${base.panel} ${base.graphPanel} ${css.stage}`} aria-label={en ? "Ordinary exploration" : "通常の関係探索"}>
          <header className={css.stageHeader}><h2>{selectedRecord&&selectedRecord.record.content.kind!=="relation"?(en?"Knowledge":"知識"):"Graph"}</h2><span role="status">{busy ? en ? "Reading…" : "読み込み中…" : `${w.normal.entities.length} ${en ? "subjects" : "対象"} · ${w.normal.records.filter(r => r.record.content.kind === "relation").length} ${en ? "relations" : "関係"}`}</span><button className={css.themeInfo} aria-label={en?"Create Capsule":"Capsuleを作成"} title={en?"Create Capsule":"Capsuleを作成"} disabled={busy||!w.normal.records.length} onClick={()=>setCreatedCapsule(captureKnowledgeCapsule({title:selectedRecord?.record.content.assertion.slice(0,80)??(en?"Knowledge connections":"知識のつながり"),snapshot:withTranslations({schemaVersion:1,entities:w.normal.entities,sources:[...new Map(w.normal.records.flatMap(dto=>dto.sources).map(source=>[source.id+"@"+source.revision,source])).values()],records:w.normal.records.map(dto=>dto.record),mappings:[],initialView:"graph"}),view:"graph",graphView:normalCanvas.current?.capture()}))}><Icon name="capsule"/></button>{submissionButton}</header>

          {selectedRecord&&selectedRecord.record.content.kind!=="relation"&&<KnowledgeRecordDetail onTranslation={keepTranslation} dto={selectedRecord} onEntity={chooseEntity}/> }
          <div hidden={!!selectedRecord&&selectedRecord.record.content.kind!=="relation"} className={css.canvasFrame}><GraphCanvas onSelectionChange={setCanvasKeys} ref={normalCanvas} graph={normalState} content={normalContent} restoration={w.normalRestoration} onViewChange={scheduleCheckpoint} contentOnly fillHeight compactGuide selection={canvasSelection(w.normal.selection)} interactionBlocked={busy || Boolean(active)} onEntity={(id) => w.selectEntity(id)} onEntityDoubleClick={(id) => { void w.expandEntity(id); }} onToggleEntity={(id) => { void w.expandEntity(id); }} onRelation={(id) => chooseRecord(id.replace(/^record:/,""))} /></div>
          <div className={css.recordStrip}>{w.normal.records.map((r) => <button key={r.record.id} onClick={() => chooseRecord(r.record.id)} aria-pressed={w.normal.selection?.kind === "record" && w.normal.selection.id === r.record.id}>{r.label || r.record.content.assertion}</button>)}</div>
        </section>
        {retained && <section hidden={!active} className={`${base.panel} ${base.graphPanel} ${css.stage}`} aria-label={en ? "Theme reading" : "テーマを読む"}>
          <header className={css.themeHeader}><button onClick={() => { resetDetailTrail(); checkpoint(); setRequested(false); w.closeTheme(); if(!commonVisible)host.current?.onReturn(); }} className={css.return}><Icon name="back" />{en ? "Back to exploration" : "探索に戻る"}</button><span>{en ? "Saved composition" : "構成版"} {retained.theme.revision}</span><h2 title={retained.theme.content.title}>{knowledgeDisplayText(themeDisplayTranslations,{kind:"theme",id:retained.theme.id,revision:retained.theme.revision,field:"title"},locale,retained.theme.content.title)}</h2><button className={css.themeInfo} aria-label={en?"Create Capsule":"Capsuleを作成"} title={en?"Create Capsule":"Capsuleを作成"} disabled={busy} onClick={()=>{checkpoint();setCreatedCapsule(captureKnowledgeCapsule({snapshot:withTranslations(retained.snapshot,retained.theme),theme:retained.theme,title:retained.theme.content.title,view:w.themeView,graphView:themeCanvas.current?.capture()}));}}><Icon name="capsule"/></button>{submissionButton}<button className={css.themeInfo} aria-label={en ? "About this theme" : "テーマについて"} title={en ? "About this theme" : "テーマについて"} onClick={showAbout}><Icon name="book" /></button></header>
          <ThemeReadingHero presentation={presentation} theme={retained.theme} snapshot={{...themeSnapshot!,translations:themeDisplayTranslations}} locale={locale} itemEntry={entryVariant==="image"&&previewItem&&active?.theme.id===retained.theme.id?<ItemTeaser key={previewItem.product.id} item={previewItem} en={en} onOpen={openItems}/>:null} onAbout={showAbout}/>{contextVariant==="collapsed"&&<KnowledgeThemeContext key={retained.theme.id+":"+retained.theme.revision+contextVariant} variant={contextVariant} records={themeDisplay!.records.map(record=>buildKnowledgePublishedRecord(record,themeDisplay!))} selectedRecordId={w.themeSelection?.kind==="record"?w.themeSelection.id:null} onRead={chooseRecord}/>}

          {(themeHasTime||themeHasGraph)&&<KnowledgeSplit mode={themeMode}>
            <div className={css.timelinePane} hidden={!themeHasTime || themeMode === "graph"}><KnowledgeTimeline reading presentation={presentation} key={retained.theme.id + ":" + retained.theme.revision} snapshot={{...themeSnapshot!,translations:themeDisplayTranslations}} headerAction={themeHasTime && themeHasGraph && <button className={css.themeInfo} aria-label={themeMode === "split" ? en ? "Close relation diagram" : "関係図を閉じる" : en ? "Show relation diagram" : "関係図を並べて表示"} title={themeMode === "split" ? en?"Close relation diagram":"関係図を閉じる" : en?"Show relation diagram":"関係図を並べて表示"} aria-pressed={themeMode === "split"} onClick={() => w.setThemeView(themeMode === "split" ? "timeline" : "split")}><Icon name="panel" /></button>} untimedInContext focusedEntityId={w.themeSelection?.kind==='entity'?w.themeSelection.id:undefined} focusedRecordId={w.themeSelection?.kind === "record" ? w.themeSelection.id : null} onFocusRecord={(id,timeId)=>{if(id){readingOrigin.current=document.activeElement as HTMLElement;resetDetailTrail();setAbout(false);w.setThemeSelection({kind:"record",id,...(timeId?{timeId}:{})});setPane("detail");}}} onShowGraph={(id) => graphFromTimeline(id)} /></div>
            <div ref={themeGraphPane} hidden={!themeHasGraph || themeMode === "timeline"} className={`${css.canvasFrame} ${css.themeCanvas}`}><GraphCanvas onSelectionChange={setCanvasKeys} key={retained.theme.id + ":" + retained.theme.revision} ref={themeCanvas} graph={themeState} content={themeContent} restoration={w.themeRestoration} onViewChange={scheduleCheckpoint} contentOnly fillHeight compactGuide selection={canvasSelection(w.themeSelection)} interactionBlocked={busy || !active} onEntity={(id) => {resetDetailTrail();w.setThemeSelection({ kind: "entity", id });}} onEntityDoubleClick={(id) => { resetDetailTrail(); w.setThemeSelection({ kind: "entity", id }); setPane("detail"); }} onToggleEntity={(id) => { resetDetailTrail(); w.setThemeSelection({ kind: "entity", id }); setPane("detail"); }} onRelation={(id) => chooseRecord(id.replace(/^record:/,""))} /></div>
          </KnowledgeSplit>}
          <details className={css.sourceIndex}><summary>{en?"Theme sources":"テーマの出典"} · {(retained.snapshot.sources??[]).length}</summary><ul>{(retained.snapshot.sources??[]).map(source=><li key={source.id}>{source.content.url?<a href={source.content.url} target="_blank" rel="noopener noreferrer">{source.content.title}<Icon name="external"/></a>:source.content.title}</li>)}</ul></details>
          {contextVariant==="list"&&<KnowledgeThemeContext key={retained.theme.id+":"+retained.theme.revision+contextVariant} variant={contextVariant} records={themeDisplay!.records.map(record=>buildKnowledgePublishedRecord(record,themeDisplay!))} selectedRecordId={w.themeSelection?.kind==="record"?w.themeSelection.id:null} onRead={chooseRecord}/>}
          <details className={css.prototype}><summary>{en?"Compare layout prototypes":"配置の試作を比較"}</summary><label>{en?"Undated information":"日時のない情報"}<select value={contextVariant} onChange={e=>setContextVariant(e.target.value as "list"|"collapsed")}><option value="list">{en?"A · Open list below the graph":"A · 図の下に開いた一覧"}</option><option value="collapsed">{en?"B · Collapsed entrance above the graph":"B · 図の上に閉じた入口"}</option></select></label><label>{en?"Related item entrance":"関連アイテムの入口"}<select value={entryVariant} onChange={e=>setEntryVariant(e.target.value as "detail"|"image")}><option value="detail">{en?"A · Details only":"A · 詳細のみ"}</option><option value="image">{en?"B · Thumbnail in introduction":"B · 導入に小さな商品画像"}</option></select></label></details>
        </section>}
</div>,detail:<div ref={detailRef} className={`${css.workspace} ${css.details}`}>{active&&(about||(!selectedRecord&&!selectedEntity)||detailTrail.some(step=>step.guideEvidence||step.chapter))&&<section hidden={!about&&!!(selectedRecord||selectedEntity)}><button className={css.return} onClick={returnToRecord}><Icon name="back"/>{selectedRecord?(en?"Back to selected record":"選んだ記録に戻る"):(en?"Back to reading":"閲覧に戻る")}</button><h2 className={css.guideTitle}>{en?"Explore this theme":"このテーマを深く読む"}</h2>{presentation?.lead&&<p className={css.mobileLead}>{presentation.lead}</p>}{chapters.length>0&&<ReadingDetailSection className={css.guideChapters} icon="list" title={en?"Read the story":"解説を読む"}><ol className={css.chapters}>{chapters.map(row=><li key={row.target.id}><button data-detail-record={row.target.id} onClick={()=>readChapter(row.target.id)}><span>{row.chapterQuestion}</span><Icon name="arrow"/></button></li>)}</ol></ReadingDetailSection>}<ReadingSources key={active.theme.id} items={active.snapshot.sources.map((source,index)=>{const record=active.snapshot.records.find(r=>r.content.evidence.some(e=>e.source.id===source.id&&e.source.revision===source.revision));const evidence=record?.content.evidence.find(e=>e.source.id===source.id&&e.source.revision===source.revision);return <p className={css.guideSource} key={source.id+":"+source.revision}><small aria-hidden="true">{String(index+1).padStart(2,"0")}</small>{record&&evidence?<button data-guide-evidence={evidence.id} onClick={()=>readEvidence(record.id,evidence.id)}>{knowledgeDisplayText(themeDisplayTranslations,{kind:"source",id:source.id,revision:source.revision,field:"title"},locale,source.content.title)}</button>:source.content.title}</p>;})}/><div ref={itemsRef} tabIndex={-1}><ThemeItemsResult result={themeItems} en={en}/></div><div className={css.guideTools}><details className={css.edition}><summary>{en?"Edition & credits":"版情報・クレジット"}</summary><div className={css.insetBody}><small>{en?"Composition revision":"構成版"} {active.theme.revision}</small>{presentation?.image&&<p>{presentation.image.caption} {presentation.image.credit} {presentation.image.kind!=="illustration"&&<a href={presentation.image.termsUrl} target="_blank" rel="noopener noreferrer">{en?"Usage terms":"利用条件"}</a>}</p>}</div></details><KnowledgeTranslationPanel onRetain={keepTranslation} fields={[{label:en?"Title":"テーマ名",target:{kind:"theme",id:active.theme.id,revision:active.theme.revision,field:"title"}},{label:en?"Description":"説明",target:{kind:"theme",id:active.theme.id,revision:active.theme.revision,field:"description"}},...themeTimelineTextTargets(active.theme).map(target=>({label:timelineTextFieldLabel(target,en),target}))]}/></div></section>}<div hidden={about} onFocusCapture={event=>{detailFocus.current=event.target as HTMLElement;}}>{selectedRecord ? <><KnowledgeRecordDetail correction={<> {!operatorEnabled&&<Link className={css.editRecord} href={"/member/submissions?record="+encodeURIComponent(selectedRecord.record.id)+"&revision="+selectedRecord.record.revision} target="_blank" rel="noopener noreferrer"><Icon name="edit"/>{en?"Propose a correction":"訂正を提案"} ↗</Link>}{operatorEnabled&&<Link className={css.editRecord} href={`/themes/records?record=${encodeURIComponent(selectedRecord.record.id)}&fromRevision=${selectedRecord.record.revision}`} onClick={() => checkpoint()}><Icon name="edit" />{en ? "Correct this record" : "この記録を訂正"}</Link>} </>} displayTranslations={active?themeDisplayTranslations:normalDisplayTranslations} key={selectedRecord.record.id} title={readingRecordTitle(themeDisplay?.records.find(r=>r.id===selectedRecord.record.id)??selectedRecord.record,presentation)} explanations={active?readingExplanations(selectedRecord.record,active.snapshot,presentation).map(ref=>({dto:buildKnowledgePublishedRecord(themeDisplay?.records.find(r=>r.id===ref.record.id)??ref.record,themeDisplay??active.snapshot),role:ref.role,heading:ref.heading})):[]} openEvidenceIds={evidenceOpen[selectedRecord.record.id]??[]} onEvidenceOpen={ids=>setEvidenceOpen(old=>({...old,[selectedRecord.record.id]:ids}))} evidenceRequest={evidenceRequest} onBack={detailTrail.length?backFromLinkedRecord:backToReading} backLabel={detailTrail.at(-1)?.chapter?(en?"Back to the questions":"問いの一覧に戻る"):detailTrail.at(-1)?.guideEvidence?(en?"Back to theme sources":"テーマの資料に戻る"):detailTrail.length?(en?`Back to “${parentRecordTitle??"previous record"}”`:`「${parentRecordTitle??"元の記録"}」に戻る`):undefined} nestedBack={detailTrail.length>0} onTranslation={keepTranslation} dto={selectedRecord} onEntity={chooseEntity} onRecord={readLinkedRecord} onTheme={id=>openTheme({id})} />{chapterIndex>=0&&chapterIndex+1<chapters.length&&<button className={css.chapterNext} data-detail-record={chapters[chapterIndex+1].target.id} onClick={()=>readChapter(chapters[chapterIndex+1].target.id,true)}><small>{en?"Next":"次の問い"}</small>{chapters[chapterIndex+1].chapterQuestion}<Icon name="arrow"/></button>}{active&&<ThemeProducts theme={active.theme} selection={{kind:"record",id:selectedRecord.record.id}}/>}</> : selectedEntity ? <><button className={`${css.return} ${css.entityReturn}`} onClick={backToReading}><Icon name="back"/>{en?"Back to reading":"年表・図に戻る"}</button><KnowledgeReadingBadge kind="entity" en={en} label={knowledgeKindLabel(selectedEntity.content.kind,locale)}/><h2>{knowledgeEntityDisplayName(selectedEntity,active?themeDisplayTranslations:normalDisplayTranslations,locale)}</h2>{selectedCaption && <p data-entity-caption>{selectedCaption}</p>}
          {active ? <button className={css.entityExplore} onClick={() => startFrom(selectedEntity)} disabled={busy}><Icon name="arrow" />{en ? `Explore from ${knowledgeEntityDisplayName(selectedEntity,themeDisplayTranslations,locale)}` : `${knowledgeEntityDisplayName(selectedEntity,themeDisplayTranslations,locale)}から探索する`}</button> : <div className={base.actions}><button onClick={() => void w.expandEntity(selectedEntity.id)} disabled={busy}><Icon name="graph" />{en ? "Expand connections" : "周囲の関係を広げる"}</button>{w.neighborPages[selectedEntity.id]?.hasMore && <button disabled={busy} onClick={() => void w.expandEntity(selectedEntity.id, w.neighborPages[selectedEntity.id]?.cursor)}>{en ? "More connections" : "関係の続きを追加"}</button>}</div>}
<RelatedThemes entityId={selectedEntity.id} catalogue={relatedCatalogue} onOpen={openTheme}/>
          <KnowledgeRelatedInformation key={selectedEntity.id} entityId={selectedEntity.id} onOpen={openRecord} inViewRecords={records.filter(r=>[r.record.content.subjectId,r.record.content.objectId].includes(selectedEntity.id))} onOpenInView={chooseRecord} inTheme={!!active} displayTranslations={active?themeDisplayTranslations:normalDisplayTranslations}/>
          {active&&<ThemeProducts theme={active.theme} selection={{kind:"entity",id:selectedEntity.id}}/>}
          <details className={css.related}><summary>{en?"Names, description & translation":"名前・説明・翻訳"}</summary><div className={css.insetBody}>{selectedEntity.content.aliases.length>0&&<p>{selectedEntity.content.aliases.join(" · ")}</p>}<KnowledgeTranslationPanel onRetain={keepTranslation} fields={[{label:en?'Name':'名前',target:{kind:'entity',id:selectedEntity.id,revision:selectedEntity.revision,field:'name'}},...selectedEntity.content.aliases.map((alias,aliasIndex)=>({label:(en?'Alias: ':'別名：')+alias,target:{kind:'entity' as const,id:selectedEntity.id,revision:selectedEntity.revision,field:'aliases' as const,aliasIndex}})),...(selectedEntity.content.description?[{label:en?'Description':'説明',target:{kind:'entity' as const,id:selectedEntity.id,revision:selectedEntity.revision,field:'description' as const}}]:[])]}/><KnowledgeContributors kind="entity" id={selectedEntity.id}/><KnowledgeIdentityPeers key={selectedEntity.id+":"+selectedEntity.revision} id={selectedEntity.id}/><a className={css.editRecord} href={'/member/submissions?'+new URLSearchParams({entity:selectedEntity.id,revision:String(selectedEntity.revision)})} target="_blank" rel="noopener noreferrer"><Icon name="edit"/>{en?'Correct name or description':'名前・説明の訂正を提案'} ↗</a></div></details>
        </> : active ? null : <p className={base.muted}>{en ? "Choose a name or connection in the graph to read its explanation and sources." : "図の名前や線を選ぶと、説明と出典を読めます。"}</p>}
</div></div>};
 return <ReadingContext value={value}>{children}{createdCapsule&&<CapsuleWorkspace initial={createdCapsule} isNew onClose={()=>setCreatedCapsule(null)}/>}</ReadingContext>;
}
