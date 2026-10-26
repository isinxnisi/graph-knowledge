"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useUiLocale } from "../lib/client/ui-locale";
import { allRelations, otherWorks, presetApplication, canonicalTargetCriteria, TARGET_HISTORY_PAGES, type ConnectionsWorkspace, type ConnectionSelection } from "../lib/domain/discovery-connections";
import { presetCatalog, type CatalogPreset } from "../lib/domain/discovery-preset-catalog";
import { useDiscoveryTargets } from "../lib/client/use-discovery-targets";
import { fetchDatasetRevision, fetchEntity, CLIENT_REQUEST_TIMEOUT_MS } from "../lib/client/api";
import { fetchSubjectMatches } from "../lib/client/discovery-subject-matches";
import type { RelationCondition } from "../lib/domain/relation-conditions";
import { discoveryRelationHref, loadDiscoverySelectionEvidence } from "../lib/client/discovery-relation-navigation";
import { entityDetailSchema, type EntitySummary, type ClaimSummary } from "../lib/domain/api";
import { CONTRIBUTION_ROLE_IDS } from "../lib/domain/contribution";
import { PREDICATE_KEYS } from "../lib/domain/predicates";
import { contributionLabels } from "../lib/i18n/contribution";
import { explorationLabels } from "../lib/i18n/exploration";
import { relationSummary } from "../lib/i18n/relation-condition";
import { freeRelation } from "../lib/client/relation-state";
import { useDiscoveryScroll } from "../lib/client/use-discovery-scroll";
import DiscoverySubjectCandidates from "./DiscoverySubjectCandidates";
import DiscoveryPresetBrowser from "./DiscoveryPresetBrowser";
import DiscoveryClaimRow from "./DiscoveryClaimRow";
import Icon from "./Icon";
import catalog from "./DiscoveryPresetBrowser.module.css";
import styles from "./DiscoveryConnections.module.css";
import list from "./DiscoveryList.module.css";
export default function DiscoveryConnections({value,onChange,onGraph,onCheckpoint,body}:{value:ConnectionsWorkspace;onChange:(value:ConnectionsWorkspace)=>void;onGraph:(value:ConnectionsWorkspace)=>void;onCheckpoint:(value:ConnectionsWorkspace)=>void;body:RefObject<HTMLDivElement|null>}){
 const {locale}=useUiLocale(),en=locale==="en",t=(ja:string,eng:string)=>en?eng:ja;
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[composing,setComposing]=useState(false),[evidenceState,setEvidence]=useState({key:"",open:false});
 const [records,setRecords]=useState<{key:string;nodes:EntitySummary[];claims:ClaimSummary[];partial:boolean}|null>(null);
 const [evidenceFailure,setEvidenceError]=useState<string|null>(null);
 const candidatesKey=JSON.stringify([value.selected,value.selectedDepth??2]),[settledCandidates,setSettledCandidates]=useState("");
 const candidatesSettled=useCallback(()=>setSettledCandidates(candidatesKey),[candidatesKey]);
 const pending=useRef<AbortController|null>(null),latest=useRef(value);
 const parsed=canonicalTargetCriteria(value.criteria),query=useDiscoveryTargets(value.criteria,value.cursors,value.cache,value.step==="targets",composing);
 const {capture,prepare}=useDiscoveryScroll(value,body,onCheckpoint,value.step==="selected"?settledCandidates===candidatesKey:value.step!=="targets"||!parsed.success||!!query.result||!!query.error);
 useLayoutEffect(()=>{latest.current=value;},[value]);
 const update=(next:ConnectionsWorkspace)=>{const saved=capture(next);latest.current=saved;onChange(saved);};
 useEffect(()=>()=>{pending.current?.abort();pending.current=null;},[]);
 useEffect(()=>{if(query.result&&latest.current.cache!==query.result)onChange(capture({...latest.current,cache:query.result}));},[query.result,onChange,capture]);
 const switchTo=(step:ConnectionsWorkspace["step"])=>{pending.current?.abort();pending.current=null;setBusy(false);setError(null);setSettledCandidates("");prepare(step);update({...value,step});};
 const changeCriteria=(patch:Partial<ConnectionsWorkspace["criteria"]>)=>update({...value,criteria:{...value.criteria,nameTarget:value.criteria.nameTarget??"subject",...patch},cursors:[null],cache:null,selected:null,activePreset:null});
 const href=(selection:ConnectionSelection)=>(en?"/en":"")+discoveryRelationHref(selection);
 // Save the return destination without painting it before the browser leaves.
 const persistGraph=(selection:ConnectionSelection)=>{onGraph(capture({...latest.current,step:"selected" as const,selected:selection}));};
 // The search snapshot stays intact for Back. This explicit control edits the
 // selected exploration, including candidates and its Graph handoff together.
 const changeExplorationRelation=async(relation:RelationCondition|null)=>{
  const selection=latest.current.selected;if(!selection)return;
  pending.current?.abort();setError(null);
  if(!relation){pending.current=null;setBusy(false);update({...latest.current,selected:{...selection,relation:null,witness:null,unmatched:false}});return;}
  const controller=new AbortController();pending.current=controller;setBusy(true);
  const timer=setTimeout(()=>controller.abort(),CLIENT_REQUEST_TIMEOUT_MS);
  try{
   const matches=await fetchSubjectMatches([selection.entity.id],relation,selection.revision,controller.signal),item=matches.items[0];
   if(item.status!=="matched"){setError(t("この対象には元の条件が成立しません。現在の条件を維持します。対象検索から別の対象を選べます。","The original criteria do not match this subject. Current criteria are preserved; choose another subject in subject search."));return;}
   if(!controller.signal.aborted&&latest.current.selected===selection)update({...latest.current,selected:{entity:item.entity,relation,revision:selection.revision,witness:item.witness}});
  }catch{if(pending.current===controller)setError(t("条件を確認できませんでした。変更前の探索を保持しています。","Could not verify the criteria. Your previous exploration is preserved."));}
  finally{clearTimeout(timer);if(pending.current===controller)setBusy(false);}
 };
 const selectPreset=async(preset:CatalogPreset,changeSubject=false)=>{
  pending.current?.abort();setError(null);const application=presetApplication(preset);
  if(application.binding==="legacy")return;
  const next={...value,activePreset:preset.id,subjectTrail:[],selectedDepth:2,criteria:{q:"",kind:preset.kind,relation:application.relation,nameTarget:"subject" as const},cursors:[null],cache:null,selected:null} satisfies ConnectionsWorkspace;
  if(application.binding==="unbound"||changeSubject){prepare("targets",0);update({...next,step:"targets"});return;}
  const controller=new AbortController();pending.current=controller;setBusy(true);
  try{const revision=await fetchDatasetRevision(controller.signal),entity=entityDetailSchema.parse((await fetchEntity(application.id!,controller.signal)).entity),after=await fetchDatasetRevision(controller.signal);
   if(entity.id!==application.id||entity.kind!==preset.kind||revision.dataset!=="public-kg"||revision.revision!==after.revision)throw Error("Unconfirmed preset");
   if(controller.signal.aborted)return;const selection={entity,relation:application.relation,revision:revision.revision!,witness:null};const snapshot=capture({...next,step:"selected" as const,selected:selection});onGraph(snapshot);window.location.assign(href(selection));
  }catch{if(!controller.signal.aborted)setError(t("公開記録を確認できませんでした。再試行できます。","Could not verify public records. Please retry."));}finally{if(!controller.signal.aborted)setBusy(false);}
 };
 const displayed=parsed.success?(query.result??query.previous):undefined;
 const selected=value.selected,selectionKey=JSON.stringify(selected),evidence=evidenceState.key===selectionKey&&evidenceState.open,evidenceError=evidenceFailure===selectionKey;
 useEffect(()=>{if(!evidence||!selected)return;const controller=new AbortController();void loadDiscoverySelectionEvidence(selected,controller.signal).then(data=>{if(!controller.signal.aborted)setRecords({key:selectionKey,...data});}).catch(()=>{if(!controller.signal.aborted)setEvidenceError(selectionKey);});return()=>controller.abort();},[evidence,selectionKey,selected]);
 const [revisionCheck,setRevisionCheck]=useState<{key:string;ok:boolean}>({key:"",ok:false});
 useEffect(()=>{if(value.step!=="selected"||!selected)return;const controller=new AbortController();void fetchDatasetRevision(controller.signal).then(r=>{if(!controller.signal.aborted)setRevisionCheck({key:selectionKey,ok:r.dataset==="public-kg"&&r.revision===selected.revision});}).catch(()=>{if(!controller.signal.aborted)setRevisionCheck({key:selectionKey,ok:false});});return()=>controller.abort();},[value.step,selectionKey,selected]);
 const switcher=<div className={catalog.modeSwitch} role="group" aria-label={t("探索の進め方","Discovery stages")}>{(["presets","targets","selected"] as const).map(step=><button key={step} aria-pressed={value.step===step} disabled={step==="selected"&&!selected} onClick={()=>switchTo(step)}>{step==="presets"?t("プリセットを探す","Find presets"):step==="targets"?t("対象を探す","Find subjects"):t("選択した対象","Selected subject")}</button>)}</div>;
 if(value.step==="presets")return <DiscoveryPresetBrowser filters={value.filters} onChange={filters=>update({...value,filters})} onSelect={p=>void selectPreset(p)} onChangeSubject={p=>void selectPreset(p,true)} onNames={()=>switchTo("targets")} busy={busy} error={error} switcher={switcher}/>;
 const relation=value.criteria.relation,roles=relation?.contributionRoles??null;
 const selectedReady=!!selected&&!selected.unmatched&&revisionCheck.key===selectionKey&&revisionCheck.ok;
 const chooseSubject=(s:ConnectionSelection)=>{pending.current?.abort();pending.current=null;setBusy(false);setError(null);prepare("selected",0);update({...value,selected:s,selectedDepth:2,subjectTrail:[...(value.subjectTrail??[]),...(selected?[selected]:[])].slice(-10)});};
 const selectedGraph=selectedReady&&selected?<a data-testid="discovery-relation-graph" className={styles.graph} href={href(selected)} onClick={()=>persistGraph(selected)}><Icon name="graph"/>{t("Graphで探索する","Explore in Graph")} <Icon name="arrow"/></a>:<p className={catalog.note} role="status">{selected?.unmatched?t("以前の条件に適合しない対象です。「すべての関係」に切り替えて探索できます。","This saved subject does not match its criteria. Switch to All relations to explore."):revisionCheck.key===selectionKey?t("公開版を確認できませんでした。対象検索へ戻り再取得してください。","Could not confirm the public revision. Return to subject search and retry."):t("公開版を確認中…","Checking the public revision…")}</p>;
 return <div className={`${catalog.catalog} ${styles.flow}`} data-testid="discovery-connections" data-stage={value.step}>
  <aside className={catalog.left}><section className={`${catalog.filters} ${styles.targetFilters}`} aria-label={t("対象と関係の条件","Subject and relation criteria")}>
   {value.step==="targets"?<>
    <div className={catalog.filterHeading}><h3>{t("対象の検索条件","Subject criteria")}</h3><button onClick={()=>{changeCriteria({q:"",kind:null});}}>{t("名前・種類を解除","Clear name and kind")}</button></div>
    <div className={catalog.options} role="group" aria-label={t("名前の照合先","Match name against")}><button className={catalog.chip} aria-pressed={(value.criteria.nameTarget??"subject")==="subject"} onClick={()=>changeCriteria({nameTarget:"subject"})}>{t("対象自身の名前","Subject name")}</button>{(value.criteria.relation?.type==="pattern"&&value.criteria.relation.pattern.revision!==1&&(value.criteria.kind===null||value.criteria.kind==="work")||value.criteria.nameTarget==="contributor")&&<button className={catalog.chip} aria-pressed={value.criteria.nameTarget==="contributor"} onClick={()=>changeCriteria({nameTarget:"contributor"})}>{t("制作担当者の名前","Contributor name")}</button>}</div>
    <label className={styles.name}>{value.criteria.nameTarget==="contributor"?t("関係する制作担当者の名前・別名（任意）","Contributor name or alias (optional)"):t("対象自身の名前・別名（任意）","Subject name or alias (optional)")}<input aria-label={value.criteria.nameTarget==="contributor"?t("制作担当者の名前・別名","Contributor name or alias"):t("対象の名前・別名","Subject name or alias")} value={value.criteria.q} maxLength={100} placeholder={t("名前なしでも探せます","No name needed")} onChange={e=>changeCriteria({q:e.target.value})} onCompositionStart={()=>setComposing(true)} onCompositionEnd={()=>setComposing(false)}/></label>
    <fieldset><legend>{t("対象の種類","Subject kind")}</legend><div className={catalog.options}>{([[null,"指定なし","Any"],["person","人物","People"],["work","作品","Works"],["organization","組織","Organizations"],["event","出来事","Events"]] as const).map(([kind,ja,eng])=><button key={kind??"any"} className={catalog.chip} aria-pressed={value.criteria.kind===kind} onClick={()=>changeCriteria({kind})}>{t(ja,eng)}</button>)}</div></fieldset>
    <div className={`${catalog.filterHeading} ${styles.relationHeading}`}><h3>{t("追いたい関係性","Relations to follow")}</h3><button onClick={()=>changeCriteria({relation:null})}>{t("関係条件を解除","Clear relation criteria")}</button></div>
    <fieldset><legend>{t("探し方","Relation mode")}</legend><div className={catalog.options}><button className={catalog.chip} aria-pressed={!relation} onClick={()=>changeCriteria({relation:null})}>{t("関係を絞らない","No relation filter")}</button><button className={catalog.chip} aria-pressed={relation?.type==="adjacent"} onClick={()=>changeCriteria({relation:relation?.type==="pattern"?freeRelation(relation):allRelations()})}>{t("一段の関係","Single relations")}</button><button className={catalog.chip} aria-pressed={relation?.type==="pattern"} onClick={()=>changeCriteria({relation:relation?.type==="pattern"?relation:otherWorks(roles,2)})}>{t("同じつくり手の別作品","Same creator, other works")}</button></div></fieldset>
    {relation?.type==="pattern"&&<section>
     <label><input type="checkbox" checked={relation.pattern.revision===3} disabled={value.criteria.kind!==null&&value.criteria.kind!=="work"} onChange={e=>changeCriteria({relation:e.target.checked?{...otherWorks(null,2),pattern:{id:"other-works",revision:3},stepRoles:[roles,roles]}:otherWorks(null,2)})}/>{t("段ごとにRoleを指定（作品を起点）","Specify roles per step (work origin)")}</label>
     {relation.pattern.revision===3&&<><p className={catalog.note}>{t("起点作品側と別作品側へ別々に適用します。共通Role・一段の関係へ切り替えると段別指定は解除されます。","Roles apply separately to the origin and other work. Switching to shared roles or single relations clears these step filters.")}</p>
      {relation.stepRoles!.map((selected,step)=><fieldset key={step}><legend>{step===0?t("起点作品側","Origin work"):t("別作品側","Other work")}</legend><div className={catalog.options}>
       <button className={catalog.chip} aria-pressed={selected===null} onClick={()=>{const next:NonNullable<typeof relation.stepRoles>=[...relation.stepRoles!];next[step]=null;changeCriteria({relation:{...relation,stepRoles:next}});}}>{t("限定なし","Any role")}</button>
       {CONTRIBUTION_ROLE_IDS.map(role=><button key={role} className={catalog.chip} aria-pressed={selected?.includes(role)??false} onClick={()=>{const next:NonNullable<typeof relation.stepRoles>=[...relation.stepRoles!];next[step]=selected===null?[role]:selected.includes(role)?selected.filter(r=>r!==role):[...selected,role];changeCriteria({relation:{...relation,stepRoles:next}});}}>{contributionLabels(locale).roles[role]}</button>)}
      </div></fieldset>)}
     </>}
    </section>}
    {relation?.type==="adjacent"&&<fieldset><legend>{t("見る関係","Relation types")}</legend><div className={catalog.options}><button className={catalog.chip} aria-pressed={relation.predicates===null} onClick={()=>changeCriteria({relation:{...relation,predicates:null}})}>{t("すべて","All")}</button>{PREDICATE_KEYS.map(predicate=><button key={predicate} className={catalog.chip} aria-pressed={relation.predicates?.includes(predicate)??false} disabled={predicate==="CONTRIBUTED_TO"&&roles!==null&&!!relation.predicates?.includes(predicate)} onClick={()=>changeCriteria({relation:{...relation,predicates:relation.predicates===null?[predicate]:relation.predicates.includes(predicate)?relation.predicates.filter(p=>p!==predicate):[...relation.predicates,predicate]}})}>{explorationLabels(locale).predicates[predicate]}</button>)}</div></fieldset>}
    {relation&&!(relation.type==="pattern"&&relation.pattern.revision===3)&&(relation.type==="pattern"||relation.predicates===null||relation.predicates.includes("CONTRIBUTED_TO"))&&<fieldset><legend>{t("制作Role","Production roles")}</legend><div className={catalog.options}><button className={catalog.chip} aria-pressed={roles===null} onClick={()=>changeCriteria({relation:{...relation,contributionRoles:null}})}>{t("限定なし","Any role")}</button>{CONTRIBUTION_ROLE_IDS.map(role=><button key={role} data-target-role={role} className={catalog.chip} aria-pressed={roles?.includes(role)??false} onClick={()=>changeCriteria({relation:{...relation,contributionRoles:roles===null?[role]:roles.includes(role)?roles.filter(r=>r!==role):[...roles,role]}})}>{contributionLabels(locale).roles[role]}</button>)}</div><p className={catalog.note}>{relation.type==="pattern"?t("両段それぞれに適用。役割0選択は該当なしです。","Applied to both claims. Selecting no roles matches nothing."):t("Roleは制作のClaimだけに適用。他の関係には影響しません。","Roles filter production claims only; other relation types are unaffected.")}</p></fieldset>}
    {relation&&<fieldset><legend>{t("記録の肯否","Claim polarity")}</legend><div className={catalog.options}>{(["all-records","affirmed"] as const).map(polarity=><button className={catalog.chip} key={polarity} aria-pressed={relation.polarity===polarity} disabled={relation.type==="pattern"&&polarity==="all-records"} onClick={()=>{if(relation.type==="adjacent")changeCriteria({relation:{...relation,polarity}});}}>{polarity==="affirmed"?t("肯定のみ","Affirmed only"):t("否定も含む","Include negative claims")}</button>)}</div></fieldset>}
    {relation?.type==="pattern"&&relation.pattern.revision!==3&&<p className={catalog.note}>{t("作品 ← 制作担当者 → 別作品。作品、または異なる2作品に関わった人物を探します。両段の肯定記録が必要です。","Work ← contributor → another work. Find works or contributors to two distinct works, with affirmed Claims on both steps.")}</p>}
   </>:selected&&<>
    <div className={styles.subjectIdentity}><span>{t("ここからつながりを探す","DISCOVER FROM")}</span><h3>{selected.entity.name}</h3><p>{selected.entity.description}</p></div>
    <div className={styles.selectedActions}>{selectedGraph}</div>
    <section className={styles.explorationCriteria} aria-label={t("この探索の関係条件","This exploration’s relation criteria")}>
     <h4>{t("探索する関係","Relations to explore")}</h4>
     {relation?<div className={catalog.options} role="group" aria-label={t("探索条件を切り替える","Switch exploration criteria")}><button className={catalog.chip} aria-pressed={!!selected.relation} disabled={busy||!!selected.relation} onClick={()=>void changeExplorationRelation(relation)}>{t("選んだ関係条件","Selected criteria")}</button><button className={catalog.chip} aria-pressed={!selected.relation} disabled={busy||!selected.relation} onClick={()=>void changeExplorationRelation(null)}>{t("すべての関係","All relations")}</button></div>:null}
     <p className={styles.condition}>{selected.relation?relationSummary(selected.relation,locale):t("すべての関係・Role・肯否の記録","All relation types, roles and claim polarities")}</p>
     <p className={catalog.note}>{t("候補とGraphに適用。対象検索の条件は保持します。","Applies to candidates and Graph. Subject search keeps its original criteria.")}</p>
     {busy&&<p className={catalog.note} role="status">{t("条件を確認中…","Verifying criteria…")}</p>}
     {error&&<p className={styles.notice} role="alert">{error}</p>}
    </section>
    {!!value.subjectTrail?.length&&<button className={styles.back} onClick={()=>{pending.current?.abort();pending.current=null;setBusy(false);setError(null);update({...value,selected:value.subjectTrail!.at(-1)!,subjectTrail:value.subjectTrail!.slice(0,-1)});}}>← {t("前に選んだ対象へ戻る","Back to previous subject")}</button>}
   </>}
   {value.step==="targets"&&<button className={styles.back} onClick={()=>switchTo("presets")}>← {t("プリセット検索へ戻る","Back to preset search")}</button>}
  </section></aside>
  <section className={catalog.results} aria-label={value.step==="targets"?t("探索する対象の検索結果","Subject search results"):t("接点からの探索","Explore through connections")}>
   {switcher}
   {value.step==="targets"?<>
    <div className={catalog.intro}><span>FIND YOUR STARTING POINT</span><h3>{t("どこから、辿ってみますか。","Where will your curiosity begin?")}</h3><p>{t("条件に合う人物・作品・組織そのものを表示します。名前の入力は任意です。","These are subjects matching your criteria, not relation records. A name is optional.")}</p></div>
    {value.activePreset&&<p className={styles.preset}>{presetCatalog.find(p=>p.id===value.activePreset)?.title[en?1:0]}</p>}
    {!parsed.success&&<div className={styles.notice} role="alert">{t("対象の種類・名前の照合先と関係条件の組合せを確認してください。対応していない条件を自動解除しません。","Check the combination of subject kind, name target and relation criteria. Unsupported criteria are not silently removed.")}</div>}
    {query.error&&<div className={styles.notice} role="alert"><p>{query.conflict?t("公開版が変わりました。条件を保って先頭から再検索してください。","The public revision changed. Restart this search with the same criteria."):t("検索を確認できませんでした。0件とは判定していません。","Search could not be confirmed; this is not a zero-result search.")}</p><button onClick={()=>{update({...value,cursors:[null],cache:null});query.retry();}}>{t("再検索","Retry search")}</button></div>}
    <div className={catalog.count} role="status">{query.loading?t("条件に合う対象を検索中…","Finding matching subjects…"):query.result?t(`このページ ${query.result.items.length}対象 · 総数未集計`,`${query.result.items.length} subjects on this page · total not counted`):""}</div>
    <div className={styles.targetRows} aria-busy={query.loading} inert={!query.result} aria-hidden={!query.result||undefined} data-stale={!query.result||undefined}>{displayed?.items.map(item=>{const selection={entity:item.entity,relation:displayed!.criteria.relation,revision:displayed!.revision,witness:item.match.status==="matched"?item.match.witness:null};return <article className={`${styles.targetRow} ${list.row}`} key={item.entity.id} data-target-id={item.entity.id}><div className={list.information}><span className={styles.entityIcon}><Icon name={item.entity.kind==="person"?"person":item.entity.kind==="organization"?"organization":item.entity.kind==="event"?"event":"book"}/></span><div className={list.copy}><h4>{item.entity.name}</h4><p>{item.entity.description}</p><small>{item.match.status==="matched"?t("指定した関係条件の成立証拠あり","Verified match for these relation criteria"):t("関係条件なしの対象","No relation criteria")}</small></div></div><div className={list.actions}><button className={list.secondary} onClick={()=>{prepare("selected",0);update({...value,step:"selected",selected:selection,selectedDepth:2,subjectTrail:[],cache:query.result!});}}>{t("この対象から探す","Explore this subject")} <Icon name="arrow"/></button><a className={list.primary} href={href(selection)} onClick={()=>persistGraph(selection)}><Icon name="graph"/>{t("Graphで探索","Explore in Graph")} <Icon name="external"/></a></div></article>;})}</div>
    {query.result&&!query.result.items.length&&<div className={catalog.empty}><h4>{t("この条件に合う対象はありません。","No subjects match these criteria.")}</h4><p>{t("公開KGのこの版での検索結果です。条件は左側から自由に変更できます。","This is a result for the current public revision. You can change any criterion on the left.")}</p></div>}
    {query.result&&<nav className={styles.pages} aria-label={t("対象検索のページ","Subject search pages")}><button disabled={value.cursors.length===1||query.loading} onClick={()=>update({...value,cursors:value.cursors.slice(0,-1),cache:null})}>{t("前へ","Previous")}</button><span>{value.cursors.length}</span><button disabled={!query.result.page.hasMore||query.loading||value.cursors.length>=TARGET_HISTORY_PAGES} onClick={()=>update({...value,cursors:[...value.cursors,query.result!.page.nextCursor],cache:null})}>{t("次へ","Next")}</button></nav>}
    {value.cursors.length>=TARGET_HISTORY_PAGES&&query.result?.page.hasMore&&<p className={catalog.note}>{t("この検索のページ保持上限です。名前・種類などで範囲を絞って再検索できます。","This search reached its page-history limit. Narrow the name or kind and search again.")}</p>}
   </>:selected&&<>
    <nav className={styles.stageBack} aria-label={t("前のステップへ戻る","Return to an earlier stage")}><button onClick={()=>switchTo("targets")}>← {t("対象検索へ戻る","Back to subject search")}</button><button onClick={()=>switchTo("presets")}>← {t("プリセット検索へ戻る","Back to preset search")}</button></nav>
    <DiscoverySubjectCandidates key={selected.entity.id+selected.revision} selection={selected} disabled={busy||!selectedReady} graphHref={href} onGraph={()=>onGraph(capture(latest.current))} onChoose={chooseSubject} depth={value.selectedDepth??2} onDepthChange={selectedDepth=>update({...value,selectedDepth})} onSettled={candidatesSettled}/>
    {selected.witness?.version===2&&selected.witness.matchContext.q&&<p className={catalog.note}>{selected.witness.matchContext.nameTarget==="contributor"?t(`対象検索：制作担当者名「${selected.witness.matchContext.q}」で一致。Graphはこの名前に限定されません。`,`Matched contributor name “${selected.witness.matchContext.q}”. Graph is not limited to this name.`):t(`対象名「${selected.witness.matchContext.q}」で一致。`,`Matched subject name “${selected.witness.matchContext.q}”.`)}</p>}
    {!selected.unmatched&&<button className={styles.evidenceToggle} aria-expanded={evidence} onClick={()=>{setEvidenceError(null);setEvidence({key:selectionKey,open:!evidence});}}>{selected.witness?t("成立証拠と根拠を確認","Review matching evidence"):t("関係の記録を確認","Review relation records")} {evidence?"−":"＋"}</button>}
    {!selected.unmatched&&evidence&&(evidenceError?<p className={styles.notice} role="alert">{t("根拠を確認できませんでした。再検索できます。","Could not verify evidence. You can retry the subject search.")}</p>:records?.key===selectionKey?<><p className={catalog.note}>{selected.witness?t("検索に一致した成立証拠です。全Claimの一覧ではありません。","This is the matching witness, not every Claim."):t("先頭ページの関係の記録です。続きはGraphから探索できます。","First-page relation records. Continue exploring in Graph.")}</p>{records.claims.map(claim=><DiscoveryClaimRow key={claim.id} claim={claim} nodes={records.nodes} revision={selected.revision}/>)}</>:<p role="status">{t("根拠を確認中…","Verifying evidence…")}</p>)}
   </>}
   {(query.result||selected)&&<p className={catalog.note}>PUBLIC KG · {query.result?.revision??selected?.revision}</p>}
  </section>
 </div>;
}
