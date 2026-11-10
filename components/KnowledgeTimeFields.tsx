"use client";
import type { KnowledgeRecordContent } from "../lib/domain/knowledge-foundation";
import { calendarMeaning } from "../lib/domain/theme-time";
import Icon from "./Icon";
import css from "./CapsuleStudio.module.css";
import timeCss from "./CapsuleTimeFields.module.css";
type Time=KnowledgeRecordContent["times"][number];
export default function KnowledgeTimeFields({value,onChange,locale,guidance=false}:{value:Time[];onChange:(value:Time[])=>void;locale:string;guidance?:boolean}){
 const t=(ja:string,en:string)=>locale==="en"?en:ja;
 const patch=(id:string,changes:Record<string,unknown>)=>onChange(value.map(row=>row.id===id?{...row,time:{...row.time,...changes} as Time["time"]}:row));
 const switchKind=(id:string,kind:Time["time"]["kind"])=>onChange(value.map(row=>row.id!==id?row:{id,time:kind==="calendar"?{kind,from:"",meaning:"point",label:row.time.label}:kind==="cycle"?{kind,axis:"",period:24,from:0,to:0,wrap:false,unit:t("時間","hours"),label:row.time.label}:{kind,axis:"",from:"",coordinateMeaning:"",label:row.time.label}}));
 return <fieldset className={`${css.evidenceFields} ${timeCss.fields}`}><legend>{t("年表に表示する時期","Time on the timeline")}</legend>
  {value.map((row,index)=>{const time=row.time;return <div key={row.id} className={timeCss.entry} role="group" aria-label={t(`時期${index+1}`,`Time ${index+1}`)}>
   <div className={timeCss.heading}><span>{t(`時期${index+1}`,`Time ${index+1}`)}</span><button type="button" className={timeCss.remove} aria-label={t(`時期${index+1}を外す`,`Remove time ${index+1}`)} onClick={()=>onChange(value.filter(r=>r.id!==row.id))}><Icon name="trash"/></button></div>
   <label>{t("時間軸","Time axis")}<select value={time.kind} onChange={e=>switchKind(row.id,e.target.value as Time["time"]["kind"])}><option value="calendar">{t("年月日・時刻","Calendar / clock")}</option><option value="cycle">{t("繰り返す周期","Cycle")}</option><option value="qualitative">{t("順序・段階","Qualitative stages")}</option></select></label>
   {time.kind==="calendar"?<>
    <label>{t("時期の意味","Time meaning")}<select value={calendarMeaning(time)} onChange={e=>{const meaning=e.target.value;patch(row.id,{meaning:meaning==="unclassified-range"?undefined:meaning,...(meaning==="point"?{to:undefined,startLatest:undefined,endEarliest:undefined}:meaning!=="duration"?{startLatest:undefined,endEarliest:undefined}:{})});}}>
     <option value="point">{t("発生時点","Point in time")}</option><option value="duration">{t("続いた期間","Duration")}</option><option value="occurrence-window">{t("この範囲のどこか","Occurrence window")}</option><option value="unclassified-range">{t("日付の範囲だけを記す","Give dates only")}</option>
    </select></label>
    <div className={css.formColumns}><label>{t("年月日・範囲の始め","Date / lower bound")}<input aria-label={t(`時期${index+1}の始め`,`Time ${index+1} start`)} placeholder="2021 / 2021-12 / 2021-12-25T12:20Z" maxLength={32} value={time.from} onChange={e=>patch(row.id,{from:e.target.value})}/></label>
    {calendarMeaning(time)!=="point"&&<label>{t("範囲の終わり","Upper bound")}<input aria-label={t(`時期${index+1}の終わり`,`Time ${index+1} end`)} placeholder="2022-01-04" maxLength={32} value={time.to??""} onChange={e=>patch(row.id,{to:e.target.value||undefined})}/></label>}</div>
    <details><summary>{t("部分期間・時刻・境界の補足","Partial periods, clock and bounds")}</summary><div className={timeCss.details}>
     <p className={css.status}>{t("時刻は T12:20、時区が分かれば Z（UTC）や +09:00 を添えます。時区の省略は未指定のままです。","Use T12:20 for a clock time, with Z (UTC) or +09:00 when known. An omitted offset remains unspecified.")}</p>
     <label>{t("原資料の時期表記（任意）","Source time expression (optional)")}<input value={time.expression??""} maxLength={300} placeholder={t("例：1991年前期／5月頃","For example: early 1991 / around May")} onChange={e=>patch(row.id,{expression:e.target.value||undefined})}/></label>
     <p className={css.status}>{t("前期・頃などはそのまま残し、上の日付には確かめた範囲だけを入れます。境界不明なら年・月までで使えます。","Keep expressions such as ‘early’ or ‘around’. Enter only supported bounds above; a year or month is sufficient when finer bounds are unknown.")}</p>
     {time.meaning==="duration"&&<div className={css.formColumns}><label>{t("開始の最遅（任意）","Latest start (optional)")}<input value={time.startLatest??""} placeholder="2021-12-30" maxLength={32} onChange={e=>patch(row.id,{startLatest:e.target.value||undefined})}/></label><label>{t("終了の最早（任意）","Earliest end (optional)")}<input value={time.endEarliest??""} placeholder="2022-01-02" maxLength={32} onChange={e=>patch(row.id,{endEarliest:e.target.value||undefined})}/></label></div>}
    </div></details>
   </>:time.kind==="cycle"?<>
    <div className={css.formColumns}><label>{t("軸の名前","Axis name")}<input value={time.axis} placeholder={t("例：一日の活動","For example: daily activity")} maxLength={300} onChange={e=>patch(row.id,{axis:e.target.value})}/></label><label>{t("単位","Unit")}<input value={time.unit} maxLength={300} onChange={e=>patch(row.id,{unit:e.target.value})}/></label></div>
    <div className={css.formColumns}><label>{t("一周の長さ","Cycle length")}<input type="number" min="0" step="any" value={time.period} onChange={e=>patch(row.id,{period:Number(e.target.value)})}/></label><label>{t("始めの位置","Start position")}<input type="number" step="any" value={time.from} onChange={e=>patch(row.id,{from:Number(e.target.value)})}/></label><label>{t("終わりの位置","End position")}<input type="number" step="any" value={time.to} onChange={e=>patch(row.id,{to:Number(e.target.value)})}/></label></div>
    <label className={timeCss.check}><input type="checkbox" checked={time.wrap} onChange={e=>patch(row.id,{wrap:e.target.checked})}/>{t("一周の境目をまたぐ","Crosses the cycle boundary")}</label><small className={css.status}>{t("位置は0以上、一周の長さ未満。22→2の夜間などは境目をまたぎます。","Positions start at 0, below the cycle length. A night from 22 to 2 crosses the boundary.")}</small>
   </>:<>
    <label>{t("軸の名前","Axis name")}<input value={time.axis} placeholder={t("例：制作の段階","For example: production stages")} maxLength={300} onChange={e=>patch(row.id,{axis:e.target.value})}/></label>
    <label>{t("段階が表すもの","What the stages mean")}<input value={time.coordinateMeaning} placeholder={t("例：構想から完成までの進み具合","For example: progress from concept to completion")} maxLength={300} onChange={e=>patch(row.id,{coordinateMeaning:e.target.value})}/></label>
    <div className={css.formColumns}><label>{t("段階・始め","Stage / start")}<input value={time.from} maxLength={300} placeholder={t("例：構想","For example: concept")} onChange={e=>patch(row.id,{from:e.target.value})}/></label><label>{t("終わりの段階（任意）","End stage (optional)")}<input value={time.to??""} maxLength={300} placeholder={t("例：完成","For example: complete")} onChange={e=>patch(row.id,{to:e.target.value||undefined})}/></label></div>
   </>}
   <label>{t(time.kind==="calendar"?"時期の補足（任意）":"この時期の説明","Time label")}<input placeholder={guidance?t("例：初版の発売日／この活動が続いた期間","For example: first edition release date / duration of this activity"):undefined} maxLength={300} value={time.label} onChange={e=>patch(row.id,{label:e.target.value})}/></label>
  </div>;})}
  <button type="button" disabled={value.length>=16} onClick={()=>onChange([...value,{id:crypto.randomUUID(),time:{kind:"calendar",from:"",meaning:"point",label:""}}])}><Icon name="plus"/>{t("時期を追加","Add time")}</button>
  {!value.length&&<p className={css.status}>{guidance?t("日付が分からないときは、追加しなくて大丈夫です。","Leave time unspecified when the date is unknown."):t("時期を定めない情報として残ります。日付は補いません。","Remains undated; no date is inferred.")}</p>}
 </fieldset>;
}
