"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { claimSummarySchema, entitySummarySchema, type NeighborsResponse } from "../lib/domain/api";
import type { CapsuleDocument, CapsuleNode } from "../lib/domain/capsule-document";
import { fetchNeighbors } from "../lib/client/api";
import { relationLabel, qualificationLabel } from "../lib/client/format";
import { useUiLocale } from "../lib/client/ui-locale";
import { CapsuleModal } from "./CapsuleSurface";
import Icon from "./Icon";
import css from "./CapsuleNeighborPicker.module.css";

export default function CapsuleNeighborPicker({node, document, onAdd, onClose}:{node:CapsuleNode; document:CapsuleDocument; onAdd:(value:NeighborsResponse, claimIds:string[])=>void; onClose:()=>void}) {
  const {locale}=useUiLocale(), t=(ja:string,en:string)=>locale==="en"?en:ja;
  const id=node.origin.kind!=="local"?node.origin.id:"";
  const [value,setValue]=useState<NeighborsResponse|null>(null), latest=useRef<NeighborsResponse|null>(null);
  const [busy,setBusy]=useState(false), [error,setError]=useState(false), controller=useRef<AbortController|null>(null);
  const [query,setQuery]=useState(""), [kind,setKind]=useState(""), [relation,setRelation]=useState("");
  const [filtersOpen,setFiltersOpen]=useState(false), filterId=useId();
  const [selected,setSelected]=useState<string[]>([]);
  const cursors=useRef(new Set<string>());
  const load=useCallback(async () => {
    if(controller.current) return;
    const abort=new AbortController(); controller.current=abort; setBusy(true); setError(false);
    try {
      // Fetch a bounded batch automatically. Very large neighborhoods keep an
      // explicit continuation, and filters always describe their loaded scope.
      for(let page=0;page<10;page++) {
        const prior=latest.current;
        const next=await fetchNeighbors(id,prior?.page.nextCursor??null,abort.signal,null,null,null,null,prior?.revision??null,"id");
        if(abort.signal.aborted)return;
        const nodes=next.nodes.map(n=>entitySummarySchema.parse(n)), claims=next.claims.map(c=>claimSummarySchema.parse(c));
        if(next.centerId!==id || prior?.revision && next.revision!==prior.revision || claims.some(c=>c.subjectId!==id && c.objectId!==id)
          || next.page.hasMore && (!next.page.nextCursor || cursors.current.has(next.page.nextCursor))) throw Error("Invalid neighborhood page");
        const allNodes=[...new Map([...(prior?.nodes??[]),...nodes].map(n=>[n.id,n])).values()];
        if(claims.some(c=>![c.subjectId,c.objectId].every(key=>allNodes.some(n=>n.id===key)))) throw Error("Missing endpoint");
        if(next.page.nextCursor)cursors.current.add(next.page.nextCursor);
        const merged={...next,nodes:allNodes,claims:[...new Map([...(prior?.claims??[]),...claims].map(c=>[c.id,c])).values()]};
        latest.current=merged; setValue(merged);
        if(!next.page.hasMore)break;
      }
    } catch { if(!abort.signal.aborted)setError(true); }
    finally { if(controller.current===abort)controller.current=null; if(!abort.signal.aborted)setBusy(false); }
  },[id]);
  useEffect(()=>{void load();return()=>{controller.current?.abort();controller.current=null;};},[load]); // The host keys each picker by its KG entity.
  const included=new Set(document.relations.flatMap(r=>r.origin.kind==="kg"?[r.origin.id]:[]));
  const candidates=useMemo(()=> {
    const grouped=new Map<string,NeighborsResponse["claims"]>();
    for(const claim of value?.claims??[]) {const key=claim.subjectId===id?claim.objectId:claim.subjectId;grouped.set(key,[...(grouped.get(key)??[]),claim]);}
    return [...grouped].flatMap(([key,claims])=>{const entity=value?.nodes.find(n=>n.id===key);return entity?[{entity,claims}]:[];});
  },[value,id]);
  const normalize=(s:string)=>s.normalize("NFKC").toLocaleLowerCase().trim();
  const relationName=(claim:NeighborsResponse["claims"][number])=>[relationLabel(claim,locale),qualificationLabel(claim,locale)].filter(Boolean).join(" · ");
  const visible=candidates.filter(c=>(!query || normalize(c.entity.name).includes(normalize(query))) && (!kind || c.entity.kind===kind) && (!relation || c.claims.some(claim=>relationName(claim)===relation)));
  const chosen=candidates.filter(c=>selected.includes(c.entity.id));
  const hidden=chosen.filter(c=>!visible.includes(c)).length;
  const labels=[...new Set(candidates.flatMap(c=>c.claims.map(claim=>relationName(claim))))].sort();
  const kinds=[...new Set(candidates.map(c=>c.entity.kind))];
  const kindName=(key:string)=>({person:t("人物","Person"),work:t("作品","Work"),organization:t("組織","Organization"),event:t("出来事","Event")})[key]??key;
  const toggle=(key:string)=>setSelected(s=>s.includes(key)?s.filter(v=>v!==key):[...s,key]);
  return <CapsuleModal wide className={css.dialog} title={t("KGの関係先","KG neighbors")} onClose={onClose}><div className={css.picker}>
    <header className={css.heading}><div><small>{t("関係先から追加","Add connected entities")}</small><h3>{node.title}</h3></div><button data-autofocus aria-label={t("関係先を閉じる","Close neighbors")} onClick={onClose}><Icon name="close"/></button></header>
    <div className={css.filters}>
      <div className={css.searchRow}><label className={css.search}><span className={css.srOnly}>{t("名前で絞り込み","Filter by name")}</span><Icon name="search"/><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={t("関係先の名前","Connected entity name")}/></label><button aria-expanded={filtersOpen} aria-controls={filterId} onClick={()=>setFiltersOpen(v=>!v)}><Icon name="settings"/>{t("条件","Filters")}{(kind||relation)&&<span className={css.filterCount}>{Number(!!kind)+Number(!!relation)}</span>}</button></div>
      <div id={filterId} className={css.advanced} hidden={!filtersOpen}><label>{t("分類","Type")}<select value={kind} onChange={e=>setKind(e.target.value)}><option value="">{t("すべて","All")}</option>{kinds.map(k=><option key={k} value={k}>{kindName(k)}</option>)}</select></label><label>{t("関係","Relation")}<select value={relation} onChange={e=>setRelation(e.target.value)}><option value="">{t("すべて","All")}</option>{labels.map(l=><option key={l}>{l}</option>)}</select></label></div>
    </div>
    <div className={css.scope} role="status"><span>{busy?t(`取得中 · ${candidates.length}件を読み込み済み`,`Loading · ${candidates.length} loaded`):value?.page.hasMore || error?t(`読み込み済みの${candidates.length}件から絞り込み`,`Filtering ${candidates.length} loaded neighbors`):t(`関係先${candidates.length}件を取得済み`,`${candidates.length} neighbors loaded`)} · {t(`${visible.length}件表示`,`${visible.length} shown`)}</span>{(query||kind||relation)&&<button onClick={()=>{setQuery("");setKind("");setRelation("");}}>{t("条件を解除","Clear filters")}</button>}</div>
    {error&&<p role="alert">{t("続きの取得ができませんでした。読み込み済みの候補と選択は保持しています。","Could not load more. Loaded candidates and selections are retained.")}</p>}
    <div className={css.results}>{visible.map(({entity,claims})=>{const exists=claims.every(c=>included.has(c.id)), existingNode=document.nodes.some(n=>n.origin.kind!=="local"&&n.origin.id===entity.id);return <label key={entity.id} className={css.candidate} data-selected={selected.includes(entity.id)} data-included={exists}><input type="checkbox" disabled={exists} checked={selected.includes(entity.id)} onChange={()=>toggle(entity.id)}/><span><strong>{entity.name}</strong><small>{kindName(entity.kind)} · {[...new Set(claims.map(c=>relationName(c)))].join(" / ")}</small>{existingNode&&<small>{exists?t("追加済み","Included"):t("対象は追加済み · 関係を追加","Entity included · add relations")}</small>}</span><span>{claims.length>1?t(`${claims.length}関係`,`${claims.length} relations`):""}</span></label>;})}{!busy&&!visible.length&&<p>{t("条件に合う関係先はありません。","No neighbors match these filters.")}</p>}</div>
    {(value?.page.hasMore||error)&&<button disabled={busy} onClick={()=>void load()}>{t("続きを読み込む","Load more")}</button>}
    <footer className={css.selection}><div><strong>{t(`${chosen.length}件を選択`,`${chosen.length} selected`)}</strong>{hidden>0&&<small>{t(` · うち${hidden}件は現在の条件の外`,` · ${hidden} outside current filters`)}</small>}<div className={css.chips}>{chosen.map(c=><button key={c.entity.id} aria-label={t(`${c.entity.name}の選択を外す`,`Deselect ${c.entity.name}`)} onClick={()=>toggle(c.entity.id)}>{c.entity.name}<Icon name="close"/></button>)}</div></div><button data-variant="primary" disabled={!chosen.length||!value} onClick={()=>value&&onAdd(value,chosen.flatMap(c=>c.claims.filter(claim=>!included.has(claim.id)).map(claim=>claim.id)))}><Icon name="plus"/>{t(`${chosen.length}件をまとめて追加`,`Add ${chosen.length} selected`)}</button></footer>
  </div></CapsuleModal>;
}
