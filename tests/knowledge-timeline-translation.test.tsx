import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {UiLocaleProvider} from "../lib/client/ui-locale";
import KnowledgeTimeline from "../components/KnowledgeTimeline";
import {expect,it} from "vitest";
import {createHash} from "node:crypto";
import {knowledgeOriginalText,knowledgeTextTargetSchema,translationIdentity,type KnowledgeTextTarget,type KnowledgeTranslationVersion} from "../lib/domain/knowledge-translation";
import {knowledgeDisplaySnapshot,knowledgeDisplayTime} from "../lib/domain/knowledge-display";
import {recordTimeTextTargets,themeTimelineTextTargets} from "../lib/domain/knowledge-timeline-text";
import {knowledgeTimelineProjection} from "../lib/domain/knowledge-timeline";
import {knowledgeRecordContentSchema,knowledgeThemeContentSchema,type KnowledgeSnapshot} from "../lib/domain/knowledge-foundation";
import {captureKnowledgeCapsule} from "../lib/client/capsule-knowledge";
import {capsuleKnowledgeSchema} from "../lib/domain/capsule-knowledge";
const version={revision:1,createdAt:"2026-11-09T00:00:00Z",reason:"test"};
const record={...version,id:"r",content:knowledgeRecordContentSchema.parse({kind:"note",subjectId:"e",assertion:"出来事",scope:"補足",times:[{id:"when",time:{kind:"calendar",from:"1989-09",label:"検討会"}},{id:"stage",time:{kind:"qualitative",axis:"一日",from:"朝",to:"夜",coordinateMeaning:"段階の順序",label:"活動"}}],evidence:[{id:"quote",source:{id:"s",revision:1},locator:"page 1",excerpt:"source quote"}]})};
const theme={...version,id:"t",content:knowledgeThemeContentSchema.parse({title:"テーマ",recordPins:[{id:"r",revision:1}],entityPins:[{id:"e",revision:1}],sourcePins:[{id:"s",revision:1}],timeline:{version:1,axes:[{id:"calendar",kind:"calendar",label:"構想から展開",originLabel:"日付は資料の精度"},{id:"stages",kind:"qualitative",label:"一日の流れ",order:["朝","夜"]}],placements:[{recordId:"r",timeId:"when",axisId:"calendar"},{recordId:"r",timeId:"stage",axisId:"stages"}],insets:[{axisId:"stages",parentRecordId:"r",parentTimeId:"when",label:"その日の活動"}]}})};
const target=(field:KnowledgeTextTarget["field"],selector:{timeId?:string}={timeId:"when"}):KnowledgeTextTarget=>({kind:"record",id:"r",revision:1,field,...selector});
const translated=(target:KnowledgeTextTarget,text:string):KnowledgeTranslationVersion=>{const originalText=knowledgeOriginalText(target,target.kind==="theme"?theme.content:record.content).text;return {...version,id:"translation:"+createHash("sha256").update(JSON.stringify(target)).digest("hex").slice(0,32),target,language:"en",text,originalText,originalHash:createHash("sha256").update(originalText).digest("hex")};};
const translations=[translated(target("timeLabel"),"Workshop"),translated(target("timeFrom",{timeId:"stage"}),"Morning"),translated(target("timeTo",{timeId:"stage"}),"Night"),translated(target("timeAxis",{timeId:"stage"}),"One day"),translated({kind:"theme",id:"t",revision:1,field:"axisLabel",axisId:"calendar"},"From concept to deployment"),translated({kind:"theme",id:"t",revision:1,field:"insetLabel",axisId:"stages"},"Activities that day"),translated({kind:"record",id:"r",revision:1,field:"scope"},"Context")];
const snapshot:KnowledgeSnapshot={schemaVersion:1,initialView:"timeline",theme,timeline:theme.content.timeline,entities:[{...version,id:"e",content:{name:"Webb",kind:"work",aliases:[],description:"",language:"en"}}],records:[record],sources:[{...version,id:"s",content:{title:"NASA",url:"https://science.nasa.gov/mission/webb/",bibliography:"",language:"en"}}],mappings:[],translations};
it("requires stable selectors, isolates annotations, and never accepts calendar/numeric coordinates as prose",()=>{
 expect(knowledgeTextTargetSchema.safeParse(target("timeLabel",{})).success).toBe(false);
 expect(knowledgeTextTargetSchema.safeParse({...target("timeLabel"),axisId:"calendar"}).success).toBe(false);
 expect(knowledgeTextTargetSchema.safeParse({...target("assertion"),timeId:"when"}).success).toBe(false);
 expect(()=>knowledgeOriginalText(target("timeFrom"),record.content)).toThrow();
 expect(()=>knowledgeOriginalText(target("timeLabel",{timeId:"absent"}),record.content)).toThrow();
 expect(knowledgeOriginalText(target("timeLabel"),record.content).text).toBe("検討会");
 expect(translationIdentity(target("timeLabel"),"en")).not.toEqual(translationIdentity(target("timeLabel",{timeId:"stage"}),"en"));
 expect(translationIdentity({kind:"theme",id:"t",revision:1,field:"title"},"en")).toEqual(["theme","t",1,"title",null,null,"en"]);
});
it("enumerates every nonempty temporal prose field for the Chat guide and display lookup",()=>{
 expect(recordTimeTextTargets(record)).toContainEqual(target("timeFrom",{timeId:"stage"}));
 expect(themeTimelineTextTargets(theme)).toContainEqual({kind:"theme",id:"t",revision:1,field:"axisOriginLabel",axisId:"calendar"});
 for(const t of [...recordTimeTextTargets(record),...themeTimelineTextTargets(theme)])expect(knowledgeOriginalText(t,t.kind==="theme"?theme.content:record.content).text).toBeTruthy();
});
it("translates headings, labels, stage prose and scope without changing time geometry/order/originals",()=>{
 const before=JSON.stringify(snapshot),display=knowledgeDisplaySnapshot(snapshot,"en"),projection=knowledgeTimelineProjection(display,{locale:"en"});
 expect(display.timeline?.axes[0].label).toBe("From concept to deployment");
 expect(display.timeline?.axes[1].order).toEqual(["朝","夜"]);
 expect(display.timeline?.insets[0].label).toBe("Activities that day");
 expect(display.records[0].content.scope).toBe("Context");
 expect(projection.records[0].time).toEqual(record.content.times[0].time);
 expect(projection.records[0].displayTime?.label).toBe("Workshop");
 expect(projection.records[1].time).toMatchObject({from:"朝",to:"夜"});
 expect(projection.records[1].displayTime).toMatchObject({from:"Morning",to:"Night",axis:"One day"});
 expect(JSON.stringify(snapshot)).toBe(before);
 expect(knowledgeDisplayTime(record,"when",translations,"ja").label).toBe("検討会");
});
it("keeps pinned translations in Capsule snapshots and ignores a later unrelated original/author override",()=>{
 const doc=captureKnowledgeCapsule({snapshot,theme,title:"My theme"}).document!;
 expect(capsuleKnowledgeSchema.safeParse(doc.knowledge).success).toBe(true);
 expect(doc.knowledge!.snapshot.records[0].content.times[0].time.label).toBe("検討会");
 expect(knowledgeDisplayTime(record,"when",doc.knowledge!.snapshot.translations,"en").label).toBe("Workshop");
 const edited=structuredClone(record);edited.content.times[0].time.label="My period label";
 expect(knowledgeDisplayTime(edited,"when",translations,"en").label).toBe("My period label");
 expect(knowledgeDisplayTime({...record,revision:2},"when",translations,"en").label).toBe("検討会");
});

it("renders translated headings and time labels in the actual shared timeline component",()=>{
 const html=renderToStaticMarkup(<UiLocaleProvider initialLocale="en"><KnowledgeTimeline snapshot={snapshot} focusedRecordId={null} onFocusRecord={()=>{}}/></UiLocaleProvider>);
 expect(html).toContain("From concept to deployment");expect(html).toContain("Workshop");expect(html).toContain("Activities that day");expect(html).toContain("Morning");expect(html).not.toContain("構想から展開");expect(html).not.toContain("検討会");
});
