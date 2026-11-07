import { expect,it } from "vitest";
import type { KnowledgeSnapshot } from "../lib/domain/knowledge-foundation";
import { captureKnowledgeCapsule,capsuleKnowledgeProjection } from "../lib/client/capsule-knowledge";
import { planCapsuleKnowledgeUpdate,sameCapsuleUpdate } from "../lib/client/capsule-knowledge-updates";
import { capsuleUpdateQuerySchema,capsuleUpdateResponseSchema,type CapsuleUpdateResponse } from "../lib/domain/capsule-updates";
import { capsuleHistory,recordCapsule,undoCapsule } from "../lib/client/capsule-editor";
const version={revision:1,createdAt:"2026-11-03T00:00:00.000Z",reason:"登録"};
const snapshot:KnowledgeSnapshot={schemaVersion:1,initialView:"split",entities:["a","b"].map(id=>({...version,id,content:{name:id,description:"説明",kind:"person",aliases:[],language:"ja"}})),sources:[{...version,id:"s",content:{title:"資料",url:null,bibliography:"初版",language:"ja"}}],mappings:[],records:[{...version,id:"r",content:{kind:"relation",subjectId:"a",objectId:"b",assertion:"原文",relation:"支援した",polarity:"affirmed",scope:"",times:[{id:"date",time:{kind:"calendar",from:"2020",label:"年"}}],evidence:[{id:"e",source:{id:"s",revision:1},locator:"本文",excerpt:"原文",stance:"support"}]}}],timeline:{version:1,axes:[{id:"calendar",kind:"calendar",label:"年"}],placements:[{recordId:"r",timeId:"date",axisId:"calendar"}],insets:[]}};
const capture=()=>captureKnowledgeCapsule({snapshot,title:"保存した図",theme:{...version,id:"theme",content:{title:"テーマ",description:"説明",recordPins:[{id:"r",revision:1}],entityPins:[],sourcePins:[],mappingPins:[],initialView:"split"}}});
function response():CapsuleUpdateResponse{const next=structuredClone(snapshot);next.entities[0].revision=2;next.entities[0].content.name="新しい名前";next.records[0].revision=2;next.records[0].content.assertion="訂正した原文";next.records[0].content.relation="観測を支援した";next.records[0].content.times[0].time={kind:"calendar",from:"2021",label:"訂正年"};return {generation:"g2",snapshot:next,unavailable:[]} satisfies CapsuleUpdateResponse;}
it("captures Theme original and translation revisions, and imports only selected translation updates",()=>{
 const d=capture().document!,theme=d.knowledge!.snapshot.theme!;
 const translation={id:"translation:theme",revision:1,target:{kind:"theme" as const,id:theme.id,revision:theme.revision,field:"title" as const},language:"en",text:"Theme",originalText:"テーマ",originalHash:"a".repeat(64),createdAt:version.createdAt,reason:"訳文"};
 d.knowledge!.snapshot.translations=[translation];const next:CapsuleUpdateResponse={generation:"g",snapshot:{...structuredClone(d.knowledge!.snapshot),translations:[{...translation,revision:2,text:"Revised theme translation"}]},unavailable:[]};
 const plan=planCapsuleKnowledgeUpdate(d,next);expect(plan.changes.map(c=>c.kind)).toEqual(["translation"]);expect(plan.document.knowledge!.snapshot.translations?.[0].revision).toBe(1);
 const picked=planCapsuleKnowledgeUpdate(d,next,false,[translation.id]);expect(picked.document.knowledge!.snapshot.translations?.[0].revision).toBe(2);expect(d.knowledge!.snapshot.translations[0].revision).toBe(1);
});
it("does not move a fixed old translation onto a changed Theme original",()=>{const d=capture().document!,theme=d.knowledge!.snapshot.theme!;d.knowledge!.snapshot.translations=[{id:"translation:theme",revision:1,target:{kind:"theme",id:theme.id,revision:theme.revision,field:"title"},language:"en",text:"Theme",originalText:theme.content.title,originalHash:"a".repeat(64),createdAt:version.createdAt,reason:"訳文"}];const next:CapsuleUpdateResponse={generation:"g",snapshot:structuredClone(d.knowledge!.snapshot),theme:{...theme,revision:2,content:{...theme.content,title:"新しいテーマ"}},unavailable:[]};delete next.snapshot.translations;const plan=planCapsuleKnowledgeUpdate(d,next,true);expect(plan.document.knowledge!.snapshot.translations).toEqual([]);expect(plan.changes.find(c=>c.kind==="translation")?.after).toBeNull();});
it("訂正を三方比較して未編集値だけを更新し、独自の空値・時期解除・配置を保つ",()=>{
 const c=capture(),d=c.document!,original=structuredClone(d),r=d.relations[0];d.nodes[0].title="作者の名前";d.nodes[0].description="";d.nodes[0].shape="diamond";r.note="";r.times=[];d.layout.positions[d.nodes[0].key]={x:112,y:345};const layout=structuredClone(d.layout);
 const imported=planCapsuleKnowledgeUpdate(d,response());
 expect(imported.document.nodes[0]).toMatchObject({key:d.nodes[0].key,title:"作者の名前",description:"",shape:"diamond",origin:{revision:2}});
 expect(imported.document.relations[0]).toMatchObject({key:r.key,label:"観測を支援した",note:"",times:[],origin:{revision:2}});
 expect(imported.document.layout).toEqual(layout);expect(imported.document.knowledge!.snapshot.records[0].content.assertion).toBe("訂正した原文");
 expect(d.knowledge!.snapshot).toEqual(original.knowledge!.snapshot);expect(imported.changes.map(c=>c.kind)).toEqual(["record","entity"]);
 expect(capsuleKnowledgeProjection(imported.document)!.records[0].content.times).toEqual([]);
 const undo=undoCapsule(recordCapsule(capsuleHistory(c),{...c,document:imported.document})).present;expect(undo.document).toEqual(d);
});
it("新しい端点を参照しても既存ノードの位置と識別を変えない",()=>{
 const d=capture().document!,next=response();next.snapshot.entities.push({...snapshot.entities[0],id:"c",content:{...snapshot.entities[0].content,name:"新しい対象"}});next.snapshot.records[0].content.objectId="c";
 const p=planCapsuleKnowledgeUpdate(d,next).document;expect(p.nodes).toHaveLength(3);expect(p.nodes.slice(0,2).map(n=>n.key)).toEqual(d.nodes.map(n=>n.key));expect(p.relations[0].target).toBe(p.nodes[2].key);
});
it("除外した関係を新しいテーマ版で復活させず、新規関係だけ追加する",()=>{
 const d=capture().document!;d.relations=[];const next=response();next.snapshot.records.push({...next.snapshot.records[0],id:"r2"});next.theme={...version,id:"theme",revision:2,content:{title:"新テーマ",description:"",recordPins:next.snapshot.records.map(r=>({id:r.id,revision:r.revision})),entityPins:[],sourcePins:[],mappingPins:[],initialView:"split"}};
 const plan=planCapsuleKnowledgeUpdate(d,next,true);expect(plan.excluded).toBe(1);expect(plan.document.relations.map(r=>r.origin.kind==="knowledge"&&r.origin.id)).toEqual(["r2"]);expect(plan.document.knowledge!.excludedRecordIds).toEqual(["r"]);expect(plan.document.knowledge!.themeRecordIds).toEqual(["r","r2"]);
 expect(capsuleKnowledgeProjection(plan.document)!.records.map(r=>r.id)).toEqual(["r2"]);expect(planCapsuleKnowledgeUpdate(plan.document,next,true).changes).toEqual([]);
});
it("テーマからの除外は未編集の辺を外し、作者の編集がある辺とその資料版を残す",()=>{
 const d=capture().document!,next=response();next.snapshot.records=[];next.snapshot.sources=[];next.snapshot.entities=[];delete next.snapshot.timeline;
 next.theme={...version,id:"theme",revision:2,content:{title:"新テーマ",description:"",recordPins:[{id:"other",revision:1}],entityPins:[],sourcePins:[],mappingPins:[],initialView:"graph"}};
 expect(planCapsuleKnowledgeUpdate(d,next,true).document.relations).toHaveLength(0);
 d.relations[0].note="自分の注記";const kept=planCapsuleKnowledgeUpdate(d,next,true);expect(kept.retained).toEqual(["r"]);expect(kept.document.relations).toHaveLength(1);expect(kept.document.knowledge!.snapshot.sources).toEqual(snapshot.sources);expect(kept.document.knowledge!.snapshot.records).toEqual(snapshot.records);expect(kept.document.knowledge!.themeRecordIds).toEqual([]);
 expect(planCapsuleKnowledgeUpdate(kept.document,next,true).changes).toEqual([]);
});
it("同じ資料の新旧の版を混同せず、時期が訂正された際に存在しない配置を残さない",()=>{
 const d=capture().document!,next=response();next.snapshot.records[0].content.evidence[0].source.revision=2;next.snapshot.sources.push({...next.snapshot.sources[0],revision:2,content:{...next.snapshot.sources[0].content,bibliography:"第二版"}});next.snapshot.records[0].content.times=[];delete next.snapshot.timeline;
 const p=planCapsuleKnowledgeUpdate(d,next).document;expect(p.knowledge!.snapshot.sources.map(s=>s.revision)).toEqual([1,2]);expect(p.knowledge!.snapshot.timeline!.placements).toEqual([]);expect(capsuleUpdateResponseSchema.safeParse(next).success).toBe(true);
});
it("非公開の取得元や別テーマは取り込まず、別の公開世代だけの更新は無視する",()=>{
 const d=capture().document!,next=response();expect(()=>planCapsuleKnowledgeUpdate(d,{...next,unavailable:[{kind:"record",id:"r"}]})).toThrow();expect(()=>planCapsuleKnowledgeUpdate(d,next,true)).toThrow();expect(sameCapsuleUpdate(next,{...next,generation:"unrelated"})).toBe(true);expect(capsuleUpdateQuerySchema.safeParse({recordIds:Array(401).fill("r"),entityIds:[]}).success).toBe(false);expect(capsuleUpdateQuerySchema.safeParse({recordIds:[],entityIds:[],includeTheme:true}).success).toBe(false);
});
