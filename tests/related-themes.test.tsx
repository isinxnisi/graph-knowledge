// @vitest-environment jsdom
import React from "react";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import RelatedThemes from "../components/RelatedThemes";
import {relatedThemesForTheme} from "../lib/domain/related-themes";
import type {KnowledgeThemeRead,KnowledgeThemeSummary} from "../lib/domain/knowledge-theme-reader";
const current={theme:{id:"self",revision:7,content:{stories:[],productPins:[]}},snapshot:{entities:[{id:"person"},{id:"work"}],records:[{id:"relation"},{id:"episode"},{id:"note"}]}} as unknown as KnowledgeThemeRead;
const summary=(id:string,entityIds:string[]=[],recordIds?:string[]):KnowledgeThemeSummary=>({id,revision:2,title:id,description:"",initialView:"graph",hasTimeline:false,entityIds,recordIds});
afterEach(cleanup);
it("全Entityと全種類のRecordから集め、自テーマ・重複・非関連を除いて公開カタログ順を保つ",()=>{
 const a=summary("entity",["work"]),b=summary("relation",[],["relation"]),c=summary("episode",[],["episode"]),d=summary("note",[],["note"]);
 const catalogue=[summary("self",["person"]),a,b,c,d,a,summary("other",["unrelated"])];
 expect(relatedThemesForTheme(catalogue,current).map(t=>t.id)).toEqual(["entity","relation","episode","note"]);
 expect(current.theme.content.stories).toEqual([]);
});
it("同一性が確認されたEntity別IDと旧カタログを扱い、共通資料だけでは関連づけない",()=>{
 const alias={...summary("alias",["canonical"]),focusAliases:{person:"canonical"}};
 expect(relatedThemesForTheme([alias,summary("old",["work"]),summary("source-only")],current).map(t=>t.id)).toEqual(["alias","old"]);
});
it("既存と同じ一覧で3件から開閉でき、版を指定して関連テーマを開く",()=>{
 const open=vi.fn(),catalogue=["a","b","c","d"].map(id=>summary(id,["person"]));
 render(<RelatedThemes theme={current} catalogue={catalogue} onOpen={open}/>);
 expect(screen.getByRole("heading",{name:"関連するテーマ"})).toBeTruthy();
 expect(screen.getAllByRole("link")).toHaveLength(3);
 fireEvent.click(screen.getByRole("button",{name:"関連するテーマ：すべて見る"}));
 expect(screen.getAllByRole("link")).toHaveLength(4);
 fireEvent.click(screen.getByRole("link",{name:/^d/}));expect(open).toHaveBeenCalledWith({id:"d",revision:2});
 fireEvent.click(screen.getByRole("button",{name:"関連するテーマ：閉じる"}));expect(screen.getAllByRole("link")).toHaveLength(3);
});
it("既存のEntity用一覧とフォーカスを保持し、関連0件の空見出しを出さない",()=>{
 const open=vi.fn(),catalogue=[summary("self",["person"]),summary("different",["other"])];
 const {rerender}=render(<RelatedThemes entityId="person" catalogue={catalogue} onOpen={open}/>);
 fireEvent.click(screen.getByRole("link"));expect(open).toHaveBeenCalledWith({id:"self",revision:2,focusEntityId:"person"});
 rerender(<RelatedThemes theme={current} catalogue={[catalogue[0]]} onOpen={open}/>);
 expect(screen.queryByRole("heading")).toBeNull();
});
