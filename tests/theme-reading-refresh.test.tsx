vi.mock("server-only",()=>({}));
// @vitest-environment jsdom
import React from "react";
import {render,screen,fireEvent,cleanup,act} from "@testing-library/react";
import {it,expect,afterEach,vi} from "vitest";
import KnowledgeReadingSources from "../components/KnowledgeReadingSources";
import KnowledgeTimeline from "../components/KnowledgeTimeline";
import KnowledgeThemeContext from "../components/KnowledgeThemeContext";
import {knowledgeRecordContentSchema,knowledgeSourceContentSchema,type KnowledgeSnapshot} from "../lib/domain/knowledge-foundation";
import {buildKnowledgePublishedRecord} from "../lib/domain/knowledge-publication";
import {knowledgeThemeLocation,knowledgeWorkspaceHref,emptyKnowledgeReference} from "../lib/client/knowledge-workspace-state";
import {themeReadingPresentation} from "../lib/server/theme-reading-presentation";
import {contextualProducts,productCatalogue,type ProductCatalogue} from "../lib/domain/theme-products";
const stamp={revision:1,createdAt:"2026-11-10T00:00:00Z",reason:"test"};
const snapshot:KnowledgeSnapshot={schemaVersion:1,initialView:"split",entities:[],mappings:[],sources:[{id:"a",...stamp,content:knowledgeSourceContentSchema.parse({title:"Source A",bibliography:"Book A"})},{id:"b",...stamp,content:knowledgeSourceContentSchema.parse({title:"Source B",bibliography:"Book B"})}],records:[{id:"r",...stamp,content:knowledgeRecordContentSchema.parse({kind:"episode",assertion:"A full statement to read in details",scope:"A scope that is not a timeline banner",times:[{id:"start",time:{kind:"calendar",from:"1991",label:"Short heading"}}],evidence:[{id:"e-a",source:{id:"a",revision:1},locator:"p1",excerpt:"supporting passage",stance:"support"},{id:"e-b",source:{id:"b",revision:1},locator:"p2",excerpt:"opposing passage",stance:"refute"}]})}]};
afterEach(cleanup);
it("source shortcut opens precisely the requested evidence and retains independent open states",async()=>{
 HTMLElement.prototype.scrollIntoView=vi.fn();let opened:string[]=[];const dto=buildKnowledgePublishedRecord(snapshot.records[0],snapshot);
 function Host(){const [ids,set]=React.useState<string[]>([]);return <KnowledgeReadingSources dto={dto} locale="en" translations={[]} openIds={ids} onOpen={value=>{opened=value;set(value);}} request={{recordId:"r",evidenceId:"e-b",token:1}}/>;}
 render(<Host/>);await act(async()=>{});expect(opened).toEqual(["e-b"]);expect(screen.getByText("opposing passage")).toBeTruthy();expect(screen.queryByText("supporting passage")).toBeNull();fireEvent.click(screen.getAllByRole("button",{name:/quotation|引用|該当/})[0]);expect(opened).toEqual(["e-b","e-a"]);
});
it("reading selects a time annotation, exposes both source shortcuts and does not duplicate full scope or quote",()=>{
 const focus=vi.fn(),evidence=vi.fn();render(<KnowledgeTimeline snapshot={snapshot} reading focusedRecordId={null} onFocusRecord={focus} onReadEvidence={evidence}/>);
 const row=screen.getByRole("button",{name:/^Short heading/});expect(row.hasAttribute("aria-expanded")).toBe(false);fireEvent.click(row);expect(focus).toHaveBeenLastCalledWith("r","start");expect(screen.queryByText(snapshot.records[0].content.scope)).toBeNull();expect(screen.queryByText("supporting passage")).toBeNull();fireEvent.click(screen.getByRole("button",{name:/Source B/}));expect(evidence).toHaveBeenLastCalledWith("r","e-b");
});
it("both undated prototypes make every item reachable, including a one-item collapsed list",()=>{
 const records=Array.from({length:6},(_,i)=>buildKnowledgePublishedRecord({...snapshot.records[0],id:"note"+i,content:{...snapshot.records[0].content,assertion:"Note "+i,times:[]}},snapshot));
 const v=render(<KnowledgeThemeContext records={records} selectedRecordId={null} onRead={vi.fn()} variant="list"/>);expect(screen.getAllByRole("button",{name:/Note/})).toHaveLength(6);v.rerender(<KnowledgeThemeContext key="collapsed" records={records.slice(0,1)} selectedRecordId={null} onRead={vi.fn()} variant="collapsed"/>);expect(screen.queryByRole("button",{name:/Note/})).toBeNull();fireEvent.click(screen.getByRole("button",{name:/すべて|all theme/}));expect(screen.getByRole("button",{name:/Note 0/})).toBeTruthy();
});
it("canonical links and legacy links preserve their pinned revision independently",()=>{
 expect(knowledgeThemeLocation(new URL("https://plunode.net/en/t/a%3Ab?krev=4&kview=split"))).toMatchObject({id:"a:b",revision:4,view:"split"});expect(knowledgeThemeLocation(new URL("https://plunode.net/?ktheme=old&krev=2"))).toMatchObject({id:"old",revision:2});const r={...emptyKnowledgeReference(),theme:{id:"a:b",revision:4},themeView:"timeline" as const};expect(knowledgeWorkspaceHref(new URL("https://plunode.net/en/t/a%3Ab"),r)).toContain("/en/t/a%3Ab?krev=4");expect(knowledgeWorkspaceHref(new URL("https://plunode.net/en/t/a%3Ab"),emptyKnowledgeReference())).toBe("/en");
});
it("editorial metadata is not inherited by another revision",()=>{
 const theme={id:"reading-20261110:webb:theme",...stamp,content:{title:"",description:"",recordPins:[],entityPins:[],sourcePins:[],mappingPins:[],initialView:"split" as const}};expect(themeReadingPresentation(theme,"ja")?.image?.credit).toContain("STScI");expect(themeReadingPresentation({...theme,revision:2},"ja")).toBeNull();
});
it("products are edition-pinned, deduplicated, independently regional and never follow arbitrary neighbors",()=>{
 const theme={id:"theme",...stamp,content:{title:"T",description:"",recordPins:[{id:"r",revision:1}],entityPins:[],sourcePins:[],mappingPins:[],initialView:"split" as const}},product=productCatalogue.products[0];
 const catalog:ProductCatalogue={products:[product],recommendations:[{id:"theme",productId:product.id,target:{kind:"theme",id:"theme",revision:1},reason:{ja:"理由",en:"Why"},order:1,state:"public"},{id:"record",productId:product.id,target:{kind:"record",id:"r",revision:1},reason:{ja:"記録",en:"Record"},order:2,state:"public"},{id:"neighbor",productId:product.id,target:{kind:"entity",id:"outside",revision:1},reason:{ja:"外",en:"Outside"},order:0,state:"public"}],offers:[{productId:product.id,marketplace:"US",asin:"1234567890",affiliateUrl:"https://www.amazon.com/dp/1234567890",status:"ready",checkedAt:"2026-11-10T00:00:00Z",image:{url:"https://m.media-amazon.com/images/x.jpg",width:80,height:100,provider:"creators-api",expiresAt:"2026-11-10T01:00:00Z"}}]};
 const rows=contextualProducts(theme,snapshot,null,"JP",Date.parse("2026-11-10T02:00:00Z"),catalog);expect(rows).toHaveLength(1);expect(rows[0].status).toBe("unverified");expect(rows[0].reason.en).toBe("Why");expect(rows[0].alternatives[0].image).toBeUndefined();expect(contextualProducts(theme,snapshot,{kind:"entity",id:"outside"},"US",0,catalog)).toEqual([]);expect(contextualProducts(theme,snapshot,{kind:"record",id:"r"},"JP",0,catalog)[0].reason.en).toBe("Record");
});
