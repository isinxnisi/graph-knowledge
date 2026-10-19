// @vitest-environment jsdom
import { useState } from "react";
import DiscoveryConnections from "../components/DiscoveryConnections";
import { initialConnectionsWorkspace, type ConnectionsWorkspace } from "../lib/domain/discovery-connections";
import { fetchDatasetRevision } from "../lib/client/api";
import { decodeExploration } from "../lib/client/exploration-url";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import DiscoverySubjectCandidates from "../components/DiscoverySubjectCandidates";
import { executePathSearch } from "../lib/client/use-discovery-paths";
import { id, page, route, relation } from "./pattern-graph-fixture";
import { relationConditionKey } from "../lib/domain/relation-conditions";
vi.mock("../lib/client/use-discovery-paths",()=>({executePathSearch:vi.fn()}));
vi.mock("../lib/client/ui-locale",()=>({useUiLocale:()=>({locale:"ja"})}));
vi.mock("../components/DiscoveryClaimRow",()=>({default:()=>null}));
vi.mock("../lib/client/use-discovery-targets",()=>({useDiscoveryTargets:()=>({})}));
vi.mock("../lib/client/use-discovery-scroll",()=>({useDiscoveryScroll:()=>({capture:(v:unknown)=>v,prepare:vi.fn()})}));
vi.mock("../lib/client/api",async original=>({...await original<typeof import("../lib/client/api")>(),fetchDatasetRevision:vi.fn()}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.resetAllMocks();});
const body=page([route(100,2),route(100,3)]);
body.nodes.forEach(n=>{n.name=`${n.kind} ${Number(n.id.slice(-12))}`;});
const selection={entity:body.root,relation,revision:"r1",witness:null};
const props={graphHref:()=>"/explore/test",onGraph:vi.fn(),depth:2 as const,onDepthChange:vi.fn(),onSettled:vi.fn()};
const paths={revision:"r1",anchor:body.root,depth:2,nodes:body.nodes,claims:body.claims,paths:body.routes.map(r=>({nodeIds:r.nodeIds,claimIds:r.claimIds.map(c=>[c])})),scan:{expanded:2,reasons:["results"],limitedIds:[]}};
const item=(n:number)=>({...body.nodes.find(e=>e.id===id(n))!,aliases:[],event:null});
const proof=body.routes[0];
const response={version:1,revision:"r1",items:[{entity:item(2),status:"matched",witness:{version:1,dataset:"public-kg",revision:"r1",conditionKey:relationConditionKey(relation),route:{nodeIds:[id(2),id(100),id(1)],claimIds:[proof.claimIds[1],proof.claimIds[0]]}}},{entity:item(3),status:"not-matched",witness:null}]};
it("接点を自動取得し、Graphと継続探索を区別して同じ条件・証拠を渡す",async()=>{
 vi.mocked(executePathSearch).mockResolvedValue(paths as never);
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>response});vi.stubGlobal("fetch",fetcher);
 const choose=vi.fn(),graph=vi.fn();render(<DiscoverySubjectCandidates {...props} selection={selection} onChoose={choose} onGraph={graph}/>);
 await waitFor(()=>expect(screen.getByRole("heading",{name:item(2).name})).toBeTruthy());
 expect(screen.queryByRole("heading",{name:item(3).name})).toBeNull();
 fireEvent.click(screen.getByRole("link",{name:"Graphで探索"}));
 const expected=expect.objectContaining({entity:item(2),relation,witness:response.items[0].witness});
 expect(graph).toHaveBeenCalledWith(expected);expect(choose).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"この対象から探す"}));expect(choose).toHaveBeenCalledWith(expected);
 expect(screen.getByRole("button",{name:"接点の根拠 ＋"}).getAttribute("aria-expanded")).toBe("false");
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it("実際の条件変更で候補を再確認し、全関係の候補にもGraphで同じ条件を引き継ぐ",async()=>{
 vi.mocked(executePathSearch).mockResolvedValue(paths as never);
 const fetcher=vi.fn().mockImplementation(async(_url,options)=>({ok:true,json:async()=>JSON.parse(options.body).relation?response:{...response,items:[2,3].map(n=>({entity:item(n),status:"matched",witness:null}))}}));vi.stubGlobal("fetch",fetcher);
 const graph=vi.fn(),view=render(<DiscoverySubjectCandidates {...props} selection={selection} onChoose={vi.fn()} onGraph={graph}/>);
 await waitFor(()=>expect(screen.getAllByRole("link",{name:"Graphで探索"})).toHaveLength(1));
 view.rerender(<DiscoverySubjectCandidates {...props} selection={{...selection,relation:null}} onChoose={vi.fn()} onGraph={graph}/>);
 expect(screen.queryByRole("link",{name:"Graphで探索"})).toBeNull();
 await waitFor(()=>expect(screen.getAllByRole("link",{name:"Graphで探索"})).toHaveLength(2));
 fireEvent.click(screen.getAllByRole("link",{name:"Graphで探索"})[1]);
 expect(graph).toHaveBeenCalledWith(expect.objectContaining({entity:item(3),relation:null,witness:null}));
 expect(fetcher).toHaveBeenCalledTimes(2);
});
it("候補の取得失敗を正常0件へ変換しない",async()=>{
 vi.mocked(executePathSearch).mockRejectedValue(Error("timeout"));
 render(<DiscoverySubjectCandidates {...props} selection={selection} onChoose={vi.fn()}/>);
 await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("0件とは判定していません"));
});

