// @vitest-environment jsdom
import React from "react";
import {act,cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import KnowledgeReading,{useKnowledgeReading} from "../components/KnowledgeReading";
import {MemberClientError} from "../lib/client/member-api";
import {knowledgeEntityContentSchema,knowledgeRecordContentSchema,knowledgeSourceContentSchema} from "../lib/domain/knowledge-foundation";
import {buildKnowledgePublishedRecord} from "../lib/domain/knowledge-publication";
const mocks=vi.hoisted(()=>({workspace:{} as Record<string,unknown>,close:vi.fn(),capture:vi.fn()}));
vi.mock("next/navigation",()=>({useSearchParams:()=>new URLSearchParams(location.search)}));
vi.mock("../lib/client/use-knowledge-workspace",()=>({useKnowledgeWorkspace:()=>mocks.workspace,readKnowledge:vi.fn(async()=>({items:[],hasMore:false,cursor:null}))}));
vi.mock("../components/GraphCanvas",()=>({default:({onEntity}:{onEntity?:(id:string)=>void})=> <div>保持中の図<button onClick={()=>onEntity?.("entity-1")}>図の名前を選ぶ</button></div>}));
vi.mock("../components/KnowledgeSubmissionAvailability",()=>({useKnowledgeSubmissionsEnabled:()=>true}));
vi.mock("../lib/client/use-knowledge-display-translations",()=>({useKnowledgeDisplayTranslations:()=>[]}));
vi.mock("../lib/client/knowledge-submission-handoff",async()=>({...await vi.importActual("../lib/client/knowledge-submission-handoff"),createSelectionSubmission:mocks.capture}));
const theme={theme:{id:"theme",revision:1,content:{title:"テーマ",recordPins:[],description:""}},records:[],snapshot:{entities:[],records:[],sources:[]}};
function Reader(){const r=useKnowledgeReading()!;return <><span>既存Explorer</span><button onClick={()=>r.openRecord("record-1")}>記録を開く</button><div>{r.center}</div></>;}
async function flush(){await act(async()=>{for(let n=0;n<10;n++)await Promise.resolve();});}
beforeEach(()=>{mocks.close.mockClear();history.replaceState({},"","/?ktheme=theme");mocks.workspace={normal:{records:[],entities:[],epoch:0,selection:null},activeTheme:theme,retainedTheme:theme,themeSelection:null,themeView:"graph",busy:false,restoring:false,error:"",message:"",status:null,closeTheme:mocks.close};});
afterEach(()=>cleanup());
it("Nextの同一路線ホーム移動はpopstateを待たずThemeを閉じる",async()=>{
 const {rerender}=render(<KnowledgeReading><Reader/></KnowledgeReading>);await flush();
 expect(mocks.close).not.toHaveBeenCalled();
 history.replaceState({},"","/");rerender(<KnowledgeReading><Reader/></KnowledgeReading>);await flush();
 expect(mocks.close).toHaveBeenCalledWith("replace");
});
it("Theme取得中の旧URLだけを理由に手動の読込を中止しない",async()=>{
 history.replaceState({},"","/");mocks.workspace={...mocks.workspace,activeTheme:null,retainedTheme:null,busy:true};
 render(<KnowledgeReading><Reader/></KnowledgeReading>);await flush();expect(mocks.close).not.toHaveBeenCalled();
});
it("解説だけのThemeに空のGraph領域を追加しない",async()=>{
 const {container}=render(<KnowledgeReading><Reader/></KnowledgeReading>);await flush();
 expect(screen.getByText("既存Explorer")).toBeTruthy();
 expect(screen.getByRole("heading",{name:/^テーマ$/})).toBeTruthy();
 expect(container.querySelector('[data-view]')).toBeNull();
});

it("公開記録の直リンクを既存Explorerのホーム移動と混同しない",async()=>{
 history.replaceState({},"","/?krecord=record-1");mocks.workspace={...mocks.workspace,activeTheme:null,retainedTheme:null};
 render(<KnowledgeReading><Reader/></KnowledgeReading>);expect(screen.getByRole("region",{name:"通常の関係探索"})).toBeTruthy();await flush();expect(mocks.close).not.toHaveBeenCalled();expect(screen.getByRole("region",{name:"通常の関係探索"})).toBeTruthy();
});

it("通常Graphからの記録取得中は旧URLを理由に取消さず、成功後に直リンクへ切り替える",async()=>{
 history.replaceState({},"","/");
 let resolve!:(value:boolean)=>void;
 const selectRecord=vi.fn(()=>new Promise<boolean>(done=>{resolve=done;}));
 mocks.workspace={...mocks.workspace,activeTheme:null,retainedTheme:null,selectRecord};
 render(<KnowledgeReading><Reader/></KnowledgeReading>);await flush();
 fireEvent.click(screen.getByRole("button",{name:"記録を開く"}));await flush();
 expect(selectRecord).toHaveBeenCalledWith("record-1",{latest:true});
 expect(mocks.close).toHaveBeenCalledTimes(1);
 await act(async()=>{resolve(true);await Promise.resolve();});await flush();
 expect(new URL(location.href).searchParams.get("krecord")).toBe("record-1");
 expect(screen.getByRole("region",{name:"通常の関係探索"})).toBeTruthy();
 expect(mocks.close).toHaveBeenCalledTimes(1);
});

it("固定版の選択投稿が競合しても勝手に替えず、明示操作で現在版を開き直せる",async()=>{
 const record={id:"record-1",revision:1,createdAt:"2026-11-08T00:00:00Z",reason:"",content:knowledgeRecordContentSchema.parse({kind:"note",assertion:"固定した内容",aboutTheme:"theme",evidence:[{id:"e",source:{id:"source",revision:1},locator:"本文"}]})};
 const snapshot={schemaVersion:1 as const,initialView:"graph" as const,records:[record],entities:[],sources:[{id:"source",revision:1,createdAt:record.createdAt,reason:"",content:knowledgeSourceContentSchema.parse({title:"公開資料",bibliography:"固定版"})}],mappings:[]};
 const fixed={...theme,snapshot,records:[buildKnowledgePublishedRecord(record,snapshot)]},selectRecord=vi.fn(async()=>false);
 mocks.workspace={...mocks.workspace,activeTheme:fixed,retainedTheme:fixed,themeSelection:{kind:"record",id:record.id},selectRecord,captureThemeView:vi.fn()};
 mocks.capture.mockRejectedValueOnce(new MemberClientError(409,"REFERENCE_CONFLICT"));
 render(<KnowledgeReading><Reader/></KnowledgeReading>);await flush();
 fireEvent.click(screen.getByRole("button",{name:"選択範囲を投稿"}));await flush();
 expect(mocks.capture).toHaveBeenCalledWith({context:expect.objectContaining({recordPins:[{id:record.id,revision:1}],themePin:{id:"theme",revision:1}})});
 expect(selectRecord).not.toHaveBeenCalled();expect(fixed.snapshot.records[0].revision).toBe(1);
 fireEvent.click(screen.getByRole("button",{name:"最新版を開いて選び直す"}));await flush();
 expect(selectRecord).toHaveBeenCalledWith(record.id,{latest:true});expect(fixed.snapshot.records[0].revision).toBe(1);
});

it("テーマ説明の一時表示は記録・出典の開閉と詳細DOMを保持する",async()=>{
 HTMLElement.prototype.scrollIntoView=vi.fn();
 const record={id:"fixed",revision:1,createdAt:"2026-11-10T00:00:00Z",reason:"",content:knowledgeRecordContentSchema.parse({kind:"note",assertion:"固定した本文",evidence:[{id:"e",source:{id:"source",revision:1},locator:"p.7",excerpt:"根拠の文章"}]})};
 const snapshot={schemaVersion:1 as const,initialView:"graph" as const,records:[record],entities:[],sources:[{id:"source",revision:1,createdAt:record.createdAt,reason:"",content:knowledgeSourceContentSchema.parse({title:"資料",bibliography:"第1版"})}],mappings:[]};
 const fixed={...theme,snapshot,records:[buildKnowledgePublishedRecord(record,snapshot)]},setThemeSelection=vi.fn();mocks.workspace={...mocks.workspace,activeTheme:fixed,retainedTheme:fixed,themeSelection:{kind:"record",id:"fixed",timeId:"original"},setThemeSelection};
 function Both(){const r=useKnowledgeReading()!;return <>{r.center}<aside id="explorer-detail">{r.detail}</aside></>;}
 render(<KnowledgeReading><Both/></KnowledgeReading>);await flush();fireEvent.click(screen.getByRole("button",{name:"引用と掲載箇所を読む：資料"}));expect(screen.getByText("根拠の文章")).toBeTruthy();const node=screen.getByText("根拠の文章");fireEvent.click(screen.getByRole("button",{name:"テーマについて"}));expect(setThemeSelection).not.toHaveBeenCalled();expect(screen.getByRole("button",{name:"選んだ記録に戻る"})).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"選んだ記録に戻る"}));expect(screen.getByText("根拠の文章")).toBe(node);expect(screen.getByRole("button",{name:"引用と掲載箇所を読む：資料"}).getAttribute("aria-expanded")).toBe("true");
});

