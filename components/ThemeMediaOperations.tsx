"use client";
import {useEffect,useState} from "react";
import type {MediaSlot,MediaPosition,ImageCandidate,MediaSlide} from "../lib/domain/theme-media";
import {positionKey} from "../lib/domain/theme-media";
import ThemeMediaCarousel from "./ThemeMediaCarousel";
import css from "./ThemeMediaOperations.module.css";

type Summary={id:string;revision:number;title:string};
type State={themeId:string;revision:number;latestRevision:number|null;title:string;generation:number;slots:MediaSlot[];targets:(MediaPosition&{label:string})[];imageCandidates:ImageCandidate[];previousPlacements:{revision:number;slotCount:number}[];videoStatus:Record<string,{state:string}>};
const api="/api/site-operations/theme-media";
async function request<T>(url:string,body?:unknown):Promise<T>{
  const response=await fetch(url,body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"}:{cache:"no-store"});
  const value=await response.json();
  if(!response.ok)throw Error(typeof value.error==="string"?value.error:"掲載設定を確認できません。");
  return value;
}
export default function ThemeMediaOperations({en,authorized}:{en:boolean;authorized:boolean}){
  const [open,setOpen]=useState(false);
  if(!authorized)return null;
  return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary>{en?"Theme videos and images":"テーマの映像・画像掲載"}</summary>{open&&<Editor en={en}/>}</details>;
}
function Editor({en}:{en:boolean}){
  const [query,setQuery]=useState(""),[themes,setThemes]=useState<Summary[]>([]),[state,setState]=useState<State>(),[slots,setSlots]=useState<MediaSlot[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[preview,setPreview]=useState<Record<"ja"|"en",MediaSlide[]>>(),[previewLang,setLang]=useState<"ja"|"en">(en?"en":"ja");
  const [newImage,setNewImage]=useState("");
  const [previewTarget,setPreviewTarget]=useState("theme");
  const t=(ja:string,eng:string)=>en?eng:ja;
  useEffect(()=>{
    let active=true;
    const timer=window.setTimeout(()=>{request<{themes:Summary[]}>(api+"?q="+encodeURIComponent(query)).then(v=>{if(active)setThemes(v.themes);}).catch(e=>{if(active)setError(e.message);});},180);
    return ()=>{active=false;clearTimeout(timer);};
  },[query]);
  async function run(fn:()=>Promise<void>){setBusy(true);setMessage("");setError("");try{await fn();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  const load=async(id:string,revision:number)=>{
    const next=await request<State>(api+"?"+new URLSearchParams({themeId:id,revision:String(revision)}));
    setState(next);setSlots(next.slots);setPreview(undefined);setNewImage("");setPreviewTarget("theme");
  };
  const choose=(id:string,revision:number)=>{
    if(state&&JSON.stringify(state.slots)!==JSON.stringify(slots)&&!window.confirm(t("編集中の掲載設定を破棄して移動しますか？","Discard your placement edits and switch?")))return;
    void run(()=>load(id,revision));
  };
  function update(next:MediaSlot[]){setSlots(next);setPreview(undefined);setMessage("");}
  function replace(i:number,slot:MediaSlot){update(slots.map((s,j)=>i===j?slot:s));}
  function move(i:number,step:number){const next=[...slots];[next[i],next[i+step]]=[next[i+step],next[i]];update(next);}
  const isCurrent=state?.latestRevision===state?.revision;
  async function submit(action:"preview"|"save"){
    if(!state)return;
    const payload={action,themeId:state.themeId,revision:state.revision,expectedGeneration:state.generation,slots,requestId:crypto.randomUUID()};
    if(action==="preview"){
      const v=await request<{slides:Record<"ja"|"en",MediaSlide[]>}>(api,payload);setPreview(v.slides);return;
    }
    await request(api,payload);await load(state.themeId,state.revision);setMessage(t("掲載設定を保存しました。","Placements saved."));
  }
  return <div className={css.editor}>
    <label>{t("公開テーマを検索","Find a published theme")}<input value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <div className={css.themes}>{themes.map(s=><button key={s.id} disabled={busy} onClick={()=>choose(s.id,s.revision)}>{s.title}</button>)}</div>
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    {state&&<fieldset disabled={busy}><legend>{state.title} · {state.revision}</legend>
      {state.previousPlacements.length>0&&<nav>{state.previousPlacements.map(p=><button key={p.revision} disabled={p.revision===state.revision} onClick={()=>choose(state.themeId,p.revision)}>{t("版","Revision ")}{p.revision} ({p.slotCount})</button>)}</nav>}
      {!isCurrent&&<p>{t("旧版では既存の掲載を解除できます。","You can remove placements from this edition.")}</p>}
      {slots.map((slot,i)=><div className={css.slot} key={slot.id}>
        <div><strong>{i+1}. {slot.kind==="image"?(state.imageCandidates.find(c=>c.id===slot.imageId)?.images[en?"en":"ja"]?.alt||slot.imageId):"YouTube"}</strong>
          <button onClick={()=>move(i,-1)} disabled={i===0} aria-label={t("前へ","Move up")}>↑</button><button onClick={()=>move(i,1)} disabled={i===slots.length-1} aria-label={t("後へ","Move down")}>↓</button>
          <button onClick={()=>update(slots.filter((_,j)=>j!==i))}>{t("枠を外す","Remove slot")}</button></div>
        {slot.kind==="video"&&<><label>{t("形式","Format")}<select disabled={!isCurrent} value={slot.format} onChange={e=>replace(i,{...slot,format:e.target.value as "landscape"|"short"})}><option value="landscape">{t("横長","Landscape")}</option><option value="short">Shorts</option></select></label>
          {(["ja","en"] as const).map(l=>{const status=state.videoStatus[l+":"+slot.editions[l]?.videoId]?.state;return <label key={l}>{l==="ja"?"日本語":"English"} · YouTube ID<input value={slot.editions[l]?.videoId??""} maxLength={11} onChange={e=>{const editions={...slot.editions};if(e.target.value)editions[l]={videoId:e.target.value};else delete editions[l];replace(i,{...slot,editions});}}/>{status&&<small>{status==="ready"?t("再生可","Playable"):status==="unavailable"?t("公開範囲・埋め込みを確認","Check visibility and embedding"):t("YouTubeと照合できません","Unable to contact YouTube")}</small>}</label>;})}</>}
        <details><summary>{t("掲載位置","Placement")} ({slot.positions.length})</summary>
          {state.targets.map(({label,...p})=><label key={positionKey(p)}><input type="checkbox" checked={slot.positions.some(v=>positionKey(v)===positionKey(p))} onChange={e=>replace(i,{...slot,positions:e.target.checked?[...slot.positions,p]:slot.positions.filter(v=>positionKey(v)!==positionKey(p))})}/>{p.kind==="theme"?"TOP":label}</label>)}</details>
      </div>)}
      {isCurrent&&<div className={css.add}><button onClick={()=>update([...slots,{kind:"video",id:crypto.randomUUID(),format:"landscape",editions:{},positions:[{kind:"theme"}]}])}>{t("動画を追加","Add video")}</button>
        <select aria-label={t("画像候補","Image candidates")} value={newImage} onChange={e=>setNewImage(e.target.value)}><option value="">{t("画像を選択","Select an image")}</option>
          {state.imageCandidates.map(c=><option key={c.id} value={c.id} disabled={!c.eligible}>{c.images[en?"en":"ja"]?.alt||c.id} · {c.origin==="unknown"?t("由来の確認が必要","Origin unconfirmed"):c.origin==="original"?"Plunode":t("外部素材","Licensed source")}</option>)}</select>
        <button disabled={!newImage} onClick={()=>{update([...slots,{kind:"image",imageId:newImage,id:crypto.randomUUID(),positions:[{kind:"theme"}]}]);setNewImage("");}}>{t("画像を追加","Add image")}</button></div>}
      <div><button onClick={()=>void run(()=>submit("preview"))}>{t("掲載プレビュー","Preview placement")}</button> <button onClick={()=>{if(window.confirm(t("この公開テーマの掲載を更新します。限定公開動画も訪問者が視聴できます。保存しますか？","Update this public theme? Visitors can watch included unlisted videos.")))void run(()=>submit("save"));}}>{t("掲載を保存","Save placements")}</button></div>
      {preview&&<><label>{t("表示言語","Preview language")}<select value={previewLang} onChange={e=>setLang(e.target.value as "ja"|"en")}><option value="ja">日本語</option><option value="en">English</option></select></label>
        <label>{t("表示位置","Preview location")}<select value={previewTarget} onChange={e=>setPreviewTarget(e.target.value)}>{state.targets.map(p=><option key={positionKey(p)} value={positionKey(p)}>{p.kind==="theme"?"TOP":p.label}</option>)}</select></label>
        <ThemeMediaCarousel slides={preview[previewLang]} query={new URLSearchParams({themeId:state.themeId,revision:String(state.revision),language:previewLang}).toString()} position={state.targets.find(p=>positionKey(p)===previewTarget)??{kind:"theme"}} language={previewLang} preview/>
        {preview[previewLang].filter(s=>s.kind==="video").map(s=><p key={s.id}>{Object.entries(s.editions).map(([l,e])=>l+" · "+e.title+" · "+e.privacy).join(" / ")}</p>)}</>}
    </fieldset>}
  </div>;
}
