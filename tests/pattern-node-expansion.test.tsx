// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { emptyPatternGraph, mergePatternPage, openPatternNode, closeExpansion, reopenExpansion, projectGraph } from "../lib/client/graph-state";
import { useGraphExplorer } from "../lib/client/use-graph-explorer";
import { captureWorkspace, rebuildWorkspace, parseWorkspaceBackup } from "../lib/client/saved-workspace";
import { encodeExploration, decodeExploration } from "../lib/client/exploration-url";
import { routeKey } from "../lib/domain/pattern-graph";
import { root, id, node, relation, route, page } from "./pattern-graph-fixture";
const a=route(100,2), b=route(100,3), body=page([a,b]);
const state=()=>mergePatternPage(emptyPatternGraph(root,relation),body,null);
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
const fetchMock=vi.fn<typeof fetch>();
const restored=(body:ReturnType<typeof page>,revision="r1")=>({version:1,dataset:"public-kg",revision,relation,root:body.root,nodes:body.nodes,claims:body.claims,operation:"restore",verifiedRoutes:body.routes,continuation:{state:"resumable",hasMore:false,nextCursor:null}});
beforeEach(()=>{vi.stubGlobal("fetch",fetchMock); fetchMock.mockImplementation(async()=>response({dataset:"public-kg",revision:"r1"}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();fetchMock.mockReset();});
it("同じEntity操作で選択・展開・閉鎖・再展開し、閉じたEntityは親の枝が支える",async()=>{
  const {result}=renderHook(()=>useGraphExplorer()); act(()=>result.current.openWorkspace({graph:state(),view:null,skippedBranches:0},null));
  expect(result.current.graph.nodes[id(2)]).toBeUndefined();
  await act(async()=>result.current.selectEntity(id(100))); await waitFor(()=>expect(result.current.graph.nodes[id(2)]).toBeDefined());
  for(let n=0;n<3;n++){
    act(()=>result.current.toggleEntity(id(100))); expect(result.current.graph.nodes[id(100)]).toBeDefined(); expect(result.current.graph.nodes[id(2)]).toBeUndefined();
    await act(async()=>result.current.toggleEntity(id(100))); await waitFor(()=>expect(result.current.graph.nodes[id(2)]).toBeDefined());
    act(()=>result.current.toggleEntity(root.id)); expect(Object.keys(result.current.graph.nodes)).toEqual([root.id]);
    await act(async()=>result.current.toggleEntity(root.id)); await waitFor(()=>expect(result.current.graph.nodes[id(2)]).toBeDefined());
  }
  expect(fetchMock.mock.calls.every(([url])=>!String(url).includes("neighbors"))).toBe(true);
});
it("別作品から同じ関係条件を保持してさらに展開し、元の起点を変えない",async()=>{
  const next={...route(102,4),nodeIds:[id(2),id(102),id(4)]}, nextBody=page([next],next,null,node(2));
  const g=openPatternNode(state(),id(100)); const {result}=renderHook(()=>useGraphExplorer()); act(()=>result.current.openWorkspace({graph:g,view:null,skippedBranches:0},null));
  fetchMock.mockImplementation(async(url,init)=>String(url).includes("paths")?(expect(JSON.parse(String(init?.body))).toMatchObject({rootId:id(2),relation,revision:"r1"}),response(nextBody)):response({dataset:"public-kg",revision:"r1"}));
  await act(async()=>result.current.selectEntity(id(2))); await waitFor(()=>expect(result.current.graph.nodes[id(102)]).toBeDefined());
  expect(result.current.graph.nodes[id(4)]).toBeUndefined(); expect(result.current.graph.centerId).toBe(root.id);
  await act(async()=>result.current.selectEntity(id(102))); await waitFor(()=>expect(result.current.graph.nodes[id(4)]).toBeDefined());
  expect(result.current.graph.relation).toEqual(relation);
});
it("中継の追加取得は成立証拠の元作品をページングし、新しい接続だけその枝へ受理する",async()=>{
  const first=page(Array.from({length:12},(_,n)=>route(100,n+2)),a,"next");
  const g=openPatternNode(mergePatternPage(emptyPatternGraph(root,relation),first,null),id(100));
  const {result}=renderHook(()=>useGraphExplorer()); act(()=>result.current.openWorkspace({graph:g,view:null,skippedBranches:0},null));
  fetchMock.mockImplementation(async(_url,init)=>{expect(JSON.parse(String(init?.body))).toMatchObject({rootId:root.id,operation:{after:"next"}});return response(page([route(100,30)],a));});
  await act(async()=>result.current.expand(id(100),true)); expect(result.current.graph.nodes[id(30)]).toBeDefined(); expect(result.current.graph.expansions[id(100)].hasMore).toBe(false);
});
it("追加取得中の閉鎖は中止し、遅着ページで枝を開き直さない",async()=>{
  const first=page(Array.from({length:12},(_,n)=>route(100,n+2)),a,"next");
  const g=openPatternNode(mergePatternPage(emptyPatternGraph(root,relation),first,null),id(100));
  const {result}=renderHook(()=>useGraphExplorer()); act(()=>result.current.openWorkspace({graph:g,view:null,skippedBranches:0},null));
  let release!:(r:Response)=>void; fetchMock.mockImplementationOnce(()=>new Promise(r=>{release=r;})); let pending!:Promise<void>;
  act(()=>{pending=result.current.expand(id(100),true);}); act(()=>result.current.close(id(100)));
  await act(async()=>{release(response(page([route(100,30)],a)));await pending;});
  expect(result.current.graph.nodes[id(30)]).toBeUndefined(); expect(result.current.graph.expansions[id(100)].open).toBe(false); expect(result.current.graph.expansions[id(100)].loading).toBe(false);
});
it("再開前にrevisionが変わったら休止枝と証拠を保ち、旧Claimを復活させない",async()=>{
  const g=closeExpansion(openPatternNode(state(),id(100)),root.id);
  const {result}=renderHook(()=>useGraphExplorer()); act(()=>result.current.openWorkspace({graph:g,view:null,skippedBranches:0},null));
  fetchMock.mockImplementation(async()=>response({dataset:"public-kg",revision:"r2"}));
  await act(async()=>result.current.toggleEntity(root.id)); expect(result.current.dataChanged).toBe(true); expect(result.current.graph.claims).toEqual({}); expect(result.current.graph.cacheClaims).toEqual(g.cacheClaims);
});
it("複数作品の証拠・Entityの開閉・URLを保存し、一版で全参照を再検証して復元する",async()=>{
  const next={...route(102,4),nodeIds:[id(2),id(102),id(4)]}, nextBody=page([next],next,null,node(2));
  const g=closeExpansion(openPatternNode(mergePatternPage(openPatternNode(state(),id(100)),nextBody,null),id(102)),id(100));
  const saved=captureWorkspace("public-kg","branches",g,null), decoded=decodeExploration(encodeExploration(saved),root.id,"public-kg");
  fetchMock.mockImplementation(async(url,init)=>String(url).includes("paths")?response(restored(JSON.parse(String(init?.body)).rootId===root.id?body:nextBody)):String(url).includes("dataset")?response({dataset:"public-kg",revision:"r1"}):response({entity:body.root}));
  const rebuilt=await rebuildWorkspace(decoded,new AbortController().signal);
  expect(rebuilt.graph.claims).toEqual(g.claims); expect(rebuilt.graph.nodes).toEqual(g.nodes); expect(rebuilt.graph.expansions[id(102)].open).toBe(true); expect(rebuilt.graph.expansions[id(102)].active).toBe(false);
  expect(reopenExpansion(rebuilt.graph,id(100)).nodes[id(4)]).toBeDefined();
  expect(fetchMock.mock.calls.filter(([url])=>String(url).includes("paths"))).toHaveLength(2);
});
it.each(["missing","revision","final-revision"])("複数作品復元の途中失敗・版変更を部分復元にしない: %s",async mode=>{
  const next={...route(102,4),nodeIds:[id(2),id(102),id(4)]}, nextBody=page([next],next,null,node(2));
  const g=mergePatternPage(openPatternNode(state(),id(100)),nextBody,null), saved=captureWorkspace("public-kg","all",g,null);
  fetchMock.mockImplementation(async(url,init)=>{if(String(url).includes("paths")){const other=JSON.parse(String(init?.body)).rootId!==root.id; if(other&&mode==="missing")return response({...restored(nextBody),verifiedRoutes:[]}); return response(restored(other?nextBody:body,other&&mode==="revision"?"r2":"r1"));} return String(url).includes("dataset")?response({dataset:"public-kg",revision:"r2"}):response({entity:body.root});});
  await expect(rebuildWorkspace(saved,new AbortController().signal)).rejects.toThrow(); expect(g.nodes[id(102)]).toBeDefined();
});
it("旧v2の経路openと点線ハンドルはEntityの休止枝へ移行し、別の起点を作らない",async()=>{
  const saved=captureWorkspace("public-kg","old",state(),null); if(saved.execution.type!=="pattern")throw Error(); delete saved.execution.entityState;
  saved.execution.routes.forEach(r=>{r.open=false;}); saved.execution.collapsedNodes=[{id:id(100),routeKeys:[routeKey(a),routeKey(b)]}];
  fetchMock.mockImplementation(async url=>String(url).includes("paths")?response(restored(body)):response({entity:body.root}));
  const rebuilt=await rebuildWorkspace(saved,new AbortController().signal); expect(Object.keys(rebuilt.graph.nodes)).toEqual([root.id]); expect(rebuilt.graph.expansions[id(100)].open).toBe(false);
  const g=reopenExpansion(reopenExpansion(rebuilt.graph,root.id),id(100)); expect(g.nodes[id(2)]).toBeDefined(); expect(g.nodes[id(3)]).toBeDefined();
});
it.each(["unrelated-claim","duplicate-source","unknown-version"])("不正なEntity枝・証拠元を黙って削除しない: %s",mode=>{
  const saved=captureWorkspace("public-kg","bad",state(),null); if(saved.execution.type!=="pattern")throw Error(); const e=saved.execution.entityState!;
  if(mode==="unrelated-claim")e.branches[0].claimIds.push(a.claimIds[1]); if(mode==="duplicate-source")e.sources.push(e.sources[0]); if(mode==="unknown-version")Object.assign(e,{version:2});
  expect(()=>parseWorkspaceBackup(JSON.stringify(saved),"public-kg")).toThrow();
});
it("段階表示でも未表示側のClaimが欠けた証拠を受理しない",()=>{
  const g=state(); delete g.cacheClaims[a.claimIds[1]]; expect(()=>projectGraph(g)).toThrow();
});
it("全証拠の再検証中に閉じた後の遅着応答は採用せず、取得中表示も残さない",async()=>{
  const {result}=renderHook(()=>useGraphExplorer());act(()=>result.current.openWorkspace({graph:openPatternNode(state(),id(100)),view:null,skippedBranches:0},null));
  let release!:(r:Response)=>void;fetchMock.mockImplementation(async url=>String(url).includes("paths")?new Promise(r=>{release=r;}):response({entity:body.root}));let pending!:Promise<void>;
  act(()=>{pending=result.current.loadPattern(true);});await waitFor(()=>expect(release).toBeDefined());act(()=>result.current.close(root.id));
  await act(async()=>{release(response(restored(body)));await pending;});
  expect(Object.keys(result.current.graph.nodes)).toEqual([root.id]);expect(result.current.graph.execution).toMatchObject({loading:false});
});
it("再検証の失敗で、既に中止したEntity取得をloadingとして復活させない",async()=>{
  const g=state();g.expansions[root.id].loading=true;const {result}=renderHook(()=>useGraphExplorer());act(()=>result.current.openWorkspace({graph:g,view:null,skippedBranches:0},null));
  fetchMock.mockImplementation(async url=>String(url).includes("paths")?response({error:{message:"unconfirmed"}},503):response({entity:body.root}));
  await act(async()=>result.current.loadPattern(true));expect(result.current.graph.nodes).toEqual(g.nodes);expect(result.current.graph.expansions[root.id].loading).toBe(false);expect(result.current.graph.execution).toMatchObject({loading:false});
});
