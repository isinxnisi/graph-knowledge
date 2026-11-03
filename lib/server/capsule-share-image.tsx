import "server-only";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { MemberCapsule } from "../domain/member-capsule";
import { capsulePreviewModel,previewExcerpt } from "../domain/capsule-preview";
let font:Promise<Buffer>|undefined;
export async function capsuleShareImage(capsule:MemberCapsule){
  const data=await(font??=readFile(path.join(process.cwd(),"app/fonts/BIZUDPMincho-OG.woff")));
  const model=capsulePreviewModel(capsule),points=new Map(model.nodes.map(n=>[n.key,n]));
  return new ImageResponse(<div style={{display:"flex",width:1200,height:630,background:"#f5f6f3",color:"#213b51",padding:42,gap:30}}>
    <div style={{display:"flex",position:"absolute",inset:20,border:"1px solid #d5e0e5",borderRadius:22}}/>
    <div style={{display:"flex",width:460,flexDirection:"column",justifyContent:"space-between",padding:"18px 8px"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,color:"#28689a",fontSize:23}}><span style={{display:"flex",border:"1px solid #a9c3d5",borderRadius:25,padding:"6px 14px",fontSize:18}}>Capsule</span><span>Plunode</span></div>
      <div style={{display:"flex",flexDirection:"column",gap:25}}><div style={{fontSize:44,lineHeight:1.35,wordBreak:"break-word"}}>{previewExcerpt(model.title,48)}</div>{model.description&&<div style={{fontSize:20,lineHeight:1.6,color:"#526c7e",wordBreak:"break-word"}}>{previewExcerpt(model.description,90)}</div>}</div>
      <div style={{display:"flex",gap:14,fontSize:18,color:"#637c8e"}}><span>{model.timeline?`${model.timeline.total} の時期情報`:`${model.totalNodes} の対象`}</span><span>·</span><span>{model.totalRelations} の関係</span></div>
    </div>
    <div style={{display:"flex",width:600,height:546,position:"relative",background:"#fbfcfa",borderRadius:20,border:"1px solid #dce5e9"}}>
      {model.timeline ? <>
        <div style={{display:"flex",position:"absolute",top:22,left:24,fontSize:17,color:"#526c7e"}}>{previewExcerpt(model.timeline.axis,26)}</div>
        <svg width="600" height="490" viewBox="0 0 600 490" style={{position:"absolute",top:0,left:0}}>
          <line x1="140" x2="140" y1="64" y2="440" stroke="#cedbe1" strokeWidth="1"/>
          {model.timeline.ticks.map(t=><circle key={t.label} cx="140" cy={t.y} r="3" fill="#6b8295"/>)}
          {model.timeline.items.map((item,i)=>{
            const point=item.y===item.end,uncertain=item.meaning==="occurrence-window"||item.meaning==="unclassified-range",color=point?"#ac7339":uncertain?"#81989d":"#397e89";
            return <g key={item.id}>
              {!point&&<g>
                <line x1={item.x} x2={item.x} y1={item.startLatest??item.y} y2={item.wrap?416:item.endEarliest??item.end} stroke={color} strokeWidth="3" strokeDasharray={uncertain?"3 4":undefined}/>
                {item.wrap&&<line x1={item.x} x2={item.x} y1="76" y2={item.end} stroke={color} strokeWidth="3"/>}
                {item.startLatest!==undefined&&<line x1={item.x} x2={item.x} y1={item.y} y2={item.startLatest} stroke={color} strokeWidth="2" strokeDasharray="2 3"/>}
                {item.endEarliest!==undefined&&<line x1={item.x} x2={item.x} y1={item.endEarliest} y2={item.end} stroke={color} strokeWidth="2" strokeDasharray="2 3"/>}
              </g>}
              <circle cx={item.x} cy={item.y} r={point?5:3} fill={point?color:"#fbfcfa"} stroke={color} strokeWidth="2"/>
              {!point&&<line x1={item.x-4} x2={item.x+4} y1={item.end} y2={item.end} stroke={color} strokeWidth="2"/>}
              <path d={`M ${item.x+6} ${item.y} L 226 ${76+i*100} L 238 ${76+i*100}`} fill="none" stroke={color} strokeWidth="1"/>
            </g>;
          })}
        </svg>
        {model.timeline.ticks.map(t=><div key={t.label} style={{display:"flex",position:"absolute",left:20,top:t.y-8,width:108,justifyContent:"flex-end",fontSize:14,color:"#6b8295"}}>{previewExcerpt(t.label,13)}</div>)}
        {model.timeline.items.map((item,i)=><div key={item.id} style={{display:"flex",position:"absolute",left:246,top:62+i*100,width:326,flexDirection:"column",gap:9}}>
          <div style={{display:"flex",fontSize:20,lineHeight:1.4,wordBreak:"break-word"}}>{previewExcerpt(item.title,25)}</div>
          <div style={{display:"flex",fontSize:13,lineHeight:1.5,color:"#637c8e",wordBreak:"break-word"}}>{previewExcerpt(item.label,40)}</div>
        </div>)}
        {!model.timeline.items.length&&<div style={{display:"flex",margin:"auto",fontSize:24,color:"#637c8e"}}>テーマの情報を、図と一緒に読む。</div>}
      </> : <>
      <svg width="600" height="490" viewBox="0 0 600 490" style={{position:"absolute",top:0,left:0}}>{model.edges.map(e=>{const a=points.get(e.source)!,b=points.get(e.target)!;return <line key={e.key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={e.origin.kind==="local"?"#63839b":"#9db5c7"} strokeWidth="2"/>;})}</svg>
      {model.nodes.map((n,i)=><div key={n.key} style={{display:"flex",position:"absolute",left:n.x-88,top:n.y-36,width:176,height:72,alignItems:"center",justifyContent:"center",textAlign:"center",padding:8,border:`${i===0?2:1}px solid ${i===0?"#4c82a8":"#abc0cf"}`,borderRadius:n.shape==="circle"||!n.shape&&n.origin.kind==="kg"&&n.origin.snapshot.kind==="person"?40:12,background:n.origin.kind==="local"?"#fffefa":i===0?"#e5f0f5":"#f1f6fa",fontSize:19,lineHeight:1.35,wordBreak:"break-word"}}>{previewExcerpt(n.title,16)}</div>)}
      {!model.nodes.length&&<div style={{display:"flex",margin:"auto",fontSize:26,color:"#637c8e"}}>考えをまとめ、つながりを共有する。</div>}
      </>}
      <div style={{display:"flex",position:"absolute",bottom:20,left:24,right:24,justifyContent:"space-between",fontSize:15,color:"#738896"}}><span>{model.timeline?`年表の一部${model.timeline.untimed?` · 時期のない情報 ${model.timeline.untimed}件`:""}`:model.totalNodes>model.nodes.length?"関係図の一部":"Capsuleの関係図"}</span><span>開いて、図と根拠を読む →</span></div>
    </div>
  </div>,{width:1200,height:630,fonts:[{name:"Editorial",data,style:"normal",weight:400}],headers:{"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow, noarchive","Referrer-Policy":"no-referrer"}});
}
