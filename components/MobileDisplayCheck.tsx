"use client";
import {useEffect,useState,useSyncExternalStore,type CSSProperties} from "react";
import {createPortal} from "react-dom";

const subscribe=()=>()=>{};
const enabled=()=>["localhost","127.0.0.1","graph-beta.isinxnisi.com"].includes(location.hostname)&&new URLSearchParams(location.search).get("displayCheck")==="1";
const round=(n:number)=>Math.round(n*10)/10;
function measure(){
 const sample=(el:Element|null)=>{
  if(!el)return null;
  const s=getComputedStyle(el),r=el.getBoundingClientRect();
  const node=el.firstChild;
  let glyph:null|{character:string;rendered:number;canvas:number}=null;
  if(node?.nodeType===Node.TEXT_NODE){
   const value=node.textContent??"",index=value.search(/[一-龯ぁ-んァ-ヶ]/u);
   if(index>=0){
    const range=document.createRange();range.setStart(node,index);range.setEnd(node,index+1);
    const canvas=document.createElement("canvas").getContext("2d");
    if(canvas){canvas.font=s.fontWeight+" "+s.fontSize+" "+s.fontFamily;glyph={character:value[index],rendered:round(range.getBoundingClientRect().width),canvas:round(canvas.measureText(value[index]).width)};}
   }
  }
  return {font:s.fontSize,lineHeight:s.lineHeight,width:round(r.width),height:round(r.height),textSizeAdjust:s.getPropertyValue("-webkit-text-size-adjust"),glyph};
 };
 const v=visualViewport;
 return {
  viewport:{innerWidth,innerHeight,screenWidth:screen.width,screenHeight:screen.height,dpr:devicePixelRatio,visualWidth:v&&round(v.width),visualHeight:v&&round(v.height),scale:v?.scale},
  root:{computed:getComputedStyle(document.documentElement).getPropertyValue("-webkit-text-size-adjust"),inline:document.documentElement.style.getPropertyValue("-webkit-text-size-adjust")},
  title:sample(document.querySelector('[class*="themeHeader"] h2')),
  product:sample(document.querySelector('#explorer-detail article h4')),
  description:sample(document.querySelector('#explorer-detail article [class*="reason"]')),
  userAgent:navigator.userAgent
 };
}
const panel:CSSProperties={position:"fixed",zIndex:10000,bottom:"max(8px,env(safe-area-inset-bottom))",right:8,width:"min(28rem,calc(100vw - 16px))",boxSizing:"border-box",maxHeight:"42dvh",overflow:"auto",padding:10,border:"1px solid #8495a5",borderRadius:8,background:"#fffefa",color:"#223449",boxShadow:"0 3px 18px #0002",font:"12px/1.5 system-ui"};
const button:CSSProperties={padding:"5px 8px",border:"1px solid #b6c5d5",borderRadius:5,background:"#fffefa",color:"#223449",font:"inherit",minHeight:30,cursor:"pointer"};

/** Opt-in beta measurement only. Never reads or sends account/content data. */
export default function MobileDisplayCheck(){
 const active=useSyncExternalStore(subscribe,enabled,()=>false);
 const [baseline,setBaseline]=useState<ReturnType<typeof measure>|null>(null);
 const [open,setOpen]=useState(true),[corrected,setCorrected]=useState(false),[report,setReport]=useState<ReturnType<typeof measure>|null>(null),[copied,setCopied]=useState(false);
 useEffect(()=>{
  if(!active)return;
  const style=document.documentElement.style;
  const before=["-webkit-text-size-adjust","text-size-adjust"].map(key=>({key,value:style.getPropertyValue(key),priority:style.getPropertyPriority(key)}));
  if(corrected)for(const {key} of before)style.setProperty(key,"100%");
  const timer=setTimeout(()=>setReport(measure()),250);
  return()=>{clearTimeout(timer);if(corrected)for(const {key,value,priority}of before){if(value)style.setProperty(key,value,priority);else style.removeProperty(key);}};
 },[active,corrected]);
 if(!active)return null;
 const refresh=()=>{setReport(measure());setCopied(false);};
 return createPortal(<aside style={panel} aria-label="表示の計測">
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
   <strong>表示の計測{corrected?" · 補正100%":" · 現在の設定"}</strong><button style={button} onClick={()=>setOpen(v=>!v)}>{open?"たたむ":"開く"}</button>
  </div>
  {open&&<><p style={{margin:"7px 0"}}>この欄は比較用です。通常の画面には表示されません。</p>
  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}><button style={button} onClick={()=>{if(!corrected)setBaseline(measure());setCorrected(v=>!v);}}>{corrected?"現在の補正に戻す":"文字補正100%と比較"}</button><button style={button} onClick={refresh}>再計測</button><button style={button} onClick={async()=>{const current=measure();setReport(current);try{await navigator.clipboard.writeText(JSON.stringify({baseline,comparison:corrected,...current},null,2));setCopied(true);}catch{setCopied(false);}}}>{copied?"コピーしました":"結果をコピー"}</button></div>
  <pre style={{font:"11px/1.45 monospace",whiteSpace:"pre-wrap",overflowWrap:"anywhere",margin:"8px 0 0"}}>{report?JSON.stringify({comparison:corrected,...report},null,2):"計測中"}</pre></>}
 </aside>,document.body);
}
