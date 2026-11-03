import {describe,expect,it} from "vitest";
import {randomUUID} from "node:crypto";
import {captureKnowledgeCapsule} from "../lib/client/capsule-knowledge";
import {captureSubmissionCapsule} from "../lib/domain/knowledge-submission-capsule";
import type {KnowledgeSnapshot} from "../lib/domain/knowledge-foundation";
import type {MemberCapsule} from "../lib/domain/member-capsule";
const stamp="2026-11-03T09:00:00Z";
const snapshot:KnowledgeSnapshot={schemaVersion:1,entities:[{id:"a",revision:2,createdAt:stamp,reason:"元の対象",content:{name:"青木",kind:"人物",description:"",aliases:[],language:"ja"}},{id:"b",revision:1,createdAt:stamp,reason:"元の対象",content:{name:"海",kind:"作品",description:"",aliases:[],language:"ja"}}],sources:[{id:"s",revision:3,createdAt:stamp,reason:"資料",content:{title:"資料の版",url:"https://example.invalid/source",bibliography:"",language:"ja"}}],records:[{id:"r",revision:4,createdAt:stamp,reason:"記録",content:{kind:"relation",subjectId:"a",objectId:"b",assertion:"青木が挿絵を描いた可能性がある。",relation:"挿絵を描いた可能性",polarity:"uncertain",scope:"初版本",times:[{id:"time-a",time:{kind:"calendar",from:"2003",meaning:"point",label:"刊行年"}}],evidence:[{id:"ev",source:{id:"s",revision:3},locator:"p.12",excerpt:"挿絵は青木の作とする説がある。",stance:"support"}]}}],mappings:[],initialView:"graph"};
const capsule=():MemberCapsule=>{const c=captureKnowledgeCapsule({snapshot,title:"仮想の検証"});return {id:c.id,schemaVersion:2,revision:5,createdAt:c.createdAt,updatedAt:c.createdAt,content:{dataset:"public-kg",title:c.title,note:"私有の説明",language:"ja",entityIds:[],claimIds:[],document:c.document}};};
describe("selected Capsule to knowledge draft",()=>{
 it("preserves the captured identity, source edition, scope, polarity and time while taking author edits",()=>{
  const c=capsule();c.content.document!.relations[0].label="作者が付けた具体語";
  const result=captureSubmissionCapsule(c,["r"]);const item=result.content.items[0];expect(item.correction).toEqual({id:"r",revision:4});expect(item.record).toMatchObject({relation:"作者が付けた具体語",polarity:"uncertain",scope:"初版本",times:snapshot.records[0].content.times,evidence:snapshot.records[0].content.evidence});expect(result.content.entityPins).toEqual([{id:"a",revision:2},{id:"b",revision:1}]);expect(result.content.sourcePins).toEqual([{id:"s",revision:3}]);expect(c.content.note).toBe("私有の説明");
 });
 it("does not reinterpret a Capsule author's source note as a quotation from the source",()=>{
  const c=capsule(),key=randomUUID();c.content.document!.evidence.push({key,targetKey:c.content.document!.relations[0].key,supports:"relation",title:"資料の説明",url:"https://example.invalid/other",locator:"p.5",note:"これは作者の解釈メモであり引用ではない",stance:"background"});
  const result=captureSubmissionCapsule(c,["r"]);expect(result.content.items[0].record.evidence.at(-1)).toMatchObject({excerpt:"",stance:"background"});expect(result.sourceCapsule.captured.evidence[0].note).toContain("作者の解釈");expect(JSON.stringify(result.sourceCapsule)).not.toContain("私有の説明");
 });
 it("rejects guessed and duplicate selections",()=>{expect(()=>captureSubmissionCapsule(capsule(),["not-found"])).toThrow();expect(()=>captureSubmissionCapsule(capsule(),["r","r"])).toThrow();});
});