it("解説の出典を読んだあと固定版の元記録と引用へ戻れ、図の選択を奪わない",async()=>{
 HTMLElement.prototype.scrollIntoView=vi.fn();HTMLElement.prototype.scrollTo=vi.fn();
 const stamp={revision:1,createdAt:"2026-11-10T00:00:00Z",reason:""};
 const evidence=[{id:"e",source:{id:"source",revision:1},locator:"p.7",excerpt:"根拠の文章"}];
 const original={id:"original",...stamp,content:knowledgeRecordContentSchema.parse({kind:"episode",assertion:"元の出来事の本文",evidence})};
 const note={id:"note",...stamp,content:knowledgeRecordContentSchema.parse({kind:"note",assertion:"出来事の意味を説明する文章",aboutRecord:{id:"original",revision:1},evidence})};
 const snapshot={schemaVersion:1 as const,initialView:"graph" as const,records:[original,note],entities:[],sources:[{id:"source",...stamp,content:knowledgeSourceContentSchema.parse({title:"資料",bibliography:"第1版"})}],mappings:[]};
 const fixed={...theme,snapshot,records:snapshot.records.map(r=>buildKnowledgePublishedRecord(r,snapshot)),presentation:{locale:"ja",records:[{target:{id:"original",revision:1},shortTitle:"元の出来事",explanations:[{record:{id:"note",revision:1},role:"background"}]}]}};
 const select=vi.fn();mocks.workspace={...mocks.workspace,activeTheme:fixed,retainedTheme:fixed,themeSelection:{kind:"record",id:"original",timeId:"saved-time"},setThemeSelection:select};
 function Both(){const r=useKnowledgeReading()!;return <>{r.center}<aside id="explorer-detail">{r.detail}</aside></>;}
 render(<KnowledgeReading><Both/></KnowledgeReading>);await flush();
 fireEvent.click(screen.getByRole("button",{name:"引用と掲載箇所を読む：資料"}));
 fireEvent.click(screen.getByRole("button",{name:"解説1の出典を読む"}));await flush();
 expect(within(document.getElementById("explorer-detail")!).queryByText("元の出来事の本文")).toBeNull();
 expect(screen.getByRole("button",{name:"「元の出来事」に戻る"})).toBeTruthy();expect(select).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"「元の出来事」に戻る"}));await flush();
 expect(within(document.getElementById("explorer-detail")!).getByText("元の出来事の本文")).toBeTruthy();expect(screen.getByText("根拠の文章")).toBeTruthy();
 expect(screen.getByRole("button",{name:"引用と掲載箇所を読む：資料"}).getAttribute("aria-expanded")).toBe("true");
 expect(select).not.toHaveBeenCalled();expect(fixed.snapshot.records[0].revision).toBe(1);
});


