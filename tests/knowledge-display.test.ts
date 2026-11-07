import {expect,it} from "vitest";
import {knowledgeDisplaySnapshot,knowledgeDisplayText} from "../lib/domain/knowledge-display";
import {knowledgeDisplayTranslationsQuerySchema,type KnowledgeTranslationVersion} from "../lib/domain/knowledge-translation";
import {knowledgeRecordContentSchema,knowledgeSourceContentSchema,type KnowledgeSnapshot} from "../lib/domain/knowledge-foundation";
import {captureKnowledgeCapsule} from "../lib/client/capsule-knowledge";
import {capsulePresentation} from "../lib/client/capsule-presentation";
import {buildKnowledgePublishedRecord} from "../lib/domain/knowledge-publication";
import {knowledgeCanvas} from "../lib/client/knowledge-canvas";
const version={revision:1,createdAt:"2026-11-08T00:00:00Z",reason:"検証"};
const target={kind:"entity" as const,id:"rocket",revision:1,field:"name" as const};
const translation:KnowledgeTranslationVersion={...version,id:"translation:rocket",target,language:"en",text:"Rocket",originalText:"ロケット",originalHash:"a".repeat(64)};
const relationTranslation:KnowledgeTranslationVersion={...translation,id:"translation:launch",target:{kind:"record",id:"launch",revision:1,field:"relation"},originalText:"打ち上げた",text:"launched"};
const assertionTranslation:KnowledgeTranslationVersion={...translation,id:"translation:assertion",target:{kind:"record",id:"launch",revision:1,field:"assertion"},originalText:"ロケットが打ち上げた",text:"The rocket launched it"};
const snapshot:KnowledgeSnapshot={schemaVersion:1,initialView:"graph",entities:["rocket","webb"].map(id=>({...version,id,content:{name:id==="rocket"?"ロケット":"Webb",kind:"work",description:"",aliases:[],language:"ja"}})),sources:[{...version,id:"source",content:knowledgeSourceContentSchema.parse({title:"NASA",bibliography:"公開資料"})}],records:[{...version,id:"launch",content:knowledgeRecordContentSchema.parse({kind:"relation",subjectId:"rocket",objectId:"webb",relation:"打ち上げた",assertion:"ロケットが打ち上げた",polarity:"uncertain",evidence:[{id:"e",source:{id:"source",revision:1},locator:"本文",excerpt:"原資料の引用"}]})}],mappings:[],translations:[translation,relationTranslation,assertionTranslation]};
it("uses only a translation for this locale, original edition and unchanged text",()=>{
 expect(knowledgeDisplayText([translation],target,"en","ロケット")).toBe("Rocket");
 expect(knowledgeDisplayText([translation],target,"ja","ロケット")).toBe("ロケット");
 expect(knowledgeDisplayText([translation],{...target,revision:2},"en","ロケット")).toBe("ロケット");
 expect(knowledgeDisplayText([translation],target,"en","作者の名称")).toBe("作者の名称");
});
it("localizes the graph and timeline projection without altering stored originals or evidence",()=>{
 const before=JSON.stringify(snapshot),display=knowledgeDisplaySnapshot(snapshot,"en");
 expect(display.records[0].content.assertion).toBe("The rocket launched it");
 expect(display.records[0].content.evidence[0].excerpt).toBe("原資料の引用");
 expect(JSON.stringify(snapshot)).toBe(before);
 const graph=knowledgeCanvas(snapshot.records.map(r=>buildKnowledgePublishedRecord(r,snapshot)),snapshot.entities,snapshot.translations,"en");
 expect(graph.nodes[0].label).toBe("Rocket");expect(Object.values(graph.relations!)[0].label).toBe("launched (uncertain)");
});
it("pins displayed Capsule translations and preserves the author's edited labels",()=>{
 const document=captureKnowledgeCapsule({snapshot,title:"作者の題名"}).document!;
 expect(capsulePresentation(document,"en").nodes[0].label).toBe("Rocket");
 expect(capsulePresentation(document,"en").relations[document.relations[0].key].label).toBe("launched (uncertain)");
 document.nodes[0].title="作者の名称";document.relations[0].label="作者の関係";
 expect(capsulePresentation(document,"en").nodes[0].label).toBe("作者の名称");
 expect(capsulePresentation(document,"en").relations[document.relations[0].key].label).toBe("作者の関係 (uncertain)");
 expect(document.knowledge!.snapshot.entities[0].content.name).toBe("ロケット");
});
it("bounds the public translation batch and rejects malformed field targets",()=>{
 expect(knowledgeDisplayTranslationsQuerySchema.safeParse({language:"en",targets:Array(101).fill(target)}).success).toBe(false);
 expect(knowledgeDisplayTranslationsQuerySchema.safeParse({language:"en",targets:[{...target,field:"excerpt"}]}).success).toBe(false);
});
