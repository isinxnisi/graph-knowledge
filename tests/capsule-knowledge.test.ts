import { beforeAll, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import type { KnowledgeSnapshot } from "../lib/domain/knowledge-foundation";
import { captureKnowledgeCapsule, capsuleKnowledgeProjection, capsuleRelationTimes, withCapsuleTimeline } from "../lib/client/capsule-knowledge";
import { capsuleDocumentSchema, capsuleReferences } from "../lib/domain/capsule-document";
import { memberCapsuleContentSchema } from "../lib/domain/member-capsule";
import { removeCapsuleElements, capsuleHistory, recordCapsule, undoCapsule } from "../lib/client/capsule-editor";
import examples from "../docs/API_RESPONSE_EXAMPLES.json";
import { captureCapsule } from "../lib/client/capsule-editor";
import { emptyGraph } from "../lib/client/graph-state";
import { relationLabel } from "../lib/client/format";
import type { NeighborsResponse } from "../lib/domain/api";
import { capsulePresentation } from "../lib/client/capsule-presentation";

beforeAll(()=>{if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto});});
const version={revision:1,createdAt:"2026-11-03T00:00:00.000Z",reason:"登録"};
const source={...version,id:"source:nasa",content:{title:"NASA",url:"https://www.nasa.gov/",bibliography:"",language:"en"}};
const evidence=[{id:"cite",source:{id:source.id,revision:1},locator:"本文",excerpt:"原文",stance:"support" as const}];
const relation={...version,id:"record:launch",content:{kind:"relation" as const,subjectId:"entity:rocket",objectId:"entity:webb",assertion:"打ち上げたという原文",relation:"打ち上げた",polarity:"affirmed" as const,scope:"",times:[{id:"time:date",time:{kind:"calendar" as const,from:"2021-12-25",label:"打上げ"}}],evidence}};
const note={...version,id:"record:context",content:{...relation.content,kind:"note" as const,subjectId:null,objectId:null,relation:"",assertion:"時期なしの解説",times:[]}};
const period={...note,id:"record:period",content:{...note.content,assertion:"年表だけの期間",times:[{id:"time:period",time:{kind:"calendar" as const,from:"2021",to:"2022",meaning:"duration" as const,label:"期間"}}]}};
const snapshot:KnowledgeSnapshot={schemaVersion:1,initialView:"split",entities:["entity:rocket","entity:webb"].map(id=>({...version,id,content:{name:id,kind:"作品",description:"元の説明",aliases:[],language:"ja"}})),sources:[source],records:[relation,note,period],mappings:[],timeline:{version:1,axes:[{id:"calendar",kind:"calendar",label:"日付"}],placements:[{recordId:relation.id,timeId:"time:date",axisId:"calendar"},{recordId:period.id,timeId:"time:period",axisId:"calendar"}],insets:[]}};
const capture=()=>captureKnowledgeCapsule({snapshot,title:"Webb"});
it("新IDを旧KGのUUID参照へ偽装せず、固定版・時期なし情報を保存できる",()=>{
 const c=capture();expect(c.entityIds).toEqual([]);expect(c.claimIds).toEqual([]);
 expect(c.document!.nodes).toHaveLength(2);expect(c.document!.relations[0].origin.kind).toBe("knowledge");
 expect(c.document!.knowledge!.snapshot).toEqual(snapshot);expect(memberCapsuleContentSchema.safeParse({dataset:c.dataset,title:c.title,note:c.note,language:c.language,entityIds:[],claimIds:[],document:c.document}).success).toBe(true);
 expect(capsuleReferences(c.document!)).toEqual({entityIds:[],claimIds:[]});
});
it("図の名称・説明・関係編集を年表へ反映しても、原文と資料版を変更しない",()=>{
 const c=capture(),doc=c.document!;const baseline=JSON.stringify(doc.knowledge!.snapshot);
 doc.nodes[0].title="表示用の名前";doc.nodes[0].description="作者の説明";doc.relations[0].label="作者の関係名";doc.relations[0].note="作者の注記";
 const projected=capsuleKnowledgeProjection(doc)!;expect(projected.entities[0].content.name).toBe("表示用の名前");expect(projected.records[0].content.relation).toBe("作者の関係名");expect(projected.records[0].content.assertion).toBe("作者の注記");expect(projected.records[0].content.evidence).toEqual(evidence);
 expect(JSON.stringify(doc.knowledge!.snapshot)).toBe(baseline);expect(capsulePresentation(doc,"ja").relations[doc.relations[0].key].label).toBe("作者の関係名");
});
it("関係除外で対応行と配置だけを外し、年表専用期間と説明を巻き添えにしない",()=>{
 const c=capture(),doc=removeCapsuleElements(c.document!,[c.document!.nodes[0].key]),p=capsuleKnowledgeProjection(doc)!;
 expect(p.records.map(r=>r.id)).toEqual([note.id,period.id]);expect(p.timeline!.placements).toHaveLength(1);expect(doc.knowledge!.snapshot.records).toHaveLength(3);
});
it("Undo・再parse・表示切替で固定断面と年表を保持する",()=>{
 const c=capture(),edited=structuredClone(c);edited.document!.knowledge!.initialView="timeline";
 const restored=undoCapsule(recordCapsule(capsuleHistory(c),edited)).present;
 expect(restored.document!.knowledge!.initialView).toBe("split");expect(capsuleDocumentSchema.parse(JSON.parse(JSON.stringify(restored.document))).knowledge!.snapshot).toEqual(snapshot);
});
it("年表だけの内容に架空Entity・辺を作らない",()=>{
 const c=captureKnowledgeCapsule({snapshot:{...snapshot,entities:[],records:[note,period],timeline:undefined},title:"年表のみ",view:"timeline"});
 expect(c.document!.nodes).toEqual([]);expect(c.document!.relations).toEqual([]);expect(capsuleKnowledgeProjection(c.document!)!.records).toHaveLength(2);
});
it("欠落した資料版・端点・元の版・重複参照を拒否する",()=>{
 const c=capture(),d=c.document!;
 for(const mutate of [(x:typeof d)=>{x.knowledge!.snapshot.sources=[];},(x:typeof d)=>{x.relations[0].target=x.relations[0].source;},(x:typeof d)=>{if(x.nodes[0].origin.kind==="knowledge")x.nodes[0].origin.revision=2;},(x:typeof d)=>{x.relations.push({...x.relations[0],key:crypto.randomUUID()});}]){const next=structuredClone(d);mutate(next);expect(capsuleDocumentSchema.safeParse(next).success).toBe(false);}
});
it("独自の関係追加は時期を捏造せず年表外の情報に反映する",()=>{
 const doc=capture().document!;doc.relations.push({key:crypto.randomUUID(),source:doc.nodes[0].key,target:doc.nodes[1].key,label:"私の仮説",note:"独自注記",origin:{kind:"local",polarity:"uncertain"}});
 const p=capsuleKnowledgeProjection(doc)!,added=p.records.at(-1)!;
 expect(added.content.assertion).toBe("独自注記");expect(added.content.polarity).toBe("uncertain");expect(added.content.times).toEqual([]);expect(added.content.evidence).toEqual([]);expect(doc.knowledge!.snapshot.records).toHaveLength(3);
});
it("元の関係図の位置を文書keyへ対応づけ、視点を引き継ぐ",()=>{
 const c=captureKnowledgeCapsule({snapshot,title:"保持",graphView:{positions:{"entity:rocket":{x:42,y:70}},pan:{x:3,y:4},zoom:.7,center:{x:10,y:20},viewport:{width:800,height:600},initialLayoutDone:true}});
 expect(c.document!.layout.positions[c.document!.nodes[0].key]).toEqual({x:42,y:70});expect(c.document!.layout.center).toEqual({x:10,y:20});expect(c.document!.layout.zoom).toBe(.7);
});