it.each([false,true])("テーマ情報は本文をその場で開閉し、必要なときだけ出典詳細へ進み一覧へ戻る（旧問いの装飾: %s）",async withOldQuestion=>{
 HTMLElement.prototype.scrollIntoView=vi.fn();HTMLElement.prototype.scrollTo=vi.fn();
 const stamp={revision:1,createdAt:"2026-11-10T00:00:00Z",reason:""};
 const original={id:"launch",...stamp,content:knowledgeRecordContentSchema.parse({kind:"episode",assertion:"打上げの記録",times:[{id:"day",time:{kind:"calendar",from:"2021-12-25"}}],evidence:[{id:"launch-e",source:{id:"launch-source",revision:1},locator:"p.1",excerpt:"打上げの根拠"}]})};
 const note={id:"trivia",...stamp,content:knowledgeRecordContentSchema.parse({kind:"note",assertion:"望遠鏡を折り畳んだ理由についての豆知識",aboutRecord:{id:"launch",revision:1},evidence:[{id:"trivia-e",source:{id:"trivia-source",revision:1},locator:"p.2",excerpt:"豆知識の根拠"}]})};
 const snapshot={schemaVersion:1 as const,initialView:"graph" as const,records:[original,note],entities:[],sources:[{id:"launch-source",...stamp,content:knowledgeSourceContentSchema.parse({title:"打上げの資料",bibliography:"第1版"})},{id:"trivia-source",...stamp,content:knowledgeSourceContentSchema.parse({title:"豆知識の資料",bibliography:"第2版"})}],mappings:[]};
 const fixed={...theme,snapshot,records:snapshot.records.map(r=>buildKnowledgePublishedRecord(r,snapshot)),...(withOldQuestion?{presentation:{locale:"ja",records:[{target:{id:"launch",revision:1},chapterQuestion:"どんな姿でロケットに乗った？",shortTitle:"打上げ",explanations:[]}]}}:{})};
 const select=vi.fn();mocks.workspace={...mocks.workspace,activeTheme:fixed,retainedTheme:fixed,themeSelection:{kind:"record",id:"launch"},setThemeSelection:select};
 function Both(){const r=useKnowledgeReading()!;return <>{r.center}<aside id="explorer-detail">{r.detail}</aside></>;}
 render(<KnowledgeReading><Both/></KnowledgeReading>);await flush();
 fireEvent.click(screen.getByRole("button",{name:"テーマについて"}));
 const detail=within(document.getElementById("explorer-detail")!);
 expect(detail.getByRole("heading",{name:"エピソード・豆知識"})).toBeTruthy();
 expect(detail.getByText(withOldQuestion?"打上げ":original.content.assertion,{selector:"summary > span"})).toBeTruthy();
 expect(detail.queryByRole("button",{name:"どんな姿でロケットに乗った？"})).toBeNull();
 const title=detail.getByText(note.content.assertion,{selector:"summary > span"});fireEvent.click(title);expect(title.closest("details")!.open).toBe(true);expect(select).not.toHaveBeenCalled();
 fireEvent.click(detail.getByRole("button",{name:"出典・詳細："+note.content.assertion}));await flush();
 const article=within(document.getElementById("explorer-detail")!.querySelector("article")!);
 expect(article.getByText(note.content.assertion)).toBeTruthy();expect(article.queryByText(original.content.assertion)).toBeNull();expect(article.queryByText("背景・解説",{exact:true})).toBeNull();
 expect(article.getByText("豆知識の資料")).toBeTruthy();expect(article.queryByText("打上げの資料")).toBeNull();
 fireEvent.click(article.getByRole("button",{name:"引用と掲載箇所を読む：豆知識の資料"}));expect(article.getByText("豆知識の根拠")).toBeTruthy();
 fireEvent.click(article.getByRole("button",{name:"一覧に戻る"}));await flush();
 expect(detail.getByRole("heading",{name:"エピソード・豆知識"})).toBeTruthy();expect(detail.getByRole("button",{name:"出典・詳細："+note.content.assertion})).toBeTruthy();expect(select).not.toHaveBeenCalled();
});


