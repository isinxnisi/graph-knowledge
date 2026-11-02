"use client";
import type { z } from "zod";
import type { knowledgeTimeAnnotationSchema } from "../lib/domain/knowledge-foundation";
import { themeTimeLabel } from "../lib/domain/theme-time";
import Icon from "./Icon";
import css from "./CapsuleStudio.module.css";
type Time = z.infer<typeof knowledgeTimeAnnotationSchema>;
export default function CapsuleTimeFields({value,onChange,locale}:{value:Time[];onChange:(value:Time[])=>void;locale:string}){
 const t=(ja:string,en:string)=>locale==="en"?en:ja;
 const patch=(id:string,changes:Record<string,unknown>)=>onChange(value.map(row=>row.id===id?{...row,time:{...row.time,...changes} as Time["time"]}:row));
 return <fieldset className={css.evidenceFields}><legend>{t("年表に表示する時期","Time on the timeline")}</legend>
  {value.map((row,index)=><div key={row.id} className={css.evidenceEditor}>
   {row.time.kind!=="calendar"?<p>{themeTimeLabel(row.time)} · {t("元の時期表現を保持します","Original time expression retained")}</p>:<>
    <label>{t("時期の意味","Time meaning")}<select value={row.time.meaning??"unspecified"} onChange={e=>{const meaning=e.target.value;patch(row.id,{meaning:meaning==="unspecified"?undefined:meaning,...(meaning==="point"?{to:undefined,startLatest:undefined,endEarliest:undefined}:meaning!=="duration"?{startLatest:undefined,endEarliest:undefined}:{})});}}>
     <option value="point">{t("発生時点","Point in time")}</option><option value="duration">{t("続いた期間","Duration")}</option><option value="occurrence-window">{t("この範囲のどこか","Occurrence window")}</option><option value="unspecified">{t("期間か発生時期の幅かは未区別","Range, meaning unspecified")}</option>
    </select></label>
    <div className={css.formColumns}><label>{t("年月日・範囲の始め","Date / lower bound")}<input aria-label={t(`時期${index+1}の始め`,`Time ${index+1} start`)} placeholder="2021 / 2021-12 / 2021-12-25" maxLength={10} value={row.time.from} onChange={e=>patch(row.id,{from:e.target.value})}/></label>
    {row.time.meaning!=="point"&&<label>{t("範囲の終わり","Upper bound")}<input aria-label={t(`時期${index+1}の終わり`,`Time ${index+1} end`)} placeholder="2022-01-04" maxLength={10} value={row.time.to??""} onChange={e=>patch(row.id,{to:e.target.value||undefined})}/></label>}</div>
    {row.time.meaning==="duration"&&<details><summary>{t("開始・終了にも幅がある場合","Uncertain endpoints")}</summary><div className={css.formColumns}><label>{t("開始の最遅","Latest start")}<input value={row.time.startLatest??""} placeholder="2021-12-30" maxLength={10} onChange={e=>patch(row.id,{startLatest:e.target.value||undefined})}/></label><label>{t("終了の最早","Earliest end")}<input value={row.time.endEarliest??""} placeholder="2022-01-02" maxLength={10} onChange={e=>patch(row.id,{endEarliest:e.target.value||undefined})}/></label></div></details>}
    <label>{t("時期の補足","Time label")}<input maxLength={300} value={row.time.label} onChange={e=>patch(row.id,{label:e.target.value})}/></label>
   </>}
   <button type="button" className={css.quietButton} onClick={()=>onChange(value.filter(r=>r.id!==row.id))}><Icon name="minus"/>{t(`時期${index+1}を外す`,`Remove time ${index+1}`)}</button>
  </div>)}
  <button type="button" disabled={value.length>=16} onClick={()=>onChange([...value,{id:crypto.randomUUID(),time:{kind:"calendar",from:"",meaning:"point",label:""}}])}><Icon name="plus"/>{t("時期を追加","Add time")}</button>
  {!value.length&&<p className={css.status}>{t("未指定の関係は、日付を補わずテーマ情報として残ります。","Undated relations remain in the information section; no date is inferred.")}</p>}
 </fieldset>;
}