it("同じ資料の異なる版を区別して保持し、重複した同版だけを拒否する",()=>{
 const c=capture(),doc=c.document!;doc.knowledge!.snapshot.sources.push({...source,revision:2,content:{...source.content,title:"改訂版"}});
 doc.knowledge!.snapshot.records[0].content.evidence.push({...evidence[0],id:"cite-v2",source:{id:source.id,revision:2}});
 expect(capsuleDocumentSchema.safeParse(doc).success).toBe(true);
 doc.knowledge!.snapshot.sources.push(structuredClone(source));expect(capsuleDocumentSchema.safeParse(doc).success).toBe(false);
});

it("原記録の時期を保持したままCapsule独自の時期で年表を投影し、明示解除できる",()=>{
 const doc=capture().document!,r=doc.relations[0];
 const baseline=structuredClone(doc.knowledge!.snapshot);
 expect(capsuleRelationTimes(doc,r)).toEqual(relation.content.times);
 r.times=[{id:"authored-time",time:{kind:"calendar",from:"2022",to:"2023",meaning:"occurrence-window",label:"作者の解釈"}}];
 const p=capsuleKnowledgeProjection(capsuleDocumentSchema.parse(doc))!;
 expect(p.records[0].content.times).toEqual(r.times);expect(p.timeline!.placements.some(x=>x.timeId==="time:date")).toBe(false);expect(p.timeline!.placements.some(x=>x.timeId==="authored-time")).toBe(true);
 expect(doc.knowledge!.snapshot).toEqual(baseline);
 r.times=[];expect(capsuleKnowledgeProjection(doc)!.records[0].content.times).toEqual([]);
 expect(capsuleKnowledgeProjection(doc)!.timeline!.placements.some(x=>x.recordId===relation.id)).toBe(false);
});
it("通常Graphから任意の年表を追加し、独自関係の期間と時期なし情報を保存できる",()=>{
 const captured=capture().document!;
 const doc=withCapsuleTimeline({...captured,knowledge:undefined,nodes:captured.nodes.map(n=>({...n,origin:{kind:"local" as const}})),relations:captured.relations.map(r=>({...r,origin:{kind:"local" as const},times:[{id:"time",time:{kind:"calendar" as const,from:"1991",to:"1993",meaning:"duration" as const,label:"期間"}}]}))});
 expect(capsuleDocumentSchema.safeParse(doc).success).toBe(true);
 const projected=capsuleKnowledgeProjection(doc)!;expect(projected.records).toHaveLength(1);expect(projected.records[0].content.times[0].time).toMatchObject({from:"1991",to:"1993"});expect(projected.entities.map(e=>e.content.name)).toEqual(doc.nodes.map(n=>n.title));expect(projected.timeline!.placements).toHaveLength(1);expect(doc.knowledge!.snapshot.records).toEqual([]);
 doc.relations[0].times=[];expect(capsuleKnowledgeProjection(doc)!.records[0].content.times).toEqual([]);
});
it("時期の不正日付・逆転範囲・重複ID・添付なしを保存schemaで拒否する",()=>{
 const doc=capture().document!;doc.relations[0].times=[{id:"time",time:{kind:"calendar",from:"2021-02-30",meaning:"point",label:""}}];
 expect(capsuleDocumentSchema.safeParse(doc).success).toBe(false);
 doc.relations[0].times=[{id:"time",time:{kind:"calendar",from:"2022",to:"2021",meaning:"duration",label:""}}];expect(capsuleDocumentSchema.safeParse(doc).success).toBe(false);
 doc.relations[0].times=[{id:"time",time:{kind:"calendar",from:"2021",meaning:"point",label:""}}];expect(capsuleDocumentSchema.safeParse(doc).success).toBe(true);doc.relations[0].times.push(doc.relations[0].times[0]);expect(capsuleDocumentSchema.safeParse(doc).success).toBe(false);
});

it("既存KGの関係名が空の編集値でも具体的な役割・否定を年表情報で失わない",()=>{
 const page=examples.neighbors as NeighborsResponse,claim={...page.claims[0],polarity:'denied' as const};const graph={...emptyGraph(),nodes:Object.fromEntries(page.nodes.map(n=>[n.id,n])),claims:{[claim.id]:claim}};
 const value=captureCapsule(graph,null,'demo','既存KG');const doc=withCapsuleTimeline(value.document!);expect(doc.relations[0].label).toBe('');
 const p=capsuleKnowledgeProjection(doc)!;expect(p.records[0].content.relation).toBe(relationLabel(claim,'ja'));expect(p.records[0].content.polarity).toBe('denied');expect(p.records[0].content.times).toEqual([]);
});
