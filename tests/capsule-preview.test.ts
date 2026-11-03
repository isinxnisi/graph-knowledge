import {it,expect,vi} from "vitest";
import {writeFile} from "node:fs/promises";
import type {MemberCapsule} from "../lib/domain/member-capsule";
vi.mock("server-only",()=>({}));
import {capsuleShareImage} from "../lib/server/capsule-share-image";
import {capsulePreviewModel} from "../lib/domain/capsule-preview";
import {captureKnowledgeCapsule} from "../lib/client/capsule-knowledge";
import {capsuleKnowledgeSnapshotSchema} from "../lib/domain/capsule-knowledge";
const nodes=Array.from({length:9},(_,i)=>({key:String(i),title:["PLUTO","浦沢直樹","長崎尚志","手塚治虫","手塚眞","MASTERキートン","作品を読む視点","MONSTER","関連する作品"][i],description:"",badge:"",origin:{kind:"local" as const}}));
const capsule={id:"10000000-0000-4000-8000-000000000001",schemaVersion:2,revision:2,createdAt:"2026-10-30T00:00:00Z",updatedAt:"2026-10-30T00:00:00Z",content:{dataset:"demo",title:"PLUTO ― 作品と作者のつながり",note:"作品の背景をたどり、作者たちの関係と資料を一枚の図にまとめました。",language:"ja",entityIds:[],claimIds:[],document:{schemaVersion:1,nodes,relations:nodes.slice(1).map(n=>({key:"edge"+n.key,source:"0",target:n.key,label:"関係する",note:"",origin:{kind:"local"}})),texts:[],evidence:[],unresolvedClaimIds:[],layout:{positions:{},pan:{x:0,y:0},zoom:1}}}} as MemberCapsule;
it("カードは実在する接続だけを選び、タイトルと対象の一部を1200×630に描画する",async()=>{
 const model=capsulePreviewModel(capsule);expect(model.nodes).toHaveLength(7);expect(model.nodes[0].key).toBe("0");expect(model.totalNodes).toBe(9);
 for(const edge of model.edges)expect(capsule.content.document!.relations).toContainEqual(edge);
 const response=await capsuleShareImage(capsule),bytes=Buffer.from(await response.arrayBuffer());
 expect(response.headers.get("cache-control")).toBe("private, no-store");expect(bytes.subarray(1,4).toString()).toBe("PNG");expect(bytes.readUInt32BE(16)).toBe(1200);expect(bytes.readUInt32BE(20)).toBe(630);
 if(process.env.CAPSULE_PREVIEW_PROOF)await writeFile(process.env.CAPSULE_PREVIEW_PROOF,bytes);
},30000);

it("複数の中心がある図では、接続していない線が中央の対象を横切らない",()=>{
 const document=capsule.content.document!;
 const branched={...capsule,content:{...capsule.content,document:{...document,nodes:document.nodes.slice(0,6),relations:[
  ...document.relations.slice(0,3),
  {key:"branch4",source:"1",target:"4",label:"関係する",note:"",origin:{kind:"local" as const}},
  {key:"branch5",source:"1",target:"5",label:"関係する",note:"",origin:{kind:"local" as const}},
 ]}}};
 const model=capsulePreviewModel(branched);
 expect(model.nodes.every(n=>Math.hypot(n.x-300,n.y-245)>170)).toBe(true);
 const points=new Map(model.nodes.map(n=>[n.key,n]));
 for(const edge of model.edges){
  const a=points.get(edge.source)!,b=points.get(edge.target)!;
  for(const n of model.nodes.filter(n=>n.key!==a.key&&n.key!==b.key)){
   const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((n.x-a.x)*dx+(n.y-a.y)*dy)/(dx*dx+dy*dy)));
   expect(Math.hypot(n.x-a.x-t*dx,n.y-a.y-t*dy)).toBeGreaterThan(45);
  }
 }
});

it("年表カードは点と期間を区別し、未定時期・別軸を混同せず、保存した断面だけを描く",async()=>{
 const version={revision:1,createdAt:"2026-11-03T00:00:00.000Z",reason:"固定した公開版"};
 const records=[
  {id:"point",content:{kind:"note",assertion:"宇宙望遠鏡を打ち上げた",times:[{id:"t",time:{kind:"calendar",from:"2021-12-25",label:"打ち上げ"}}]}},
  {id:"period",content:{kind:"note",assertion:"遮熱膜の展開工程",times:[{id:"t",time:{kind:"calendar",from:"2021-12-28",to:"2022-01-04",meaning:"duration",label:"停止日を含む工程"}}]}},
  {id:"window",content:{kind:"note",assertion:"観測の準備についての記録",times:[{id:"t",time:{kind:"calendar",from:"2022-01-03",to:"2022-01-08",meaning:"occurrence-window",label:"この間のどこか"}}]}},
  {id:"context",content:{kind:"note",assertion:"時期を置かないテーマの説明"}},
  {id:"other",content:{kind:"note",assertion:"別の暦軸の出来事",times:[{id:"t",time:{kind:"calendar",from:"1901"}}]}},
 ];
 const snapshot=capsuleKnowledgeSnapshotSchema.parse({schemaVersion:1,initialView:"timeline",entities:[],sources:[{...version,id:"s",content:{title:"検証資料",bibliography:"固定版"}}],mappings:[],records:records.map(r=>({...version,...r,content:{...r.content,evidence:[{id:"cite",source:{id:"s",revision:1},locator:"本文"}]}})),timeline:{version:1,axes:[{id:"primary",kind:"calendar",label:"打ち上げから展開まで"},{id:"separate",kind:"calendar",label:"別軸"}],placements:[...records.slice(0,3).map(r=>({recordId:r.id,timeId:"t",axisId:"primary"})),{recordId:"other",timeId:"t",axisId:"separate"}],insets:[]}});
 const value=captureKnowledgeCapsule({snapshot,title:"Webbが宇宙でひらくまで",view:"timeline"});
 const cap={...capsule,content:{...capsule.content,title:value.title,note:"打ち上げ、展開、その工程を根拠と一緒に読む。",document:value.document}};
 const model=capsulePreviewModel(cap),timeline=model.timeline!;
 expect(model.nodes).toEqual([]);expect(timeline.untimed).toBe(1);expect(timeline.total).toBe(4);
 expect(timeline.items.map(r=>r.meaning)).toEqual(["point","duration","occurrence-window"]);
 expect(timeline.items.some(r=>r.title.includes("別の暦軸"))).toBe(false);
 expect(timeline.ticks.map(r=>r.label)).toContain("2022-01-04");
 const response=await capsuleShareImage(cap),bytes=Buffer.from(await response.arrayBuffer());expect(bytes.readUInt32BE(16)).toBe(1200);expect(bytes.readUInt32BE(20)).toBe(630);
 if(process.env.CAPSULE_TIMELINE_PREVIEW_PROOF)await writeFile(process.env.CAPSULE_TIMELINE_PREVIEW_PROOF,bytes);
 value.document!.knowledge!.initialView="graph";expect(capsulePreviewModel(cap).timeline).toBeNull();
},30000);