it("B切替は候補と実際のGraph条件を変え、②の検索・証拠を保全し、失敗を原子的に扱う",async()=>{
 vi.mocked(fetchDatasetRevision).mockResolvedValue({dataset:"public-kg",revision:"r1"});
 vi.mocked(executePathSearch).mockResolvedValue(paths as never);
 let restoreFails=false,incompatible=false;
 const rootWitness={version:1 as const,dataset:"public-kg" as const,revision:"r1",conditionKey:relationConditionKey(relation),route:proof};
 vi.stubGlobal("fetch",vi.fn().mockImplementation(async(_url,options)=>{
  const input=JSON.parse(options.body);
  if(input.ids.length===1&&input.ids[0]===body.root.id){if(restoreFails)throw Error("timeout");return{ok:true,json:async()=>({version:1,revision:"r1",items:[{entity:body.root,status:incompatible?"not-matched":"matched",witness:incompatible?null:rootWitness}]})};}
  return{ok:true,json:async()=>input.relation?response:{...response,items:[2,3].map(n=>({entity:item(n),status:"matched",witness:null}))}};
 }));
 const change=vi.fn();
 function Harness(){const [value,set]=useState<ConnectionsWorkspace>({...initialConnectionsWorkspace,step:"selected",criteria:{q:"浦沢",kind:"work",nameTarget:"contributor",relation},selected:{...selection,witness:rootWitness},selectedDepth:3});return <DiscoveryConnections value={value} onChange={v=>{change(v);set(v);}} onGraph={vi.fn()} onCheckpoint={vi.fn()} body={{current:null}}/>;}
 render(<Harness/>);
 await waitFor(()=>expect(screen.getByTestId("discovery-relation-graph")).toBeTruthy());
 fireEvent.click(screen.getByRole("button",{name:"すべての関係"}));
 await waitFor(()=>expect(screen.getAllByRole("link",{name:"Graphで探索"})).toHaveLength(2));
 const href=screen.getByTestId("discovery-relation-graph").getAttribute("href")!;
 expect(decodeExploration(new URL(href,"https://example.invalid").searchParams.get("s")!,body.root.id,"public-kg").relation).toMatchObject({type:"adjacent",predicates:null,contributionRoles:null,polarity:"all-records"});
 expect(change.mock.calls.at(-1)![0]).toMatchObject({criteria:{q:"浦沢",nameTarget:"contributor",relation},selected:{relation:null,witness:null},selectedDepth:3});
 incompatible=true;fireEvent.click(screen.getByRole("button",{name:"選んだ関係条件"}));
 await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("この対象には元の条件が成立しません"));
 expect(screen.getByRole("button",{name:"すべての関係"}).getAttribute("aria-pressed")).toBe("true");
 incompatible=false;restoreFails=true;fireEvent.click(screen.getByRole("button",{name:"選んだ関係条件"}));
 await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("変更前の探索を保持"));
 expect(screen.getByRole("button",{name:"すべての関係"}).getAttribute("aria-pressed")).toBe("true");
 restoreFails=false;fireEvent.click(screen.getByRole("button",{name:"選んだ関係条件"}));
 await waitFor(()=>expect(screen.getByRole("button",{name:"選んだ関係条件"}).getAttribute("aria-pressed")).toBe("true"));
 expect(change.mock.calls.at(-1)![0]).toMatchObject({criteria:{q:"浦沢",relation},selected:{relation,witness:rootWitness}});
});
