vi.mock("server-only",()=>({}));
// @vitest-environment jsdom
import React from "react";
import {render,screen,fireEvent,cleanup,act,waitFor} from "@testing-library/react";
import {it,expect,afterEach,vi} from "vitest";
import KnowledgeReadingSources from "../components/KnowledgeReadingSources";
import KnowledgeTimeline from "../components/KnowledgeTimeline";
import KnowledgeRelatedInformation from "../components/KnowledgeRelatedInformation";
import {ReadingList,ReadingSources} from "../components/ReadingDetailSection";
import KnowledgeThemeContext from "../components/KnowledgeThemeContext";
import {knowledgeRecordContentSchema,knowledgeSourceContentSchema,type KnowledgeSnapshot} from "../lib/domain/knowledge-foundation";
import {buildKnowledgePublishedRecord} from "../lib/domain/knowledge-publication";
import {knowledgeThemeLocation,knowledgeWorkspaceHref,emptyKnowledgeReference} from "../lib/client/knowledge-workspace-state";
import {themeReadingPresentationSchema} from "../lib/domain/theme-reading-presentation";
import {themeReadingPresentation} from "../lib/server/theme-reading-presentation";
import {contextualProducts,productCatalogue,type ProductCatalogue} from "../lib/domain/theme-products";
const stamp={revision:1,createdAt:"2026-11-10T00:00:00Z",reason:"test"};
const snapshot:KnowledgeSnapshot={schemaVersion:1,initialView:"split",entities:[],mappings:[],sources:[{id:"a",...stamp,content:knowledgeSourceContentSchema.parse({title:"Source A",bibliography:"Book A"})},{id:"b",...stamp,content:knowledgeSourceContentSchema.parse({title:"Source B",bibliography:"Book B"})}],records:[{id:"r",...stamp,content:knowledgeRecordContentSchema.parse({kind:"episode",assertion:"A full statement to read in details",scope:"A scope that is not a timeline banner",times:[{id:"start",time:{kind:"calendar",from:"1991",label:"Short heading"}}],evidence:[{id:"e-a",source:{id:"a",revision:1},locator:"p1",excerpt:"supporting passage",stance:"support"},{id:"e-b",source:{id:"b",revision:1},locator:"p2",excerpt:"opposing passage",stance:"refute"}]})}]};
afterEach(cleanup);
it("source shortcut opens precisely the requested evidence and retains independent open states",async()=>{
 HTMLElement.prototype.scrollIntoView=vi.fn();let opened:string[]=[];const dto=buildKnowledgePublishedRecord(snapshot.records[0],snapshot);
 function Host(){const [ids,set]=React.useState<string[]>([]);return <KnowledgeReadingSources dto={dto} locale="en" translations={[]} openIds={ids} onOpen={value=>{opened=value;set(value);}} request={{recordId:"r",evidenceId:"e-b",token:1}}/>;}
 render(<Host/>);await act(async()=>{});expect(opened).toEqual(["e-b"]);expect(screen.getByText("opposing passage")).toBeTruthy();expect(screen.queryByText("supporting passage")).toBeNull();fireEvent.click(screen.getAllByRole("button",{name:/quotation|passage|引用|該当/})[0]);expect(opened).toEqual(["e-b","e-a"]);
});
it("reading selects a time annotation, leaves source links to the detail pane and does not duplicate full scope or quote",()=>{
 const focus=vi.fn();render(<KnowledgeTimeline snapshot={snapshot} reading focusedRecordId={null} onFocusRecord={focus}/>);
 expect(screen.queryByText("出来事",{exact:true})).toBeNull();const row=screen.getByText("Short heading",{exact:true}).closest("button")!;expect(row.hasAttribute("aria-expanded")).toBe(false);fireEvent.click(row);expect(focus).toHaveBeenLastCalledWith("r","start");expect(screen.queryByText(snapshot.records[0].content.scope)).toBeNull();expect(screen.queryByText("supporting passage")).toBeNull();expect(screen.queryByRole("button",{name:/Source B/})).toBeNull();
});
it("both undated prototypes make every item reachable, including a one-item collapsed list",()=>{
 const records=Array.from({length:6},(_,i)=>buildKnowledgePublishedRecord({...snapshot.records[0],id:"note"+i,content:{...snapshot.records[0].content,assertion:"Note "+i,times:[]}},snapshot));
 const v=render(<KnowledgeThemeContext records={records} selectedRecordId={null} onRead={vi.fn()} variant="list"/>);expect(screen.getAllByRole("button",{name:/Note/})).toHaveLength(3);fireEvent.click(screen.getByRole("button",{name:"このテーマを深く読む：すべて見る"}));expect(screen.getAllByRole("button",{name:/Note/})).toHaveLength(6);v.rerender(<KnowledgeThemeContext key="collapsed" records={records.slice(0,1)} selectedRecordId={null} onRead={vi.fn()} variant="collapsed"/>);expect(screen.queryByRole("button",{name:/Note/})).toBeNull();fireEvent.click(screen.getByRole("button",{name:/すべて|all theme/}));expect(screen.getByRole("button",{name:/Note 0/})).toBeTruthy();
});
it("canonical links and legacy links preserve their pinned revision independently",()=>{
 expect(knowledgeThemeLocation(new URL("https://plunode.net/en/t/a%3Ab?krev=4&kview=split"))).toMatchObject({id:"a:b",revision:4,view:"split"});expect(knowledgeThemeLocation(new URL("https://plunode.net/?ktheme=old&krev=2"))).toMatchObject({id:"old",revision:2});const r={...emptyKnowledgeReference(),theme:{id:"a:b",revision:4},themeView:"timeline" as const};expect(knowledgeWorkspaceHref(new URL("https://plunode.net/en/t/a%3Ab"),r)).toContain("/en/t/a%3Ab?krev=4");expect(knowledgeWorkspaceHref(new URL("https://plunode.net/en/t/a%3Ab"),emptyKnowledgeReference())).toBe("/en");
});
it("editorial metadata is not inherited by another revision",()=>{
 const theme={id:"reading-20261110:webb:theme",...stamp,content:{title:"",description:"",recordPins:[],entityPins:[],sourcePins:[],mappingPins:[],initialView:"split" as const}};expect(themeReadingPresentation(theme,"ja")?.image?.credit).toContain("Plunode");expect(themeReadingPresentation({...theme,revision:999},"ja")).toBeNull();
});
it("products are edition-pinned, deduplicated, independently regional and never follow arbitrary neighbors",()=>{
 const theme={id:"theme",...stamp,content:{title:"T",description:"",recordPins:[{id:"r",revision:1}],entityPins:[],sourcePins:[],mappingPins:[],initialView:"split" as const}},product=productCatalogue.products[0];
 const catalog:ProductCatalogue={products:[product],recommendations:[{id:"theme",productId:product.id,target:{kind:"theme",id:"theme",revision:1},reason:{ja:"理由",en:"Why"},order:1,state:"public"},{id:"record",productId:product.id,target:{kind:"record",id:"r",revision:1},reason:{ja:"記録",en:"Record"},order:2,state:"public"},{id:"neighbor",productId:product.id,target:{kind:"entity",id:"outside",revision:1},reason:{ja:"外",en:"Outside"},order:0,state:"public"}],offers:[{productId:product.id,marketplace:"US",asin:"1234567890",affiliateUrl:"https://www.amazon.com/dp/1234567890",status:"ready",checkedAt:"2026-11-10T00:00:00Z",image:{url:"https://m.media-amazon.com/images/x.jpg",width:80,height:100,provider:"creators-api",expiresAt:"2026-11-10T01:00:00Z"}}]};
 const rows=contextualProducts(theme,snapshot,null,"JP",Date.parse("2026-11-10T02:00:00Z"),catalog);expect(rows).toHaveLength(1);expect(rows[0].status).toBe("unverified");expect(rows[0].reason.en).toBe("Why");expect(rows[0].alternatives[0].image).toBeUndefined();expect(contextualProducts(theme,snapshot,{kind:"entity",id:"outside"},"US",0,catalog)).toEqual([]);expect(contextualProducts(theme,snapshot,{kind:"record",id:"r"},"JP",0,catalog)[0].reason.en).toBe("Record");
});

