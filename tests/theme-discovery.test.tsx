// @vitest-environment jsdom
import React,{useState} from "react";
import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {HomeThemes,ThemeSearchPanel,initialThemeCriteria,ThemeLink} from "../components/ThemeDiscovery";
import {knowledgeThemeTypeLabel,type KnowledgeThemeSummary} from "../lib/domain/knowledge-theme-reader";
const graph:KnowledgeThemeSummary={id:"graph",revision:2,title:"制作のつながり",description:"関係だけのテーマ",hasTimeline:false,hasRelations:true,entityIds:[],initialView:"graph",publishedAt:"2026-11-02T00:00:00.000Z"};
const timeline:KnowledgeThemeSummary={...graph,id:"timeline",title:"展開の年表",hasTimeline:true,initialView:"timeline"};
const reply=(body:unknown)=>({ok:true,status:200,json:async()=>body});
async function tick(){await act(()=>vi.advanceTimersByTimeAsync(260));}
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
it("年表・関係図・解説を開く前に区別し、固定版への通常リンクも持つ",()=>{
 const open=vi.fn();render(<ThemeLink theme={timeline} onOpen={open}/>);
 expect(screen.getByText("年表・関係図")).toBeTruthy();
 const link=screen.getByRole("link");expect(link.getAttribute("href")).toContain("krev=2");
 fireEvent.click(link);expect(open).toHaveBeenCalledWith({id:"timeline",revision:2});
 expect(knowledgeThemeTypeLabel(graph)).toBe("関係図");
 expect(knowledgeThemeTypeLabel({...timeline,hasRelations:false})).toBe("年表");
 expect(knowledgeThemeTypeLabel({...graph,hasRelations:false})).toBe("解説");
});
it("TOPの紹介と新着を同じ認可済み読取から示す",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>reply({featured:[timeline,graph],recent:[graph],total:2})));
 render(<HomeThemes onOpen={vi.fn()} onBrowse={vi.fn()}/>);await tick();
 expect(screen.getByRole("heading",{name:"紹介テーマ"})).toBeTruthy();
 expect(screen.getByRole("heading",{name:"新着テーマ"})).toBeTruthy();
 expect(screen.getByText("2026-11-02")).toBeTruthy();
 expect(screen.getByRole("list",{name:/紹介テーマ/}).children).toHaveLength(2);
});
it("検索条件を変えた瞬間から旧結果を操作不可にし、遅い旧応答で上書きしない",async()=>{
 let release!:(v:ReturnType<typeof reply>)=>void;
 vi.stubGlobal("fetch",vi.fn((url:string)=>{const q=new URL(url,"http://localhost").searchParams.get("q");return q==="遅い"?new Promise(r=>{release=r;}):Promise.resolve(reply({themes:q==="年表"?[timeline]:[graph]}));}));
 function Panel(){const [criteria,setCriteria]=useState(initialThemeCriteria);return <ThemeSearchPanel criteria={criteria} onChange={setCriteria} onOpen={vi.fn()}/>;}
 render(<Panel/>);await tick();
 expect(screen.getByText(graph.title)).toBeTruthy();
 fireEvent.change(screen.getByRole("textbox"),{target:{value:"遅い"}});
 expect(screen.getByText(graph.title).closest("[inert]")?.hasAttribute("inert")).toBe(true);
 await tick();fireEvent.change(screen.getByRole("textbox"),{target:{value:"年表"}});await tick();
 expect(screen.getByText(timeline.title)).toBeTruthy();
 await act(async()=>release(reply({themes:[graph]})));
 expect(screen.queryByText(graph.title)).toBeNull();
});
it("表示内容・並び順と名前を同じ検索へ渡し、解除できる",async()=>{
 const requests:URLSearchParams[]=[];vi.stubGlobal("fetch",vi.fn(async(url:string)=>{requests.push(new URL(url,"http://localhost").searchParams);return reply({themes:[]});}));
 function Panel(){const [criteria,setCriteria]=useState(initialThemeCriteria);return <ThemeSearchPanel criteria={criteria} onChange={setCriteria} onOpen={vi.fn()}/>;}
 render(<Panel/>);await tick();
 fireEvent.click(screen.getByRole("button",{name:/^年表$/}));
 fireEvent.change(screen.getByRole("combobox",{name:"並び順"}),{target:{value:"name"}});
 fireEvent.change(screen.getByRole("textbox"),{target:{value:"Webb"}});await tick();
 expect(Object.fromEntries(requests.at(-1)!)).toMatchObject({q:"Webb",kind:"timeline",order:"name"});
 fireEvent.click(screen.getByRole("button",{name:"解除"}));await tick();
 expect(Object.fromEntries(requests.at(-1)!)).toMatchObject({kind:"all",order:"newest"});
});
