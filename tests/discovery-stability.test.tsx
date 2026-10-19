// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDiscoveryScroll } from "../lib/client/use-discovery-scroll";
import { useDiscoveryHistory } from "../lib/client/use-discovery-history";
import { initialConnectionsWorkspace, type ConnectionsWorkspace } from "../lib/domain/discovery-connections";
beforeEach(()=>{vi.useFakeTimers();history.replaceState({plunodeDiscovery:{},__NA:true},"","/?discovery=presets");});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();document.body.innerHTML="";});
const target=():ConnectionsWorkspace=>({...initialConnectionsWorkspace,step:"targets"});
const body=()=>{const el=document.createElement("div");Object.defineProperty(el,"scrollTo",{value:vi.fn(({top}:ScrollToOptions)=>{el.scrollTop=top??0;})});document.body.append(el);return{current:el};};
const snapshot=(flow=target())=>({layoutVersion:2,entry:"connections",listCriteria:{q:"",kind:null},connectionFlow:flow});
it("200スクロールをrefだけに保持し、再描画せず停止後1回だけcheckpointする",async()=>{
 const el=body(),checkpoint=vi.fn();let renders=0;const {result}=renderHook(()=>{renders++;return useDiscoveryScroll(target(),el,checkpoint,true);});
 for(let n=1;n<=200;n++)act(()=>{el.current.scrollTop=n;el.current.dispatchEvent(new Event("scroll"));});
 expect(checkpoint).not.toHaveBeenCalled();expect(renders).toBe(1);expect(result.current.capture(target()).scrolls.targets).toBe(200);
 await act(()=>vi.advanceTimersByTimeAsync(500));expect(checkpoint).toHaveBeenCalledTimes(1);expect(checkpoint.mock.calls[0][0].scrolls.targets).toBe(200);expect(renders).toBe(1);
 await act(()=>vi.advanceTimersByTimeAsync(60000));expect(checkpoint).toHaveBeenCalledTimes(1);
});
it("Graph移動直前・非表示時の最後の位置と選択状態を保持し、unmount後のlistenerを残さない",()=>{
 const el=body(),checkpoint=vi.fn(),{result,unmount}=renderHook(()=>useDiscoveryScroll(target(),el,checkpoint,true));
 act(()=>{el.current.scrollTop=360;el.current.dispatchEvent(new Event("scroll"));});
 const selected=result.current.capture({...target(),step:"selected"});expect(selected.scrolls.targets).toBe(360);
 act(()=>window.dispatchEvent(new Event("pagehide")));expect(checkpoint).toHaveBeenLastCalledWith(expect.objectContaining({step:"selected",scrolls:expect.objectContaining({targets:360})}));
 unmount();checkpoint.mockClear();el.current.dispatchEvent(new Event("scroll"));window.dispatchEvent(new Event("pagehide"));expect(checkpoint).not.toHaveBeenCalled();
});
it("結果が復帰してから保存位置を適用し、ステップごとの位置を分離する",()=>{
 const el=body(),value={...target(),scrolls:{presets:40,targets:320,selected:0}},checkpoint=vi.fn();
 const {result,rerender}=renderHook(({ready})=>useDiscoveryScroll(value,el,checkpoint,ready),{initialProps:{ready:false}});
 expect(el.current.scrollTo).not.toHaveBeenCalled();rerender({ready:true});expect(el.current.scrollTo).toHaveBeenLastCalledWith({top:320});
 act(()=>result.current.prepare("presets"));const s=result.current.capture({...value,step:"presets"});expect(s.scrolls).toEqual(value.scrolls);
});
it("新しい接点探索の先頭位置は取得待ちにせず表示し、非ゼロの復帰位置は待つ",()=>{
 const el=body(),checkpoint=vi.fn();el.current.scrollTop=500;
 renderHook(()=>useDiscoveryScroll({...target(),step:"selected"},el,checkpoint,false));
 expect(el.current.scrollTo).toHaveBeenLastCalledWith({top:0});
});
it("連続編集の履歴保存を毎フレーム行わず、Graph前に最新状態を同期flushする",async()=>{
 const replace=vi.spyOn(history,"replaceState"),source={current:"home"},start=snapshot();
 const {result,rerender}=renderHook(({value})=>useDiscoveryHistory(value,true,false,source),{initialProps:{value:start}});
 for(let n=0;n<100;n++){rerender({value:{...start,connectionFlow:{...target(),criteria:{q:String(n),kind:null,relation:null}}}});await act(()=>vi.advanceTimersByTimeAsync(16));}
 expect(replace.mock.calls.length).toBeLessThan(4);
 act(()=>{result.current.checkpoint({...target(),step:"selected",scrolls:{presets:30,targets:400,selected:0}},true);});
 expect(history.state.discoveryWorkspace.connectionFlow).toMatchObject({step:"selected",scrolls:{targets:400}});expect(history.state.__NA).toBe(true);
 const count=replace.mock.calls.length;act(()=>result.current.flush());await act(()=>vi.advanceTimersByTimeAsync(60000));expect(replace).toHaveBeenCalledTimes(count);
});
it("HistoryのSecurityError・QuotaExceededErrorで画面例外や再試行ループにせず、復帰時に再保存できる",async()=>{
 const source={current:null},value=snapshot(),original=history.replaceState.bind(history),replace=vi.spyOn(history,"replaceState");
 const {result}=renderHook(()=>useDiscoveryHistory(value,true,false,source));
 for(const name of ["SecurityError","QuotaExceededError"]){replace.mockImplementation(()=>{throw new DOMException("blocked",name);});expect(()=>result.current.flush()).not.toThrow();}
 await act(()=>vi.advanceTimersByTimeAsync(60000));const count=replace.mock.calls.length;await act(()=>vi.advanceTimersByTimeAsync(60000));expect(replace).toHaveBeenCalledTimes(count);
 replace.mockImplementation(original);act(()=>document.dispatchEvent(new Event("visibilitychange")));await act(()=>vi.advanceTimersByTimeAsync(1000));expect(history.state.discoveryWorkspace).toEqual(value);
});
it("Backですでに別entryへ移った後は、その履歴をDiscoveryで上書きしない",()=>{
 const {result}=renderHook(()=>useDiscoveryHistory(snapshot(),true,false,{current:null}));
 history.replaceState({__NA:true,elsewhere:true},"","/");expect(result.current.flush()).toBe(false);expect(history.state).toEqual({__NA:true,elsewhere:true});
});
