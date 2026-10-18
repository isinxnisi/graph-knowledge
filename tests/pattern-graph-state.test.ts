import { expect, it } from "vitest";
import { emptyPatternGraph, mergePatternPage, openPatternNode, closeExpansion, reopenExpansion, projectGraph, graphRootReady } from "../lib/client/graph-state";
import { root, id, relation, route, page } from "./pattern-graph-fixture";
const a = route(100, 2), b = route(100, 3), c = route(101, 3);
const state = () => mergePatternPage(emptyPatternGraph(root, relation), page([a,b,c]), null);
it("初期展開は起点に接続するClaimだけで、全線は完全経路の成立証拠を持つ", () => {
  const g=state(); expect(Object.keys(g.nodes)).toHaveLength(3); expect(Object.keys(g.claims)).toHaveLength(2);
  expect(g.nodes[id(2)]).toBeUndefined(); expect(g.cacheNodes[id(2)]).toBeDefined(); expect(g.expansions[root.id].expanded).toBe(true);
  expect(graphRootReady(g)).toBe(true); expect(graphRootReady(emptyPatternGraph(root,relation))).toBe(false);
});
it("中継Entityの枝を閉じても親が支えるEntityと共有Claimは残り、再展開できる", () => {
  let g=openPatternNode(openPatternNode(state(),id(100)),id(101));
  g=closeExpansion(g,id(100)); expect(g.nodes[id(100)]).toBeDefined(); expect(g.nodes[id(3)]).toBeDefined(); expect(g.nodes[id(2)]).toBeUndefined();
  expect(g.claims[c.claimIds[1]]).toBeDefined(); expect(g.expansions[id(100)].open).toBe(false);
  g=reopenExpansion(g,id(100)); expect(g.nodes[id(2)]).toBeDefined();
});
it("起点を閉じると切断した子の枝は休止し、起点再開で同じ枝が戻る", () => {
  const g=openPatternNode(state(),id(100)), closed=closeExpansion(g,root.id);
  expect(Object.keys(closed.nodes)).toEqual([root.id]); expect(closed.expansions[id(100)].active).toBe(false);
  expect(reopenExpansion(closed,root.id).claims).toEqual(g.claims);
});
it("候補外の指定証拠も検証するが終点を自動展開せず、候補境界は保つ", () => {
  const refs=Array.from({length:12},(_,n)=>route(100,n+2)), required=route(900,800);
  const g=mergePatternPage(emptyPatternGraph(root,relation),page(refs,required,"next"),null);
  expect(g.nodes[id(900)]).toBeDefined(); expect(g.nodes[id(800)]).toBeUndefined(); expect(g.execution).toMatchObject({candidateBoundary:refs[11],nextCursor:"next"});
});
it("完全証拠の欠落・否定・役割違い・不正な枝のClaimを拒否する", () => {
  const body=page([a]); expect(()=>mergePatternPage(emptyPatternGraph(root,relation),{...body,claims:body.claims.slice(0,1)},null)).toThrow();
  const g=state(); delete g.cacheClaims[a.claimIds[1]]; expect(()=>projectGraph(g)).toThrow();
  const other=state(); other.expansions[root.id].pages[0].claimIds.push(a.claimIds[1]); expect(()=>projectGraph(other)).toThrow();
});
it("異なる公開版・候補境界を受理せず、表示上限ではcacheとcursorを進めない", () => {
  let g=emptyPatternGraph(root,relation);
  for(let p=0;p<8;p++){const refs=Array.from({length:12},(_,n)=>route(100+p*12+n,500+p*12+n)); g=mergePatternPage(g,page(refs,route(100,500),`p${p+1}`),p?`p${p}`:null);}
  expect(Object.keys(g.nodes)).toHaveLength(97);
  const rejected=mergePatternPage(g,page(Array.from({length:4},(_,n)=>route(300+n,800+n)),route(100,500)),"p8");
  expect(rejected.cacheNodes).toBe(g.cacheNodes); expect(rejected.execution).toBe(g.execution); expect(rejected.expansions[root.id].blocked).toBe(true);
  expect(()=>mergePatternPage(g,{...page([a]),revision:"r2"},"p8")).toThrow(); expect(()=>mergePatternPage(g,page([a]),"wrong")).toThrow();
});
