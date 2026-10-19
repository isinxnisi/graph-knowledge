// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMemberIdentity } from "../lib/client/use-member-identity";
import { memberSessionEvent } from "../lib/client/account-navigation";
const fetcher=vi.fn();
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal("fetch",fetcher);fetcher.mockReset().mockImplementation(async()=>Response.json({error:{code:"UNAUTHENTICATED"}},{status:401}));Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
const tick=()=>act(()=>vi.advanceTimersByTimeAsync(1));
const visibility=(state:string)=>act(()=>{Object.defineProperty(document,"visibilityState",{configurable:true,value:state});document.dispatchEvent(new Event("visibilitychange"));});
it("401を処理済みの未ログインとして扱い、放置・スクロールで再試行しない",async()=>{
 const {result}=renderHook(()=>useMemberIdentity());await tick();expect(fetcher).toHaveBeenCalledTimes(1);expect(result.current).toBeNull();
 act(()=>window.dispatchEvent(new Event("scroll")));await act(()=>vi.advanceTimersByTimeAsync(120000));expect(fetcher).toHaveBeenCalledTimes(1);
});
it("非表示中は中止し、復帰のvisibility/focusをまとめ、無関係なstorageには反応しない",async()=>{
 const {unmount}=renderHook(()=>useMemberIdentity());await tick();visibility("hidden");
 act(()=>{window.dispatchEvent(new Event("focus"));window.dispatchEvent(new StorageEvent("storage",{key:memberSessionEvent}));});await tick();expect(fetcher).toHaveBeenCalledTimes(1);
 visibility("visible");act(()=>window.dispatchEvent(new Event("focus")));await tick();expect(fetcher).toHaveBeenCalledTimes(2);
 act(()=>window.dispatchEvent(new StorageEvent("storage",{key:"plunode:privacy:v1"})));await tick();expect(fetcher).toHaveBeenCalledTimes(2);
 act(()=>window.dispatchEvent(new StorageEvent("storage",{key:memberSessionEvent})));await tick();expect(fetcher).toHaveBeenCalledTimes(3);
 unmount();act(()=>window.dispatchEvent(new Event("focus")));await tick();expect(fetcher).toHaveBeenCalledTimes(3);
});
