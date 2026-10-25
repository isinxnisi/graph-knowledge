"use client";
import { useEffect, useState } from "react";
import { executePathSearch } from "../lib/client/use-discovery-paths";
import { CLIENT_REQUEST_TIMEOUT_MS } from "../lib/client/api";
import { fetchSubjectMatches, type SubjectMatches } from "../lib/client/discovery-subject-matches";
import { relationConditionKey } from "../lib/domain/relation-conditions";
import { type ConnectionSelection } from "../lib/domain/discovery-connections";
import { type DiscoveryPathsResponse } from "../lib/domain/discovery-paths";
import { useUiLocale } from "../lib/client/ui-locale";
import DiscoveryClaimRow from "./DiscoveryClaimRow";
import catalog from "./DiscoveryPresetBrowser.module.css";
import styles from "./DiscoveryConnections.module.css";
import Icon from "./Icon";
const pathConditions={predicates:null,contributionRoles:null};
export default function DiscoverySubjectCandidates({selection,onChoose,graphHref,onGraph,disabled=false,depth,onDepthChange,onSettled}:{selection:ConnectionSelection;onChoose:(s:ConnectionSelection)=>void;graphHref:(s:ConnectionSelection)=>string;onGraph:(s:ConnectionSelection)=>void;disabled?:boolean;depth:2|3;onDepthChange:(n:2|3)=>void;onSettled:()=>void}){
 const {locale}=useUiLocale(),t=(ja:string,en:string)=>locale==="en"?en:ja;
 const [attempt,retry]=useState(0),[detail,setDetail]=useState<string|null>(null);
 const key=JSON.stringify([selection.entity.id,selection.revision,selection.relation?relationConditionKey(selection.relation):null,depth,attempt]);
 const [state,setState]=useState<{key:string;paths?:DiscoveryPathsResponse;matches?:SubjectMatches;error?:boolean}>({key:""});
 useEffect(()=>{
  let disposed=false;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),CLIENT_REQUEST_TIMEOUT_MS);
  void(async()=>{
   const paths=await executePathSearch(selection.entity.id,depth,pathConditions,selection.revision,controller.signal);
   const ids=[...new Set(paths.paths.map(p=>p.nodeIds.at(-1)!))];
   const matches=await fetchSubjectMatches(ids,selection.relation,selection.revision,controller.signal);
   if(!controller.signal.aborted)setState({key,paths,matches});
  })().catch(()=>{if(!disposed)setState({key,error:true});}).finally(()=>{clearTimeout(timer);if(!disposed)onSettled();});
  const abort=()=>{disposed=true;clearTimeout(timer);controller.abort();};return abort;
 // A fixed key identifies the revision, complete relation and starting subject.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key,onSettled]);
 const current=state.key===key?state:null,items=current?.matches?.items.filter(i=>i.status==="matched");
 return <section className={styles.candidates} aria-label={t("接点から別の対象を探す","Find another subject through connections")}>
  <header className={styles.connectionsHeading}><div><span>FOLLOW A CONNECTION</span><h3>{t("つながりの先に、次の発見。","Follow a new connection.")}</h3><p>{t(`${selection.entity.name}から見つかる接点。Graphで開くか、その対象からさらに辿れます。`,`Connections from ${selection.entity.name}. Open Graph, or keep exploring from a new subject.`)}</p></div>
   <div className={styles.distance} role="group" aria-label={t("辿る段数","Connection distance")}>{([2,3] as const).map(n=><button key={n} aria-pressed={depth===n} onClick={()=>onDepthChange(n)}>{t(`${n}段先`,`${n} steps away`)}</button>)}</div>
  </header>
   {current?.error?<p role="alert">{t("候補を確認できませんでした。0件とは判定していません。","Candidates could not be confirmed; this is not a zero-result search.")} <button onClick={()=>retry(n=>n+1)}>{t("再試行","Retry")}</button></p>:!current?.matches?<p role="status">{t("接点と候補の適合性を確認中…","Checking connections and candidate eligibility…")}</p>:<>
    <p className={catalog.note} role="status">{t(`取得範囲内 ${items?.length??0}候補（全件ではありません）。最大12経路・24対象の展開。`,`${items?.length??0} candidates in the retrieved scope, not an exhaustive list. Up to 12 routes and 24 expanded subjects.`)} {current.paths!.scan.reasons.length>0?t("取得上限に達した範囲があります。","Some traversal limits were reached."):""}</p>
    {!items?.length&&<p className={styles.noCandidates}>{t("この取得範囲では、条件に合う接点が見つかりませんでした。3段先や「すべての関係」でも探せます。","No matching connections were found in this retrieved scope. Try three steps away or All relations.")}</p>}
    {items?.map(item=>{const path=current.paths!.paths.find(p=>p.nodeIds.at(-1)===item.entity.id)!;const pathClaims=new Set(path.claimIds.flat()),candidate={entity:item.entity,relation:selection.relation,revision:selection.revision,witness:item.witness};return <article key={item.entity.id} className={styles.candidateRow}>
     <h4>{item.entity.name}</h4><p className={catalog.note}>{path.nodeIds.map(id=>current.paths!.nodes.find(n=>n.id===id)?.name??id).join(" — ")}</p>
     <div className={styles.rowActions} inert={disabled}><button onClick={()=>onChoose(candidate)}>{t("この対象から探す","Explore this subject")} <Icon name="arrow"/></button><a className={styles.graphAction} href={graphHref(candidate)} onClick={()=>onGraph(candidate)}><Icon name="graph"/>{t("Graphで探索","Explore in Graph")}<Icon name="external"/></a></div>
     <button className={styles.routeEvidence} aria-expanded={detail===item.entity.id} onClick={()=>setDetail(detail===item.entity.id?null:item.entity.id)}>{t("接点の根拠","Connection evidence")} {detail===item.entity.id?"−":"＋"}</button>
     {detail===item.entity.id&&<><p className={catalog.note}>{t("候補への到達経路の一例です。並びは辿った順で、Claimの方向・肯否は各記録で確認できます。候補自身の適合証拠とは別です。","One route to this candidate, in traversal order. Each record shows its actual direction and polarity. This is separate from evidence that the candidate matches.")}</p>{current.paths!.claims.filter(c=>pathClaims.has(c.id)).map(c=><DiscoveryClaimRow key={c.id} claim={c} nodes={current.paths!.nodes} revision={selection.revision}/>)}</>}
    </article>;})}
   </>}
 </section>;
}