it("非同期で開いた未選択テーマの概要も閉じた状態を保ち、必要なときに開き直せる",async()=>{
 HTMLElement.prototype.scrollIntoView=vi.fn();HTMLElement.prototype.scrollTo=vi.fn();
 function Both(){const r=useKnowledgeReading()!;return <>{r.center}<aside id="explorer-detail">{r.detail}</aside></>;}
 mocks.workspace={...mocks.workspace,activeTheme:null,retainedTheme:null,busy:true};
 const {rerender}=render(<KnowledgeReading><Both/></KnowledgeReading>);await flush();
 mocks.workspace={...mocks.workspace,activeTheme:theme,retainedTheme:theme,busy:false};
 rerender(<KnowledgeReading><Both/></KnowledgeReading>);await flush();const detail=within(document.getElementById("explorer-detail")!);
 expect(detail.getByRole("heading",{name:"このテーマを深く読む"})).toBeTruthy();
 fireEvent.click(detail.getByRole("button",{name:"閲覧に戻る"}));await flush();
 expect(detail.queryByRole("heading",{name:"このテーマを深く読む"})).toBeNull();
 expect(detail.getByText("年表の出来事や図の名前を選ぶと、内容と出典を読めます。")).toBeTruthy();
 fireEvent.click(detail.getByRole("button",{name:"エピソード・豆知識を見る"}));await flush();
 expect(detail.getByRole("heading",{name:"このテーマを深く読む"})).toBeTruthy();
});