it("reading keeps context in details instead of adding a duplicate background disclosure to the timeline",()=>{
 const note=(id:string,assertion:string)=>({id,...stamp,content:knowledgeRecordContentSchema.parse({kind:"note",assertion,aboutRecord:{id:"r",revision:1},evidence:snapshot.records[0].content.evidence})});
 const context={...snapshot,records:[...snapshot.records,note("background","Why this happened"),note("insight","A separate conclusion")]};
 const presentation=themeReadingPresentationSchema.parse({version:1,theme:{id:"t",revision:1},locale:"ja",state:"checked",hook:"Question",lead:"Introduction",records:[{target:{id:"r",revision:1},shortTitle:"Event",explanations:[{record:{id:"background",revision:1},role:"background"},{record:{id:"insight",revision:1},role:"insight"}]}]});
 const v=render(<KnowledgeTimeline snapshot={context} reading presentation={presentation} untimedInContext focusedRecordId={null} onFocusRecord={vi.fn()}/>);
 expect(screen.queryByText("背景",{exact:true})).toBeNull();expect(screen.queryByText("Why this happened")).toBeNull();expect(screen.queryByText("A separate conclusion")).toBeNull();
 v.rerender(<KnowledgeTimeline snapshot={{...context,records:context.records.map(r=>r.id==="r"?{...r,revision:2}:r)}} reading presentation={presentation} untimedInContext focusedRecordId={null} onFocusRecord={vi.fn()}/>);
 expect(screen.queryByText("Why this happened")).toBeNull();
});

