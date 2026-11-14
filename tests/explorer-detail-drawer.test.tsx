// @vitest-environment jsdom
import React,{useRef,useState} from "react";
import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {useExplorerDetailDrawer} from "../lib/client/use-explorer-detail-drawer";
import type {ExplorerPane} from "../lib/client/explorer-scroll";
function setup(phone=true,theme=false){
 let listener:(()=>void)|undefined;
 const media={matches:phone,addEventListener:vi.fn((_type,fn)=>{listener=fn;}),removeEventListener:vi.fn()};
 vi.stubGlobal("matchMedia",vi.fn(()=>media));
 function Host(){const root=useRef<HTMLDivElement>(null),[pane,setPane]=useState<ExplorerPane>("graph");const drawer=useExplorerDetailDrawer(root,pane,()=>setPane("graph"),theme);return <div ref={root}><header><button onClick={()=>setPane("detail")}>開く</button></header><main><div id="explorer-graph"><button>Graphの選択</button></div><div id="explorer-search"/><aside id="explorer-detail" tabIndex={-1} role={drawer.overlay?"dialog":undefined} inert={drawer.overlay&&!drawer.open} data-open={drawer.open}><button onClick={()=>setPane("graph")}>閉じる</button><button>資料</button></aside></main><div data-explorer-footer>footer</div></div>;}
 const result=render(<Host/>);return {...result,media,resize:(phone:boolean)=>act(()=>{media.matches=phone;listener?.();})};
}
afterEach(()=>{cleanup();vi.unstubAllGlobals();document.documentElement.style.overflow="";document.body.style.overflow="";});
it("スマホはGraphを保ったまま詳細へフォーカスし、閉じたら操作元へ戻す",()=>{
 const {container}=setup();const graph=container.querySelector<HTMLElement>("#explorer-graph")!,detail=container.querySelector<HTMLElement>("aside")!;
 const trigger=screen.getByText("開く");trigger.focus();fireEvent.click(trigger);
 expect(detail.dataset.open).toBe("true");expect(document.activeElement).toBe(detail);expect(graph.inert).toBe(true);expect(document.documentElement.style.overflow).toBe("hidden");expect(document.body.style.overflow).toBe("");
 detail.scrollTop=240;fireEvent.click(screen.getByText("閉じる"));expect(graph.inert).toBe(false);expect(document.documentElement.style.overflow).toBe("");expect(document.body.style.overflow).toBe("");expect(document.activeElement).toBe(trigger);
 fireEvent.click(trigger);expect(detail.scrollTop).toBe(240);
});
it("Escapeで閉じ、上に開いたdialogのEscapeは横取りしない",()=>{
 setup();fireEvent.click(screen.getByText("開く"));const dialog=document.createElement("dialog");dialog.setAttribute("open","");document.body.append(dialog);
 fireEvent.keyDown(document,{key:"Escape"});expect(document.querySelector<HTMLElement>("#explorer-detail")!.dataset.open).toBe("true");dialog.remove();
 fireEvent.keyDown(document,{key:"Escape"});expect(document.body.style.overflow).toBe("");
});
it("PCのsidebarは遮蔽・スクロール制限せず、幅変更でも制限を残さない",()=>{
 const {container,resize}=setup(false);const graph=container.querySelector<HTMLElement>("#explorer-graph")!;
 fireEvent.click(screen.getByText("開く"));expect(graph.inert).not.toBe(true);expect(document.body.style.overflow).toBe("");
 resize(true);expect(graph.inert).toBe(true);expect(document.documentElement.style.overflow).toBe("hidden");expect(document.body.style.overflow).toBe("");
 resize(false);expect(graph.inert).toBe(false);expect(document.documentElement.style.overflow).toBe("");expect(document.body.style.overflow).toBe("");
});
it("unmountで元のoverflowとinertを戻す",()=>{
 document.body.style.overflow="clip";const {unmount}=setup();fireEvent.click(screen.getByText("開く"));unmount();expect(document.body.style.overflow).toBe("clip");
});

it("テーマの中間幅は1199pxまで重ね、通常Graphは800pxまでに限定する",()=>{
 const first=setup(true,true);expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 1199px)");fireEvent.click(screen.getByText("開く"));expect(document.documentElement.style.overflow).toBe("hidden");first.unmount();
 vi.mocked(window.matchMedia).mockClear();const second=setup(false,false);expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 800px)");fireEvent.click(screen.getByText("開く"));expect(document.documentElement.style.overflow).toBe("");second.unmount();
});
