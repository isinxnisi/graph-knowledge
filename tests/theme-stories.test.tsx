// @vitest-environment jsdom
import React from "react";
import {it,expect,vi,afterEach} from "vitest";
import {render,screen,fireEvent,cleanup} from "@testing-library/react";
import {themeStoriesSchema,themeStoryEntries,themeStoriesReferenceError} from "../lib/domain/theme-stories";
import {knowledgeRecordContentSchema,knowledgeSourceContentSchema,knowledgeEntityContentSchema,type KnowledgeRecordVersion,type KnowledgeSnapshot} from "../lib/domain/knowledge-foundation";
import {themeUpdateInputSchema} from "../lib/domain/knowledge-theme-registration";
import {themeReadingPresentationSchema} from "../lib/domain/theme-reading-presentation";
import {buildKnowledgePublishedRecord} from "../lib/domain/knowledge-publication";
import KnowledgeThemeContext from "../components/KnowledgeThemeContext";
const make=(id:string,kind:"note"|"episode"|"relation"):KnowledgeRecordVersion=>({id,revision:1,createdAt:"2026-11-14T00:00:00Z",reason:"fixture",content:knowledgeRecordContentSchema.parse({kind,assertion:"Full text "+id,...(kind==="relation"?{subjectId:"a",objectId:"b",relation:"inspired"}:{}),...(kind==="episode"?{times:[{id:"date",time:{kind:"calendar",from:"1980"}}]}:{}),evidence:[{id:"e",source:{id:"s",revision:1},locator:"p1",excerpt:"Source text"}]})});
const records=[make("release","episode"),make("idea","note"),make("connection","relation")];
const selection=themeStoriesSchema.parse({version:1,items:[{key:"connection",records:[{id:"connection",revision:1}]},{key:"background",records:[{id:"idea",revision:1},{id:"release",revision:1}],title:{ja:"背景の読み物",en:"Behind the work"}}]});
const presentation=themeReadingPresentationSchema.parse({version:1,theme:{id:"t",revision:1},locale:"ja",state:"checked",hook:"Hook",lead:"Lead",records:[{target:{id:"connection",revision:1},shortTitle:"意外なつながり",chapterQuestion:"どうつながった？"}]});
afterEach(cleanup);
it("distinguishes legacy, explicitly empty and authored order without kind filtering or changing records",()=>{
 expect(themeStoryEntries(records,undefined).map(i=>i.key)).toEqual(["release","idea"]);
 expect(themeStoryEntries(records,{version:1,items:[]})).toEqual([]);
 expect(themeStoryEntries(records,selection,presentation).map(i=>i.title)).toEqual(["意外なつながり","背景の読み物"]);
 expect(themeStoryEntries(records,selection,presentation,"en")[1].title).toBe("Behind the work");
 expect(records[0].content.times).toHaveLength(1);expect(records).toHaveLength(3);
});
it("rejects duplicate keys/pins and wrong versions, and suppresses unavailable groups without fallback",()=>{
 expect(themeStoriesSchema.safeParse({version:1,items:[selection.items[0],selection.items[0]]}).success).toBe(false);
 expect(themeStoriesSchema.safeParse({version:1,items:[{key:"duplicate",records:[{id:"a",revision:1},{id:"a",revision:2}]}]}).success).toBe(false);
 expect(themeStoriesReferenceError(selection,records)).toBeNull();
 expect(themeStoriesReferenceError(selection,records.filter(r=>r.id!=="idea"))).toBeTruthy();
 expect(themeStoryEntries(records.filter(r=>r.id!=="idea"),selection).map(i=>i.key)).toEqual(["connection"]);
 expect(themeStoryEntries(records.map(r=>({...r,revision:2})),selection)).toEqual([]);
});
it("preserves omission and deliberate clearing in the existing update contract",()=>{
 const base={requestId:"12345678-1234-4234-8234-123456789012",target:{id:"t",revision:2},reason:"編集"};
 expect(themeUpdateInputSchema.parse({...base,changes:{stories:selection}}).changes.stories).toEqual(selection);
 expect(themeUpdateInputSchema.parse({...base,changes:{stories:{version:1,items:[]}}}).changes.stories?.items).toEqual([]);
 expect(themeUpdateInputSchema.parse({...base,changes:{title:"Title"}}).changes).not.toHaveProperty("stories");
});
it("retains accordion layout, full grouped prose and precise per-record evidence navigation",()=>{
 const snapshot={schemaVersion:1,initialView:"graph",records,entities:["a","b"].map(id=>({id,revision:1,createdAt:"",reason:"test",content:knowledgeEntityContentSchema.parse({name:id,kind:"work"})})),sources:[{id:"s",revision:1,createdAt:"",reason:"test",content:knowledgeSourceContentSchema.parse({title:"Source",bibliography:"Source"})}],mappings:[]} as KnowledgeSnapshot;
 const onRead=vi.fn();const v=render(<KnowledgeThemeContext variant="stories" records={records.map(r=>buildKnowledgePublishedRecord(r,snapshot))} stories={selection} presentation={presentation} selectedRecordId={null} onRead={onRead}/>);
 expect(screen.getAllByText(/意外なつながり|背景の読み物/,{selector:"summary > span"}).map(e=>e.textContent)).toEqual(["意外なつながり","背景の読み物"]);
 const title=screen.getByText("背景の読み物");fireEvent.click(title);expect(title.closest("details")!.open).toBe(true);
 expect(screen.getByText("Full text idea")).toBeTruthy();expect(screen.getByText("Full text release")).toBeTruthy();expect(onRead).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"出典・詳細：背景の読み物 · Full text idea"}));expect(onRead).toHaveBeenLastCalledWith("idea");
 fireEvent.click(title);expect(title.closest("details")!.open).toBe(false);
 v.rerender(<KnowledgeThemeContext variant="stories" records={records.map(r=>buildKnowledgePublishedRecord(r,snapshot))} stories={{version:1,items:[]}} selectedRecordId={null} onRead={onRead}/>);expect(screen.queryByText("エピソード・豆知識")).toBeNull();
});