it("reading lists use one reversible control for three entries or the whole list",()=>{
 render(<ReadingList noun="テーマ" items={Array.from({length:7},(_,i)=><button key={i}>Theme {i}</button>)}/>);
 const toggle=screen.getByRole("button",{name:"テーマ：すべて見る"});
 expect(screen.getAllByRole("button",{name:/^Theme /})).toHaveLength(3);
 fireEvent.click(toggle);expect(screen.getAllByRole("button",{name:/^Theme /})).toHaveLength(7);
 expect(screen.getByRole("button",{name:"テーマ：閉じる"})).toBe(toggle);
 fireEvent.click(toggle);expect(screen.getAllByRole("button",{name:/^Theme /})).toHaveLength(3);
 expect(toggle.getAttribute("aria-expanded")).toBe("false");
});
it("theme source expansion uses the same heading control and keeps all sources in the normal flow",()=>{
 render(<ReadingSources items={Array.from({length:8},(_,i)=><a key={i} href={"#source"+i}>Source {i}</a>)}/>);
 const toggle=screen.getByRole("button",{name:"出典：すべて見る"});
 expect(screen.getAllByRole("link")).toHaveLength(3);fireEvent.click(toggle);
 expect(screen.getAllByRole("link")).toHaveLength(8);expect(screen.getByRole("button",{name:"出典：閉じる"})).toBe(toggle);
 fireEvent.click(toggle);expect(screen.getAllByRole("link")).toHaveLength(3);
});
it("the bounded knowledge list keeps fixed in-view versions and sends new public entries to their own route",async()=>{
 const pinned=buildKnowledgePublishedRecord(snapshot.records[0],snapshot),newer={...pinned,record:{...pinned.record,revision:2,content:{...pinned.record.content,assertion:"Different newer text"}}};
 const others=Array.from({length:4},(_,i)=>({...pinned,record:{...pinned.record,id:"public"+i,content:{...pinned.record.content,assertion:"Public "+i}}}));
 const fetchMock=vi.spyOn(globalThis,"fetch").mockResolvedValue({ok:true,json:async()=>({records:[newer,...others],nextCursor:null})} as Response);
 const open=vi.fn(),openPinned=vi.fn();try{
  render(<KnowledgeRelatedInformation entityId="entity" inViewRecords={[pinned]} onOpen={open} onOpenInView={openPinned} inTheme/>);await act(async()=>{});
  expect(screen.queryByText("Different newer text")).toBeNull();expect(screen.getAllByText(/^Public /)).toHaveLength(2);fireEvent.click(screen.getByText(pinned.record.content.assertion));expect(openPinned).toHaveBeenLastCalledWith("r");fireEvent.click(screen.getByRole("button",{name:"関連する知識：すべて見る"}));expect(screen.getAllByText(/^Public /)).toHaveLength(4);fireEvent.click(screen.getByText("Public 3"));expect(open).toHaveBeenLastCalledWith("public3");
 }finally{fetchMock.mockRestore();}
});


