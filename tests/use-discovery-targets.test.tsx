// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDiscoveryTargets } from "../lib/client/use-discovery-targets";
import { fetchDiscoveryTargets } from "../lib/client/discovery-targets";
import { fetchDatasetRevision, ClientApiError } from "../lib/client/api";
import { initialConnectionsWorkspace, otherWorks } from "../lib/domain/discovery-connections";
import type { TargetSearchResponse } from "../lib/domain/discovery-targets";
vi.mock("../lib/client/discovery-targets",()=>({fetchDiscoveryTargets:vi.fn()}));
vi.mock("../lib/client/api",async original=>({...await original<typeof import("../lib/client/api")>(),fetchDatasetRevision:vi.fn()}));
const criteria={q:"",kind:"work" as const,relation:otherWorks()};
const response=(q=""):TargetSearchResponse=>({version:1,dataset:"public-kg",revision:"r1",criteria:{...criteria,q},items:[],page:{limit:20,hasMore:false,nextCursor:null,total:{status:"not-counted"}}});
const initial={criteria,cursors:[null] as (string|null)[],cached:null as TargetSearchResponse|null,enabled:true,composing:false};
beforeEach(()=>{vi.useFakeTimers();vi.mocked(fetchDiscoveryTargets).mockResolvedValue(response());vi.mocked(fetchDatasetRevision).mockResolvedValue({dataset:"public-kg",revision:"r1"});});
afterEach(()=>{cleanup();vi.useRealTimers();vi.resetAllMocks();});
const tick=()=>act(()=>vi.advanceTimersByTimeAsync(250));
it("名前なしPOST・条件変更の即時更新とAbort・遅着応答排除",async()=>{
 let finish!:(r:TargetSearchResponse)=>void;vi.mocked(fetchDiscoveryTargets).mockReturnValueOnce(new Promise(resolve=>finish=resolve));
 const {result,rerender}=renderHook(p=>useDiscoveryTargets(p.criteria,p.cursors,p.cached,p.enabled,p.composing),{initialProps:initial});await tick();
 const firstSignal=vi.mocked(fetchDiscoveryTargets).mock.calls[0][1];expect(vi.mocked(fetchDiscoveryTargets).mock.calls[0][0].criteria.q).toBe("");
 vi.mocked(fetchDiscoveryTargets).mockResolvedValueOnce(response("pluto"));rerender({...initial,criteria:{...criteria,q:"PLUTO"}});expect(firstSignal.aborted).toBe(true);expect(result.current.result).toBeUndefined();
 await tick();expect(result.current.result?.criteria.q).toBe("pluto");await act(async()=>finish(response()));expect(result.current.result?.criteria.q).toBe("pluto");
});
it("不適合kindを黙って作品へ変えず検索しない。IME中も送信しない",async()=>{
 const {result,rerender}=renderHook(p=>useDiscoveryTargets(p.criteria,p.cursors,p.cached,p.enabled,p.composing),{initialProps:{...initial,criteria:{...criteria,kind:"person" as "person"|"work"}}});await tick();expect(result.current.invalid).toBe(true);expect(fetchDiscoveryTargets).not.toHaveBeenCalled();
 rerender({...initial,criteria,composing:true});await tick();expect(fetchDiscoveryTargets).not.toHaveBeenCalled();
 rerender({...initial,criteria});await tick();expect(fetchDiscoveryTargets).toHaveBeenCalledTimes(1);
});
it("復帰cacheの版を再検証し、409を正常0件へ変換しない",async()=>{
 vi.mocked(fetchDatasetRevision).mockResolvedValue({dataset:"public-kg",revision:"r2"});
 const {result}=renderHook(()=>useDiscoveryTargets(criteria,[null],response(),true,false));await tick();
 expect(result.current.conflict).toBe(true);expect(result.current.result).toBeUndefined();expect(fetchDiscoveryTargets).not.toHaveBeenCalled();
 act(()=>result.current.retry());await tick();expect(result.current.result?.revision).toBe("r1");
});
it("ページは検索時の版を引継ぎ、通信失敗で旧結果を選択可能にしない",async()=>{
 const {result,rerender}=renderHook(p=>useDiscoveryTargets(p.criteria,p.cursors,p.cached,p.enabled,p.composing),{initialProps:initial});await tick();
 vi.mocked(fetchDiscoveryTargets).mockRejectedValueOnce(new ClientApiError("unconfirmed",503));rerender({...initial,cursors:[null,"cursor"]});expect(result.current.result).toBeUndefined();await tick();
 expect(vi.mocked(fetchDiscoveryTargets).mock.calls.at(-1)?.[0]).toMatchObject({after:"cursor",revision:"r1"});expect(result.current.error).toBe("unconfirmed");expect(result.current.result).toBeUndefined();
 expect(initialConnectionsWorkspace.criteria.relation).toBeNull();
});
