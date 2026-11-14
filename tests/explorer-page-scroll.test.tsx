// @vitest-environment jsdom
import React from "react";
import {act,cleanup,render} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {explorerScrollTop,scrollExplorerPane} from "../lib/client/explorer-scroll";
import {useExplorerPageLayout} from "../lib/client/use-explorer-page-layout";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function media(phone:boolean){vi.stubGlobal("matchMedia",vi.fn(()=>({matches:phone})));}
it("PCでは中央がページ、左右だけが内部スクロールになる",()=>{
 media(false);const local=vi.fn(),page=vi.fn();vi.stubGlobal("scrollTo",page);vi.stubGlobal("scrollY",430);
 const {container}=render(<><div id="explorer-graph"/><aside id="explorer-detail"/></>);const detail=container.querySelector<HTMLElement>("aside")!;detail.scrollTop=90;detail.scrollTo=local;
 expect(explorerScrollTop("graph")).toBe(430);expect(explorerScrollTop("detail")).toBe(90);
 scrollExplorerPane("graph",120);expect(page).toHaveBeenCalledWith({top:120,behavior:"instant"});expect(local).not.toHaveBeenCalled();
 scrollExplorerPane("detail",20);expect(local).toHaveBeenCalledWith({top:20,behavior:"instant"});
});
it("スマホの詳細は内部で読み、Graphのページ位置を変えない",()=>{
 media(true);let top=0;const page=vi.fn(({top:next}:{top:number})=>{top=next;Object.defineProperty(window,"scrollY",{configurable:true,value:next});});vi.stubGlobal("scrollTo",page);vi.stubGlobal("scrollY",0);
 function Host({pane}:{pane:"search"|"graph"|"detail"}){const ref=useExplorerPageLayout(pane);return <div ref={ref}><header/><main><div id="explorer-graph"/><aside id="explorer-detail"/></main><footer/></div>;}
 const {rerender,container}=render(<Host pane="graph"/>);
 const detail=container.querySelector<HTMLElement>("aside")!;detail.scrollTo=vi.fn(({top:next})=>{detail.scrollTop=next;});
 act(()=>{page({top:420});window.dispatchEvent(new Event("scroll"));});rerender(<Host pane="detail"/>);expect(top).toBe(420);
 act(()=>{scrollExplorerPane("detail",260);});expect(explorerScrollTop("detail")).toBe(260);expect(top).toBe(420);
 rerender(<Host pane="graph"/>);expect(top).toBe(420);rerender(<Host pane="detail"/>);expect(explorerScrollTop("detail")).toBe(260);
 rerender(<Host pane="search"/>);expect(top).toBe(0);rerender(<Host pane="graph"/>);expect(top).toBe(420);
});