it("evidence navigation opens a source beyond the initial three and still lets the list close",async()=>{
 HTMLElement.prototype.scrollIntoView=vi.fn();
 const record={...snapshot.records[0],content:{...snapshot.records[0].content,evidence:Array.from({length:5},(_,i)=>({...snapshot.records[0].content.evidence[0],id:"e-"+i,excerpt:"Passage "+i}))}};
 const dto=buildKnowledgePublishedRecord(record,snapshot);
 function Host(){const [ids,set]=React.useState<string[]>([]);return <KnowledgeReadingSources dto={dto} locale="en" translations={[]} openIds={ids} onOpen={set} request={{recordId:"r",evidenceId:"e-4",token:2}}/>;}
 render(<Host/>);await act(async()=>{});
 expect(screen.getByText("Passage 4")).toBeTruthy();expect(screen.getAllByRole("button",{name:/Read the quotation/})).toHaveLength(5);
 fireEvent.click(screen.getByRole("button",{name:"Sources：Show less"}));
 expect(screen.getAllByRole("button",{name:/Read the quotation/})).toHaveLength(3);
});

it("related knowledge fetches later pages only while expanded, keeps loaded pages and cancels on close",async()=>{
 const pinned=buildKnowledgePublishedRecord(snapshot.records[0],snapshot);
 const entries=(start:number,count:number)=>Array.from({length:count},(_,i)=>({...pinned,record:{...pinned.record,id:"entry"+(start+i),content:{...pinned.record.content,assertion:"Entry "+(start+i)}}}));
 let pendingSignal:AbortSignal|undefined;
 const fetchMock=vi.spyOn(globalThis,"fetch").mockImplementation(async(_url,options)=>{
  const url=String(_url);
  if(!url.includes("cursor="))return {ok:true,json:async()=>({records:entries(0,5),nextCursor:"page-2"})} as Response;
  if(url.includes("page-2"))return {ok:true,json:async()=>({records:entries(5,4),nextCursor:"page-3"})} as Response;
  pendingSignal=options?.signal as AbortSignal;
  return new Promise<Response>((_resolve,reject)=>pendingSignal?.addEventListener("abort",()=>reject(new DOMException("Aborted","AbortError"))));
 });
 try{
  render(<KnowledgeRelatedInformation entityId="paged" onOpen={vi.fn()}/>);
  await waitFor(()=>expect(screen.getAllByText(/^Entry /)).toHaveLength(3));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const toggle=screen.getByRole("button",{name:"関連する知識：すべて見る"});fireEvent.click(toggle);
  await waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(screen.getAllByText(/^Entry /)).toHaveLength(9);expect(String(fetchMock.mock.calls[1][0])).toContain("limit=50");
  fireEvent.click(screen.getByRole("button",{name:"関連する知識：閉じる"}));
  expect(pendingSignal?.aborted).toBe(true);expect(screen.getAllByText(/^Entry /)).toHaveLength(3);
  expect(screen.getByRole("button",{name:"関連する知識：すべて見る"})).toBe(toggle);
  fireEvent.click(toggle);await waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(4));
  expect(screen.getAllByText(/^Entry /)).toHaveLength(9);
  expect(fetchMock.mock.calls.filter(([url])=>String(url).includes("page-2"))).toHaveLength(1);
 }finally{fetchMock.mockRestore();}
});
