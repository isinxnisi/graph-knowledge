"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { executePathSearch } from "../lib/client/use-discovery-paths";
import { CLIENT_REQUEST_TIMEOUT_MS } from "../lib/client/api";
import { entityDetailSchema } from "../lib/domain/api";
import { matchWitnessSchema, witnessSubjectId } from "../lib/domain/relation-patterns";
import { relationConditionKey } from "../lib/domain/relation-conditions";
import { type ConnectionSelection } from "../lib/domain/discovery-connections";
import { type DiscoveryPathsResponse } from "../lib/domain/discovery-paths";
import { useUiLocale } from "../lib/client/ui-locale";
import DiscoveryClaimRow from "./DiscoveryClaimRow";
import catalog from "./DiscoveryPresetBrowser.module.css";
import styles from "./DiscoveryConnections.module.css";
const matchResponse=z.strictObject({version:z.literal(1),revision:z.string(),items:z.array(z.strictObject({entity:entityDetailSchema,status:z.enum(["matched","not-matched","incompatible"]),witness:matchWitnessSchema.nullable()})).max(24)});
type Matches=z.infer<typeof matchResponse>;
const pathConditions={predicates:null,contributionRoles:null};
export default function DiscoverySubjectCandidates({selection,onChoose}:{selection:ConnectionSelection;onChoose:(s:ConnectionSelection)=>void}){
 const {locale}=useUiLocale(),t=(ja:string,en:string)=>locale==="en"?en:ja;
 const [open,setOpen]=useState(false),[visit,setVisit]=useState(0),[depth,setDepth]=useState<2|3>(2),[filtered,setFiltered]=useState(true),[attempt,retry]=useState(0),[detail,setDetail]=useState<string|null>(null);
 const key=JSON.stringify([selection.entity.id,selection.revision,selection.relation?relationConditionKey(selection.relation):null,depth,attempt,visit]);
 const [state,setState]=useState<{key:string;paths?:DiscoveryPathsResponse;matches?:Matches;error?:boolean}>({key:""});
 useEffect(()=>{
  if(!open)return;let disposed=false;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),CLIENT_REQUEST_TIMEOUT_MS);
  void(async()=>{
   const paths=await executePathSearch(selection.entity.id,depth,pathConditions,selection.revision,controller.signal);
   const ids=[...new Set(paths.paths.map(p=>p.nodeIds.at(-1)!))];
   const response=await fetch("/api/discovery/subject-matches",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({version:1,ids,relation:selection.relation,revision:selection.revision}),signal:controller.signal,cache:"no-store"});
   if(!response.ok)throw Error("Unconfirmed candidates");const matches=matchResponse.parse(await response.json());
   if(matches.revision!==selection.revision||matches.items.length!==ids.length||new Set(matches.items.map(i=>i.entity.id)).size!==ids.length||matches.items.some(i=>!ids.includes(i.entity.id)||i.status==="matched"&&selection.relation&&!i.witness||i.status!=="matched"&&i.witness!==null||i.witness&&(!selection.relation||witnessSubjectId(i.witness)!==i.entity.id||i.witness.revision!==selection.revision||i.witness.conditionKey!==relationConditionKey(selection.relation))))throw Error("Unexpected candidates");
   if(!controller.signal.aborted)setState({key,paths,matches});
  })().catch(()=>{if(!disposed)setState({key,error:true});}).finally(()=>clearTimeout(timer));
  const abort=()=>{disposed=true;clearTimeout(timer);controller.abort();};return abort;
 // A fixed key identifies the revision, complete relation and starting subject.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[open,key]);
 const current=state.key===key?state:null,items=current?.matches?.items.filter(i=>!filtered||i.status==="matched");
 return <section className={styles.candidates} aria-label={t("接点から別の対象を探す","Find another subject through connections")}>
  <button className={styles.evidenceToggle} aria-expanded={open} onClick={()=>{if(!open)setVisit(n=>n+1);setOpen(!open);}}>{t("接点から別の対象を探す","Find another subject through connections")} <span aria-hidden="true">{open?"−":"＋"}</span></button>
  {open&&<>
   <div className={catalog.options} role="group" aria-label={t("辿る段数","Connection distance")}>{([2,3] as const).map(n=><button key={n} className={catalog.chip} aria-pressed={depth===n} onClick={()=>setDepth(n)}>{t(`${n}段先`,`${n} steps away`)}</button>)}</div>
   <div className={catalog.options} role="group" aria-label={t("候補の絞り込み","Candidate filter")}><button className={catalog.chip} aria-pressed={filtered} disabled={!selection.relation} onClick={()=>setFiltered(true)}>{t("関係条件を適用","Apply relation criteria")}</button><button className={catalog.chip} aria-pressed={!filtered} onClick={()=>setFiltered(false)}>{t("関係を絞らない","No candidate filter")}</button></div>
   <p className={catalog.note}>{t("この切替は候補一覧だけに適用します。Graphの関係条件は変わりません。到達経路は肯否を含む記録の接続で、候補の適合証拠とは別です。","This switch filters candidates only; Graph criteria stay unchanged. Routes connect recorded Claims, including negative ones, and are separate from evidence that a candidate matches.")}</p>
   {current?.error?<p role="alert">{t("候補を確認できませんでした。0件とは判定していません。","Candidates could not be confirmed; this is not a zero-result search.")} <button onClick={()=>retry(n=>n+1)}>{t("再試行","Retry")}</button></p>:!current?.matches?<p role="status">{t("接点と候補の適合性を確認中…","Checking connections and candidate eligibility…")}</p>:<>
    <p className={catalog.note} role="status">{t(`取得範囲内 ${items?.length??0}候補（全件ではありません）。最大12経路・24対象の展開。`,`${items?.length??0} candidates in the retrieved scope, not an exhaustive list. Up to 12 routes and 24 expanded subjects.`)} {current.paths!.scan.reasons.length>0?t("取得上限に達した範囲があります。","Some traversal limits were reached."):""}</p>
    {!items?.length&&<p>{t("取得した範囲に表示できる候補はありません。段数・候補の絞り込みを変更できます。","No candidates to display in this retrieved scope. Try another distance or candidate filter.")}</p>}
    {items?.map(item=>{const path=current.paths!.paths.find(p=>p.nodeIds.at(-1)===item.entity.id)!;const pathClaims=new Set(path.claimIds.flat());return <article key={item.entity.id} className={styles.candidateRow}>
     <h4>{item.entity.name}</h4><p className={catalog.note}>{path.nodeIds.map(id=>current.paths!.nodes.find(n=>n.id===id)?.name??id).join(" → ")}</p>
     <small>{item.status==="matched"?t("候補自身の関係条件：適合","Candidate’s relation criteria: matched"):t("現在の関係条件には不適合。Graphへ進む前に条件を変更してください。","Does not match the current relation criteria. Change criteria before opening Graph.")}</small>
     <div className={styles.rowActions}><button onClick={()=>onChoose({entity:item.entity,relation:selection.relation,revision:selection.revision,witness:item.witness,...(item.status!=="matched"?{unmatched:true}:{})})}>{t("この対象に変更","Use this subject")} →</button><button aria-expanded={detail===item.entity.id} onClick={()=>setDetail(detail===item.entity.id?null:item.entity.id)}>{t("到達経路の根拠","Route evidence")} {detail===item.entity.id?"−":"＋"}</button></div>
     {detail===item.entity.id&&<><p className={catalog.note}>{t("候補への到達経路の一例です。候補自身の関係条件の証拠は、対象変更後に確認できます。","One route to this candidate. Evidence for the candidate’s relation criteria is available after selecting it.")}</p>{current.paths!.claims.filter(c=>pathClaims.has(c.id)).map(c=><DiscoveryClaimRow key={c.id} claim={c} nodes={current.paths!.nodes} revision={selection.revision}/>)}</>}
    </article>;})}
   </>}
  </>}
 </section>;
}