it("テーマ概要から図の名前を選ぶと、その名前の説明へ切り替わる",async()=>{
 HTMLElement.prototype.scrollIntoView=vi.fn();HTMLElement.prototype.scrollTo=vi.fn();
 const stamp={revision:1,createdAt:"2026-11-10T00:00:00Z",reason:""};
 const entities=[{id:"entity-1",...stamp,content:knowledgeEntityContentSchema.parse({name:"Ariane 5",kind:"rocket",description:"Webbを打ち上げたロケット"})},{id:"entity-2",...stamp,content:knowledgeEntityContentSchema.parse({name:"Webb",kind:"telescope"})}];
 const record={id:"launch",...stamp,content:knowledgeRecordContentSchema.parse({kind:"relation",subjectId:"entity-1",objectId:"entity-2",relation:"打ち上げた",assertion:"Ariane 5がWebbを打ち上げた。",evidence:[{id:"e",source:{id:"source",revision:1},locator:"本文"}]})};
 const snapshot={schemaVersion:1 as const,initialView:"graph" as const,records:[record],entities,sources:[{id:"source",...stamp,content:knowledgeSourceContentSchema.parse({title:"打上げの資料",bibliography:"第1版"})}],mappings:[]};
 const fixed={...theme,snapshot,records:[buildKnowledgePublishedRecord(record,snapshot)]};
 const select=vi.fn((selection:unknown)=>{mocks.workspace={...mocks.workspace,themeSelection:selection};});
 mocks.workspace={...mocks.workspace,activeTheme:fixed,retainedTheme:fixed,setThemeSelection:select};
 function Both(){const r=useKnowledgeReading()!;return <>{r.center}<aside id="explorer-detail">{r.detail}</aside></>;}
 render(<KnowledgeReading><Both/></KnowledgeReading>);await flush();
 const detail=within(document.getElementById("explorer-detail")!);
 fireEvent.click(screen.getByRole("button",{name:"テーマについて"}));
 expect(detail.getByRole("heading",{name:"このテーマを深く読む"})).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"図の名前を選ぶ"}));await flush();
 expect(select).toHaveBeenCalledWith({kind:"entity",id:"entity-1"});
 expect(detail.queryByRole("heading",{name:"このテーマを深く読む"})).toBeNull();
 expect(detail.getByRole("heading",{name:"Ariane 5"})).toBeTruthy();
 expect(detail.getByText("Webbを打ち上げたロケット")).toBeTruthy();
});

it("テーマの『名前から探索する』は言語付きの正規URLへのリンクにする",async()=>{
 const entity={id:"import:person-kurosawa",revision:1,createdAt:"2026-11-13T00:00:00Z",reason:"",content:knowledgeEntityContentSchema.parse({name:"黒澤明",kind:"person",description:"映画監督"})};
 const focused={...theme,snapshot:{...theme.snapshot,entities:[entity]}};
 mocks.workspace={...mocks.workspace,activeTheme:focused,retainedTheme:focused,themeSelection:{kind:"entity",id:entity.id}};
 function Details(){return <>{useKnowledgeReading()!.detail}</>;}
 render(<KnowledgeReading><Details/></KnowledgeReading>);await flush();
 expect(screen.getByRole("link",{name:"黒澤明から探索する"}).getAttribute("href")).toBe("/explore/import%3Aperson-kurosawa");
});
it("正規の共通知識ページをホームと誤認して閉じず、ホームに戻るリンクを表示する",async()=>{
 history.replaceState({},"","/explore/import%3Aperson-kurosawa");mocks.workspace={...mocks.workspace,activeTheme:null,retainedTheme:null};
 render(<KnowledgeReading initialEntityId="import:person-kurosawa"><Reader/></KnowledgeReading>);await flush();expect(mocks.close).not.toHaveBeenCalled();expect(screen.getByRole("region",{name:"通常の関係探索"})).toBeTruthy();expect(screen.getByRole("link",{name:"探索に戻る"}).getAttribute("href")).toBe("/");
});
